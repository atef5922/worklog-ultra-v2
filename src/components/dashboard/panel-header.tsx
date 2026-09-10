import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared heading for dashboard panels: tinted icon chip + title + optional action.
 * Keeps every panel on the same rhythm instead of each card inventing its own header.
 */
export function PanelHeader({
  action,
  icon: Icon,
  title,
  tone = "bg-[#4f5ef7]/10 text-[#4f5ef7]",
}: {
  action?: ReactNode;
  /** Optional: a panel that already sits under a page title can skip the chip. */
  icon?: LucideIcon;
  title: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {Icon ? (
          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="h-3 w-3" />
          </span>
        ) : null}
        <h3 className="truncate text-[0.84rem] font-bold tracking-[-0.01em] text-[var(--foreground)]">{title}</h3>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
