import * as z from "zod";

const EnvSchema = z
  .object({
    NEXT_PUBLIC_API_ROOT_URL: z.string(),
  })
  .transform((env) => {
    return {
      API_ROOT_URL: env.NEXT_PUBLIC_API_ROOT_URL,
    };
  });

export function getEnv() {
  return EnvSchema.parse(process.env);
}
