import { toast } from "sonner";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ExportFormat = "csv" | "excel" | "pdf";

export interface AgentReportData {
  agentId: string;
  name: string;
  calls: number;
  activities: number;
  leadsCreated: number;
  leadsConverted: number;
  conversionRate: number;
  followUpAdherence: number;
  responseTime: string;
  revenue: number;
  properties: number;
  farms: number;
  leadsTarget: number;
  callsTarget: number;
  targetProgress: number;
}

export interface TeamReportData {
  teamId: string;
  teamName: string;
  teamSize: number;
  totalCalls: number;
  totalLeads: number;
  leadsConverted: number;
  conversionRate: number;
  messagesOutbound: number;
  messagesRead: number;
  readRate: number;
  incomingCalls: number;
  missedCalls: number;
  missedRate: number;
}

/**
 * Export to CSV format
 */
export function exportToCSV(
  data: AgentReportData[] | TeamReportData[],
  fileName: string,
  isTeamReport: boolean
) {
  const headers = isTeamReport
    ? [
        "Team Name",
        "Team Size",
        "Total Calls",
        "Total Leads",
        "Leads Converted",
        "Conversion Rate (%)",
        "Messages Sent",
        "Messages Read",
        "Read Rate (%)",
        "Incoming Calls",
        "Missed Calls",
        "Missed Rate (%)",
      ]
    : [
        "Agent Name",
        "Calls",
        "Activities",
        "Leads Created",
        "Leads Converted",
        "Conversion Rate (%)",
        "Follow-up Adherence (%)",
        "Avg Response Time",
        "Revenue (₹)",
        "Properties",
        "Farms",
        "Leads Target",
        "Target Progress (%)",
      ];

  const rows = data.map((row: any) =>
    isTeamReport
      ? [
          row.teamName,
          row.teamSize,
          row.totalCalls,
          row.totalLeads,
          row.leadsConverted,
          row.conversionRate,
          row.messagesOutbound,
          row.messagesRead,
          row.readRate,
          row.incomingCalls,
          row.missedCalls,
          row.missedRate,
        ]
      : [
          row.name,
          row.calls,
          row.activities,
          row.leadsCreated,
          row.leadsConverted,
          row.conversionRate,
          row.followUpAdherence,
          row.responseTime,
          row.revenue,
          row.properties,
          row.farms,
          row.leadsTarget,
          row.targetProgress,
        ]
  );

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Export to Excel format (CSV-based, simpler approach)
 */
export async function exportToExcel(
  data: AgentReportData[] | TeamReportData[],
  fileName: string,
  isTeamReport: boolean
) {
  try {
    // Try to use xlsx if available
    try {
      const XLSX = await import("xlsx");

      const headers = isTeamReport
        ? [
            "Team Name",
            "Team Size",
            "Total Calls",
            "Total Leads",
            "Leads Converted",
            "Conversion Rate (%)",
            "Messages Sent",
            "Messages Read",
            "Read Rate (%)",
            "Incoming Calls",
            "Missed Calls",
            "Missed Rate (%)",
          ]
        : [
            "Agent Name",
            "Calls",
            "Activities",
            "Leads Created",
            "Leads Converted",
            "Conversion Rate (%)",
            "Follow-up Adherence (%)",
            "Avg Response Time",
            "Revenue (₹)",
            "Properties",
            "Farms",
            "Leads Target",
            "Target Progress (%)",
          ];

      const rows = data.map((row: any) =>
        isTeamReport
          ? [
              row.teamName,
              row.teamSize,
              row.totalCalls,
              row.totalLeads,
              row.leadsConverted,
              row.conversionRate,
              row.messagesOutbound,
              row.messagesRead,
              row.readRate,
              row.incomingCalls,
              row.missedCalls,
              row.missedRate,
            ]
          : [
              row.name,
              row.calls,
              row.activities,
              row.leadsCreated,
              row.leadsConverted,
              row.conversionRate,
              row.followUpAdherence,
              row.responseTime,
              row.revenue,
              row.properties,
              row.farms,
              row.leadsTarget,
              row.targetProgress,
            ]
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } catch {
      // Fallback to CSV if xlsx is not available
      console.log("xlsx not available, using CSV format instead");
      exportToCSV(data, fileName, isTeamReport);
      toast.info("Exported as CSV (xlsx library not available)");
    }
  } catch (error) {
    console.error("Excel export error:", error);
    throw new Error("Failed to export to Excel");
  }
}

/**
 * Export to PDF format
 */
export function exportToPDF(
  data: AgentReportData[] | TeamReportData[],
  fileName: string,
  isTeamReport: boolean
) {
  try {
    const doc = new jsPDF("landscape");

    const headers = isTeamReport
      ? [
          "Team Name",
          "Size",
          "Calls",
          "Leads",
          "Conv",
          "Conv %",
          "Msg Sent",
          "Msg Read",
          "Read %",
          "In Calls",
          "Missed",
          "Missed %",
        ]
      : [
          "Agent Name",
          "Calls",
          "Activities",
          "Leads",
          "Conv",
          "Conv %",
          "Follow-up %",
          "Resp Time",
          "Revenue (₹)",
          "Props",
          "Farms",
          "Target %",
        ];

    const rows = data.map((row: any) =>
      isTeamReport
        ? [
            row.teamName,
            row.teamSize,
            row.totalCalls,
            row.totalLeads,
            row.leadsConverted,
            row.conversionRate,
            row.messagesOutbound,
            row.messagesRead,
            row.readRate,
            row.incomingCalls,
            row.missedCalls,
            row.missedRate,
          ]
        : [
            row.name,
            row.calls,
            row.activities,
            row.leadsCreated,
            row.leadsConverted,
            row.conversionRate,
            row.followUpAdherence,
            row.responseTime,
            row.revenue,
            row.properties,
            row.farms,
            row.targetProgress,
          ]
    );

    doc.setFontSize(14);
    doc.text(`2Bigha CRM - ${isTeamReport ? 'Team' : 'Agent'} Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 30,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] }, // --primary color
      alternateRowStyles: { fillColor: [248, 250, 252] }, // --surface-dim roughly
    });

    doc.save(`${fileName}.pdf`);
  } catch (error) {
    console.error("PDF export error:", error);
    toast.error("Failed to export to PDF");
  }
}

/**
 * Main export function that routes to the appropriate format
 */
export async function exportReport(
  data: AgentReportData[] | TeamReportData[],
  format: ExportFormat,
  fileName: string,
  isTeamReport: boolean
) {
  if (format === "csv") {
    exportToCSV(data, fileName, isTeamReport);
  } else if (format === "excel") {
    await exportToExcel(data, fileName, isTeamReport);
  } else if (format === "pdf") {
    exportToPDF(data, fileName, isTeamReport);
  }
}
