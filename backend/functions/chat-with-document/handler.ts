import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { JSONStringified } from "@aws-lambda-powertools/parser/helpers";
import { parser } from "@aws-lambda-powertools/parser/middleware";
import { APIGatewayProxyEventV2Schema } from "@aws-lambda-powertools/parser/schemas";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateStreamCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import middy from "@middy/core";
import type { Context } from "aws-lambda";
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
  pathParameters: z.object({ documentId: z.string() }),
});

type Payload = z.infer<typeof PayloadSchema>;

const client = new BedrockAgentRuntimeClient({});

const lambdaHandler = async (payload: Payload, context: Context) => {
  const documentId = payload.pathParameters.documentId;
  const text = payload.body.text;

  logger.info("Invoking bedrock", { documentId, text });

  const bedrockResult = await client.send(
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
  if (!bedrockResult.stream) {
    return;
  }

  for await (const chunk of bedrockResult.stream) {
    logger.info("Invoking AppSync Events APIs", { text: chunk.output?.text });

    const response = await fetch(env.APPSYNC_EVENTS_API_URL, {
      body: JSON.stringify({
        channel: `${env.APPSYNC_RESPONSE_CHANNEL_PREFIX}/${documentId}`,
        events: [
          JSON.stringify({
            text: chunk.output?.text,
            id: context.awsRequestId,
          }),
        ],
      }),
      method: "POST",
      headers: {
        "X-Api-Key": env.APPSYNC_EVENTS_API_KEY,
        "Content-Type": "application/json",
      },
    });

    logger.info("Invoked AppSync Events API", {
      status: response.status,
      headers: response.headers,
    });
  }

  return {
    status: "OK",
  };
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(
    parser({
      schema: PayloadSchema,
    }),
  );
