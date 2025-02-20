import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import middy from "@middy/core";
import { DocumentSchema, type ListDocumentsResponse } from "transport";
import { z } from "zod";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const logger = new Logger();

const EnvSchema = z.object({
  DOCUMENTS_TABLE_NAME: z.string(),
});
const env = EnvSchema.parse(process.env);

const lambdaHandler = async (): Promise<ListDocumentsResponse> => {
  const { Items: items = [] } = await client.send(
    new ScanCommand({
      TableName: env.DOCUMENTS_TABLE_NAME,
    }),
  );

  const documents = items.map((item) => {
    return DocumentSchema.parse(item);
  });

  return documents;
};

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger));
