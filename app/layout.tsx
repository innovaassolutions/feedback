import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { PLATFORM_THEME, themeCss } from "@/lib/theme/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "Course Feedback Platform",
  description: "Session-by-session feedback, Q&A and results for training courses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(PLATFORM_THEME, ":root") }} />
      </head>
      <body className="min-h-screen bg-background text-text antialiased">{children}</body>
    </html>
  );
}
