"use client";

import {
  use,
  useActionState,
  useCallback,
  useEffect,
  useOptimistic,
  useState,
} from "react";
import { z } from "zod";
import { chatWithDocumentAction } from "../../lib/actions";
import { type EventsChannel, events } from "../../lib/amplify";
import Form from "next/form";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = use(params);

  return <DocumentChat documentId={documentId} />;
}

function DocumentChat({ documentId }: { documentId: string }) {
  const [userMessages, action, isPending] = useActionState(
    chatWithDocumentAction,
    [],
  );
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    userMessages,
    (state, newMessage: Message) => {
      return [...state, newMessage];
    },
  );

  const aiMessages = useAIDocumentMessages({ documentId });

  const allMessages = [...optimisticMessages, ...aiMessages].toSorted(
    (a, b) => {
      return a.timestamp - b.timestamp;
    },
  );

  return (
    <div className={"flex flex-col gap-4"}>
      <h2>
        Chatting with <code>{documentId}</code>
      </h2>
      <div className="border border-red-500 overflow-auto h-[300px] w-[400px] p-4">
        <ul className={"grid grid-cols-[min-content_1fr] gap-2"}>
          {allMessages.map((message, index) => {
            return (
              <li
                key={index}
                className={"w-full grid grid-cols-subgrid col-[1/-1]"}
              >
                <span className={"font-bold uppercase"}>{message.source}:</span>
                <span>{message.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <Form
        action={async (formData) => {
          addOptimisticMessage({
            id: crypto.randomUUID(),
            source: "user",
            text: formData.get("text"),
            timestamp: Date.now(),
          });

          await action(formData);
        }}
      >
        <fieldset>
          <div className={"flex flex-col"}>
            <label htmlFor={"text"}>Your input</label>
            <textarea
              id="text"
              className={"border border-red-500 p-2"}
              name="text"
            />
          </div>
          <input type="hidden" name="documentId" value={documentId} />

          <button type="submit" className={"mt-4"} disabled={isPending}>
            Submit
          </button>
        </fieldset>
      </Form>
    </div>
  );
}

type Message = {
  id: string;
  source: "user" | "ai";
  text: string;
  timestamp: number;
};

type DocumentMessage = {
  id: string;
  text: string;
};

const DocumentMessageSchema = z.object({
  event: z.object({
    text: z.string().optional(),
    id: z.string(),
  }),
});

function useAIDocumentMessages({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const handleOnDocumentMessage = useCallback(
    (documentMessage: DocumentMessage) => {
      const now = Date.now();

      setMessages((allMessages) => {
        const correspondingAiMessageIndex = allMessages.findIndex((message) => {
          return message.id === documentMessage.id;
        });
        if (correspondingAiMessageIndex === -1) {
          return allMessages.concat([
            {
              id: documentMessage.id,
              source: "ai",
              text: documentMessage.text,
              timestamp: now,
            },
          ]);
        }

        const existingAiMessage = allMessages[correspondingAiMessageIndex];
        const newAiMessages = allMessages.with(correspondingAiMessageIndex, {
          ...existingAiMessage,
          text: existingAiMessage.text + documentMessage.text,
        });
        return newAiMessages;
      });
    },
    [],
  );

  useEffect(() => {
    let channel: EventsChannel | undefined = undefined;
    let active = true;

    const channelName = `response/document/${documentId}`;

    async function handleConnection() {
      channel = await events.connect(channelName);
      if (!active) {
        return channel.close();
      }

      channel.subscribe({
        next: (data) => {
          if (!active) {
            return;
          }

          const {
            event: { text, id },
          } = DocumentMessageSchema.parse(data);
          if (!text) {
            return;
          }

          handleOnDocumentMessage({ id, text });
        },
        error: console.error,
      });
    }

    void handleConnection();

    return () => {
      active = false;
      channel?.close();
    };
  }, [documentId]);

  return messages;
}
