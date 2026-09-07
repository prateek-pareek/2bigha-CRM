"use client";

import { useState } from "react";
import { toast } from "sonner";
import api from "@/common/lib/api";
import { CrmButton } from "@/components/crm/ui";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportType: "agent" | "team";
  currentFilters: Record<string, any>;
};

export default function ScheduleReportModal({ open, onOpenChange, reportType, currentFilters }: Props) {
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [emails, setEmails] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    const emailList = emails.split(",").map(e => e.trim()).filter(Boolean);
    if (emailList.length === 0) {
      toast.error("Please enter at least one email address");
      return;
    }

    setLoading(true);
    try {
      await api.post("/crm/reports/schedules", {
        reportType,
        frequency,
        emailRecipients: emailList,
        filters: currentFilters
      });
      toast.success("Report schedule saved successfully!");
      onOpenChange(false);
      setEmails("");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to schedule report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 shadow-[var(--crm-shadow-raised)]">
        <h3 className="text-lg font-bold text-[var(--text-main)]">Schedule Automated Report</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          This report will be generated matching your current screen filters and emailed to the specified recipients automatically.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Mondays)</option>
              <option value="monthly">Monthly (1st of Month)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Email Recipients (comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. manager@company.com, ceo@company.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/20 transition-all"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </CrmButton>
          <CrmButton type="button" onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Save Schedule"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
