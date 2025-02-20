"use server";

import Link from "next/link";
import { listDocuments } from "../lib/network";

export async function Sidenav() {
  const documents = await listDocuments();
  return (
    <nav className={"px-6 py-4 bg-amber-100 h-[100cqh]"}>
      <ul>
        {documents.map((document) => {
          return (
            <li>
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
    </nav>
  );
}
