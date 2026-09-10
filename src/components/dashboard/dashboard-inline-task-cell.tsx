"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

export type DashboardEditableTaskField = "taskTitle" | "taskDescription";

export function DashboardInlineTaskCell({
  editable,
  field,
  onCommit,
  onOpenDetails,
  value,
}: {
  editable: boolean;
  field: DashboardEditableTaskField;
  onCommit: (nextValue: string) => Promise<boolean>;
  onOpenDetails: () => void;
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const label = field === "taskTitle" ? "title" : "description";
  const displayValue = value || "No description";

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function beginEditing() {
    if (!editable || saving) {
      onOpenDetails();
      return;
    }
    setDraft(value);
    setEditing(true);
  }

  async function commit() {
    if (committingRef.current) return;
    const normalized = draft.trim();

    if (field === "taskTitle" && normalized.length < 3) {
      toast.error("Task title must be at least 3 characters.");
      inputRef.current?.focus();
      return;
    }
    if (normalized === value.trim()) {
      setEditing(false);
      return;
    }

    committingRef.current = true;
    setSaving(true);
    let saved = false;
    try {
      saved = await onCommit(normalized);
    } catch {
      toast.error(`Could not update task ${label}.`);
    } finally {
      committingRef.current = false;
      setSaving(false);
    }

    if (saved) {
      setEditing(false);
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="relative min-w-0">
        <input
          aria-label={`Edit task ${label}`}
          className="h-7 w-full min-w-0 rounded-md border border-[#4f5ef7] bg-[var(--panel)] px-2 text-[0.7rem] font-medium text-[var(--foreground)] outline-none ring-2 ring-[#4f5ef7]/15"
          disabled={saving}
          onBlur={() => void commit()}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          ref={inputRef}
          spellCheck
          value={draft}
        />
        {saving ? (
          <Loader2
            aria-hidden
            className="absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-[#4f5ef7]"
          />
        ) : null}
        <span aria-live="polite" className="sr-only">
          {saving ? `Saving task ${label}` : ""}
        </span>
      </div>
    );
  }

  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>
        <button
          aria-label={
            editable
              ? `${displayValue}. Click to edit task ${label}`
              : `${displayValue}. Open task details`
          }
          className={`group/cell flex h-7 w-full min-w-0 items-center gap-1 rounded-md px-1.5 text-left outline-none transition hover:bg-[#4f5ef7]/[0.06] focus-visible:ring-2 focus-visible:ring-[#4f5ef7]/35 ${
            editable ? "cursor-text" : "cursor-pointer"
          }`}
          onClick={beginEditing}
          onKeyDown={(event) => {
            if (editable && (event.key === "F2" || event.key === "Enter")) {
              event.preventDefault();
              beginEditing();
            }
          }}
          type="button"
        >
          <span
            className={`min-w-0 flex-1 truncate text-[0.7rem] ${
              field === "taskTitle"
                ? "font-semibold text-[var(--foreground)]"
                : "font-medium text-[var(--muted-foreground)]"
            }`}
          >
            {displayValue}
          </span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-[70] max-w-[24rem] rounded-lg border border-[var(--panel-border)] bg-[var(--foreground)] px-2.5 py-1.5 text-[0.68rem] leading-4 text-[var(--panel)] shadow-xl"
          sideOffset={6}
        >
          {displayValue}
          <Tooltip.Arrow className="fill-[var(--foreground)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
