"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNowStrict } from "date-fns";

type Contact = {
  id: string;
  name: string;
  role: string;
  department: { name: string } | null;
};

type Message = {
  id: string;
  subject: string | null;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  senderId: string;
  recipientId: string;
  sender: { name: string; role: string };
  recipient: { name: string; role: string };
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }>;
};

export function MessagesCenter({
  currentUserId,
  contacts,
  messages,
}: {
  currentUserId: string;
  contacts: Contact[];
  messages: Message[];
}) {
  const router = useRouter();
  const [recipientId, setRecipientId] = useState(contacts[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const groupedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        direction: message.senderId === currentUserId ? "outgoing" : "incoming",
        isUnreadIncoming: message.senderId !== currentUserId && !message.readAt,
      })),
    [currentUserId, messages],
  );

  async function sendMessage() {
    if (!recipientId || !body.trim()) {
      toast.error("Choose a teammate and write a message first.");
      return;
    }

    setSending(true);
    const payload = new FormData();
    payload.append("recipientId", recipientId);
    payload.append("subject", subject);
    payload.append("body", body);
    attachments.forEach((file) => payload.append("attachments", file));
    const response = await fetch("/api/messages", {
      method: "POST",
      body: payload,
    });

    const raw = await response.text();
    const result = raw ? JSON.parse(raw) : { message: "Message could not be sent." };
    setSending(false);

    if (!response.ok) {
      toast.error(result.message);
      return;
    }

    setSubject("");
    setBody("");
    setAttachments([]);
    toast.success(result.message);
    router.refresh();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <section className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Direct Message</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Workspace Messaging</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Reach any employee, Team Head, HR, or CEO/Admin without leaving the dashboard shell.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <Label>Recipient</Label>
            <Select onValueChange={setRecipientId} value={recipientId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose teammate" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.name} · {contact.department?.name ?? contact.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Input onChange={(event) => setSubject(event.target.value)} placeholder="Optional subject" value={subject} />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea
              className="min-h-36"
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message for the workspace..."
              value={body}
            />
          </div>
          <div>
            <Label>Attachments</Label>
            <div className="relative">
              <Paperclip className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                className="pl-10 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--ring)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                multiple
                onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                type="file"
              />
            </div>
            {attachments.length ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                {attachments.map((file) => (
                  <span key={`${file.name}-${file.size}`} className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-muted)] px-2.5 py-1">
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <Button className="w-full" disabled={sending} onClick={sendMessage} type="button">
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Inbox</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent Messages</h2>
          </div>
          <Badge variant="purple">{messages.length} entries</Badge>
        </div>
        <div className="space-y-4">
          {groupedMessages.length ? (
            groupedMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border p-4 ${
                  message.direction === "outgoing"
                    ? "border-cyan-500/30 bg-cyan-500/6"
                    : message.isUnreadIncoming
                      ? "border-red-500/35 bg-red-500/8 shadow-[0_0_0_1px_rgba(239,68,68,0.14)]"
                      : "border-[var(--panel-border)] bg-[var(--panel-muted)]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">
                      {message.direction === "outgoing" ? `To ${message.recipient.name}` : `From ${message.sender.name}`}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      {message.direction === "outgoing" ? message.recipient.role : message.sender.role}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDistanceToNowStrict(new Date(message.createdAt), { addSuffix: true })}
                    </p>
                    {message.isUnreadIncoming ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ef4444] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_0_16px_rgba(239,68,68,0.35)]">
                        New
                      </span>
                    ) : null}
                  </div>
                </div>
                {message.subject ? <p className="mt-3 font-medium text-white">{message.subject}</p> : null}
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{message.body}</p>
                {message.attachments.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-cyan-300"
                        href={attachment.fileUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {attachment.fileName}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-muted)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              No messages yet. Start the first enterprise conversation from the composer.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
