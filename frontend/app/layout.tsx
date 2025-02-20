"use server";

import { Sidenav } from "./components/Sidenav";
import "./globals.css";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={"flex flex-row gap-10 @container/body"}>
        <Sidenav />
        <main className={"py-6"}>{children}</main>
      </body>
    </html>
  );
}
