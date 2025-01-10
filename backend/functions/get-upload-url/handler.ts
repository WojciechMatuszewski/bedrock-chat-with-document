import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { parser } from "@aws-lambda-powertools/parser/middleware";
import { ApiGatewayV2Envelope } from "@aws-lambda-powertools/parser/envelopes";
import middy from "@middy/core";
import { z } from "zod";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import {
  GetObjectUrlPayloadSchema,
  type GetObjectUrlPayload,
  type GetObjectUrlResponse,
} from "transport";

const logger = new Logger();

const EnvSchema = z.object({
  BUCKET_NAME: z.string(),
});

const env = EnvSchema.parse(process.env);

const s3Client = new S3Client({});

const lambdaHandler = async (
  payload: GetObjectUrlPayload,
): Promise<GetObjectUrlResponse> => {
  const uuid = crypto.randomUUID();
  const key = `${uuid}/data`;

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: env.BUCKET_NAME,
    Conditions: [
      ["content-length-range", payload.size, payload.size],
      ["eq", "$Content-Type", "text/plain"],
      ["eq", "$x-amz-meta-name", payload.name],
    ],
    Fields: {
      "Content-Type": "text/plain",
      "x-amz-meta-name": payload.name,
    },
    Expires: 20_000,
    Key: key,
  });

  return { url, fields };
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(
    parser({
      schema: GetObjectUrlPayloadSchema,
      envelope: ApiGatewayV2Envelope,
    }),
  );
