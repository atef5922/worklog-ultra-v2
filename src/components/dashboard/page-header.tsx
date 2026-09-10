import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Standard page title row: the same gradient chip the dashboard greeting uses,
 * the page name, a one-line subtitle, and an optional action on the right.
 * Every dashboard page opens with this so they read as one product.
 */
export function PageHeader({
  action,
  icon: Icon,
  subtitle,
  title,
}: {
  action?: ReactNode;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}) {
  return (
    <section
      // shrink-0 so a fit-viewport page cannot squash the title when the content
      // below it is competing for height.
      className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
      data-page-section
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.75rem] bg-[linear-gradient(140deg,#6172ff_0%,#7c6cf8_46%,#a855f7_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.38),inset_0_0_0_1px_rgba(255,255,255,0.22),0_4px_10px_rgba(79,94,247,0.26)]">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.3} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[0.98rem] font-semibold leading-tight text-[var(--foreground)] sm:text-[1.05rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-[0.72rem] leading-4 text-[var(--muted-foreground)]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
