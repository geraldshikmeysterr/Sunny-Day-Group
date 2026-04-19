import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Солнечный день — Панель управления",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers triggers dynamic rendering — required for nonce-based CSP.
  // Next.js reads x-nonce from request headers and applies it to its own inline scripts.
  headers();

  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
