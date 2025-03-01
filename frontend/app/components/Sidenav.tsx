"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { use, useActionState, useEffect, useId, useState } from "react";
import { DocumentSchema, type ListDocumentsResponse } from "transport";
import { z } from "zod";
import { deleteDocumentAction, uploadDocumentAction } from "../lib/actions";
import { events } from "../lib/amplify";
import { type Document } from "transport";
import Form from "next/form";

export function Sidenav({
  documentsPromise,
}: {
  documentsPromise: Promise<ListDocumentsResponse>;
}) {
  const documents = use(documentsPromise);

  return (
    <nav className={"px-6 py-4 bg-amber-100 h-[100cqh] w-[300px]"}>
      <section>
        <h2>Files</h2>
        <ul>
          {documents.map((document) => {
            return <DocumentItem key={document.id} document={document} />;
          })}
        </ul>
      </section>
      <hr className={"my-4"} />
      <UploadDocument />
    </nav>
  );
}

function DocumentItem({ document }: { document: Document }) {
  return (
    <li key={document.id}>
      <Link
        className={"inline-block underline"}
        href={`/document/${document.id}`}
      >
        {document.originalFileName}
      </Link>
      <DeleteDocument documentId={document.id} />
    </li>
  );
}

function DeleteDocument({ documentId }: { documentId: string }) {
  const router = useRouter();
  const { documentId: documentIdInParams } = useParams();

  const [_, action, isPending] = useActionState(
    async (_: unknown, formData: FormData) => {
      await deleteDocumentAction(formData);
      if (documentIdInParams === documentId) {
        router.replace("/");
      } else {
        router.refresh();
      }
    },
    undefined,
  );

  return (
    <form action={action}>
      <fieldset>
        <legend className={"sr-only"}>Delete document {documentId}</legend>
        <input type="hidden" name="documentId" value={documentId} />
        <button type="submit" disabled={isPending}>
          {isPending ? "Deleting..." : "Delete"}
        </button>
      </fieldset>
    </form>
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
    <Form action={action}>
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
    </Form>
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
