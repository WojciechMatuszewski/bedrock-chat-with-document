"use server";

import { Sidenav } from "./components/Sidenav";
import "./globals.css";
import { listDocuments } from "./lib/network";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const documentsPromise = listDocuments();

  return (
    <html lang="en">
      <body className={"flex flex-row gap-10 @container/body"}>
        <Sidenav documentsPromise={documentsPromise} />
        <main className={"py-6"}>{children}</main>
      </body>
    </html>
  );
}
