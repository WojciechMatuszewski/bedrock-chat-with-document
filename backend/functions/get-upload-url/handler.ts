import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { parser } from "@aws-lambda-powertools/parser/middleware";
import { ApiGatewayV2Envelope } from "@aws-lambda-powertools/parser/envelopes";
import middy from "@middy/core";
import { z } from "zod";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const logger = new Logger();

const PayloadSchema = z.object({
  name: z.string(),
  size: z.number(),
});

const EnvSchema = z.object({
  BUCKET_NAME: z.string(),
});

const env = EnvSchema.parse(process.env);

const s3Client = new S3Client({});

const lambdaHandler = async (payload: z.infer<typeof PayloadSchema>) => {
  const uuid = crypto.randomUUID();
  const key = `${uuid}/data`;

  const url = await createPresignedPost(s3Client, {
    Bucket: env.BUCKET_NAME,
    Conditions: [{}],
    Fields: {},
    Expires: 0,
    Key: key,
  });
  return null;
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(parser({ schema: PayloadSchema, envelope: ApiGatewayV2Envelope }));
