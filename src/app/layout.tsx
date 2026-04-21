import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Солнечный день — Панель управления",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  headers();

  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
