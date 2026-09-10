import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth/server";
import { buildReportSummary, type ReportSummaryItem } from "@/lib/report-summary";
import { getHistoryData } from "@/lib/worklog";
import { toDateOnly, STANDARD_DAILY_HOURS } from "@/lib/utils";
import { db } from "@/lib/db";

function formatRangeDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+06:00`));
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) {
    return formatRangeDate(from);
  }

  return `${formatRangeDate(from)} to ${formatRangeDate(to)}`;
}

function statusLabel(status: "done" | "in_progress" | "pending") {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "employee"
  );
}

function formatDateTimeInDhaka(value: Date) {
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

/** Clock time in Dhaka, or a dash placeholder when the moment is missing. */
function clockInDhaka(value: string | null | undefined) {
  if (!value) {
    return "--:--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

/** "9h 05m" from a raw minute count, so every duration in the book reads alike. */
function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

/** Weekday + day/month, the label a reader scans for when flipping through days. */
function formatDayLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00+06:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

type AttendanceDay = {
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakMinutes: number;
};

type AttendanceMetrics = {
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  overtimeMinutes: number;
  status: "Present" | "Open session" | "Absent";
};

/**
 * One day's attendance reduced to the numbers the report actually reports on.
 *
 * Gross is the raw check-in→check-out span, net subtracts the break, and
 * overtime is whatever net runs past the STANDARD_DAILY_HOURS baseline — the
 * same 9-hour baseline the dashboard's Time Summary counts against, so the
 * spreadsheet and the app never disagree.
 */
function measureAttendanceDay(attendance: AttendanceDay | undefined): AttendanceMetrics {
  if (!attendance?.checkInAt) {
    return { grossMinutes: 0, breakMinutes: 0, netMinutes: 0, overtimeMinutes: 0, status: "Absent" };
  }

  const breakMinutes = Math.max(0, attendance.breakMinutes ?? 0);
  const checkIn = new Date(attendance.checkInAt).getTime();
  const checkOut = attendance.checkOutAt ? new Date(attendance.checkOutAt).getTime() : Number.NaN;

  if (!Number.isFinite(checkOut) || checkOut < checkIn) {
    // Checked in and never checked out: the span is unknowable, so only the
    // break (a recorded fact) carries over and the day is flagged as open.
    return { grossMinutes: 0, breakMinutes, netMinutes: 0, overtimeMinutes: 0, status: "Open session" };
  }

  const grossMinutes = Math.max(0, Math.round((checkOut - checkIn) / 60000));
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);
  const overtimeMinutes = Math.max(0, netMinutes - STANDARD_DAILY_HOURS * 60);

  return { grossMinutes, breakMinutes, netMinutes, overtimeMinutes, status: "Present" };
}

type AttendanceTotals = {
  daysInRange: number;
  daysPresent: number;
  daysAbsent: number;
  openSessions: number;
  netMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  averageNetMinutes: number;
};

/** Roll the per-day attendance metrics up into the figures the cover page reports. */
function summariseAttendance(attendanceData: AttendanceDay[], daysInRange: number): AttendanceTotals {
  const measured = attendanceData.map((entry) => measureAttendanceDay(entry));
  const present = measured.filter((entry) => entry.status === "Present");
  const openSessions = measured.filter((entry) => entry.status === "Open session").length;
  const netMinutes = measured.reduce((total, entry) => total + entry.netMinutes, 0);

  return {
    daysInRange,
    daysPresent: present.length,
    // Only days with no check-in at all count as absent; an unclosed session
    // is reported separately so it never masquerades as a missed day.
    daysAbsent: Math.max(0, daysInRange - present.length - openSessions),
    openSessions,
    netMinutes,
    breakMinutes: measured.reduce((total, entry) => total + entry.breakMinutes, 0),
    overtimeMinutes: measured.reduce((total, entry) => total + entry.overtimeMinutes, 0),
    averageNetMinutes: present.length ? Math.round(netMinutes / present.length) : 0,
  };
}

/** Every calendar day in the requested range, so a zero-activity day still gets a row. */
function listDatesInRange(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    return dates;
  }

  // A month-long range is 31 iterations; the guard is only here so a malformed
  // range can never spin forever.
  while (cursor <= end && dates.length < 400) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

const BRAND_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F5EF7" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFDBE4FF" } },
  left: { style: "thin", color: { argb: "FFDBE4FF" } },
  bottom: { style: "thin", color: { argb: "FFDBE4FF" } },
  right: { style: "thin", color: { argb: "FFDBE4FF" } },
};

const STATUS_FILL: Record<ReportSummaryItem["status"], string> = {
  done: "FFD1FAE5",
  in_progress: "FFDBEAFE",
  pending: "FFFEF3C7",
};

const STATUS_FONT_COLOR: Record<ReportSummaryItem["status"], string> = {
  done: "FF065F46",
  in_progress: "FF1D4ED8",
  pending: "FF92400E",
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = BRAND_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 22;
}

function addCoverSheet(
  workbook: ExcelJS.Workbook,
  input: {
    employeeName: string;
    employeeRole: string;
    rangeLabel: string;
    generatedAt: string;
    totals: ReturnType<typeof buildReportSummary>["totals"];
    attendance: AttendanceTotals;
  },
) {
  const sheet = workbook.addWorksheet("Cover", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 22 }, { width: 42 }];

  sheet.mergeCells("A1:B1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "WorkLog Ultra — Employee Work Report";
  titleCell.font = TITLE_FONT;
  titleCell.fill = BRAND_FILL;
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 32;

  const infoRows: Array<[string, string]> = [
    ["Employee", input.employeeName],
    ["Role", input.employeeRole],
    ["Date range", input.rangeLabel],
    ["Generated", input.generatedAt],
  ];

  infoRows.forEach(([label, value], index) => {
    const rowNumber = index + 3;
    const labelCell = sheet.getCell(`A${rowNumber}`);
    const valueCell = sheet.getCell(`B${rowNumber}`);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: "FF47597C" } };
    valueCell.value = value;
  });

  let cursor = infoRows.length + 4;

  // Two stacked blocks rather than one long list: a reader looking for hours
  // should not have to scan past task counts to find them.
  const blocks: Array<{ heading: string; rows: Array<[string, string | number]> }> = [
    {
      heading: "Work output",
      rows: [
        ["Total task entries", input.totals.totalTasks],
        ["Completed", input.totals.completedTasks],
        ["In progress", input.totals.inProgressTasks],
        ["Pending", input.totals.pendingTasks],
        ["Tracked time", input.totals.totalTrackedLabel],
        ["Tracked minutes", input.totals.totalTrackedMinutes],
      ],
    },
    {
      heading: "Attendance & hours",
      rows: [
        ["Days in range", input.attendance.daysInRange],
        ["Days present", input.attendance.daysPresent],
        ["Days absent", input.attendance.daysAbsent],
        ["Open sessions (no check-out)", input.attendance.openSessions],
        ["Total net work time", formatMinutes(input.attendance.netMinutes)],
        ["Total break time", formatMinutes(input.attendance.breakMinutes)],
        ["Total overtime", formatMinutes(input.attendance.overtimeMinutes)],
        ["Average net work / present day", formatMinutes(input.attendance.averageNetMinutes)],
        ["Daily baseline", `${STANDARD_DAILY_HOURS}h 00m`],
      ],
    },
  ];

  blocks.forEach((block) => {
    cursor += 1;
    const headingCell = sheet.getCell(`A${cursor}`);
    headingCell.value = block.heading;
    headingCell.font = { bold: true, size: 13, color: { argb: "FF14213D" } };
    cursor += 1;

    block.rows.forEach(([label, value]) => {
      const labelCell = sheet.getCell(`A${cursor}`);
      const valueCell = sheet.getCell(`B${cursor}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3FF" } };
      labelCell.border = THIN_BORDER;
      valueCell.value = value;
      valueCell.border = THIN_BORDER;
      valueCell.alignment = { horizontal: "right" };
      cursor += 1;
    });
  });

  return sheet;
}

function addEntriesSheet(workbook: ExcelJS.Workbook, items: ReportSummaryItem[]) {
  const sheet = workbook.addWorksheet("Report Entries", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "#", key: "index", width: 5 },
    { header: "Date", key: "date", width: 13 },
    { header: "Task", key: "task", width: 34 },
    { header: "Department", key: "department", width: 16 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Status", key: "status", width: 13 },
    { header: "Progress %", key: "progress", width: 11 },
    { header: "Tracked (min)", key: "trackedMinutes", width: 13 },
    { header: "Notes", key: "notes", width: 42 },
    { header: "Follow-up", key: "followUp", width: 10 },
    { header: "Continued", key: "continued", width: 10 },
    { header: "Days active", key: "daysActive", width: 11 },
  ];
  styleHeaderRow(sheet.getRow(1));

  items.forEach((item, index) => {
    const row = sheet.addRow({
      index: index + 1,
      date: item.date,
      task: item.title,
      department: item.departmentName,
      priority: item.priority.charAt(0).toUpperCase() + item.priority.slice(1),
      status: statusLabel(item.status),
      progress: item.completionPercent,
      trackedMinutes: item.trackedMinutes,
      notes: item.description || item.note || "",
      followUp: item.isFollowUp ? "Yes" : "No",
      continued: item.isContinued ? "Yes" : "No",
      daysActive: item.continuation?.totalDays ?? 1,
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle" };
    });

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
      });
    }

    const statusCell = row.getCell("status");
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[item.status] } };
    statusCell.font = { bold: true, color: { argb: STATUS_FONT_COLOR[item.status] } };
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    row.getCell("progress").numFmt = '0"%"';
    row.getCell("progress").alignment = { horizontal: "right" };
    row.getCell("trackedMinutes").alignment = { horizontal: "right" };
    row.getCell("notes").alignment = { wrapText: true, vertical: "middle" };
  });

  if (items.length) {
    const totalRow = sheet.addRow({
      index: "",
      date: "",
      task: `Total · ${items.length} ${items.length === 1 ? "entry" : "entries"}`,
      department: "",
      priority: "",
      status: "",
      progress: "",
      trackedMinutes: { formula: `SUM(H2:H${items.length + 1})` },
      notes: "",
      followUp: "",
      continued: "",
      daysActive: "",
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "double", color: { argb: "FF4F5EF7" } } };
    });
  }

  sheet.autoFilter = { from: "A1", to: `L${items.length + 1 || 1}` };
  return sheet;
}

function addDailyLogSheet(workbook: ExcelJS.Workbook, items: ReportSummaryItem[]) {
  const dailyRows = items.flatMap((item) =>
    item.continuation && item.continuation.dailyLogs.length > 1
      ? item.continuation.dailyLogs.map((entry) => ({ task: item.title, ...entry }))
      : [],
  );

  if (!dailyRows.length) {
    return null;
  }

  const sheet = workbook.addWorksheet("Daily Log", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Task", key: "task", width: 34 },
    { header: "Date", key: "date", width: 13 },
    { header: "Progress %", key: "progress", width: 11 },
    { header: "Tracked (min)", key: "trackedMinutes", width: 13 },
    { header: "Note", key: "note", width: 48 },
  ];
  styleHeaderRow(sheet.getRow(1));

  dailyRows.forEach((entry, index) => {
    const row = sheet.addRow({
      task: entry.task,
      date: entry.date,
      progress: entry.progress,
      trackedMinutes: entry.trackedMinutes,
      note: entry.note,
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle" };
    });

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
      });
    }

    row.getCell("progress").numFmt = '0"%"';
    row.getCell("progress").alignment = { horizontal: "right" };
    row.getCell("trackedMinutes").alignment = { horizontal: "right" };
    row.getCell("note").alignment = { wrapText: true, vertical: "middle" };
  });

  sheet.autoFilter = { from: "A1", to: `E${dailyRows.length + 1}` };
  return sheet;
}

function addAttendanceSheet(
  workbook: ExcelJS.Workbook,
  attendanceData: Array<{ date: string; checkInAt: string | null; checkOutAt: string | null; breakMinutes: number }>,
) {
  if (!attendanceData.length) {
    return null;
  }

  const sheet = workbook.addWorksheet("Attendance", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Date", key: "date", width: 13 },
    { header: "Check In", key: "checkIn", width: 14 },
    { header: "Check Out", key: "checkOut", width: 14 },
    { header: "Break (min)", key: "breakTime", width: 12 },
    { header: "Work Time (hrs)", key: "workTime", width: 14 },
    { header: "Status", key: "status", width: 12 },
  ];
  styleHeaderRow(sheet.getRow(1));

  attendanceData.forEach((entry, index) => {
    const checkInTime = entry.checkInAt ? new Date(`${entry.checkInAt}`) : null;
    const checkOutTime = entry.checkOutAt ? new Date(`${entry.checkOutAt}`) : null;

    let workHours = 0;
    if (checkInTime && checkOutTime) {
      workHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60) - entry.breakMinutes / 60;
    }

    const status = !entry.checkInAt ? "Absent" : !entry.checkOutAt ? "Not Checked Out" : "Present";

    const row = sheet.addRow({
      date: entry.date,
      checkIn: checkInTime ? checkInTime.toLocaleTimeString("en-BD") : "--",
      checkOut: checkOutTime ? checkOutTime.toLocaleTimeString("en-BD") : "--",
      breakTime: entry.breakMinutes,
      workTime: workHours > 0 ? workHours.toFixed(2) : "--",
      status: status,
    });

    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle" };
    });

    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
      });
    }

    const statusCell = row.getCell("status");
    if (status === "Present") {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      statusCell.font = { color: { argb: "FF065F46" }, bold: true };
    } else if (status === "Not Checked Out") {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      statusCell.font = { color: { argb: "FF92400E" }, bold: true };
    } else {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } };
      statusCell.font = { color: { argb: "FF991B1B" }, bold: true };
    }
    statusCell.alignment = { horizontal: "center" };

    row.getCell("breakTime").alignment = { horizontal: "right" };
    row.getCell("workTime").alignment = { horizontal: "right" };
  });

  sheet.autoFilter = { from: "A1", to: `F${attendanceData.length + 1}` };
  return sheet;
}

const DAY_TASK_HEADERS = [
  "Task",
  "Department",
  "Priority",
  "Status",
  "Started",
  "Finished",
  "Tracked",
  "Progress %",
  "Progress note",
  "Description",
] as const;

/**
 * The heart of the report: one block per calendar day in the selected range.
 *
 * Each block stacks the day's attendance (in, out, break, net, overtime) on
 * top of every task touched that day, so a reader auditing "what did this
 * person do on the 18th" never has to cross-reference another sheet. Days
 * with no attendance and no tasks still get a block, because a silent gap in
 * a monitoring report is itself the finding.
 */
function addDayByDayDetailSheet(
  workbook: ExcelJS.Workbook,
  items: ReportSummaryItem[],
  attendanceData: AttendanceDay[],
  from: string,
  to: string,
) {
  const sheet = workbook.addWorksheet("Day-by-Day Details", { views: [{ showGridLines: false }] });

  // Widths first: assigning `columns` after the cells exist rebuilds the
  // column defs underneath already-written data.
  sheet.columns = [
    { width: 34 },
    { width: 16 },
    { width: 10 },
    { width: 13 },
    { width: 11 },
    { width: 11 },
    { width: 10 },
    { width: 11 },
    { width: 34 },
    { width: 40 },
  ];

  const tasksByDate = new Map<string, ReportSummaryItem[]>();
  items.forEach((item) => {
    const bucket = tasksByDate.get(item.date);
    if (bucket) {
      bucket.push(item);
    } else {
      tasksByDate.set(item.date, [item]);
    }
  });

  const attendanceMap = new Map(attendanceData.map((entry) => [entry.date, entry]));

  // The requested range is the spine. Anything recorded outside it (a task
  // whose report date drifted) is appended so no data silently vanishes.
  const rangeDates = listDatesInRange(from, to);
  const extraDates = [...tasksByDate.keys(), ...attendanceMap.keys()].filter((date) => !rangeDates.includes(date));
  const sortedDates = [...new Set([...rangeDates, ...extraDates])].sort();

  const lastColumn = DAY_TASK_HEADERS.length;
  let currentRow = 1;

  const paintRow = (row: number, fill: string | null, font: Partial<ExcelJS.Font>) => {
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = THIN_BORDER;
      cell.font = font;
      if (fill) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      }
    }
  };

  sortedDates.forEach((date) => {
    const tasks = tasksByDate.get(date) ?? [];
    const attendance = attendanceMap.get(date);
    const metrics = measureAttendanceDay(attendance);
    const taskMinutes = tasks.reduce((total, task) => total + task.trackedMinutes, 0);

    // ---- Day banner -------------------------------------------------------
    sheet.mergeCells(currentRow, 1, currentRow, lastColumn);
    const banner = sheet.getCell(currentRow, 1);
    banner.value = formatDayLabel(date);
    banner.alignment = { vertical: "middle", horizontal: "left" };
    paintRow(currentRow, "FF4F5EF7", { bold: true, size: 12, color: { argb: "FFFFFFFF" } });
    sheet.getRow(currentRow).height = 22;
    currentRow += 1;

    // ---- Attendance strip -------------------------------------------------
    const attendancePairs: Array<[string, string]> = [
      ["Check-in", clockInDhaka(attendance?.checkInAt)],
      ["Check-out", clockInDhaka(attendance?.checkOutAt)],
      ["Break", formatMinutes(metrics.breakMinutes)],
      ["Net work", metrics.status === "Present" ? formatMinutes(metrics.netMinutes) : "--"],
      ["Overtime", metrics.status === "Present" ? formatMinutes(metrics.overtimeMinutes) : "--"],
    ];

    attendancePairs.forEach(([label, value], index) => {
      const labelCell = sheet.getCell(currentRow, index * 2 + 1);
      const valueCell = sheet.getCell(currentRow, index * 2 + 2);
      labelCell.value = label;
      labelCell.font = { bold: true, size: 10, color: { argb: "FF47597C" } };
      valueCell.value = value;
      valueCell.font = { bold: true, size: 10, color: { argb: "FF14213D" } };
      valueCell.alignment = { horizontal: "left" };
    });

    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(currentRow, column);
      cell.border = THIN_BORDER;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3FF" } };
    }
    currentRow += 1;

    // A second strip carries the day's verdict and the two totals that answer
    // "was the tracked work consistent with the hours claimed".
    const summaryPairs: Array<[string, string]> = [
      ["Attendance", metrics.status],
      ["Gross span", metrics.status === "Present" ? formatMinutes(metrics.grossMinutes) : "--"],
      ["Tasks", String(tasks.length)],
      ["Task time", formatMinutes(taskMinutes)],
      ["Completed", String(tasks.filter((task) => task.status === "done").length)],
    ];

    summaryPairs.forEach(([label, value], index) => {
      const labelCell = sheet.getCell(currentRow, index * 2 + 1);
      const valueCell = sheet.getCell(currentRow, index * 2 + 2);
      labelCell.value = label;
      labelCell.font = { bold: true, size: 10, color: { argb: "FF47597C" } };
      valueCell.value = value;
      valueCell.font = { size: 10, color: { argb: "FF14213D" } };
    });

    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = sheet.getCell(currentRow, column);
      cell.border = THIN_BORDER;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8FF" } };
    }

    const verdictCell = sheet.getCell(currentRow, 2);
    verdictCell.font = {
      bold: true,
      size: 10,
      color: { argb: metrics.status === "Present" ? "FF065F46" : metrics.status === "Open session" ? "FF92400E" : "FF991B1B" },
    };
    currentRow += 1;

    // ---- Task table -------------------------------------------------------
    if (!tasks.length) {
      sheet.mergeCells(currentRow, 1, currentRow, lastColumn);
      const emptyCell = sheet.getCell(currentRow, 1);
      emptyCell.value = "No task activity recorded on this day.";
      emptyCell.alignment = { horizontal: "left", vertical: "middle" };
      paintRow(currentRow, "FFFFFFFF", { italic: true, size: 10, color: { argb: "FF8592AD" } });
      currentRow += 2;
      return;
    }

    DAY_TASK_HEADERS.forEach((header, index) => {
      sheet.getCell(currentRow, index + 1).value = header;
    });
    paintRow(currentRow, "FF6B78F9", { bold: true, size: 10, color: { argb: "FFFFFFFF" } });
    for (let column = 1; column <= lastColumn; column += 1) {
      sheet.getCell(currentRow, column).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    sheet.getRow(currentRow).height = 18;
    currentRow += 1;

    tasks.forEach((task, taskIndex) => {
      const values: Array<string | number> = [
        task.title,
        task.departmentName,
        task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
        statusLabel(task.status),
        clockInDhaka(task.actualStart),
        clockInDhaka(task.actualEnd),
        formatMinutes(task.trackedMinutes),
        task.completionPercent,
        task.note || "—",
        task.description || "—",
      ];

      values.forEach((value, index) => {
        const cell = sheet.getCell(currentRow, index + 1);
        cell.value = value;
        cell.border = THIN_BORDER;
        cell.alignment = { vertical: "top", wrapText: index >= 8 };
      });

      if (taskIndex % 2 === 1) {
        for (let column = 1; column <= lastColumn; column += 1) {
          sheet.getCell(currentRow, column).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFF" },
          };
        }
      }

      const statusCell = sheet.getCell(currentRow, 4);
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[task.status] } };
      statusCell.font = { bold: true, color: { argb: STATUS_FONT_COLOR[task.status] } };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };

      sheet.getCell(currentRow, 8).numFmt = '0"%"';
      sheet.getCell(currentRow, 8).alignment = { horizontal: "right", vertical: "top" };
      sheet.getCell(currentRow, 7).alignment = { horizontal: "right", vertical: "top" };

      currentRow += 1;
    });

    // Day total, so each block closes with its own bottom line.
    sheet.getCell(currentRow, 1).value = `Day total · ${tasks.length} ${tasks.length === 1 ? "entry" : "entries"}`;
    sheet.getCell(currentRow, 7).value = formatMinutes(taskMinutes);
    paintRow(currentRow, "FFEAEEFF", { bold: true, size: 10, color: { argb: "FF14213D" } });
    sheet.getCell(currentRow, 7).alignment = { horizontal: "right" };
    currentRow += 2;
  });

  return sheet;
}

function addPerformanceSheet(workbook: ExcelJS.Workbook, items: ReportSummaryItem[]) {
  const sheet = workbook.addWorksheet("Performance", {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [{ width: 30 }, { width: 18 }];

  const titleRow = sheet.addRow(["Performance Summary", ""]);
  titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: "FF14213D" } };
  sheet.getRow(1).height = 20;

  // Task completion rates
  sheet.addRow(["By Status", ""]);
  sheet.getCell(`A${sheet.lastRow?.number ?? 2}`).font = { bold: true, size: 11 };

  const completed = items.filter((i) => i.status === "done").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const pending = items.filter((i) => i.status === "pending").length;

  sheet.addRow([
    "Completed Tasks",
    completed,
  ]);
  sheet.addRow(["In Progress Tasks", inProgress]);
  sheet.addRow(["Pending Tasks", pending]);

  const completionRate = items.length > 0 ? ((completed / items.length) * 100).toFixed(2) : 0;
  sheet.addRow(["Completion Rate (%)", completionRate]);

  sheet.addRow([]);

  // By Priority
  sheet.addRow(["By Priority", ""]);
  sheet.getCell(`A${sheet.lastRow?.number ?? 6}`).font = { bold: true, size: 11 };

  const critical = items.filter((i) => i.priority === "critical").length;
  const high = items.filter((i) => i.priority === "high").length;
  const normal = items.filter((i) => i.priority === "normal").length;
  const low = items.filter((i) => i.priority === "low").length;

  sheet.addRow(["Critical", critical]);
  sheet.addRow(["High", high]);
  sheet.addRow(["Normal", normal]);
  sheet.addRow(["Low", low]);

  sheet.addRow([]);

  // By Department
  sheet.addRow(["By Department", ""]);
  sheet.getCell(`A${sheet.lastRow?.number ?? 12}`).font = { bold: true, size: 11 };

  const departments = new Map<string, number>();
  items.forEach((item) => {
    departments.set(item.departmentName, (departments.get(item.departmentName) ?? 0) + 1);
  });

  departments.forEach((count, dept) => {
    sheet.addRow([dept, count]);
  });

  sheet.eachRow((row) => {
    row.eachCell((cell, columnNumber) => {
      cell.border = THIN_BORDER;
      if (columnNumber === 2 && typeof cell.value === "number") {
        cell.alignment = { horizontal: "right" };
      }
    });
  });

  return sheet;
}

export async function GET(request: NextRequest) {
  const user = await requireEmployee();
  const requestedFrom = request.nextUrl.searchParams.get("from") || toDateOnly();
  const requestedTo = request.nextUrl.searchParams.get("to") || requestedFrom;
  const from = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
  const to = requestedFrom <= requestedTo ? requestedTo : requestedFrom;

  // Fetch task history
  const historyTasks = await getHistoryData(user.id, from, to);
  const summary = buildReportSummary(historyTasks);

  // attendanceDate is a @db.Date, so every value is UTC midnight. Querying it
  // with a Dhaka (+06:00) window would shift the bounds six hours and pull in
  // (or drop) a neighbouring day, so the window is widened by a day on each
  // side in plain UTC and the exact range is enforced on the derived key below.
  const attendanceRecords = await db.attendanceRecord.findMany({
    where: {
      userId: user.id,
      attendanceDate: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
    },
    orderBy: { attendanceDate: "asc" },
  });

  const attendanceData: AttendanceDay[] = attendanceRecords
    .map((record) => ({
      date: toDateOnly(record.attendanceDate),
      checkInAt: record.checkInAt?.toISOString() ?? null,
      checkOutAt: record.checkOutAt?.toISOString() ?? null,
      breakMinutes: record.breakMinutes ?? 0,
    }))
    .filter((entry) => entry.date >= from && entry.date <= to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkLog Ultra";
  workbook.created = new Date();
  workbook.title = "WorkLog Ultra Employee Report";
  workbook.subject = `Work report for ${user.name}`;

  const rangeDates = listDatesInRange(from, to);

  // Add sheets in order
  addCoverSheet(workbook, {
    employeeName: user.name,
    employeeRole: user.designation ?? user.role,
    rangeLabel: formatRangeLabel(from, to),
    generatedAt: formatDateTimeInDhaka(new Date()),
    totals: summary.totals,
    attendance: summariseAttendance(attendanceData, rangeDates.length),
  });

  addDayByDayDetailSheet(workbook, summary.items, attendanceData, from, to);
  addAttendanceSheet(workbook, attendanceData);
  addEntriesSheet(workbook, summary.items);
  addDailyLogSheet(workbook, summary.items);
  addPerformanceSheet(workbook, summary.items);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="worklog-report-${slugify(user.name)}-${from}-to-${to}.xlsx"`,
    },
  });
}
