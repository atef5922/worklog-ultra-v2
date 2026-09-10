import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function StatCard({
  title,
  value,
  subtitle,
  tone,
  href,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  tone: "blue" | "green" | "amber" | "purple";
  href?: string;
}) {
  const toneClass =
    tone === "green"
      ? "card-gradient-green"
      : tone === "amber"
        ? "card-gradient-amber"
        : tone === "purple"
          ? "card-gradient-purple"
          : "card-gradient-blue";

  const content = (
    <div
      className={`rounded-3xl p-5 text-white transition duration-200 ${toneClass} ${
        href ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">{title}</p>
        <ArrowUpRight className="h-4 w-4" />
      </div>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-white/80">{subtitle}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
