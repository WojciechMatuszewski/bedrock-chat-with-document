import { cache } from "react";
import { getEnv } from "./env";
import { ListDocumentsResponseSchema } from "transport";

export const listDocuments = cache(async function listDocument() {
  const url = new URL("/documents", getEnv().API_ROOT_URL);
  return await fetchData(url, { method: "GET" }).then((data) => {
    return ListDocumentsResponseSchema.parse(data);
  });
});

export async function fetchData(
  ...parameters: Parameters<typeof globalThis.fetch>
) {
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
