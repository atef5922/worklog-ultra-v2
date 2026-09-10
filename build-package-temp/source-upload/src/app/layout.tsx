import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { AppToaster } from "@/components/ui/toaster";
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
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeScript />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
