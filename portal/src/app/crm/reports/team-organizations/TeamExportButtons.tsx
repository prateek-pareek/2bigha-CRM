"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { exportReport, TeamReportData } from "../lib/export-reports";

type Props = {
  data: TeamReportData[];
  fileName: string;
  disabled?: boolean;
};

export default function TeamExportButtons({ data, fileName, disabled }: Props) {
  const [exporting, setExporting] = useState<"csv" | "excel" | null>(null);

  const handleExport = async (format: "csv" | "excel") => {
    if (!data || data.length === 0) {
      toast.error("No data to export");
      return;
    }

    setExporting(format);
    try {
      await exportReport(data, format, fileName, true);
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
      <button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={disabled || exporting !== null}
        title="Download as CSV"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting === "csv" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        CSV
      </button>

      <button
        type="button"
        onClick={() => handleExport("excel")}
        disabled={disabled || exporting !== null}
        title="Download as Excel"
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting === "excel" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        Excel
      </button>
    </div>
  );
}
