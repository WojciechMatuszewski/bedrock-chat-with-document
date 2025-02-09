import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { JSONStringified } from "@aws-lambda-powertools/parser/helpers";
import { parser } from "@aws-lambda-powertools/parser/middleware";
import { APIGatewayProxyEventV2Schema } from "@aws-lambda-powertools/parser/schemas";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
  RetrieveAndGenerateStreamCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import middy from "@middy/core";
import { ChatWithDocumentPayloadSchema } from "transport";
import { z } from "zod";

const logger = new Logger();

const EnvSchema = z.object({
  APPSYNC_EVENTS_API_URL: z.string(),
  APPSYNC_EVENTS_API_KEY: z.string(),
  APPSYNC_RESPONSE_CHANNEL_PREFIX: z.string(),

  KNOWLEDGE_BASE_ID: z.string(),
  MODEL_ARN: z.string(),
});
const env = EnvSchema.parse(process.env);

const PayloadSchema = APIGatewayProxyEventV2Schema.extend({
  body: JSONStringified(ChatWithDocumentPayloadSchema),
  pathParameters: z.object({ id: z.string() }),
});

type Payload = z.infer<typeof PayloadSchema>;

const client = new BedrockAgentRuntimeClient({});

const lambdaHandler = async (payload: Payload) => {
  const documentId = payload.pathParameters.id;
  const text = payload.body.text;

  const result = await client.send(
    new RetrieveAndGenerateStreamCommand({
      input: { text },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: env.KNOWLEDGE_BASE_ID,
          modelArn: env.MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
              filter: {
                equals: {
                  key: "fileId",
                  value: documentId,
                },
              },
            },
          },
        },
      },
    }),
  );

  if (!result.stream) {
    return;
  }

  for await (const chunk of result.stream) {
    void fetch(env.APPSYNC_EVENTS_API_URL, {
      body: JSON.stringify({
        channel: `${env.APPSYNC_RESPONSE_CHANNEL_PREFIX}/${documentId}`,
        events: [JSON.stringify({ text: chunk.output?.text })],
      }),
      method: "POST",
      headers: {
        "X-Api-Key": env.APPSYNC_EVENTS_API_KEY,
        "Content-Type": "application/json",
      },
    });
  }

  return;
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(
    parser({
      schema: PayloadSchema,
    }),
  );
