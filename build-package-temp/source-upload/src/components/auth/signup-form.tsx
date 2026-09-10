"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound, BriefcaseBusiness, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseApiResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Department = { id: string; name: string };

const roleLabels: Record<string, string> = {
  employee: "Employee",
  hr: "HR",
  manager: "Team Head",
  admin: "CEO / Admin",
};

export function SignupForm({
  departments,
  variant = "default",
}: {
  departments: Department[];
  variant?: "default" | "minimal";
}) {
  const router = useRouter();
  const [role, setRole] = useState("employee");
  const [otpStage, setOtpStage] = useState<{ email: string; role: string; otp?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const isMinimal = variant === "minimal";

  const requiresDepartment = role !== "admin";
  const requiresCode = role !== "employee";
  const otpLabel = useMemo(() => roleLabels[role], [role]);

  async function register(formData: FormData) {
    setLoading(true);
    const payload = {
      role,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      designation: String(formData.get("designation") ?? ""),
      departmentId: requiresDepartment ? String(formData.get("departmentId") ?? "") : null,
      accessCode: String(formData.get("accessCode") ?? ""),
    };

    const response = await fetch("/api/auth/register-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await parseApiResponse<{ message: string; otp?: string }>(response, "Registration request failed.");
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setOtpStage({ email: payload.email, role, otp: result.otp });
  }

  async function verify(formData: FormData) {
    setLoading(true);
    const response = await fetch("/api/auth/register-role/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: otpStage?.email,
        role: otpStage?.role,
        code: String(formData.get("code") ?? ""),
      }),
    });
    const result = await parseApiResponse<{ message: string }>(response, "Verification request failed.");
    setLoading(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    router.push("/dashboard");
    router.refresh();
  }

  if (otpStage) {
    return (
      <form action={verify} className={cn("space-y-5", isMinimal && "space-y-4")}>
        <div
          className={cn(
            "rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4 text-sm text-[var(--muted-foreground)]",
            isMinimal && "rounded-lg border-slate-700/45 bg-white/14 p-3 text-slate-800",
          )}
        >
          Verify your {roleLabels[otpStage.role]} account for{" "}
          <span className={cn(isMinimal ? "font-semibold text-slate-900" : "text-white")}>
            {otpStage.email}
          </span>.
        </div>
        <div className="space-y-2">
          <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Verification Code</Label>
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="code"
            placeholder="Enter 6 digit code"
          />
        </div>
        <Button
          className={cn(
            "auth-action-button w-full",
            isMinimal &&
              "h-12 rounded-none border-0 bg-[#102f5c] text-[17px] font-semibold uppercase tracking-[0.18em] hover:bg-[#173b71]",
          )}
          disabled={loading}
          type="submit"
        >
          {loading ? "Verifying..." : "Verify and Continue"}
        </Button>
        <button
          className={cn(
            "w-full text-sm text-[var(--muted-foreground)] hover:text-white",
            isMinimal && "text-[13px] text-slate-700 hover:text-slate-900",
          )}
          onClick={() => setOtpStage(null)}
          type="button"
        >
          Back to signup
        </button>
        <Link
          className={cn(
            "inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--panel-border)] bg-[var(--panel-alt)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[#2a3c55]",
            isMinimal &&
              "h-11 rounded-none border border-slate-700/35 bg-transparent text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-900 hover:bg-white/10",
          )}
          href="/auth/login"
        >
          Go to Login
        </Link>
      </form>
    );
  }

  return (
    <form action={register} className={cn("space-y-5", isMinimal && "space-y-4")}>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 text-base text-slate-900 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
          >
            <SelectValue placeholder="Choose role" />
          </SelectTrigger>
          <SelectContent className={cn(isMinimal && "border-slate-300 bg-white text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.18)]")}>
            {Object.entries(roleLabels).map(([value, label]) => (
              <SelectItem
                className={cn(isMinimal && "data-[state=checked]:bg-slate-100 data-[state=checked]:text-slate-900 data-[highlighted]:bg-[#173b71] data-[highlighted]:text-white")}
                key={value}
                value={value}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Full Name</Label>
        <div className="relative">
          <UserRound className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="name"
            placeholder="Your full name"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Email</Label>
        <div className="relative">
          <Mail className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="email"
            type="email"
            placeholder="Email ID"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Password</Label>
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
        <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Designation</Label>
        <div className="relative">
          <BriefcaseBusiness className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
          <Input
            className={cn(
              isMinimal &&
                "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
            )}
            name="designation"
            placeholder="Optional designation"
          />
        </div>
      </div>
      {requiresDepartment ? (
        <div className="space-y-2">
          <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>Department</Label>
          <Select name="departmentId">
            <SelectTrigger
              className={cn(
                isMinimal &&
                  "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 text-base text-slate-900 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
              )}
            >
              <SelectValue placeholder="Choose department" />
            </SelectTrigger>
            <SelectContent className={cn(isMinimal && "border-slate-300 bg-white text-slate-800 shadow-[0_20px_60px_rgba(15,23,42,0.18)]")}>
              {departments.map((department) => (
                <SelectItem
                  className={cn(isMinimal && "data-[state=checked]:bg-slate-100 data-[state=checked]:text-slate-900 data-[highlighted]:bg-[#173b71] data-[highlighted]:text-white")}
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {requiresCode ? (
        <div className="space-y-2">
          <Label className={cn(isMinimal && "mb-1 text-[13px] font-medium text-slate-700")}>{otpLabel} Access Code</Label>
          <div className="relative">
            <ShieldCheck className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]", isMinimal && "left-3 h-[17px] w-[17px] text-slate-700/90")} />
            <Input
              className={cn(
                isMinimal &&
                  "h-11 rounded-lg border border-slate-700/45 bg-white/16 px-3 pl-11 pr-11 text-base text-slate-900 placeholder:text-slate-600 shadow-none transition-colors hover:border-slate-800/70 focus:border-slate-900",
              )}
              name="accessCode"
              type={showAccessCode ? "text" : "password"}
              placeholder="Enter role access code"
            />
            <button
              aria-label={showAccessCode ? "Hide access code" : "Show access code"}
              className={cn("absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] transition-colors hover:text-white", isMinimal && "right-3 text-slate-600 hover:text-slate-900")}
              onClick={() => setShowAccessCode((current) => !current)}
              type="button"
            >
              {showAccessCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : null}
      <Button
        className={cn(
          "auth-action-button w-full",
          isMinimal &&
            "mt-2 h-12 rounded-none border-0 bg-[#102f5c] text-[17px] font-semibold uppercase tracking-[0.08em] hover:bg-[#173b71]",
        )}
        disabled={loading}
        type="submit"
      >
        {loading ? "Sending verification..." : "Create Account"}
      </Button>
      <Link
        className={cn(
          "inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--panel-border)] bg-[var(--panel-alt)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[#2a3c55]",
          isMinimal &&
            "h-11 rounded-none border border-slate-700/35 bg-transparent text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-900 hover:bg-white/10",
        )}
        href="/auth/login"
      >
        Go to Login
      </Link>
      <p className={cn("text-sm text-[var(--muted-foreground)]", isMinimal && "text-[13px] text-slate-700")}>
        Already registered?{" "}
        <Link href="/auth/login" className={cn("text-white hover:text-cyan-300", isMinimal && "font-medium text-slate-900 hover:text-[#173b71]")}>
          Login here
        </Link>
      </p>
    </form>
  );
}
