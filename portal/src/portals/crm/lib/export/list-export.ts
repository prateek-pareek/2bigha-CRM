import api from "@/lib/crm/api";

/** One exported column: header text + how to read the cell from a row. */
export type ListExportColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export type ListExportFormat = "xlsx" | "csv";

/** Upper bound for browser-built exports (matches the API's CRM_MAX_EXPORT_ROWS). */
export const LIST_EXPORT_MAX_ROWS = 50_000;

/** `YYYY-MM-DD HH:mm` in local time — sorts correctly and Excel reads it as a date. */
export function exportDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Display name from a populated user / person ref or a plain string. */
export function exportPerson(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const name = [v.firstName, v.lastName].filter(Boolean).join(" ").trim();
    return String(name || v.fullName || v.name || v.email || "");
  }
  return String(value);
}

/** Plain text for one cell (numbers incl. 0, booleans, arrays, refs). */
export function exportText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return exportDate(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(exportText).filter(Boolean).join("; ");
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.name === "string") return v.name;
    if (typeof v.title === "string") return v.title;
    const person = exportPerson(v);
    if (person) return person;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Neutralise spreadsheet formulas (CSV injection). Phone numbers such as `+91 98765 43210`
 * and `-` placeholders stay as-is; anything else starting with = + - @ is prefixed.
 */
function neutraliseFormula(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-][\d\s().-]*$/.test(text)) return `'${text}`;
  return text;
}

function buildMatrix<T>(rows: T[], columns: ListExportColumn<T>[]): string[][] {
  return rows.map((row) =>
    columns.map((col) => {
      let raw: unknown;
      try {
        raw = col.value(row);
      } catch {
        raw = "";
      }
      return neutraliseFormula(exportText(raw));
    }),
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string" && m) return m;
  return fallback;
}

/**
 * Download a server-built CSV (`GET /crm/export/:type`) for leads / contacts / clients /
 * organizations. Pass the list's own query params (search, filters, mine, email activity)
 * so the file matches the screen. Keeps the UTF-8 BOM and surfaces permission / quota errors.
 */
export async function downloadServerExport(
  type: "leads" | "contacts" | "clients" | "organizations",
  params?: URLSearchParams,
  opts?: { ids?: string[] },
): Promise<void> {
  const qs = new URLSearchParams();
  // Only forward filter params — paging / sorting don't apply to an export.
  for (const key of [
    "search",
    "filters",
    "mine",
    "lastActivity",
    "emailOpenMode",
    "emailOpenDays",
    "emailReply",
    "pipelineId",
  ]) {
    const v = params?.get(key);
    if (v) qs.set(key, v);
  }
  if (opts?.ids?.length) qs.set("ids", opts.ids.join(","));
  try {
    const res = await api.get<Blob>(`/crm/export/${type}${qs.toString() ? `?${qs}` : ""}`, {
      responseType: "blob",
      timeout: 120_000,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([res.data], { type: "text/csv;charset=utf-8" }),
      `${type}_export_${stamp}.csv`,
    );
  } catch (err) {
    // Error bodies arrive as a Blob too — read the JSON message out of it.
    const e = err as { response?: { data?: unknown } };
    const body = e?.response?.data;
    if (body instanceof Blob) {
      let message = "";
      try {
        const m = JSON.parse(await body.text())?.message;
        message = Array.isArray(m) ? m.join(", ") : String(m || "");
      } catch {
        /* not a JSON error body */
      }
      throw new Error(message || "Export failed");
    }
    throw new Error(apiErrorMessage(err, "Export failed"));
  }
}

/**
 * Page through a list endpoint until every matching row is loaded (or the cap is hit).
 * `fetchPage` must apply the same filters as the list on screen.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; total?: number }>,
  opts?: { maxRows?: number; maxPages?: number },
): Promise<T[]> {
  const maxRows = opts?.maxRows ?? LIST_EXPORT_MAX_ROWS;
  const maxPages = opts?.maxPages ?? 500;
  const out: T[] = [];
  let total = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= maxPages && out.length < total && out.length < maxRows; page++) {
    const { data, total: t } = await fetchPage(page);
    if (typeof t === "number" && Number.isFinite(t)) total = t;
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
  }
  return out.slice(0, maxRows);
}

/**
 * Build and download an export of `rows`.
 * The API checks the module's export permission + daily quota and records the export in
 * Export History *before* the file is produced.
 */
export async function exportListRows<T>(opts: {
  /** Export module key — see CLIENT_EXPORT_PERMISSIONS on the API. */
  module: string;
  /** File name without extension, e.g. `tasks`. */
  fileName: string;
  /** Sheet title shown in Excel. */
  sheetName?: string;
  columns: ListExportColumn<T>[];
  rows: T[];
  format: ListExportFormat;
  /** Filter summary stored in Export History. */
  filters?: Record<string, unknown>;
}): Promise<number> {
  const rows = opts.rows.slice(0, LIST_EXPORT_MAX_ROWS);
  if (!rows.length) throw new Error("Nothing to export — the list is empty.");

  try {
    await api.post("/crm/export/log", {
      module: opts.module,
      rowCount: rows.length,
      filters: opts.filters,
    });
  } catch (err) {
    throw new Error(apiErrorMessage(err, "You are not allowed to export this list."));
  }

  const headers = opts.columns.map((c) => c.header);
  const body = buildMatrix(rows, opts.columns);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${opts.fileName}_export_${stamp}`;

  if (opts.format === "xlsx") {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
    sheet["!cols"] = headers.map((h, i) => {
      const longest = body.reduce((m, r) => Math.max(m, (r[i] || "").length), String(h).length);
      return { wch: Math.min(48, Math.max(10, longest + 2)) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, (opts.sheetName || opts.fileName).slice(0, 31));
    XLSX.writeFile(wb, `${base}.xlsx`);
    return rows.length;
  }

  const csv = [headers, ...body]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  // BOM so Excel opens UTF-8 (₹, Hindi) correctly.
  downloadBlob(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
  return rows.length;
}
