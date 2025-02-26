"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useActionState, useId } from "react";
import { DocumentSchema, type ListDocumentsResponse } from "transport";
import { z } from "zod";
import { uploadDocumentAction } from "../lib/actions";
import { events } from "../lib/amplify";

export function Sidenav({
  documentsPromise,
}: {
  documentsPromise: Promise<ListDocumentsResponse>;
}) {
  const documents = use(documentsPromise);

  return (
    <nav className={"px-6 py-4 bg-amber-100 h-[100cqh]"}>
      <ul>
        {documents.map((document) => {
          return (
            <li key={document.id}>
              <Link
                className={"inline-block underline"}
                href={`/document/${document.id}`}
              >
                {document.originalFileName}
              </Link>
            </li>
          );
        })}
      </ul>
      <UploadDocument />
    </nav>
  );
}

function UploadDocument() {
  const router = useRouter();

  const [, action, isPending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await uploadDocumentAction(formData);
    },
    null,
  );

  const inputId = useId();

  return (
    <form action={action}>
      <fieldset disabled={isPending}>
        <label htmlFor={inputId}>Choose a file</label>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          name="file"
          accept={"text/plain"}
          multiple={false}
          required={true}
          onChange={(event) => {
            if (!event.currentTarget.files) {
              return;
            }

            event.currentTarget.form?.requestSubmit();
          }}
        />
      </fieldset>
    </form>
  );
}

const DocumentEventSchema = z.object({
  id: z.string(),
  event: DocumentSchema,
});

async function waitForDocumentReady() {
  const { resolve, reject, promise } = Promise.withResolvers();
  const channel = await events.connect(`/events/document`);
  channel.subscribe({
    next: (data) => {
      const {
        event: { id, status },
      } = DocumentEventSchema.parse(data);
      if (status === "FAILED") {
        return reject();
      }
      if (status === "READY") {
        return resolve(id);
      }
    },
    error: (error) => {
      reject(error);
    },
  });

  return promise;
}
