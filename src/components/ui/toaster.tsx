"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      richColors
      theme="light"
      position="top-right"
      duration={1400}
      gap={8}
      visibleToasts={3}
      offset={{ top: 16, right: 16 }}
      mobileOffset={{ top: 12, right: 12, left: 12 }}
      toastOptions={{
        className:
          "!min-h-0 !w-[18rem] !max-w-[calc(100vw-2rem)] !rounded-xl !border !border-[var(--panel-border)] !bg-[var(--panel)] !px-3 !py-2.5 !text-[0.78rem] !leading-5 !text-[var(--foreground)] !shadow-[0_10px_26px_rgba(15,23,42,0.14)]",
        classNames: {
          success:
            "!border-emerald-200 !bg-emerald-50 !text-emerald-800",
          error: "!border-rose-200 !bg-rose-50 !text-rose-800",
          warning: "!border-amber-200 !bg-amber-50 !text-amber-800",
          info: "!border-sky-200 !bg-sky-50 !text-sky-800",
          icon: "!h-4 !w-4 !shrink-0",
          content: "!gap-0",
          title: "!text-[0.78rem] !font-semibold !leading-5",
          description: "!text-[0.7rem] !leading-4 !opacity-80",
          actionButton:
            "!h-7 !rounded-lg !px-2.5 !text-[0.7rem] !font-semibold",
          cancelButton:
            "!h-7 !rounded-lg !px-2.5 !text-[0.7rem] !font-semibold",
        },
      }}
    />
  );
}
