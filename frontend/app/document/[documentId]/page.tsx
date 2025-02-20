import { use } from "react";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);
  return <code>{documentId}</code>;
}
