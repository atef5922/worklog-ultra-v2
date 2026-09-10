"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";

export function Progress({ value = 0 }: { value?: number }) {
  return (
    <ProgressPrimitive.Root className="relative h-2 w-full overflow-hidden rounded-full bg-[#243349]">
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-[var(--ring)] transition-all"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
