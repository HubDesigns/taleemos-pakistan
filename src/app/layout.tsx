import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaleemOS Pakistan",
  description: "One Platform. Every Institution. Complete Control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
