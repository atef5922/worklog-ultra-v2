import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import fs from "node:fs";
import { excelReport, pdfReport, exportResponse } from "./export";

describe("Report file generation", () => {
  it("keeps formula-like employee/task text as plain text", async () => {
    const bengaliTask = "\u09ac\u09be\u0982\u09b2\u09be \u0995\u09be\u099c";
    const bytes = await excelReport("Test", [{
      name: "Tasks",
      columns: ["Task", "Minutes"],
      rows: [['=HYPERLINK("https://example.com")', 12], [bengaliTask, 25]],
    }]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as never);
    expect(book.worksheets[0].getCell("A3").value).toBe('=HYPERLINK("https://example.com")');
    expect(book.worksheets[0].getCell("B4").value).toBe(25);
  });

  it("creates a branded, multi-page PDF with summaries and readable tables", async () => {
    const bengaliTitle = "\u09ac\u09be\u0982\u09b2\u09be \u0995\u09be\u099c\u09c7\u09b0 \u09b6\u09bf\u09b0\u09cb\u09a8\u09be\u09ae";
    const tasks = Array.from({ length: 34 }, (_, index) => [
      index === 0 ? bengaliTitle : `Prepare production report ${index + 1}`,
      `Employee ${index % 7 + 1}\nIT Department`,
      index % 3 === 0 ? "Critical\nIn Progress" : "Normal\nCompleted",
      "15 Sep 2026, 04:30 PM",
      index % 3 === 0 ? "65% (2/3)" : "100%",
      "2h 00m",
      `${index + 1}h 15m`,
    ]);
    const employees = Array.from({ length: 9 }, (_, index) => [
      `Employee ${index + 1}`,
      index % 2 ? "IT Department" : "E-Commerce",
      8 + index,
      `${5 + index} (72%)`,
      2,
      "1 pending\n0 overdue",
      "Task: 6h 30m\nCounted: 8h 15m",
    ]);
    const bytes = await pdfReport(
      "Management Dashboard Report",
      [
        {
          name: "Tasks in Selected Period",
          columns: ["Task / Project", "Employee / Department", "Priority / Status", "Deadline", "Progress", "Estimated", "Tracked"],
          widths: [2.2, 1.65, 1.25, 1.2, 0.85, 0.9, 0.9],
          rows: tasks,
        },
        {
          name: "Employee Performance Summary",
          columns: ["Employee", "Department", "Assigned", "Completed", "In Progress", "Pending / Overdue", "Task / Counted Time"],
          widths: [1.7, 1.45, 0.8, 0.85, 0.9, 1.15, 1.35],
          rows: employees,
        },
      ],
      {
        subtitle: "Team performance, task progress and attendance overview",
        period: "2026-09-01 to 2026-09-15",
        scope: "Permission-scoped management data",
        generatedAt: "2026-09-15T10:30:00.000Z",
        metrics: [
          { label: "Employees", value: 9, note: "Within access scope" },
          { label: "Present", value: 7, note: "Checked in during period" },
          { label: "Tasks", value: 34, note: "Selected period" },
          { label: "Completed", value: 23, note: "Marked as done" },
          { label: "In progress", value: 8, note: "Active or paused" },
          { label: "Pending", value: 3, note: "Not started" },
          { label: "Overdue", value: 2, note: "Past deadline" },
        ],
      },
    );
    if (process.env.WORKLOG_EXPORT_QA === "1") {
      fs.mkdirSync("tmp/pdfs", { recursive: true });
      fs.writeFileSync("tmp/pdfs/report-check.pdf", bytes);
    }
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it("returns download headers and disables caching", async () => {
    const response = await exportResponse("Test", [{ name: "Tasks", columns: ["Task"], rows: [] }], "xlsx", "test");
    expect(response.headers.get("Content-Disposition")).toContain("test.xlsx");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
