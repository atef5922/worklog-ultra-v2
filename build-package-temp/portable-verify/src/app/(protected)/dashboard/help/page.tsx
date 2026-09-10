import { Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const helpCards = [
  {
    icon: Mail,
    title: "Email Support",
    body: "Reach the enterprise support desk at info@mugneeit.com for account issues, onboarding help, and access requests.",
  },
  {
    icon: ShieldCheck,
    title: "Security & Access",
    body: "Use this route for role upgrades, approval questions, or account restriction support across Mugnee IT teams.",
  },
  {
    icon: MessageSquareText,
    title: "Operational Guidance",
    body: "Get help with morning plans, evening reporting, department assignments, and workflow conventions in the system.",
  },
];

export default async function HelpPage() {
  const user = await requireUser();

  return (
    <div className="space-y-5">
      <Card className="rounded-[28px] bg-[#162033]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Enterprise Help Desk</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Support for {user.name}</h1>
            <p className="mt-3 max-w-3xl text-[15px] text-[var(--muted-foreground)]">
              This workspace is backed by Mugnee enterprise support. For technical, account, or operational questions, use the contact path below.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[rgba(255,255,255,0.04)] px-5 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-foreground)]">Primary Contact</p>
            <p className="mt-2 text-xl font-semibold text-white">info@mugneeit.com</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {helpCards.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                <item.icon className="h-5 w-5" />
              </div>
              <CardTitle className="mt-4">{item.title}</CardTitle>
              <CardDescription>{item.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How To Get Fast Help</CardTitle>
          <CardDescription>Use these support notes to keep the enterprise workflow moving.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            Include your role, department, and a short summary when sending support requests to <span className="font-semibold text-white">info@mugneeit.com</span>.
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            For account image, profile, or workspace identity changes, visit <span className="font-semibold text-white">Settings</span> first and save your latest information.
          </div>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-muted)] p-4">
            Leadership users can route reporting and analytics questions through the same enterprise help contact without leaving this dashboard system.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
