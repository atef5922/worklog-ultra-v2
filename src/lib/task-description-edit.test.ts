import { describe, expect, it } from "vitest";
import { replaceReadableTaskDescription } from "@/lib/task-description-edit";

describe("replaceReadableTaskDescription", () => {
  it("replaces a plain description", () => {
    expect(replaceReadableTaskDescription("Old copy", "New copy")).toBe("New copy");
  });

  it("preserves the complete workflow metadata suffix", () => {
    const original = [
      "Old copy",
      "[continued-task]",
      "Continued from: 2026-09-09",
      "[follow-up-reminder]",
      "Scheduled date: 2026-09-10",
      "[recurring-task]",
      "[reopened-from-complete]",
      "Reopened at: 2026-09-10T03:00:00.000Z",
    ].join("\n");

    const updated = replaceReadableTaskDescription(original, "Clearer customer-facing copy");

    expect(updated).toContain("Clearer customer-facing copy\n\n[continued-task]");
    expect(updated).toContain("Continued from: 2026-09-09");
    expect(updated).toContain("[follow-up-reminder]");
    expect(updated).toContain("[recurring-task]");
    expect(updated).toContain("[reopened-from-complete]");
    expect(updated).not.toContain("Old copy");
  });

  it("does not duplicate markers when a modal submits a raw description", () => {
    const original = "Old copy\n\n[recurring-task]";
    const submitted = "New copy\n\n[recurring-task]";

    expect(replaceReadableTaskDescription(original, submitted)).toBe(
      "New copy\n\n[recurring-task]",
    );
  });
});
