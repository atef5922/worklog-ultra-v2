import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs";

export type ReportCell = string | number | null;
export type ReportSheet = {
  name: string;
  columns: string[];
  rows: ReportCell[][];
  widths?: number[];
};
export type ReportMetric = {
  label: string;
  value: string | number;
  note?: string;
};
export type PdfReportOptions = {
  subtitle?: string;
  period?: string;
  scope?: string;
  generatedAt?: Date | string;
  metrics?: ReportMetric[];
};
export type ExportOptions = {
  pdf?: PdfReportOptions;
  pdfSheets?: ReportSheet[];
};

const COLORS = {
  navy: "#0b1f4b",
  blue: "#2563eb",
  indigo: "#4f46e5",
  ink: "#172554",
  text: "#334155",
  muted: "#64748b",
  line: "#dbe4f0",
  panel: "#f8fafc",
  stripe: "#f6f8fc",
  white: "#ffffff",
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
};
const PAGE_MARGIN = 36;
const CONTENT_TOP = 96;
const CONTENT_BOTTOM = 48;
type AddReportPage = () => void;

// Spreadsheet cells are assigned text values, never formula objects.
export async function excelReport(title: string, sheets: ReportSheet[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkLog Ultra";
  workbook.created = new Date();
  for (const data of sheets) {
    const sheet = workbook.addWorksheet(data.name.slice(0, 31));
    sheet.addRow([title]);
    sheet.mergeCells(1, 1, 1, data.columns.length);
    sheet.getRow(1).font = { size: 15, bold: true, color: { argb: "FF172554" } };
    sheet.addRow(data.columns);
    sheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
    data.rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 32 : 22;
      column.alignment = { vertical: "top", wrapText: true };
    });
    sheet.views = [{ state: "frozen", ySplit: 2 }];
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2, column: data.columns.length },
    };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cleanText(value: ReportCell, limit = 220) {
  if (value === null || value === undefined || value === "") return "-";
  const text = String(value)
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return text.length > limit ? text.slice(0, limit - 3).trimEnd() + "..." : text;
}

const BENGALI_PATTERN = /[\u0980-\u09ff]/;
const MIXED_TEXT_PATTERN = /[\u0980-\u09ff\u200c\u200d]+|[^\u0980-\u09ff\u200c\u200d]+/g;

function bodyFont(text: string, bengaliFont: string) {
  return BENGALI_PATTERN.test(text) ? bengaliFont : "Helvetica";
}

function measureBodyText(
  doc: PDFKit.PDFDocument,
  text: string,
  bengaliFont: string,
  width: number,
) {
  const fonts = BENGALI_PATTERN.test(text) && /[A-Za-z]/.test(text)
    ? [bengaliFont, "Helvetica"]
    : [bodyFont(text, bengaliFont)];
  return Math.max(...fonts.map((font) => doc.font(font).fontSize(7.4).heightOfString(text, {
    width,
    lineGap: 1,
  })));
}

function writeBodyText(
  doc: PDFKit.PDFDocument,
  text: string,
  bengaliFont: string,
  x: number,
  y: number,
  options: PDFKit.Mixins.TextOptions,
) {
  const mixed = BENGALI_PATTERN.test(text) && /[A-Za-z]/.test(text);
  if (!mixed) {
    doc.font(bodyFont(text, bengaliFont)).text(text, x, y, options);
    return;
  }
  const runs = text.match(MIXED_TEXT_PATTERN) ?? [text];
  runs.forEach((run, index) => {
    doc.font(BENGALI_PATTERN.test(run) ? bengaliFont : "Helvetica");
    if (index === 0) {
      doc.text(run, x, y, { ...options, continued: index < runs.length - 1 });
    } else {
      doc.text(run, { ...options, continued: index < runs.length - 1 });
    }
  });
}

function formatGeneratedAt(value?: Date | string) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(Number.isNaN(date.valueOf()) ? new Date() : date);
}

function inferWidths(sheet: ReportSheet) {
  if (sheet.widths?.length === sheet.columns.length && sheet.widths.every((value) => value > 0)) {
    return sheet.widths;
  }
  return sheet.columns.map((column) => {
    const name = column.toLowerCase();
    if (/task|employee|description|note/.test(name)) return 1.8;
    if (/department|project|role|attendance/.test(name)) return 1.35;
    if (/date|deadline|status|priority/.test(name)) return 1.15;
    return 1;
  });
}

function statusColor(value: string) {
  const normalized = value.toLowerCase();
  if (/completed|working|checked in|done/.test(normalized)) return COLORS.green;
  if (/overdue|critical|absent/.test(normalized)) return COLORS.red;
  if (/pending|break|late|high/.test(normalized)) return COLORS.amber;
  if (/progress|active|meeting/.test(normalized)) return COLORS.blue;
  return COLORS.text;
}

function drawPageHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  options: PdfReportOptions,
  generatedAt: string,
) {
  const width = doc.page.width;
  doc.save();
  doc.rect(0, 0, width, 76).fill(COLORS.navy);
  doc.roundedRect(PAGE_MARGIN, 20, 36, 36, 8).fill(COLORS.blue);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.white).text("W", PAGE_MARGIN, 27, {
    width: 36,
    align: "center",
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.white).text("WorkLog Ultra", PAGE_MARGIN + 48, 21, {
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(9).fillColor("#bfdbfe").text(title, PAGE_MARGIN + 48, 43, {
    lineBreak: false,
  });
  const rightWidth = 250;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white).text(options.period ?? "Selected period", width - PAGE_MARGIN - rightWidth, 22, {
    width: rightWidth,
    align: "right",
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(8).fillColor("#bfdbfe").text("Generated " + generatedAt + " (Dhaka)", width - PAGE_MARGIN - rightWidth, 42, {
    width: rightWidth,
    align: "right",
    lineBreak: false,
  });
  doc.restore();
  doc.y = CONTENT_TOP;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number, addPage: AddReportPage) {
  if (doc.y + height <= doc.page.height - CONTENT_BOTTOM) return false;
  addPage();
  return true;
}

function drawOverview(
  doc: PDFKit.PDFDocument,
  metrics: ReportMetric[],
  regularFont: string,
  addPage: AddReportPage,
) {
  if (!metrics.length) return;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ink).text("Report overview", PAGE_MARGIN, doc.y);
  doc.y += 21;
  const gap = 8;
  const perRow = metrics.length <= 4 ? metrics.length : 4;
  const cardWidth = (doc.page.width - PAGE_MARGIN * 2 - gap * (perRow - 1)) / perRow;
  const cardHeight = 48;
  for (let start = 0; start < metrics.length; start += perRow) {
    ensureSpace(doc, cardHeight + gap, addPage);
    const row = metrics.slice(start, start + perRow);
    const rowY = doc.y;
    row.forEach((metric, index) => {
      const x = PAGE_MARGIN + index * (cardWidth + gap);
      const y = rowY;
      doc.roundedRect(x, y, cardWidth, cardHeight, 6).fillAndStroke(COLORS.panel, COLORS.line);
      doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.muted).text(cleanText(metric.label, 45).toUpperCase(), x + 10, y + 8, {
        width: cardWidth - 20,
        lineBreak: false,
      });
      const metricValue = cleanText(metric.value, 32);
      doc.fontSize(15).fillColor(COLORS.ink);
      writeBodyText(doc, metricValue, regularFont, x + 10, y + 21, {
        width: cardWidth - 20,
        lineBreak: false,
      });
      if (metric.note) {
        const note = cleanText(metric.note, 45);
        doc.fontSize(6.5).fillColor(COLORS.muted);
        writeBodyText(doc, note, regularFont, x + 10, y + 38, {
          width: cardWidth - 20,
          lineBreak: false,
        });
      }
    });
    doc.y = rowY + cardHeight + gap;
  }
  doc.y += 6;
}

function drawSectionHeading(
  doc: PDFKit.PDFDocument,
  sheet: ReportSheet,
  regularFont: string,
  addPage: AddReportPage,
  continued = false,
) {
  ensureSpace(doc, 54, addPage);
  doc.rect(PAGE_MARGIN, doc.y + 1, 4, 24).fill(COLORS.indigo);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.ink).text(sheet.name + (continued ? " - continued" : ""), PAGE_MARGIN + 12, doc.y, {
    lineBreak: false,
  });
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted).text(
    sheet.rows.length + " record" + (sheet.rows.length === 1 ? "" : "s"),
    PAGE_MARGIN + 12,
    doc.y + 16,
    { lineBreak: false },
  );
  doc.y += 34;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  sheet: ReportSheet,
  xPositions: number[],
  widths: number[],
) {
  const y = doc.y;
  const height = 26;
  doc.rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, height).fill(COLORS.navy);
  sheet.columns.forEach((column, index) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.white).text(cleanText(column, 45).toUpperCase(), xPositions[index] + 6, y + 8, {
      width: widths[index] - 12,
      lineBreak: false,
      ellipsis: true,
    });
  });
  doc.y += height;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  sheet: ReportSheet,
  regularFont: string,
  addPage: AddReportPage,
) {
  drawSectionHeading(doc, sheet, regularFont, addPage);
  if (!sheet.rows.length) {
    doc.roundedRect(PAGE_MARGIN, doc.y, doc.page.width - PAGE_MARGIN * 2, 54, 6).fillAndStroke(COLORS.panel, COLORS.line);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("No records found for the selected period.", PAGE_MARGIN + 14, doc.y + 20);
    doc.y += 68;
    return;
  }
  const availableWidth = doc.page.width - PAGE_MARGIN * 2;
  const weights = inferWidths(sheet);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => availableWidth * weight / totalWeight);
  const xPositions: number[] = [];
  widths.reduce((x, width) => {
    xPositions.push(x);
    return x + width;
  }, PAGE_MARGIN);
  drawTableHeader(doc, sheet, xPositions, widths);
  sheet.rows.forEach((row, rowIndex) => {
    const values = sheet.columns.map((_, index) => cleanText(row[index]));
    const contentHeight = Math.max(...values.map((value, index) =>
      measureBodyText(doc, value, regularFont, Math.max(20, widths[index] - 12))));
    const rowHeight = Math.max(27, Math.min(64, contentHeight + 12));
    if (doc.y + rowHeight > doc.page.height - CONTENT_BOTTOM) {
      addPage();
      drawSectionHeading(doc, sheet, regularFont, addPage, true);
      drawTableHeader(doc, sheet, xPositions, widths);
    }
    const y = doc.y;
    doc.rect(PAGE_MARGIN, y, availableWidth, rowHeight).fill(rowIndex % 2 ? COLORS.stripe : COLORS.white);
    doc.lineWidth(0.5).strokeColor(COLORS.line);
    doc.moveTo(PAGE_MARGIN, y + rowHeight).lineTo(PAGE_MARGIN + availableWidth, y + rowHeight).stroke();
    sheet.columns.forEach((column, index) => {
      if (index) doc.moveTo(xPositions[index], y).lineTo(xPositions[index], y + rowHeight).stroke();
      const value = values[index];
      const isStatus = /status|priority|attendance/.test(column.toLowerCase());
      doc.fontSize(7.4).fillColor(isStatus ? statusColor(value) : COLORS.text);
      writeBodyText(doc, value, regularFont, xPositions[index] + 6, y + 7, {
        width: widths[index] - 12,
        height: rowHeight - 12,
        lineGap: 1,
        ellipsis: true,
        align: typeof row[index] === "number" ? "right" : "left",
      });
    });
    doc.y = y + rowHeight;
  });
  doc.rect(PAGE_MARGIN, doc.y - Math.min(doc.y, 1), availableWidth, 1).fill(COLORS.line);
  doc.y += 16;
}

function drawPageDecorations(
  doc: PDFKit.PDFDocument,
  title: string,
  options: PdfReportOptions,
  generatedAt: string,
) {
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(pages.start + index);
    drawPageHeader(doc, title, options, generatedAt);
    // Keep footer text above PDFKit's bottom margin to avoid implicit blank pages.
    const y = doc.page.height - PAGE_MARGIN - 10;
    doc.moveTo(PAGE_MARGIN, y - 7).lineTo(doc.page.width - PAGE_MARGIN, y - 7).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.muted).text("CONFIDENTIAL - WorkLog Ultra", PAGE_MARGIN, y, {
      width: 220,
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text("Generated " + generatedAt, doc.page.width / 2 - 100, y, {
      width: 200,
      align: "center",
      lineBreak: false,
    });
    doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.muted).text("Page " + (index + 1) + " of " + pages.count, doc.page.width - PAGE_MARGIN - 100, y, {
      width: 100,
      align: "right",
      lineBreak: false,
    });
  }
}

export async function pdfReport(title: string, sheets: ReportSheet[], options: PdfReportOptions = {}) {
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansBengali-Regular.ttf");
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 0, left: PAGE_MARGIN },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: title,
      Author: "WorkLog Ultra",
      Subject: options.subtitle ?? "Work and attendance report",
      Creator: "WorkLog Ultra",
    },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const regularFont = fs.existsSync(fontPath) ? "ReportRegular" : "Helvetica";
  if (regularFont === "ReportRegular") doc.registerFont(regularFont, fontPath);
  const generatedAt = formatGeneratedAt(options.generatedAt);
  const addPage = () => {
    doc.addPage();
    doc.y = CONTENT_TOP;
  };
  doc.y = CONTENT_TOP;
  if (options.subtitle || options.scope) {
    const context = [options.subtitle, options.scope].filter(Boolean).join("  |  ");
    doc.fontSize(8.5).fillColor(COLORS.muted);
    writeBodyText(doc, context, regularFont, PAGE_MARGIN, doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });
    doc.y += 17;
  }
  drawOverview(doc, options.metrics ?? [], regularFont, addPage);
  sheets.forEach((sheet, index) => {
    if (index > 0) addPage();
    drawTable(doc, sheet, regularFont, addPage);
  });
  drawPageDecorations(doc, title, options, generatedAt);
  doc.end();
  return finished;
}

export async function exportResponse(
  title: string,
  sheets: ReportSheet[],
  format: string,
  filename: string,
  options: ExportOptions = {},
) {
  const pdf = format === "pdf";
  const buffer = pdf
    ? await pdfReport(title, options.pdfSheets ?? sheets, options.pdf)
    : await excelReport(title, sheets);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.${pdf ? "pdf" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
