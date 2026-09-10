import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-60 disabled:hover:translate-y-0",
  {
    variants: {
      variant: {
        default:
          "button-force-white border-transparent bg-[var(--ring)] px-4 py-2 text-white hover:bg-[#5683ff] hover:shadow-[0_10px_20px_rgba(49,95,230,0.32)]",
        // Hover tints toward the brand instead of flipping to a dark fill with
        // white text: light theme force-overrides `hover:text-white`, so that
        // combination rendered dark text on a dark button.
        secondary:
          "border-[var(--panel-border)] bg-[var(--panel-alt)] px-4 py-2 text-[var(--foreground)] hover:border-[#4f5ef7]/55 hover:bg-[#4f5ef7]/12 hover:text-[#4f5ef7] hover:shadow-[0_8px_18px_rgba(79,94,247,0.2)]",
        outline:
          "border-[var(--panel-border)] bg-transparent px-4 py-2 text-[var(--foreground)] hover:border-[#4f5ef7]/55 hover:bg-[#4f5ef7]/10 hover:text-[#4f5ef7] hover:shadow-[0_8px_18px_rgba(79,94,247,0.16)]",
        ghost:
          "border-transparent bg-transparent px-3 py-2 text-[var(--muted-foreground)] hover:bg-[#4f5ef7]/10 hover:text-[#4f5ef7]",
        danger:
          "button-force-white border-transparent bg-[var(--danger)] px-4 py-2 text-white hover:bg-[#e26f80] hover:shadow-[0_10px_20px_rgba(213,84,106,0.32)]",
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
