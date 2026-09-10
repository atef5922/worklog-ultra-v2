"use client";

import Link from "next/link";
import { ArrowLeft, MailCheck, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm({ variant = "default" }: { variant?: "default" | "minimal" }) {
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [showInlineReset, setShowInlineReset] = useState(false);
  const isMinimal = variant === "minimal";

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    setLoading(true);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await parseApiResponse<{ message: string }>(response, "Password reset request failed.");
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    setSubmittedEmail(email);
    setShowInlineReset(true);
    toast.success(result.message);
  }

  if (submittedEmail) {
    return (
      <div className={cn("space-y-5", isMinimal && "space-y-4")}>
        <div
          className={cn(
            "rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted-foreground)]",
            isMinimal && "rounded-lg border border-slate-700/45 bg-white/18 p-4 text-slate-800",
          )}
        >
          <div className="flex items-start gap-3">
            <MailCheck className={cn("mt-0.5 h-5 w-5 text-cyan-300", isMinimal && "text-[#173b71]")} />
            <div>
              <p className={cn("font-semibold text-white", isMinimal && "text-slate-900")}>Check your inbox</p>
              <p className="mt-1">
                We sent a secure 6 digit password reset code to{" "}
                <span className={cn("font-semibold text-white", isMinimal && "text-slate-900")}>{submittedEmail}</span>.
              </p>
              <p className="mt-2">The code will expire in 30 minutes. If it does not arrive quickly, check Spam or Promotions.</p>
            </div>
          </div>
        </div>
        <div className={cn("rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4", isMinimal && "rounded-lg border border-slate-700/45 bg-white/18 p-4")}>
          {showInlineReset ? <ResetPasswordForm presetEmail={submittedEmail} variant={variant} /> : null}
        </div>
        <Button
          className={cn(
            "w-full",
            isMinimal &&
              "h-11 rounded-none border border-slate-700/35 bg-transparent text-sm font-medium uppercase tracking-[0.08em] text-slate-900 hover:bg-white/10",
          )}
          onClick={() => {
            setSubmittedEmail(null);
            setShowInlineReset(false);
          }}
          type="button"
          variant={isMinimal ? "ghost" : "secondary"}
        >
          Send Again
        </Button>
        <p className={cn("text-sm text-[var(--muted-foreground)]", isMinimal && "text-[13px] text-slate-700")}>
          <Link href="/auth/login" className={cn("inline-flex items-center gap-2 text-white hover:text-cyan-300", isMinimal && "font-medium text-slate-900 hover:text-[#173b71]")}>
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className={cn("space-y-5", isMinimal && "space-y-4")}>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Work email</Label>
        <div className="relative">
          <Mail className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="email"
            type="email"
            placeholder="name@company.com"
          />
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
        {loading ? "Sending..." : "Send Reset Code"}
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
