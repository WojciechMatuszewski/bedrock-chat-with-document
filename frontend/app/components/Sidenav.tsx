"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useActionState, useEffect, useId, useState } from "react";
import { DocumentSchema, type ListDocumentsResponse } from "transport";
import { z } from "zod";
import { uploadDocumentAction } from "../lib/actions";
import { events } from "../lib/amplify";
import { type Document } from "transport";

export function Sidenav({
  documentsPromise,
}: {
  documentsPromise: Promise<ListDocumentsResponse>;
}) {
  const documents = use(documentsPromise);

  return (
    <nav className={"px-6 py-4 bg-amber-100 h-[100cqh]"}>
      <section>
        <h2>Files</h2>
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
      </section>
      <hr className={"my-4"} />
      <UploadDocument />
    </nav>
  );
}

function UploadDocument() {
  const router = useRouter();
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(
    null,
  );

  const [uploadResult, action, isPending] = useActionState(
    async (_prevState: { documentId: string } | null, formData: FormData) => {
      return await uploadDocumentAction(formData);
    },
    null,
  );
  useEffect(() => {
    if (!uploadResult) {
      return;
    }

    const { documentId } = uploadResult;

    setPendingDocumentId(documentId);
    waitForDocumentReady({ documentId }).finally(() => {
      setPendingDocumentId(null);
      router.refresh();
    });
  }, [uploadResult]);

  const inputId = useId();

  const isLoading = pendingDocumentId != null || isPending;

  return (
    <form action={action}>
      <fieldset disabled={isLoading}>
        <label
          htmlFor={inputId}
          className="bg-gray-400 p-2 text-white rounded-md"
        >
          {isLoading ? "Uploading..." : "Pick a file to upload"}
        </label>
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

async function waitForDocumentReady({ documentId }: { documentId: string }) {
  const { resolve, reject, promise } = Promise.withResolvers<Document>();

  const channel = await events.connect(`/events/document/${documentId}`);
  channel.subscribe({
    next: (data) => {
      const {
        event: { id, status, originalFileName },
      } = DocumentEventSchema.parse(data);
      if (status === "FAILED") {
        return reject();
      }

      if (status === "READY") {
        return resolve({ id, originalFileName, status });
      }
    },
    error: (error) => {
      reject(error);
    },
  });

  return promise.finally(() => {
    channel.close();
  });
}
