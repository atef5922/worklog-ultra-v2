"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDateTimeInDhaka } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import styles from "./task-comments.module.css";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
};
type CommentPage = {
  success: boolean;
  message?: string;
  comments: Comment[];
  currentUserId: string;
  hasMore: boolean;
  nextCursor: string | null;
  unreadCount: number;
};

async function readApiResponse<T extends object>(response: Response, fallback: string): Promise<T> {
  const body = await response.text();
  let result: T | null = null;
  try {
    result = body ? JSON.parse(body) as T : null;
  } catch {
    // A failed request can return HTML or an empty body instead of API JSON.
  }
  if (!result || typeof result !== "object") {
    throw new Error(response.status === 401 ? "Your session has expired. Please sign in again." : fallback);
  }
  if (!response.ok) throw new Error((result as { message?: string }).message ?? fallback);
  return result;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function mergeComments(oldItems: Comment[], newItems: Comment[]) {
  const items = new Map(oldItems.map(item => [item.id, item]));
  for (const item of newItems) items.set(item.id, item);
  return [...items.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

export function TaskCommentsButton({
  taskId, taskTitle, compact = false,
}: {
  taskId: string;
  taskTitle: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const base = "/api/dashboard/tasks/" + taskId + "/comments";

  useEffect(() => {
    let cancelled = false;
    async function refreshSummary() {
      if (open) return;
      try {
        const response = await fetch(base + "?summary=1", { cache: "no-store" });
        const result = await readApiResponse<{ unreadCount?: number }>(response, "Could not load comment count.");
        if (!cancelled && response.ok) setUnread(result.unreadCount ?? 0);
      } catch {
        // The chat panel will show a retryable error if the user opens it.
      }
    }
    const node = buttonRef.current;
    if (!node) return;
    let visible = false;
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible && !open) void refreshSummary();
    });
    observer.observe(node);
    const interval = window.setInterval(() => {
      if (visible && !open && document.visibilityState === "visible") void refreshSummary();
    }, 20000);
    window.addEventListener("focus", refreshSummary);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshSummary);
    };
  }, [base, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let busy = false;
    setComments([]);
    setCursor(null);
    setHasMore(false);
    setError("");
    setLoading(true);
    async function refresh(initial: boolean) {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(base, { cache: "no-store" });
        const result = await readApiResponse<CommentPage>(response, "Could not load comments. Please try again.");
        if (cancelled) return;
        setCurrentUserId(result.currentUserId);
        setComments(previous => initial ? result.comments : mergeComments(previous, result.comments));
        if (initial) {
          setCursor(result.nextCursor);
          setHasMore(result.hasMore);
          requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
        }
        setUnread(result.unreadCount);
        const newest = result.comments.at(-1);
        if (newest) {
          const readResponse = await fetch(base + "/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentId: newest.id }),
          });
          if (!cancelled && readResponse.ok) setUnread(0);
        }
        if (!cancelled) setError("");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load comments.");
      } finally {
        busy = false;
        if (!cancelled) setLoading(false);
      }
    }
    void refresh(true);
    const interval = window.setInterval(() => void refresh(false), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [base, open]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    const list = listRef.current;
    const oldHeight = list?.scrollHeight ?? 0;
    const oldTop = list?.scrollTop ?? 0;
    try {
      const response = await fetch(base + "?before=" + encodeURIComponent(cursor), { cache: "no-store" });
      const result = await readApiResponse<CommentPage>(response, "Could not load older comments. Please try again.");
      setComments(previous => mergeComments(result.comments, previous));
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - oldHeight + oldTop;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load older comments.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await readApiResponse<{ comment?: Comment; message?: string }>(response, "Could not send comment. Please try again.");
      if (!result.comment) throw new Error("Could not send comment. Please try again.");
      setComments(previous => mergeComments(previous, [result.comment!]));
      setDraft("");
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send comment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          ref={buttonRef}
          aria-label={compact ? "Comments for " + taskTitle + (unread ? ", " + unread + " unread" : "") : undefined}
          className={compact ? styles.compactTrigger : styles.trigger}
          title={"Comments for " + taskTitle}
          type="button"
        >
          <MessageCircle aria-hidden="true" size={compact ? 14 : 16} />
          {!compact && <span>Comments</span>}
          {unread > 0 && <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
          <header className={styles.header}>
            <div className={styles.headerIcon}><MessageCircle aria-hidden="true" size={19} /></div>
            <div className={styles.headerText}>
              <Dialog.Title>Task comments</Dialog.Title>
              <p title={taskTitle}>{taskTitle}</p>
            </div>
            <Dialog.Close asChild>
              <button className={styles.close} aria-label="Close comments" type="button"><X size={18} /></button>
            </Dialog.Close>
          </header>
          <div className={`${styles.messages} ${!hasMore ? styles.shortThread : ""}`} ref={listRef} role="log" aria-label="Task comment conversation">
            {hasMore && (
              <button className={styles.older} disabled={loadingOlder} onClick={() => void loadOlder()} type="button">
                {loadingOlder ? "Loading..." : "Load older comments"}
              </button>
            )}
            {loading && !comments.length && <p className={styles.loading}>Loading comments...</p>}
            {!loading && !comments.length && !error && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}><MessageCircle aria-hidden="true" size={22} /></span>
                <strong>No comments yet</strong>
                <span>Start the conversation on this task.</span>
              </div>
            )}
            {comments.map(comment => {
              const own = comment.authorId === currentUserId;
              return (
                <article className={own ? styles.ownMessage : styles.otherMessage} key={comment.id}>
                  {!own && (
                    <Avatar className={`${styles.avatar} h-[30px] w-[30px]`}>
                      <AvatarImage alt={comment.authorName} src={comment.authorAvatarUrl ?? undefined} />
                      <AvatarFallback className="bg-[#e4edfc] text-[10px] text-[#214d9d]">{initials(comment.authorName)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={styles.messageStack}>
                    <div className={styles.bubble}><p>{comment.body}</p></div>
                    <div className={styles.messageMeta}>
                      <strong>{own ? "You" : comment.authorName}</strong>
                      <time dateTime={comment.createdAt}>{formatDateTimeInDhaka(comment.createdAt)}</time>
                    </div>
                  </div>
                  {own && (
                    <Avatar className={`${styles.avatar} h-[30px] w-[30px]`}>
                      <AvatarImage alt={comment.authorName} src={comment.authorAvatarUrl ?? undefined} />
                      <AvatarFallback className="bg-[#e4edfc] text-[10px] text-[#214d9d]">{initials(comment.authorName)}</AvatarFallback>
                    </Avatar>
                  )}
                </article>
              );
            })}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <form className={styles.composer} onSubmit={send}>
            <div className={styles.composerRow}>
              <label className={styles.srOnly} htmlFor={"task-comment-" + taskId}>Write a task comment</label>
              <textarea
                id={"task-comment-" + taskId}
                maxLength={2000}
                onChange={event => setDraft(event.target.value)}
                placeholder="Write a reply..."
                rows={1}
                value={draft}
              />
              <button aria-label="Send comment" disabled={!draft.trim() || sending} type="submit">
                <Send size={17} />
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
