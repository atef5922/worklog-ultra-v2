import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { Toaster } from "sonner";
import type { CSSProperties } from "react";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkLog Ultra",
  description: "Daily work plan and reporting dashboard",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
      data-sidebar-collapsed="true"
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeScript />
        {children}
        <Toaster
          position="bottom-right"
          richColors
          gap={8}
          visibleToasts={3}
          offset={16}
          mobileOffset={12}
          style={{ "--width": "min(300px, calc(100vw - 24px))" } as CSSProperties}
          toastOptions={{ className: "worklog-toast" }}
        />
      </body>
    </html>
  );
}
