"use client";

import { useActionState } from "react";
import { uploadDocumentAction } from "./lib/actions";

/**
 * https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
 */

export default function Home() {
  const [, formAction, isPending] = useActionState(
    (_: unknown, formData: FormData) => uploadDocumentAction(formData),
    null,
  );

  return (
    <form action={formAction}>
      <input
        type="file"
        name="file"
        id="file"
        accept={"text/plain"}
        multiple={false}
        required={true}
      />
      <button disabled={isPending}>Submit</button>
    </form>
  );
}
