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

export const DocumentSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "READY", "FAILED"]),
  originalFileName: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const ListDocumentsResponseSchema = z.array(DocumentSchema);

export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>;
