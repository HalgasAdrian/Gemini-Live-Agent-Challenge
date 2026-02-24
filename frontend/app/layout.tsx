import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Gemini Live Agent",
    description: "Real-time multimodal AI agent powered by Gemini",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
