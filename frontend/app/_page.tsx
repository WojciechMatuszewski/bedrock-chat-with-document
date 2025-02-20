"use client";

import { Amplify } from "aws-amplify";
import type { EventsChannel } from "aws-amplify/api";
import { events } from "aws-amplify/api";
import { useActionState, useEffect, useState } from "react";
import { z } from "zod";
import { chatWithDocumentAction, uploadDocumentAction } from "./lib/actions";
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
  const [, action, isPending] = useActionState(
    (_: unknown, formData: FormData) => uploadDocumentAction(formData),
    null,
  );
  const [documentId, setDocumentId] = useState<string>("");

  return (
    <main>
      <form action={action}>
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
      <hr />
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

export type Message = {
  id: string;
  source: "user" | "ai";
  text: string;
  timestamp: number;
};

const DocumentResponseMessageSchema = z.object({
  id: z.string(),
  event: z.object({
    text: z.string().optional(),
  }),
});

function DocumentChat({ documentId }: { documentId: string }) {
  const [aiMessages, setAIMessages] = useState<Message[]>([]);
  const [userMessages, action, isPending] = useActionState(
    chatWithDocumentAction,
    [],
  );

  useEffect(() => {
    let channel: EventsChannel | undefined = undefined;

    const connectAndSubscribe = async () => {
      channel = await events.connect(`response/document/${documentId}`);

      channel.subscribe({
        next: (data) => {
          const {
            /**
             * TODO: The index appears to be the same every time we sent the message?
             */
            id,
            event: { text },
          } = DocumentResponseMessageSchema.parse(data);
          if (!text) {
            return;
          }
          setAIMessages((allAIMessages) => {
            const lastAIMessageIndex = allAIMessages.findIndex((message) => {
              return message.id === id;
            });
            console.log({ id, lastAIMessageIndex });

            if (lastAIMessageIndex === -1) {
              return [
                ...allAIMessages,
                { source: "ai", text, timestamp: Date.now(), id },
              ];
            }

            const currentAIMessage = allAIMessages.at(lastAIMessageIndex);
            if (!currentAIMessage) {
              return allAIMessages;
            }

            const newMessages = allAIMessages.with(lastAIMessageIndex, {
              ...currentAIMessage,
              text: currentAIMessage.text.concat(text),
            });
            return newMessages;
          });
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

  const allMessages = [...userMessages, ...aiMessages].toSorted((a, b) => {
    return a.timestamp - b.timestamp;
  });

  return (
    <div>
      <div
        style={{
          maxHeight: 300,
          height: "100%",
          width: 400,
          padding: 16,
          overflow: "auto",
        }}
      >
        <ul>
          {allMessages.map((message, index) => {
            return (
              <li key={index}>
                {message.text} | {message.timestamp}
              </li>
            );
          })}
        </ul>
      </div>
      <form action={action}>
        <fieldset>
          <label htmlFor={"text"}>Your input</label>
          <textarea id="text" name="text" />
          <input type="hidden" name="documentId" value={documentId} />
          <button type="submit" disabled={isPending}>
            Submit
          </button>
        </fieldset>
      </form>
    </div>
  );
}
