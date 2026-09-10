"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function Avatar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--panel-border)] bg-[var(--panel-alt)]",
        className,
      )}
    >
      {children}
    </AvatarPrimitive.Root>
  );
}

export function AvatarImage(props: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className="h-full w-full object-cover" {...props} />;
}

export function AvatarFallback(
  props: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>,
) {
  return (
    <AvatarPrimitive.Fallback
      className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--foreground)]"
      {...props}
    />
  );
}
