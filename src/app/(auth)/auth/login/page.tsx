import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#9ec1f2_0%,#efc1d8_100%)] px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="mx-auto mb-10 h-px w-full max-w-[440px] bg-white/80" />
        <div className="mx-auto max-w-[390px]">
          <h1 className="mb-8 text-center text-[3rem] font-extralight tracking-[0.18em] text-slate-900">
            User Login
          </h1>
          <Suspense fallback={null}>
            <LoginForm variant="minimal" />
          </Suspense>
        </div>
        <div className="mx-auto mt-12 h-px w-full max-w-[440px] bg-white/80" />
      </div>
    </div>
  );
}
