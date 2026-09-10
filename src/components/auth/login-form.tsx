"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseApiResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { safeRedirect } from "@/lib/utils";

const REMEMBERED_EMAIL_STORAGE_KEY = "worklog-remembered-email";

function getRememberedEmail() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY) ?? "";
}

export function LoginForm({ variant = "default" }: { variant?: "default" | "minimal" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(() => getRememberedEmail());
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => Boolean(getRememberedEmail()));
  const isMinimal = variant === "minimal";

  // Desktop only: a bare Electron window has no Chrome-style "save
  // password?" prompt (that UI belongs to Chrome itself, not Chromium), so
  // "remember me" could never have remembered a password through the
  // browser — it needs the app to store one itself. The browser/web path
  // below keeps remembering only the email and relies on the browser's own
  // password manager, which does exist there.
  useEffect(() => {
    if (!window.worklogDesktop?.isDesktop) return;
    void window.worklogDesktop.loadCredentials().then((saved) => {
      if (!saved) return;
      setEmail(saved.email);
      setPassword(saved.password);
      setRememberMe(true);
    });
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrorMessage("");
    setLoading(true);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      remember: formData.get("remember") === "on",
    };

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await parseApiResponse<{ message: string }>(response, "Login request failed.");
    setLoading(false);

    if (!response.ok) {
      setErrorMessage(result.message);
      toast.error(result.message);
      return;
    }

    if (window.worklogDesktop?.isDesktop) {
      if (payload.remember) {
        void window.worklogDesktop.saveCredentials(payload.email, payload.password);
      } else {
        void window.worklogDesktop.clearCredentials();
      }
    } else if (payload.remember) {
      window.localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, payload.email);
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
    }

    setErrorMessage("");
    router.push(safeRedirect(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form autoComplete="on" onSubmit={onSubmit} className={cn("space-y-4", isMinimal && "space-y-5")}>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Email</Label>
        <div className="relative">
          <Mail
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]",
              isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90",
            )}
          />
          <Input
            autoComplete="username"
            className={cn(
              "h-10 rounded-xl pl-9",
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setErrorMessage("");
            }}
            value={email}
            type="email"
            placeholder="Email ID"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Password</Label>
        <div className="relative">
          <LockKeyhole
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]",
              isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90",
            )}
          />
          <Input
            autoComplete="current-password"
            className={cn(
              "h-10 rounded-xl pl-9 pr-10",
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              setErrorMessage("");
            }}
            value={password}
            type={showPassword ? "text" : "password"}
            placeholder="Password"
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] transition-colors hover:text-white",
              isMinimal && "right-3 text-slate-600 hover:text-slate-900",
            )}
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {errorMessage ? (
        <div
          aria-live="polite"
          className={cn(
            "rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200",
            isMinimal && "rounded-lg border-red-700/30 bg-red-50 text-red-700",
          )}
        >
          {errorMessage}
        </div>
      ) : null}
      <div className={cn("flex items-center justify-between pt-1 text-sm text-[var(--muted-foreground)]", isMinimal && "pt-0 text-[13px] text-slate-700")}>
        <label className={cn("flex items-center gap-2", isMinimal && "text-slate-700")}>
          <input
            className="h-3.5 w-3.5 accent-slate-900"
            checked={rememberMe}
            name="remember"
            onChange={(event) => {
              const nextRememberMe = event.target.checked;
              setRememberMe(nextRememberMe);

              if (!nextRememberMe) {
                window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
                if (window.worklogDesktop?.isDesktop) void window.worklogDesktop.clearCredentials();
              }
            }}
            type="checkbox"
          />
          <span>Remember me</span>
        </label>
        <Link href="/auth/forgot-password" className={cn("hover:text-white", isMinimal && "hover:text-slate-900")}>
          Forgot Password?
        </Link>
      </div>
      <Button
        className={cn(
          "auth-action-button mt-1 h-10 w-full rounded-xl",
          isMinimal &&
            "mt-2 h-12 rounded-none border-0 bg-[#102f5c] text-[17px] font-semibold uppercase tracking-[0.18em] hover:bg-[#173b71]",
        )}
        disabled={loading}
        type="submit"
      >
        {loading ? "Signing in..." : "Login"}
      </Button>
      <div className={cn("flex items-center justify-between pt-1 text-sm text-[var(--muted-foreground)]", isMinimal && "pt-0 text-[13px] text-slate-700")}>
        <span />
        <Link href="/auth/signup" className={cn("hover:text-white", isMinimal && "hover:text-slate-900")}>
          Create account
        </Link>
      </div>
    </form>
  );
}
