import { AppLogo } from "@/components/shared/app-logo";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-backdrop flex min-h-screen items-center px-4 py-4 text-[var(--foreground)] lg:px-6">
      <div className="mx-auto grid w-full max-w-[1040px] gap-4 lg:max-h-[760px] lg:grid-cols-[1fr_0.78fr]">
        <section className="panel hidden overflow-hidden rounded-[24px] p-6 lg:flex lg:flex-col lg:gap-8">
          <div className="space-y-3.5">
            <AppLogo />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">
                Daily Work Planning System
              </p>
              <h1 className="max-w-sm text-[2.45rem] font-semibold leading-[1.04] text-white xl:text-[2.7rem]">
                Premium work planning and reporting.
              </h1>
              <p className="max-w-sm text-sm leading-5.5 text-[var(--muted-foreground)]">
                One dark control center for plans, reports, and team visibility.
              </p>
            </div>
          </div>
          <div className="mt-auto grid gap-3 md:grid-cols-3">
            {[
              ["Plans", "Morning tasks"],
              ["Reports", "Daily updates"],
              ["Control", "Role analytics"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-3.5">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-foreground)]">{label}</p>
                <p className="mt-1.5 text-sm text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="panel flex overflow-hidden rounded-[24px] p-5 sm:p-6">
          <div className="m-auto w-full max-w-sm">
            <div className="mb-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Secure Access</p>
              <h2 className="text-[1.72rem] font-semibold text-white">{title}</h2>
              <p className="max-w-xs text-sm leading-5 text-[var(--muted-foreground)]">{description}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
