"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CrmDropdown } from "@/components/crm/ui";
import { exportReport } from "../lib/export-reports";
import type { AgentReportRow, TeamReportRow } from "../lib/performance-report";

type Props = {
  data: AgentReportRow[] | TeamReportRow[];
  fileName: string;
  /** Team & Organization columns instead of per-agent columns. */
  team?: boolean;
  /** Period / scope line printed on the PDF. */
  subtitle?: string;
  disabled?: boolean;
};

export default function ExportButtons({ data, fileName, team = false, subtitle, disabled }: Props) {
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    if (!data || data.length === 0) {
      toast.error("No data to export");
      return;
    }
    setExporting(format);
    try {
      await exportReport(data, format, fileName, team, subtitle);
      toast.success(`Exported to ${format.toUpperCase()}`);
    } catch (error) {
      console.error(`Export error (${format}):`, error);
      toast.error(`Failed to export to ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex gap-2">
      <CrmDropdown
        value=""
        onChange={(val) => handleExport(val as "csv" | "excel" | "pdf")}
        options={[
          { value: "csv", label: "Download CSV" },
          { value: "excel", label: "Download Excel" },
          { value: "pdf", label: "Download PDF" },
        ]}
        placeholder={exporting ? "Exporting..." : "Export Reports"}
        disabled={disabled || exporting !== null}
        buttonClassName="h-8 !py-1.5 inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        textSize="text-xs"
      />
    </div>
  );
}
