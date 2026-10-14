import { toast } from "sonner";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AgentReportRow, TeamReportRow } from "./performance-report";

type ExportFormat = "csv" | "excel" | "pdf";

type Column<T> = { header: string; short?: string; value: (row: T) => string | number };

const dash = (v: number | null | undefined) => (v == null ? "—" : v);

export const AGENT_EXPORT_COLUMNS: Column<AgentReportRow>[] = [
  { header: "Agent", value: (r) => r.name },
  { header: "Team", value: (r) => r.teamName },
  { header: "Calls", value: (r) => r.calls },
  { header: "Connected Calls", short: "Conn.", value: (r) => r.connectedCalls },
  { header: "Connect Rate (%)", short: "Conn %", value: (r) => r.connectRate },
  { header: "Missed Calls", short: "Missed", value: (r) => r.missedCalls },
  { header: "Leads Created", short: "Leads", value: (r) => r.leadsCreated },
  { header: "Leads Converted", short: "Conv", value: (r) => r.leadsConverted },
  { header: "Conversion Rate (%)", short: "Conv %", value: (r) => r.conversionRate },
  { header: "Follow-ups Due", short: "FU due", value: (r) => r.followUpsDue },
  { header: "Follow-ups Done", short: "FU done", value: (r) => r.followUpsDone },
  { header: "Follow-up Adherence (%)", short: "FU %", value: (r) => dash(r.followUpAdherence) },
  { header: "Avg First Response (min)", short: "Resp (min)", value: (r) => dash(r.avgResponseMins) },
  { header: "Activities", short: "Acts", value: (r) => r.activities },
  { header: "Properties Listed", short: "Props", value: (r) => r.properties },
  { header: "Farms Listed", short: "Farms", value: (r) => r.farms },
  { header: "WhatsApp Sent", short: "WA sent", value: (r) => r.whatsappSent },
  { header: "WhatsApp Read", short: "WA read", value: (r) => r.whatsappRead },
  { header: "Subscription Sales", short: "Subs", value: (r) => r.subscriptionSales },
  { header: "Revenue (INR)", short: "Revenue", value: (r) => r.revenue },
  { header: "Leads Target", short: "Lead tgt", value: (r) => r.target?.leadsTarget ?? "—" },
  { header: "Calls Target", short: "Call tgt", value: (r) => r.target?.callsTarget ?? "—" },
];

export const TEAM_EXPORT_COLUMNS: Column<TeamReportRow>[] = [
  { header: "Team", value: (r) => r.teamName },
  { header: "Members", short: "Size", value: (r) => r.teamSize },
  { header: "Calls", value: (r) => r.calls },
  { header: "Connected Calls", short: "Conn.", value: (r) => r.connectedCalls },
  { header: "Incoming Calls", short: "In", value: (r) => r.incomingCalls },
  { header: "Missed Calls", short: "Missed", value: (r) => r.missedCalls },
  { header: "Leads Created", short: "Leads", value: (r) => r.leadsCreated },
  { header: "Leads Converted", short: "Conv", value: (r) => r.leadsConverted },
  { header: "Conversion Rate (%)", short: "Conv %", value: (r) => r.conversionRate },
  { header: "Follow-up Adherence (%)", short: "FU %", value: (r) => dash(r.followUpAdherence) },
  { header: "Listings", value: (r) => r.listingsTotal },
  { header: "WhatsApp Sent", short: "WA sent", value: (r) => r.whatsappSent },
  { header: "WhatsApp Read", short: "WA read", value: (r) => r.whatsappRead },
  { header: "WhatsApp Read Rate (%)", short: "Read %", value: (r) => r.whatsappReadRate },
  { header: "Subscription Sales", short: "Subs", value: (r) => r.subscriptionSales },
  { header: "Revenue (INR)", short: "Revenue", value: (r) => r.revenue },
];

function table(data: Array<AgentReportRow | TeamReportRow>, isTeam: boolean, short = false) {
  const cols = (isTeam ? TEAM_EXPORT_COLUMNS : AGENT_EXPORT_COLUMNS) as Column<any>[];
  return {
    headers: cols.map((c) => (short && c.short) || c.header),
    rows: data.map((row) => cols.map((c) => c.value(row))),
  };
}

function download(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportToCSV(data: Array<AgentReportRow | TeamReportRow>, fileName: string, isTeam: boolean) {
  const { headers, rows } = table(data, isTeam);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  // BOM so Excel opens UTF-8 (₹, names) correctly.
  download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }), `${fileName}.csv`);
}

export async function exportToExcel(data: Array<AgentReportRow | TeamReportRow>, fileName: string, isTeam: boolean) {
  try {
    const XLSX = await import("xlsx");
    const { headers, rows } = table(data, isTeam);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((h, i) => ({ wch: i < 2 ? 24 : Math.max(10, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, isTeam ? "Teams" : "Agents");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (error) {
    console.error("Excel export error:", error);
    exportToCSV(data, fileName, isTeam);
    toast.info("Exported as CSV (Excel export unavailable)");
  }
}

export function exportToPDF(
  data: Array<AgentReportRow | TeamReportRow>,
  fileName: string,
  isTeam: boolean,
  subtitle?: string,
) {
  const doc = new jsPDF("landscape");
  const { headers, rows } = table(data, isTeam, true);
  doc.setFontSize(14);
  doc.text(`2Bigha CRM - ${isTeam ? "Team & Organization" : "Agent Performance"} Report`, 14, 15);
  doc.setFontSize(9);
  doc.text(`${subtitle ? `${subtitle} · ` : ""}Generated ${new Date().toLocaleString()}`, 14, 21);
  autoTable(doc, {
    head: [headers],
    body: rows as any,
    startY: 26,
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(`${fileName}.pdf`);
}

export async function exportReport(
  data: Array<AgentReportRow | TeamReportRow>,
  format: ExportFormat,
  fileName: string,
  isTeam: boolean,
  subtitle?: string,
) {
  if (format === "csv") exportToCSV(data, fileName, isTeam);
  else if (format === "excel") await exportToExcel(data, fileName, isTeam);
  else exportToPDF(data, fileName, isTeam, subtitle);
}
