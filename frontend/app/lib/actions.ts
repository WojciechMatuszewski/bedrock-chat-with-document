"use server";

import * as z from "zod";
import { getEnv } from "./env";
import { GetObjectUrlResponseSchema } from "transport";
import type { Message } from "../_page";
import { fetchData } from "./network";

const GetUploadUrlFormDataSchema = z.object({
  file: z.instanceof(File),
});

export async function uploadDocumentAction(formData: FormData) {
  console.log("Getting document upload URL");

  const { file } = GetUploadUrlFormDataSchema.parse(
    Object.fromEntries(formData.entries()),
  );

  const endpointUrl = new URL("/upload-url", getEnv().API_ROOT_URL);
  const { url, fields, documentId } = await fetchData(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
    }),
  }).then((response) => {
    return GetObjectUrlResponseSchema.parse(response);
  });

  const uploadFormData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    uploadFormData.set(key, value);
  });
  uploadFormData.set("file", file);

  console.log("Uploading the document", { documentId });

  await fetchData(url, { method: "POST", body: uploadFormData });

  return { documentId };
}

const ChatWithDocumentFormDataSchema = z.object({
  text: z.string(),
  documentId: z.string(),
});

export async function chatWithDocumentAction(
  prevMessages: Array<Message>,
  formData: FormData,
): Promise<Array<Message>> {
  const { text, documentId } = ChatWithDocumentFormDataSchema.parse(
    Object.fromEntries(formData.entries()),
  );

  const endpointUrl = new URL(
    `/document/${documentId}/chat`,
    getEnv().API_ROOT_URL,
  );

  const now = Date.now();

  await fetchData(endpointUrl, {
    body: JSON.stringify({ text }),
    method: "POST",
  });

  return [
    ...prevMessages,
    { source: "user", text: text, timestamp: now, id: crypto.randomUUID() },
  ];
}
