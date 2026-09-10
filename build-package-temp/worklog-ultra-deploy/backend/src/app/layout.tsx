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
    icon: "/icon.svg",
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
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
