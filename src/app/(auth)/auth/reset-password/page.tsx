import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#9ec1f2_0%,#efc1d8_100%)] px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="mx-auto mb-10 h-px w-full max-w-[440px] bg-white/80" />
        <div className="mx-auto max-w-[390px]">
          <h1 className="mb-3 text-center text-[2.6rem] font-extralight tracking-[0.08em] text-slate-900">
            Reset Password
          </h1>
          <p className="mb-7 text-center text-sm text-slate-700">Create a new secure password and get back into your workspace.</p>
          <Suspense fallback={null}>
            <ResetPasswordForm variant="minimal" />
          </Suspense>
        </div>
        <div className="mx-auto mt-12 h-px w-full max-w-[440px] bg-white/80" />
      </div>
    </div>
  );
}
