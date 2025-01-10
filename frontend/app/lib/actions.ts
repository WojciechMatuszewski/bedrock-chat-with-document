"use server";

import * as z from "zod";
import { getEnv } from "./env";
import { GetObjectUrlResponseSchema } from "transport";

const GetUploadUrlFormDataSchema = z.object({
  file: z.instanceof(File),
});

export async function getUploadUrlAction(formData: FormData) {
  const { file } = GetUploadUrlFormDataSchema.parse(
    Object.fromEntries(formData.entries()),
  );

  const endpointUrl = new URL("/upload-url", getEnv().API_ROOT_URL);
  const { url, fields } = await fetch(endpointUrl, {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Failed to fetch");
    }

    return GetObjectUrlResponseSchema.parse(await response.json());
  });

  const uploadFormData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    uploadFormData.set(key, value);
  });
  uploadFormData.set("file", file);

  await fetch(url, { method: "POST", body: uploadFormData }).then(
    (response) => {
      if (!response.ok) {
        throw new Error("Failed to upload data");
      }
    },
  );
}
