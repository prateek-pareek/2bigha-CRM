"use client";

import { Download, Loader2, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { exportReport, AgentReportData } from "../lib/export-reports";
import { CrmDropdown } from "@/components/crm/ui";

type Props = {
  data: AgentReportData[];
  fileName: string;
  disabled?: boolean;
};

export default function ExportButtons({ data, fileName, disabled }: Props) {
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    if (format === "pdf") {
      window.print();
      return;
    }

    if (!data || data.length === 0) {
      toast.error("No data to export");
      return;
    }

    setExporting(format);
    try {
      await exportReport(data, format, fileName, false);
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
          { value: "pdf", label: "Print PDF" }
        ]}
        placeholder={exporting ? "Exporting..." : "Export Reports"}
        disabled={disabled || exporting !== null}
        buttonClassName="h-8 !py-1.5 inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-semibold text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        textSize="text-xs"
      />
    </div>
  );
}
