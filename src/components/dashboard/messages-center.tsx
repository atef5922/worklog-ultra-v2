"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Paperclip, Search, SendHorizonal } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Contact = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string | null;
  department: { name: string } | null;
};

type MessageParty = {
  name: string;
  role: string;
  avatarUrl?: string | null;
};

type MessageAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
};

type Message = {
  id: string;
  subject: string | null;
  body: string;
  readAt: Date | string | null;
  createdAt: Date | string;
  senderId: string;
  recipientId: string;
  sender: MessageParty;
  recipient: MessageParty;
  attachments: MessageAttachment[];
};

type ConversationMessage = Message & {
  direction: "incoming" | "outgoing";
  partnerId: string;
  partnerName: string;
  isUnreadIncoming: boolean;
};

type ConversationSummary = {
  contact: Contact;
  messages: ConversationMessage[];
  unreadCount: number;
  latestMessageAt: number;
  latestPreview: string;
};

function getContactMeta(contact: Contact) {
  return contact.department?.name ?? contact.role;
}

function formatClock(value: Date | string) {
  return new Intl.DateTimeFormat("en-BD", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function parseApiResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const map = new Map<string, Message>();

  for (const message of current) {
    map.set(message.id, message);
  }

  for (const message of incoming) {
    map.set(message.id, {
      ...message,
      attachments: message.attachments ?? [],
    });
  }

  return Array.from(map.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function mergeContacts(current: Contact[], incoming: Contact[]) {
  const map = new Map<string, Contact>();

  for (const contact of current) {
    map.set(contact.id, contact);
  }

  for (const contact of incoming) {
    map.set(contact.id, contact);
  }

  return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function MessagesCenter({
  currentUserId,
  contacts = [],
  messages = [],
}: {
  currentUserId: string;
  contacts: Contact[];
  messages: Message[];
}) {
  const [liveContacts, setLiveContacts] = useState<Contact[]>(contacts);
  const [liveMessages, setLiveMessages] = useState<Message[]>(messages);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [search, setSearch] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const fileInputId = "workspace-chat-file-input";
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLiveContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    let active = true;

    async function refreshMessages() {
      const response = await fetch("/api/messages", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const result = (await response.json()) as {
        contacts?: Contact[];
        inbox?: Message[];
      };

      if (!active) {
        return;
      }

      setLiveContacts((current) => mergeContacts(current, result.contacts ?? []));
      setLiveMessages((current) => mergeMessages(current, result.inbox ?? []));
    }

    void refreshMessages();
    const intervalId = window.setInterval(() => {
      void refreshMessages();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const normalizedMessages = useMemo<ConversationMessage[]>(
    () =>
      (liveMessages ?? []).map((message) => {
        const outgoing = message.senderId === currentUserId;

        return {
          ...message,
          direction: outgoing ? "outgoing" : "incoming",
          partnerId: outgoing ? message.recipientId : message.senderId,
          partnerName: outgoing ? message.recipient.name : message.sender.name,
          isUnreadIncoming: !outgoing && !message.readAt,
        };
      }),
    [currentUserId, liveMessages],
  );

  const conversations = useMemo<ConversationSummary[]>(() => {
    const map = new Map<string, ConversationSummary>();

    for (const contact of liveContacts ?? []) {
      map.set(contact.id, {
        contact,
        messages: [],
        unreadCount: 0,
        latestMessageAt: 0,
        latestPreview: "Start chatting",
      });
    }

    for (const message of normalizedMessages) {
      const fallbackContact: Contact = {
        id: message.partnerId,
        name: message.partnerName,
        role: message.direction === "outgoing" ? message.recipient.role : message.sender.role,
        avatarUrl: message.direction === "outgoing" ? message.recipient.avatarUrl ?? null : message.sender.avatarUrl ?? null,
        department: null,
      };

      const current =
        map.get(message.partnerId) ??
        ({
          contact: fallbackContact,
          messages: [],
          unreadCount: 0,
          latestMessageAt: 0,
          latestPreview: "Start chatting",
        } satisfies ConversationSummary);

      current.messages.push(message);
      current.latestMessageAt = Math.max(current.latestMessageAt, new Date(message.createdAt).getTime());
      current.latestPreview = message.body.trim() || "Attachment";

      if (message.isUnreadIncoming) {
        current.unreadCount += 1;
      }

      map.set(message.partnerId, current);
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        messages: [...item.messages].sort(
          (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        ),
      }))
      .sort((left, right) => {
        if (right.latestMessageAt !== left.latestMessageAt) {
          return right.latestMessageAt - left.latestMessageAt;
        }

        return left.contact.name.localeCompare(right.contact.name);
      });
  }, [liveContacts, normalizedMessages]);

  const filteredConversations = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return conversations;
    }

    return conversations.filter((item) =>
      [item.contact.name, item.contact.role, item.contact.department?.name ?? "", item.latestPreview]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversations, deferredSearch]);

  useEffect(() => {
    if (!filteredConversations.length) {
      setSelectedContactId("");
      return;
    }

    setSelectedContactId((current) => {
      if (current && filteredConversations.some((item) => item.contact.id === current)) {
        return current;
      }

      return filteredConversations[0]?.contact.id ?? "";
    });
  }, [filteredConversations]);

  const selectedConversation =
    filteredConversations.find((item) => item.contact.id === selectedContactId) ??
    conversations.find((item) => item.contact.id === selectedContactId) ??
    null;
  const selectedContact = selectedConversation?.contact ?? null;

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [selectedConversation?.messages.length]);

  async function sendMessage() {
    if (!selectedContact?.id || !body.trim()) {
      toast.error("Choose a teammate and write a message first.");
      return;
    }

    setSending(true);
    const payload = new FormData();
    payload.append("recipientId", selectedContact.id);
    payload.append("subject", "");
    payload.append("body", body.trim());
    attachments.forEach((file) => payload.append("attachments", file));

    const response = await fetch("/api/messages", {
      method: "POST",
      body: payload,
    });

    const result = parseApiResponse(await response.text()) as {
      message?: string;
      sentMessage?: Message;
    };
    setSending(false);

    if (!response.ok) {
      toast.error(result.message ?? "Message could not be sent.");
      return;
    }

    if (result.sentMessage) {
      setLiveMessages((current) => mergeMessages(current, [result.sentMessage as Message]));
    }

    setBody("");
    setAttachments([]);
    toast.success(result.message ?? "Message sent successfully.");
  }

  return (
    <div className="grid overflow-hidden rounded-[30px] border border-[#d8e3f7] bg-white shadow-[0_26px_70px_rgba(15,23,42,0.12)] lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="border-b border-[#dfe7f6] bg-[linear-gradient(180deg,#f5f9ff_0%,#edf4ff_100%)] lg:border-b-0 lg:border-r">
        <div className="border-b border-[#dfe7f6] px-5 py-5">
          <h2 className="text-[1.9rem] font-bold tracking-[-0.03em] text-[#0f2345]">Messages</h2>
          <p className="mt-1 text-sm text-[#6780a8]">Live team chat with files, avatars, and instant refresh.</p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ca0c4]" />
            <Input
              className="h-12 rounded-[18px] border-[#d2ddf4] bg-white/95 pl-10 text-[#10203a] placeholder:text-[#8ca0c4]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teammate"
              value={search}
            />
          </div>
        </div>

        <div className="max-h-[760px] space-y-2 overflow-y-auto p-3">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const active = conversation.contact.id === selectedConversation?.contact.id;

              return (
                <button
                  key={conversation.contact.id}
                  className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition ${
                    active
                      ? "border-[#6da8ff] bg-[linear-gradient(135deg,#dbeafe_0%,#bfdbfe_48%,#eff6ff_100%)] shadow-[0_12px_30px_rgba(59,130,246,0.18)]"
                      : "border-[#dce6f8] bg-white/92 hover:border-[#c6d7f5] hover:bg-[#f6faff]"
                  }`}
                  onClick={() => setSelectedContactId(conversation.contact.id)}
                  type="button"
                >
                  <Avatar className="h-12 w-12 border border-[#cddbf4] shadow-sm">
                    <AvatarImage
                      alt={conversation.contact.name}
                      src={conversation.contact.avatarUrl ?? undefined}
                    />
                    <AvatarFallback className="bg-[#e9f1ff] text-[#18407d]">
                      {getInitials(conversation.contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[#10203a]">{conversation.contact.name}</p>
                      <span className="shrink-0 text-[11px] text-[#7f94ba]">
                        {conversation.latestMessageAt ? formatClock(new Date(conversation.latestMessageAt)) : ""}
                      </span>
                    </div>
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b85af]">
                      {getContactMeta(conversation.contact)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate text-xs text-[#5f7398]">{conversation.latestPreview}</p>
                      {conversation.unreadCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1d9bf0] px-1.5 text-[10px] font-bold text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-10 text-center text-sm text-[#8fa1c2]">No teammate found.</div>
          )}
        </div>
      </aside>

      <section className="flex min-h-[780px] flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_100%)]">
        <div className="flex items-center gap-4 border-b border-[#dde8f8] bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)] px-5 py-4">
          <Avatar className="h-14 w-14 border border-[#cbdbf8] shadow-sm">
            <AvatarImage alt={selectedContact?.name ?? "Selected teammate"} src={selectedContact?.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-[#eaf2ff] text-[#173f7d]">
              {getInitials(selectedContact?.name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold text-[#10203a]">{selectedContact?.name ?? "Choose teammate"}</p>
            <p className="truncate text-sm text-[#60779f]">
              {selectedContact ? getContactMeta(selectedContact) : "Select a user from the left to open the chat"}
            </p>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, rgba(59,130,246,0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(14,165,233,0.08), transparent 24%)",
          }}
        >
          {selectedConversation?.messages.length ? (
            <div className="space-y-4">
              {selectedConversation.messages.map((message) => {
                const isOutgoing = message.direction === "outgoing";
                const avatarName = isOutgoing ? message.sender.name : message.sender.name;
                const avatarUrl = isOutgoing ? message.sender.avatarUrl ?? null : message.sender.avatarUrl ?? null;

                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-3 ${isOutgoing ? "justify-end" : "justify-start"}`}
                  >
                    {!isOutgoing ? (
                      <Avatar className="h-10 w-10 border border-[#bfdbfe] bg-[#dbeafe] shadow-[0_10px_25px_rgba(59,130,246,0.18)]">
                        <AvatarImage alt={avatarName} src={avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-[#93c5fd] text-[#0f2d66]">
                          {getInitials(avatarName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}

                    <div className={`max-w-[86%] sm:max-w-[72%] ${isOutgoing ? "items-end" : "items-start"}`}>
                      <div
                        className={`rounded-[24px] px-4 py-3 shadow-[0_12px_30px_rgba(15,23,42,0.16)] ${
                          isOutgoing
                            ? "rounded-br-md bg-[linear-gradient(135deg,#0ea5e9_0%,#2563eb_55%,#1d4ed8_100%)] text-white"
                            : "rounded-bl-md bg-[linear-gradient(135deg,#93c5fd_0%,#60a5fa_42%,#3b82f6_100%)] text-[#eff6ff]"
                        }`}
                      >
                        <p className="break-words whitespace-pre-line text-sm leading-6">{message.body}</p>
                        {message.attachments.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                                  isOutgoing
                                    ? "bg-white/15 text-white hover:bg-white/20"
                                    : "bg-white/20 text-[#eff6ff] hover:bg-white/28"
                                }`}
                                href={attachment.fileUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{attachment.fileName}</span>
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <p
                        className={`mt-1 px-2 text-[11px] text-[#7590ba] ${
                          isOutgoing ? "text-right" : "text-left"
                        }`}
                      >
                        {isOutgoing ? "You" : message.sender.name} -{" "}
                        {formatDistanceToNowStrict(new Date(message.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {isOutgoing ? (
                      <Avatar className="h-10 w-10 border border-white/10 bg-[#12325e] shadow-[0_10px_25px_rgba(15,23,42,0.2)]">
                        <AvatarImage alt={message.sender.name} src={message.sender.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-[#2456a6] text-white">
                          {getInitials(message.sender.name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center rounded-[28px] border border-dashed border-[#cfe0fb] bg-white/70 p-8 text-center text-sm text-[#738bb0]">
              {selectedContact
                ? `${selectedContact.name} er sathe ekhono kono message nei. Nicher box theke chat start korte paren.`
                : "Select a user from the left to open the chat."}
            </div>
          )}
        </div>

        <div className="border-t border-[#dbe6f8] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="flex-1">
              <Textarea
                className="min-h-[60px] rounded-[22px] border-[#d5e1f7] bg-white text-[#10203a] placeholder:text-[#8ca0c4]"
                disabled={!selectedContact}
                onChange={(event) => setBody(event.target.value)}
                placeholder={selectedContact ? `Type a message for ${selectedContact.name}...` : "Select teammate first"}
                value={body}
              />
            </div>

            <div className="flex flex-col gap-3 xl:min-w-[320px]">
              <input
                className="hidden"
                disabled={!selectedContact}
                id={fileInputId}
                multiple
                onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                type="file"
              />

              <label
                className={`flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-sm transition ${
                  selectedContact
                    ? "cursor-pointer border-[#cfddf7] bg-[#eef5ff] text-[#10203a] hover:bg-[#e4efff]"
                    : "cursor-not-allowed border-[#e2e8f4] bg-[#f4f7fb] text-[#9aa9c2]"
                }`}
                htmlFor={selectedContact ? fileInputId : undefined}
              >
                <span
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                    selectedContact ? "bg-[#1d4ed8] text-white" : "bg-[#dbe4f2] text-[#7b8da9]"
                  }`}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Choose files
                </span>
                <span className="min-w-0 truncate text-right text-xs">
                  {attachments.length
                    ? attachments.length === 1
                      ? attachments[0]?.name
                      : `${attachments.length} files selected`
                    : "No file chosen"}
                </span>
              </label>

              <button
                className="flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#2563eb_0%,#1d4ed8_100%)] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.26)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-[#9db8f5] disabled:shadow-none"
                disabled={sending || !selectedContact}
                onClick={sendMessage}
                type="button"
              >
                <SendHorizonal className="h-4 w-4" />
                {sending ? "Sending..." : "Send message"}
              </button>
            </div>
          </div>

          {attachments.length ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#5f7398]">
              {attachments.map((file) => (
                <span
                  key={`${file.name}-${file.size}`}
                  className="rounded-full border border-[#d8e4f8] bg-white px-3 py-1.5"
                >
                  {file.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
