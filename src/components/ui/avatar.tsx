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

export function AvatarImage({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn("h-full w-full object-cover", className)} {...props} />;
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}
