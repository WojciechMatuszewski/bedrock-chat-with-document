import * as z from "zod";

const EnvSchema = z
  .object({
    NEXT_PUBLIC_API_ROOT_URL: z.preprocess(() => {
      return process.env.NEXT_PUBLIC_API_ROOT_URL;
    }, z.string()),
    NEXT_PUBLIC_APPSYNC_EVENTS_API_URL: z.preprocess(() => {
      return process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_URL;
    }, z.string()),
    NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY: z.preprocess(() => {
      return process.env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY;
    }, z.string()),
  })
  .transform((env) => {
    return {
      API_ROOT_URL: env.NEXT_PUBLIC_API_ROOT_URL,
      APPSYNC_EVENTS_API_URL: env.NEXT_PUBLIC_APPSYNC_EVENTS_API_URL,
      APPSYNC_EVENTS_API_KEY: env.NEXT_PUBLIC_APPSYNC_EVENTS_API_KEY,
    };
  });

export function getEnv() {
  return EnvSchema.parse(process.env);
}
