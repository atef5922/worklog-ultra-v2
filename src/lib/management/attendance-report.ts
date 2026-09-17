import "server-only";
import { formatDateInDhaka, formatDateTimeInDhaka } from "@/lib/utils";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import type { attendanceOverview } from "@/lib/management/attendance-overview";
import { buildAttendanceReport, type EmployeeAttendanceSummary } from "@/lib/management/attendance-report-data";

type AttendanceData = Awaited<ReturnType<typeof attendanceOverview>>;
type AttendanceRow = AttendanceData["rows"][number];
type ReportContext = {
  data: AttendanceData;
  params: URLSearchParams;
  preparedBy: string;
  generatedAt?: Date;
};

const INK = "#172339";
const MUTED = "#526175";
const LINE = "#cbd5e1";
const LIGHT = "#f1f5f9";
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const HEADERS = ["No.", "Date", "Employee", "Department / Team", "Status", "In", "Out", "Work", "Break", "Overtime", "Remarks"];
const PDF_WIDTHS = [24, 57, 112, 103, 77, 62, 62, 43, 43, 48, 102];
const SUMMARY_HEADERS = ["Employee", "Department", "Workdays", "Present", "Late", "Absent", "Off days", "Off-day work", "Avg hours", "Overtime", "Attendance %"];
const SUMMARY_PDF_WIDTHS = [130, 100, 56, 47, 41, 47, 52, 63, 59, 58, 80];

function summaryValues(item: EmployeeAttendanceSummary, name = item.employeeName) {
  return [name, name === "TOTAL" ? "" : item.department, item.workdays, item.present, item.late, item.absent,
    item.offDays, item.offDayWorked, item.avgWorkdayMinutes / 1440,
    item.overtimeMinutes / 1440, item.attendanceRate];
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}

function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function clock(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(value) : "";
}

function reportDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function excelClock(value: Date | null) {
  return value ? new Date(value.valueOf() + DHAKA_OFFSET_MS) : null;
}

function remarks(row: AttendanceRow) {
  const flags = row.flags.filter(flag => flag !== "absent").map(titleCase);
  return [...flags, row.dayReason].filter(Boolean).join("; ");
}

function status(row: AttendanceRow) {
  if (row.status === "off_day") return "Off day";
  if (row.status === "worked_off_day") return "Worked off day";
  if (row.status === "not_checked_in") return "Not checked in";
  return titleCase(row.status);
}

function departmentTeam(row: AttendanceRow) {
  return row.team && row.team !== "No team" ? `${row.department} / ${row.team}` : row.department;
}

function filterDescription({ data, params }: ReportContext) {
  const department = data.departments.find(item => item.id === params.get("departmentId"))?.name;
  const team = data.teams.find(item => item.id === params.get("teamId"))?.name;
  const person = data.people.find(item => item.id === params.get("userId"))?.name;
  const filters = [
    `Scope: ${person ?? team ?? department ?? "All permitted employees"}`,
    ...(department && (person || team) ? [`Department: ${department}`] : []),
    ...(team && person ? [`Team: ${team}`] : []),
    ...(params.get("status") ? [`Status: ${titleCase(params.get("status")!)}`] : []),
    ...(params.get("attention") ? [`Attention: ${titleCase(params.get("attention")!)}`] : []),
    ...(params.get("q") ? [`Search: ${params.get("q")!.slice(0, 100)}`] : []),
  ];
  return filters.join("  |  ");
}

function generatedDate(value: Date) {
  return formatDateTimeInDhaka(value);
}

export async function attendanceExcelReport(context: ReportContext) {
  const { data, preparedBy } = context;
  const report = buildAttendanceReport(data, context.params);
  const generatedAt = context.generatedAt ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkLog Ultra";
  workbook.created = generatedAt;
  workbook.title = "Attendance Report";
  const summary = workbook.addWorksheet("Attendance Summary", {
    views: [{ state: "frozen", ySplit: 7, xSplit: 2, showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1,
      fitToHeight: 0, printTitlesRow: "1:7", horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });
  summary.columns = [27, 26, 12, 11, 10, 11, 12, 15, 13, 13, 15].map(width => ({ width }));
  summary.mergeCells("A1:K1");
  summary.getCell("A1").value = "WorkLog Ultra  |  Attendance Report";
  summary.getCell("A1").font = { name: "Aptos", size: 16, bold: true, color: { argb: "FF172339" } };
  summary.getRow(1).height = 30;
  for (const [number, value] of [
    [2, `Period: ${formatDateInDhaka(data.from)} to ${formatDateInDhaka(data.to)}   |   Asia/Dhaka`],
    [3, filterDescription(context)],
    [4, `Prepared by: ${preparedBy}   |   Generated: ${generatedDate(generatedAt)}`],
  ] as const) {
    summary.mergeCells(number, 1, number, 11);
    summary.getCell(number, 1).value = value;
    summary.getRow(number).height = 20;
    summary.getRow(number).font = { name: "Aptos", size: 10, color: { argb: "FF526175" } };
  }
  summary.getRow(5).height = 9;
  summary.mergeCells("A6:K6");
  summary.getCell("A6").value = report.mode === "individual" ? "EMPLOYEE MONTHLY SUMMARY" : "EMPLOYEE ATTENDANCE SUMMARY";
  summary.getCell("A6").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF172339" } };
  summary.getCell("A6").border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  summary.getRow(6).height = 21;
  const summaryHeader = summary.getRow(7);
  summaryHeader.values = SUMMARY_HEADERS;
  summaryHeader.height = 25;
  summaryHeader.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243B5A" } };
  summaryHeader.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  const summaryRows = report.mode === "individual" ? report.employees :
    report.mode === "daily" ? [report.overall] : [report.overall, ...report.employees];
  summaryRows.forEach((item, index) => {
    const label = report.mode !== "individual" && index === 0 ? "TOTAL" : item.employeeName;
    const row = summary.addRow(summaryValues(item, label));
    row.height = 24;
    row.font = { name: "Aptos", size: 10, bold: label === "TOTAL", color: { argb: "FF172339" } };
    row.alignment = { vertical: "middle" };
    if (index % 2 || label === "TOTAL") row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: label === "TOTAL" ? "FFEAF0F7" : "FFF7F9FC" } };
    row.eachCell({ includeEmpty: true }, cell => { cell.border = { bottom: { style: "hair", color: { argb: "FFD7DEE8" } } }; });
    for (const column of [9, 10]) row.getCell(column).numFmt = "[h]:mm";
    row.getCell(11).numFmt = "0.0%";
    for (let column = 3; column <= 11; column++) row.getCell(column).alignment = { vertical: "middle", horizontal: "right" };
  });
  const summaryEnd = 7 + summaryRows.length;
  summary.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 11 } };
  summary.getCell(`A${summaryEnd + 2}`).value = "Attendance % = Present / Workdays. Late is included in Present; pending and off days are excluded.";
  summary.getCell(`A${summaryEnd + 2}`).font = { name: "Aptos", size: 9, color: { argb: "FF526175" } };
  summary.pageSetup.printArea = `A1:K${summaryEnd + 2}`;
  summary.headerFooter.oddFooter = "WorkLog Ultra  |  Attendance Summary                       Page &P of &N";
  if (!report.includeDaily) return Buffer.from(await workbook.xlsx.writeBuffer());

  const sheet = workbook.addWorksheet("Daily Attendance", {
    views: [{ state: "frozen", ySplit: 7, xSplit: 2, showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1,
      fitToHeight: 0, printTitlesRow: "1:7", horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    },
  });
  sheet.columns = [5, 13, 25, 27, 19, 13, 13, 11, 11, 11, 32].map(width => ({ width }));
  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = "WorkLog Ultra  |  Attendance Register";
  sheet.getCell("A1").font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FF172339" } };
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value = `Reporting period: ${formatDateInDhaka(data.from)} to ${formatDateInDhaka(data.to)}   |   Time zone: Asia/Dhaka`;
  sheet.getRow(2).height = 20;
  sheet.mergeCells("A3:K3");
  sheet.getCell("A3").value = filterDescription(context);
  sheet.getRow(3).height = 20;
  sheet.mergeCells("A4:K4");
  sheet.getCell("A4").value = `Prepared by: ${preparedBy}   |   Generated: ${generatedDate(generatedAt)}   |   Employee-days: ${data.total}`;
  sheet.getRow(4).height = 20;
  for (let rowNumber = 2; rowNumber <= 4; rowNumber++) {
    sheet.getRow(rowNumber).font = { name: "Aptos", size: 10, color: { argb: "FF526175" } };
    sheet.getRow(rowNumber).alignment = { vertical: "middle" };
  }
  sheet.getRow(5).height = 9;
  sheet.mergeCells("A6:K6");
  sheet.getCell("A6").value = "DAILY ATTENDANCE RECORD";
  sheet.getCell("A6").font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF172339" } };
  sheet.getCell("A6").border = { bottom: { style: "thin", color: { argb: "FF94A3B8" } } };
  sheet.getRow(6).height = 21;
  const header = sheet.getRow(7);
  header.values = HEADERS;
  header.height = 25;
  header.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243B5A" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: 11 } };

  data.rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1, reportDate(item.date), item.employeeName, departmentTeam(item), status(item),
      excelClock(item.firstIn), excelClock(item.lastOut), item.countedMinutes / 1440,
      item.breakMinutes / 1440, item.overtimeMinutes / 1440, remarks(item),
    ]);
    row.height = Math.max(23, Math.min(120, 15 * Math.max(
      1, Math.ceil(item.employeeName.length / 23),
      Math.ceil(departmentTeam(item).length / 25),
      Math.ceil(remarks(item).length / 30),
    ) + 8));
    row.font = { name: "Aptos", size: 10, color: { argb: "FF172339" } };
    row.alignment = { vertical: "middle", wrapText: true };
    if (index % 2 === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = { bottom: { style: "hair", color: { argb: "FFD7DEE8" } } };
    });
    row.getCell(2).numFmt = "dd/mm/yyyy";
    for (const column of [6, 7]) row.getCell(column).numFmt = "hh:mm AM/PM";
    for (const column of [8, 9, 10]) row.getCell(column).numFmt = "[h]:mm";
    for (const column of [1, 8, 9, 10]) row.getCell(column).alignment = { vertical: "middle", horizontal: "right" };
  });

  const firstDataRow = 8;
  const lastDataRow = firstDataRow + data.rows.length - 1;
  const totalRow = sheet.getRow(Math.max(firstDataRow, lastDataRow + 1));
  totalRow.getCell(3).value = "TOTAL";
  for (const column of [8, 9, 10]) {
    const totalMinutes = data.rows.reduce((sum, item) => sum + (
      column === 8 ? item.countedMinutes : column === 9 ? item.breakMinutes : item.overtimeMinutes
    ), 0);
    totalRow.getCell(column).value = data.rows.length
      ? { formula: `SUM(${sheet.getColumn(column).letter}${firstDataRow}:${sheet.getColumn(column).letter}${lastDataRow})`, result: totalMinutes / 1440 }
      : 0;
    totalRow.getCell(column).numFmt = "[h]:mm";
  }
  totalRow.height = 25;
  totalRow.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF172339" } };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF0F7" } };
  totalRow.eachCell({ includeEmpty: true }, cell => {
    cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
  });
  sheet.pageSetup.printArea = `A1:K${totalRow.number}`;
  sheet.headerFooter.oddFooter = "WorkLog Ultra  |  Attendance Register                       Page &P of &N";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function pdfText(doc: PDFKit.PDFDocument, value: string, x: number, y: number, width: number, fontPath: string, options: PDFKit.Mixins.TextOptions = {}) {
  const text = value || "—";
  const font = /[\u0980-\u09ff]/.test(text) && fs.existsSync(fontPath) ? "Bangla" : "Helvetica";
  doc.font(font).text(text, x, y, { width, ellipsis: true, ...options });
}

export async function attendancePdfReport(context: ReportContext) {
  const { data, preparedBy } = context;
  const report = buildAttendanceReport(data, context.params);
  const generatedAt = context.generatedAt ?? new Date();
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansBengali-Regular.ttf");
  const doc = new PDFDocument({
    size: "A4", layout: "landscape", bufferPages: true,
    margins: { top: 28, right: 28, bottom: 28, left: 28 },
    info: { Title: "Attendance Report", Author: "WorkLog Ultra", Subject: "Employee attendance report" },
  });
  if (fs.existsSync(fontPath)) doc.registerFont("Bangla", fontPath);
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const margin = 28;
  const tableWidth = PDF_WIDTHS.reduce((sum, width) => sum + width, 0);
  let y = 0;
  const drawHeader = (continued: boolean, section: "summary" | "daily") => {
    y = 28;
    doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text("WorkLog Ultra", margin, y, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11).text("ATTENDANCE REPORT", margin, y + 19, { lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${formatDateInDhaka(data.from)} to ${formatDateInDhaka(data.to)}  |  Asia/Dhaka`, margin, y + 36, { lineBreak: false });
    if (!continued) {
      doc.fontSize(7.5);
      pdfText(doc, filterDescription(context), margin, y + 50, tableWidth, fontPath, { height: 12, lineBreak: false });
      doc.font("Helvetica").fontSize(7.5).text(`Prepared by: ${preparedBy}  |  Generated: ${generatedDate(generatedAt)}  |  ${data.total} employee-days`, margin, y + 64, { lineBreak: false });
      y += 87;
    } else {
      y += 65;
    }
    doc.moveTo(margin, y - 8).lineTo(margin + tableWidth, y - 8).lineWidth(0.7).strokeColor(LINE).stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(section === "summary" ? "EMPLOYEE ATTENDANCE SUMMARY" : "DAY-WISE ATTENDANCE", margin, y, { lineBreak: false });
    y += 15;
    doc.rect(margin, y, tableWidth, 23).fill(INK);
    let x = margin;
    const headings = section === "summary" ? SUMMARY_HEADERS : HEADERS;
    const widths = section === "summary" ? SUMMARY_PDF_WIDTHS : PDF_WIDTHS;
    headings.forEach((heading, index) => {
      doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#ffffff").text(heading.toUpperCase(), x + 4, y + 7, {
        width: widths[index] - 8, height: 12, lineBreak: false, ellipsis: true,
      });
      x += widths[index];
    });
    y += 23;
  };
  drawHeader(false, "summary");
  const summaryRows = report.mode === "individual" ? report.employees :
    report.mode === "daily" ? [report.overall] : [report.overall, ...report.employees];
  for (const [index, item] of summaryRows.entries()) {
    const total = report.mode !== "individual" && index === 0;
    const values = [total ? "TOTAL" : item.employeeName,
      total ? "" : item.department, String(item.workdays), String(item.present), String(item.late), String(item.absent),
      String(item.offDays), String(item.offDayWorked), duration(item.avgWorkdayMinutes),
      duration(item.overtimeMinutes), item.attendanceRate === null ? "-" : `${(item.attendanceRate * 100).toFixed(1)}%`];
    const height = 28;
    if (y + height > doc.page.height - 48) { doc.addPage(); drawHeader(true, "summary"); }
    if (index === 0 && report.mode !== "individual") doc.rect(margin, y, tableWidth, height).fill(LIGHT);
    else if (index % 2) doc.rect(margin, y, tableWidth, height).fill("#f8fafc");
    doc.moveTo(margin, y + height).lineTo(margin + tableWidth, y + height).lineWidth(0.4).strokeColor(LINE).stroke();
    let x = margin;
    values.forEach((value, column) => {
      doc.fontSize(7).fillColor(INK);
      pdfText(doc, value, x + 4, y + 7, SUMMARY_PDF_WIDTHS[column] - 8, fontPath, {
        height: height - 10, align: column >= 2 ? "right" : "left",
      });
      x += SUMMARY_PDF_WIDTHS[column];
    });
    y += height;
  }
  if (report.includeDaily) {
    if (y + 80 > doc.page.height - 48) { doc.addPage(); drawHeader(true, "daily"); }
    else {
      y += 25;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text("DAY-WISE ATTENDANCE", margin, y, { lineBreak: false });
      y += 15;
      doc.rect(margin, y, tableWidth, 23).fill(INK);
      let x = margin;
      HEADERS.forEach((heading, index) => {
        doc.font("Helvetica-Bold").fontSize(6.8).fillColor("#ffffff").text(heading.toUpperCase(), x + 4, y + 7, {
          width: PDF_WIDTHS[index] - 8, height: 12, lineBreak: false, ellipsis: true,
        });
        x += PDF_WIDTHS[index];
      });
      y += 23;
    }
  if (!data.rows.length) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("No attendance records match the selected filters.", margin + 4, y + 10);
    y += 29;
  }
  data.rows.forEach((item, index) => {
    const values = [String(index + 1), formatDateInDhaka(item.date), item.employeeName, departmentTeam(item), status(item),
      clock(item.firstIn), clock(item.lastOut), duration(item.countedMinutes),
      duration(item.breakMinutes), duration(item.overtimeMinutes), remarks(item)];
    const height = Math.max(29, ...values.map((value, column) => {
      const text = value || "—";
      const font = /[\u0980-\u09ff]/.test(text) && fs.existsSync(fontPath) ? "Bangla" : "Helvetica";
      return Math.ceil(doc.font(font).fontSize(7).heightOfString(text, { width: PDF_WIDTHS[column] - 8 })) + 12;
    }));
    if (y + height > doc.page.height - 48) {
      doc.addPage();
      drawHeader(true, "daily");
    }
    if (index % 2 === 1) doc.rect(margin, y, tableWidth, height).fill("#f8fafc");
    doc.moveTo(margin, y + height).lineTo(margin + tableWidth, y + height).lineWidth(0.4).strokeColor(LINE).stroke();
    let x = margin;
    values.forEach((value, column) => {
      doc.fontSize(7).fillColor(INK);
      pdfText(doc, value, x + 4, y + 7, PDF_WIDTHS[column] - 8, fontPath, {
        height: height - 10, align: column === 0 || (column >= 7 && column <= 9) ? "right" : "left",
      });
      x += PDF_WIDTHS[column];
    });
    y += height;
  });
  if (y + 56 > doc.page.height - 48) {
    doc.addPage();
    drawHeader(true, "daily");
  }
  const totals = ["", "", "TOTAL", "", `${data.total} days`, "", "",
    duration(data.totals.countedMinutes),
    duration(data.rows.reduce((sum, row) => sum + row.breakMinutes, 0)),
    duration(data.totals.overtimeMinutes), ""];
  doc.rect(margin, y, tableWidth, 29).fill(LIGHT);
  let x = margin;
  totals.forEach((value, column) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor(INK).text(value, x + 4, y + 8, {
      width: PDF_WIDTHS[column] - 8, align: column >= 7 && column <= 9 ? "right" : "left", lineBreak: false,
    });
    x += PDF_WIDTHS[column];
  });
  y += 29;
  }
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(pages.start + index);
    const footerY = doc.page.height - 42;
    doc.moveTo(margin, footerY - 7).lineTo(margin + tableWidth, footerY - 7).lineWidth(0.4).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("Late is included in Present. Attendance % excludes pending and off days.", margin, footerY, { lineBreak: false });
    doc.text(`Page ${index + 1} of ${pages.count}`, margin + tableWidth - 80, footerY, { width: 80, align: "right", lineBreak: false });
  }
  doc.end();
  return finished;
}

export async function attendanceExportResponse(context: ReportContext, format: "pdf" | "xlsx", filename: string) {
  const pdf = format === "pdf";
  const buffer = pdf ? await attendancePdfReport(context) : await attendanceExcelReport(context);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
