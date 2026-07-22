import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { validateEnv } from "@/lib/env-validate";

validateEnv();

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "CutiSmart — Sistem Manajemen Cuti",
  description: "Sistem pengajuan dan persetujuan cuti digital untuk instansi pemerintah",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
