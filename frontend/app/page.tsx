"use client";

import { useActionState } from "react";
import { getUploadUrlAction } from "./lib/actions";

export default function Home() {
  const [, formAction, isPending] = useActionState(
    (_: unknown, formData: FormData) => getUploadUrlAction(formData),
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
      />
      <button disabled={isPending}>Submit</button>
    </form>
  );
}
