"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, FileText, Loader2, Paperclip, Search, SendHorizonal, Smile, X } from "lucide-react";
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
    const previous = map.get(message.id);
    map.set(message.id, {
      ...message,
      readAt: message.readAt ?? previous?.readAt ?? null,
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

const EMOJI_CHOICES = [
  ["Grinning", 0x1f600], ["Smile", 0x1f604], ["Laughing", 0x1f606], ["Joy", 0x1f602],
  ["Wink", 0x1f609], ["Heart eyes", 0x1f60d], ["Thinking", 0x1f914], ["Cool", 0x1f60e],
  ["Sad", 0x1f622], ["Crying", 0x1f62d], ["Surprised", 0x1f62e], ["Celebration", 0x1f973],
  ["Thumbs up", 0x1f44d], ["Thumbs down", 0x1f44e], ["Clap", 0x1f44f], ["Waving", 0x1f44b],
  ["Praying", 0x1f64f], ["Handshake", 0x1f91d], ["Muscle", 0x1f4aa], ["OK hand", 0x1f44c],
  ["Red heart", 0x2764], ["Blue heart", 0x1f499], ["Sparkles", 0x2728], ["Fire", 0x1f525],
  ["Party popper", 0x1f389], ["Star", 0x2b50], ["Check mark", 0x2705], ["Eyes", 0x1f440],
  ["Rocket", 0x1f680], ["Coffee", 0x2615], ["Light bulb", 0x1f4a1], ["Hundred", 0x1f4af],
] as const;

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const fileInputId = "workspace-chat-file-input";
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setLiveContacts(contacts);
  }, [contacts]);

  useEffect(() => {
    setLiveMessages(messages);
  }, [messages]);

  useEffect(() => {
    let active = true;

    async function refreshMessages() {
      const viewedId = document.visibilityState === "visible" ? selectedContactId : "";
      const url = viewedId ? "/api/messages?partnerId=" + encodeURIComponent(viewedId) : "/api/messages";
      const response = await fetch(url, { cache: "no-store" });

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
    document.addEventListener("visibilitychange", refreshMessages);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshMessages);
    };
  }, [selectedContactId]);

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

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "36px";
    textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 36), 112) + "px";
  }, [body]);

  useEffect(() => {
    if (!emojiOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!emojiPickerRef.current?.contains(event.target as Node)) setEmojiOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [emojiOpen]);

  function insertEmoji(emoji: string) {
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? start;
    setBody((current) => current.slice(0, start) + emoji + current.slice(end));
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const visibleEmojis = EMOJI_CHOICES.filter(([name]) =>
    name.toLowerCase().includes(emojiSearch.trim().toLowerCase()),
  );

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
    setEmojiOpen(false);
  }

  return (
    <div className="grid overflow-hidden rounded-[18px] border border-[#d8e3f7] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)] min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:grid-cols-[290px_minmax(0,1fr)]" data-fit-viewport>
      <aside className="flex max-h-[290px] min-h-0 flex-col border-b border-[#dfe7f6] bg-[#f7faff] min-[900px]:max-h-none min-[900px]:border-b-0 min-[900px]:border-r">
        <div className="shrink-0 border-b border-[#dfe7f6] px-4 py-3">
          <h2 className="text-xl font-bold tracking-[-0.02em] text-[#0f2345]">Messages</h2>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ca0c4]" />
            <Input
              className="h-9 rounded-xl border-[#d2ddf4] bg-white pl-9 text-sm text-[#10203a] placeholder:text-[#8ca0c4]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teammate"
              value={search}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => {
              const active = conversation.contact.id === selectedConversation?.contact.id;

              return (
                <button
                  key={conversation.contact.id}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                    active
                      ? "border-[#a9c8fa] bg-[#eaf2ff] shadow-sm"
                      : "border-[#dce6f8] bg-white/92 hover:border-[#c6d7f5] hover:bg-[#f6faff]"
                  }`}
                  onClick={() => setSelectedContactId(conversation.contact.id)}
                  type="button"
                >
                  <Avatar className="h-9 w-9 shrink-0 border border-[#cddbf4] shadow-sm">
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
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6b85af]">
                      {getContactMeta(conversation.contact)}
                    </p>
                    <div className="flex items-center gap-2">
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

      <section className="flex min-h-[420px] min-w-0 flex-col bg-[#f8fbff] min-[900px]:min-h-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#dde8f8] bg-white px-4 py-2.5">
          <Avatar className="h-10 w-10 border border-[#cbdbf8] shadow-sm">
            <AvatarImage alt={selectedContact?.name ?? "Selected teammate"} src={selectedContact?.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-[#eaf2ff] text-[#173f7d]">
              {getInitials(selectedContact?.name ?? "?")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[#10203a]">{selectedContact?.name ?? "Choose teammate"}</p>
            <p className="truncate text-xs text-[#60779f]">
              {selectedContact ? getContactMeta(selectedContact) : "Select a user from the left to open the chat"}
            </p>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {selectedConversation?.messages.length ? (
            <div className="flex min-h-full flex-col justify-end gap-2.5">
              {selectedConversation.messages.map((message) => {
                const isOutgoing = message.direction === "outgoing";
                const avatarName = isOutgoing ? message.sender.name : message.sender.name;
                const avatarUrl = isOutgoing ? message.sender.avatarUrl ?? null : message.sender.avatarUrl ?? null;

                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${isOutgoing ? "justify-end" : "justify-start"}`}
                  >
                    {!isOutgoing ? (
                      <Avatar className="h-8 w-8 border border-[#bfdbfe] bg-[#dbeafe]">
                        <AvatarImage alt={avatarName} src={avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-[#93c5fd] text-[#0f2d66]">
                          {getInitials(avatarName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : null}

                    <div className="max-w-[82%] sm:max-w-[68%]">
                      <div
                        className={`rounded-2xl border px-3 py-2 shadow-sm ${
                          isOutgoing
                            ? "rounded-br-sm border-[#cbdcfa] bg-[#eaf2ff] text-[#163b73]"
                            : "rounded-bl-sm border-[#d9e4f5] bg-white text-[#183153]"
                        }`}
                      >
                        <p className="break-words whitespace-pre-line text-sm leading-5">{message.body}</p>
                        {message.attachments.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                                  isOutgoing
                                    ? "bg-white text-[#2456a6] hover:bg-[#f8fbff]"
                                    : "bg-[#edf4ff] text-[#2456a6] hover:bg-[#e4efff]"
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
                      <p className={"mt-1 flex items-center gap-1.5 px-1 text-[11px] text-[#7185a6] " + (isOutgoing ? "justify-end" : "justify-start")}>
                        <span>{isOutgoing ? "You" : message.sender.name} - {formatDistanceToNowStrict(new Date(message.createdAt), { addSuffix: true })}</span>
                        {isOutgoing ? (
                          <span className={"inline-flex items-center gap-1 font-semibold " + (message.readAt ? "text-[#16785e]" : "text-[#657da5]")} title={message.readAt ? "Seen by " + message.recipient.name : "Sent, waiting to be seen"}>
                            {message.readAt ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                            {message.readAt ? "Seen" : "Sent"}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {isOutgoing ? (
                      <Avatar className="h-8 w-8 border border-[#cbdcfa] bg-[#eaf2ff]">
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

        <div className="shrink-0 border-t border-[#e2e8f3] bg-white px-3 py-3 sm:px-4">
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected attachments">
              {attachments.map((file, index) => (
                <span
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#dce6f5] bg-[#f3f7fd] py-1 pl-2.5 pr-1 text-xs text-[#38547d]"
                  key={file.name + "-" + file.size + "-" + index}
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="max-w-44 truncate">{file.name}</span>
                  <button
                    aria-label={"Remove " + file.name}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-[#dce8f8]"
                    onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-1 rounded-[22px] border border-[#d7e2f1] bg-[#f7f9fd] p-1.5 shadow-[0_2px_10px_rgba(20,45,90,0.04)] transition focus-within:border-[#8baceb] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#e9f0fd]">
            <Textarea
              ref={composerRef}
              rows={1}
              aria-label="Message"
              className="h-9 min-h-9 max-h-28 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border-0 bg-transparent px-3 py-2 text-sm leading-5 text-[#162c4b] shadow-none outline-none placeholder:text-[#8999b0] focus:border-0 focus:outline-none"
              disabled={!selectedContact}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (body.trim() && !sending) void sendMessage();
                }
              }}
              placeholder={selectedContact ? "Message " + selectedContact.name + "..." : "Select teammate first"}
              value={body}
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <div className="relative" ref={emojiPickerRef}>
                <button
                  aria-expanded={emojiOpen}
                  aria-label="Choose emoji"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e3edff] text-[#1b4c9f] transition hover:bg-[#cddfff] hover:text-[#123e88] disabled:cursor-not-allowed disabled:bg-[#edf1f8] disabled:text-[#8b9db9]"
                  disabled={!selectedContact}
                  onClick={() => setEmojiOpen((open) => !open)}
                  title="Choose emoji"
                  type="button"
                >
                  <Smile className="h-5 w-5" />
                </button>
                {emojiOpen ? (
                  <div className="absolute bottom-[calc(100%+12px)] -right-20 z-20 w-[min(320px,calc(100vw-2rem))] rounded-[20px] border border-[#d8e3f2] bg-white p-3 shadow-[0_18px_45px_rgba(16,37,78,0.18)]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#183153]">Emoji</span>
                      <span className="text-[11px] text-[#7c8da8]">Choose one to add</span>
                    </div>
                    <Input
                      aria-label="Search emoji"
                      className="h-8 rounded-lg border-[#dbe4f2] bg-[#f8faff] text-xs"
                      onChange={(event) => setEmojiSearch(event.target.value)}
                      placeholder="Search emoji"
                      value={emojiSearch}
                    />
                    <div className="mt-2 grid max-h-44 grid-cols-8 gap-1 overflow-y-auto" role="group" aria-label="Emoji choices">
                      {visibleEmojis.length ? visibleEmojis.map(([name, code]) => (
                        <button
                          aria-label={name}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-xl transition hover:bg-[#edf3fc] focus-visible:outline-2 focus-visible:outline-[#2456d3]"
                          key={name}
                          onClick={() => insertEmoji(String.fromCodePoint(code))}
                          title={name}
                          type="button"
                        >
                          {String.fromCodePoint(code)}
                        </button>
                      )) : <p className="col-span-8 py-3 text-center text-xs text-[#7388aa]">No emoji found</p>}
                    </div>
                  </div>
                ) : null}
              </div>
              <input
                ref={fileInputRef}
                className="hidden"
                disabled={!selectedContact}
                id={fileInputId}
                multiple
                onChange={(event) => {
                  setAttachments(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                type="file"
              />
              <button
                aria-label="Attach files"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e3edff] text-[#1b4c9f] transition hover:bg-[#cddfff] hover:text-[#123e88] disabled:cursor-not-allowed disabled:bg-[#edf1f8] disabled:text-[#8b9db9]"
                disabled={!selectedContact}
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                type="button"
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </button>
              <button
                aria-label={sending ? "Sending message" : "Send message"}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[#1949b8] text-white shadow-[0_3px_9px_rgba(25,73,184,0.24)] transition hover:bg-[#103c9d] disabled:cursor-not-allowed disabled:bg-[#dce7fa] disabled:text-[#4269ad] disabled:shadow-none"
                disabled={sending || !selectedContact || !body.trim()}
                onClick={sendMessage}
                title="Send message"
                type="button"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
