import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { createCanvas } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";

vi.mock("server-only", () => ({}));

import { attendanceExcelReport, attendancePdfReport } from "./attendance-report";

const context = {
  data: {
    from: "2026-09-16", to: "2026-09-16", total: 2,
    rows: [
      {
        date: "2026-09-16", employeeId: "jane", employeeName: "Jane Doe", department: "IT", team: "Platform", dayKind: "workday",
        status: "checked_out", flags: ["late"], dayReason: null,
        firstIn: new Date("2026-09-16T04:00:00Z"), lastOut: new Date("2026-09-16T13:30:00Z"),
        countedMinutes: 540, breakMinutes: 30, overtimeMinutes: 0,
      },
      {
        date: "2026-09-16", employeeId: "john", employeeName: "John Smith", department: "IT", team: "No team", dayKind: "workday",
        status: "absent", flags: ["absent"], dayReason: null,
        firstIn: null, lastOut: null, countedMinutes: 0, breakMinutes: 0, overtimeMinutes: 0,
      },
    ],
    totals: { countedMinutes: 540, overtimeMinutes: 0 },
    departments: [], teams: [], people: [],
  },
  params: new URLSearchParams(),
  preparedBy: "Manager",
  generatedAt: new Date("2026-09-16T12:00:00Z"),
} as unknown as Parameters<typeof attendanceExcelReport>[0];

describe("attendance register exports", () => {
  it("exports a company month as employee-wise summary and an individual month with daily detail", async () => {
    const month = { ...context, data: { ...context.data, to: "2026-09-30" } };
    const grouped = new ExcelJS.Workbook();
    await grouped.xlsx.load(await attendanceExcelReport(month) as unknown as Parameters<typeof grouped.xlsx.load>[0]);
    expect(grouped.worksheets.map(sheet => sheet.name)).toEqual(["Attendance Summary"]);
    const summary = grouped.getWorksheet("Attendance Summary")!;
    expect(summary.getCell("A8").value).toBe("TOTAL");
    expect(summary.getCell("B8").value).toBe("");
    expect([summary.getCell("A9").value, summary.getCell("A10").value]).toEqual(["Jane Doe", "John Smith"]);
    const individual = { ...month, params: new URLSearchParams({ userId: "jane" }),
      data: { ...month.data, rows: [context.data.rows[0]], total: 1 } };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await attendanceExcelReport(individual) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["Attendance Summary", "Daily Attendance"]);
    expect(workbook.getWorksheet("Attendance Summary")!.getCell("A8").value).toBe("Jane Doe");
    expect(workbook.getWorksheet("Daily Attendance")!.getCell("C8").value).toBe("Jane Doe");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await attendancePdfReport(month)), useSystemFonts: true });
    const pdf = await task.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
    expect(text).toContain("EMPLOYEE ATTENDANCE SUMMARY");
    expect(text).not.toContain("DAY-WISE ATTENDANCE");
    await task.destroy();
  });

  it("creates one typed and printable Excel register with totals", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await attendanceExcelReport(context) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["Attendance Summary", "Daily Attendance"]);
    const summary = workbook.getWorksheet("Attendance Summary")!;
    expect(summary.getCell("A8").value).toBe("TOTAL");
    expect(summary.getCell("D8").value).toBe(1);
    expect(summary.getCell("F8").value).toBe(1);
    expect(summary.getCell("K8").value).toBe(0.5);
    const sheet = workbook.getWorksheet("Daily Attendance")!;
    expect(sheet.getCell("C8").value).toBe("Jane Doe");
    expect(sheet.getCell("B8").value).toBeInstanceOf(Date);
    expect(sheet.getCell("F8").value).toBeInstanceOf(Date);
    expect((sheet.getCell("F8").value as Date).getUTCHours()).toBe(10);
    expect(sheet.getCell("H8").value).toBeInstanceOf(Date);
    expect((sheet.getCell("H8").value as Date).getUTCHours()).toBe(9);
    expect(sheet.getCell("H8").numFmt).toBe("[h]:mm");
    expect(sheet.getCell("F9").value).toBeNull();
    expect(sheet.getCell("E9").value).toBe("Absent");
    expect(sheet.getCell("H10").value).toMatchObject({ formula: "SUM(H8:H9)" });
    expect(sheet.pageSetup.printArea).toBe("A1:K10");
    expect(sheet.pageSetup.printTitlesRow).toBe("1:7");
  });

  it("creates a restrained PDF register without dashboard cards", async () => {
    const pdf = await attendancePdfReport(context);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
    expect(text).toContain("ATTENDANCE REPORT");
    expect(text).toContain("EMPLOYEE ATTENDANCE SUMMARY");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("TOTAL");
    expect(text).not.toContain("Report overview");
    if (process.env.ATTENDANCE_REPORT_PREVIEW === "1") {
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({
        canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
        viewport,
        canvas: canvas as unknown as HTMLCanvasElement,
      }).promise;
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile("tmp/pdfs/attendance-register-preview.png", canvas.toBuffer("image/png"));
    }
    await loadingTask.destroy();
  });

  it("repeats the register heading across PDF pages and keeps the totals at the end", async () => {
    const base = context.data.rows[0];
    const many = {
      ...context,
      data: {
        ...context.data,
        rows: Array.from({ length: 50 }, (_, index) => ({
          ...base, employeeName: `Employee ${index + 1}`,
          dayReason: index === 0 ? "Approved schedule adjustment for the employee on this date" : null,
        })),
        total: 50,
        totals: { ...context.data.totals, countedMinutes: 50 * 540 },
      },
    };
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await attendancePdfReport(many)), useSystemFonts: true });
    const document = await task.promise;
    expect(document.numPages).toBeGreaterThan(1);
    const first = (await (await document.getPage(1)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
    const last = (await (await document.getPage(document.numPages)).getTextContent()).items.map(item => "str" in item ? item.str : "").join(" ");
    expect(first).toContain("ATTENDANCE REPORT");
    expect(last).toContain("ATTENDANCE REPORT");
    expect(last).toContain("TOTAL");
    expect(last).toContain("Employee 50");
    await task.destroy();
  });
});
