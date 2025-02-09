"use server";

import * as z from "zod";
import { getEnv } from "./env";
import { GetObjectUrlResponseSchema } from "transport";

const GetUploadUrlFormDataSchema = z.object({
  file: z.instanceof(File),
});

export async function uploadDocumentAction(formData: FormData) {
  const { file } = GetUploadUrlFormDataSchema.parse(
    Object.fromEntries(formData.entries()),
  );

  const endpointUrl = new URL("/upload-url", getEnv().API_ROOT_URL);
  const { url, fields } = await fetch(endpointUrl, {
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

  await fetch(url, { method: "POST", body: uploadFormData });
}

async function fetch(...parameters: Parameters<typeof globalThis.fetch>) {
  const response = await globalThis.fetch(...parameters);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${await response.text()}`);
  }

  const { ["content-type"]: contentType = "" } = Object.fromEntries(
    response.headers.entries(),
  );
  if (contentType.toLocaleLowerCase() === "application/json") {
    return (await response.json()) as unknown;
  }

  return await response.text();
}
