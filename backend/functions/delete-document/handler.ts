import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { parser } from "@aws-lambda-powertools/parser/middleware";
import { APIGatewayProxyEventV2Schema } from "@aws-lambda-powertools/parser/schemas";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import middy from "@middy/core";
import { z } from "zod";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const logger = new Logger();

const EnvSchema = z.object({
  DOCUMENTS_TABLE_NAME: z.string(),
});
const env = EnvSchema.parse(process.env);

const PayloadSchema = APIGatewayProxyEventV2Schema.extend({
  pathParameters: z.object({ documentId: z.string() }),
});
type Payload = z.infer<typeof PayloadSchema>;

const lambdaHandler = async (payload: Payload) => {
  const { documentId } = payload.pathParameters;
  logger.info("Deleting document", { documentId });

  await client.send(
    new DeleteCommand({
      Key: {
        id: documentId,
      },
      TableName: env.DOCUMENTS_TABLE_NAME,
    }),
  );

  logger.info("Deleted document", { documentId });

  return {
    status: 204,
  };
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(
    parser({
      schema: PayloadSchema,
    }),
  );
