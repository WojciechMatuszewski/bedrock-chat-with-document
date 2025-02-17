"use client";

import { useActionState, useEffect, useState } from "react";
import { uploadDocumentAction } from "./lib/actions";
import { Amplify } from "aws-amplify";
import { events } from "aws-amplify/api";
import type { EventsChannel } from "aws-amplify/api";
import { getEnv } from "./lib/env";

/**
 * https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
 */

Amplify.configure({
  API: {
    Events: {
      endpoint: getEnv().APPSYNC_EVENTS_API_URL,
      region: "eu-central-1",
      defaultAuthMode: "apiKey",
      apiKey: getEnv().APPSYNC_EVENTS_API_KEY,
    },
  },
});

export default function Home() {
  const [, formAction, isPending] = useActionState(
    (_: unknown, formData: FormData) => uploadDocumentAction(formData),
    null,
  );
  const [documentId, setDocumentId] = useState<string>("");

  return (
    <main>
      <form action={formAction}>
        <fieldset>
          <legend>Upload file</legend>
          <input
            type="file"
            name="file"
            id="file"
            accept={"text/plain"}
            multiple={false}
            required={true}
          />
          <button disabled={isPending}>Submit</button>
        </fieldset>
      </form>
      <article>
        <form>
          <fieldset>
            <legend>Provide document ID</legend>
            <label htmlFor={"documentId"}>Document ID:</label>
            <input
              value={documentId}
              onChange={(event) => {
                const documentId = event.currentTarget.value;
                setDocumentId(documentId);
              }}
              type="text"
              name="documentId"
              id="documentId"
            />
          </fieldset>
        </form>
        <section>
          <h2>Document Chat</h2>
          <DocumentChat documentId={documentId} />
        </section>
      </article>
    </main>
  );
}

function DocumentChat({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let channel: EventsChannel | undefined = undefined;

    const connectAndSubscribe = async () => {
      channel = await events.connect(`responses/document/${documentId}`);

      channel.subscribe({
        next: (data) => {
          console.log("received", data);
        },
        error: (err) => console.error("error", err),
      });
    };

    if (documentId) {
      connectAndSubscribe();
    }

    return () => {
      channel?.close();
    };
  }, [documentId]);

  return (
    <div>
      <div
        style={{ maxHeight: 300, height: "100%", width: 400, padding: 16 }}
      ></div>
      <form>
        <fieldset>
          <label htmlFor={"text"}>Your input</label>
          <textarea id="text" />
        </fieldset>
      </form>
    </div>
  );
}
