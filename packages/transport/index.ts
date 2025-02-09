import { z } from "zod";

export const GetObjectUrlPayloadSchema = z.object({
  name: z.string(),
  size: z.number(),
});

export type GetObjectUrlPayload = z.infer<typeof GetObjectUrlPayloadSchema>;

export const GetObjectUrlResponseSchema = z.object({
  url: z.string(),
  fields: z.record(z.string(), z.string()),
});

export type GetObjectUrlResponse = z.infer<typeof GetObjectUrlResponseSchema>;

export const ChatWithDocumentPayloadSchema = z.object({
  text: z.string(),
});

export type ChatWithDocumentPayload = z.infer<
  typeof ChatWithDocumentPayloadSchema
>;
