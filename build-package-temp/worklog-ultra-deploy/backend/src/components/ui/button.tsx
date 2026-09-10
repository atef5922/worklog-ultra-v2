import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "button-force-white border-transparent bg-[var(--ring)] px-4 py-2 text-white hover:bg-[#5683ff]",
        secondary:
          "border-[var(--panel-border)] bg-[var(--panel-alt)] px-4 py-2 text-[var(--foreground)] hover:bg-[#2a3c55]",
        outline:
          "border-[var(--panel-border)] bg-transparent px-4 py-2 text-[var(--foreground)] hover:bg-[var(--panel-alt)]",
        ghost:
          "border-transparent bg-transparent px-3 py-2 text-[var(--muted-foreground)] hover:bg-[var(--panel-alt)] hover:text-[var(--foreground)]",
        danger:
          "button-force-white border-transparent bg-[var(--danger)] px-4 py-2 text-white hover:bg-[#e26f80]",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-5",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  ),
);

Button.displayName = "Button";
