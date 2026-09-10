"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({
  variant = "default",
  presetEmail,
}: {
  variant?: "default" | "minimal";
  presetEmail?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isMinimal = variant === "minimal";
  const resolvedEmail = presetEmail ?? searchParams.get("email") ?? "";

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const code = String(formData.get("code") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        code,
        password,
      }),
    });
    const result = await parseApiResponse<{ message: string }>(response, "Password reset failed.");
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    router.push("/auth/login");
  }

  return (
    <form action={onSubmit} className={cn("space-y-5", isMinimal && "space-y-4")}>
      <div
        className={cn(
          "rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted-foreground)]",
          isMinimal && "rounded-lg border border-slate-700/45 bg-white/18 p-4 text-slate-800",
        )}
      >
        Enter the 6 digit code from your email and set a new secure password.
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Work email</Label>
        <div className="relative">
          <Mail className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            defaultValue={resolvedEmail}
            name="email"
            type="email"
            placeholder="name@company.com"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Reset code</Label>
        <div className="relative">
          <KeyRound className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base tracking-[0.18em] text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            inputMode="numeric"
            maxLength={6}
            name="code"
            placeholder="6 digit code"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>New password</Label>
        <div className="relative">
          <LockKeyhole className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Minimum 8 characters"
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] transition-colors hover:text-white", isMinimal && "right-3 text-slate-600 hover:text-slate-900")}
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Confirm password</Label>
        <div className="relative">
          <ShieldCheck className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Repeat your new password"
          />
          <button
            aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
            className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] transition-colors hover:text-white", isMinimal && "right-3 text-slate-600 hover:text-slate-900")}
            onClick={() => setShowConfirmPassword((current) => !current)}
            type="button"
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button
        className={cn(
          "auth-action-button w-full",
          isMinimal &&
            "h-12 rounded-none border-0 bg-[#102f5c] text-[17px] font-semibold uppercase tracking-[0.08em] hover:bg-[#173b71]",
        )}
        disabled={loading}
        type="submit"
      >
        {loading ? "Updating..." : "Reset Password"}
      </Button>
      <p className={cn("text-sm text-[var(--muted-foreground)]", isMinimal && "text-[13px] text-slate-700")}>
        <Link href="/auth/login" className={cn("inline-flex items-center gap-2 text-white hover:text-cyan-300", isMinimal && "font-medium text-slate-900 hover:text-[#173b71]")}>
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </p>
    </form>
  );
}
