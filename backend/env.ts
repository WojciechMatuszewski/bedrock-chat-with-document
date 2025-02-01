import { z } from "zod";

const EnvSchema = z.object({
  PINECONE_ENDPOINT_URL: z.string(),
  PINECONE_API_KEY: z.string(),
  PINECONE_API_KEY_SECRET_ARN: z.string(),

  APPSYNC_EVENTS_API_ENDPOINT: z.string().url(),
  APPSYNC_EVENTS_API_KEY: z.string(),
});

export function getEnv() {
  return EnvSchema.parse(process.env);
}
