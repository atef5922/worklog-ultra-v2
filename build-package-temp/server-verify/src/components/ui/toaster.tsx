"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      richColors
      theme="light"
      position="top-right"
      toastOptions={{
        className: "!border !border-[var(--panel-border)] !bg-[var(--panel)] !text-[var(--foreground)]",
        classNames: {
          success:
            "!border !border-emerald-300 !bg-emerald-50 !text-emerald-700",
        },
      }}
    />
  );
}
