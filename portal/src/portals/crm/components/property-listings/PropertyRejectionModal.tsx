"use client";

import { useState } from "react";
import { AlertTriangle, Check, XCircle } from "lucide-react";
import { CrmCenterModalShell } from "@/components/crm/shell/CrmCenterModalShell";
import { CrmButton } from "@/components/crm/ui";

const PRESET_REASONS = [
  "Incomplete / Invalid Land Documents",
  "Unrealistic Listing Price",
  "Inaccurate Address or Khasra Details",
  "Poor Image Quality / Inadequate Photos",
  "Duplicate Property Listing",
  "Unclear Property Title / Ownership Claim",
];

interface PropertyRejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function PropertyRejectionModal({
  isOpen,
  onClose,
  propertyTitle,
  onConfirm,
}: PropertyRejectionModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customComment, setCustomComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    const finalReason = [selectedReason, customComment.trim()].filter(Boolean).join(" - ");
    if (!finalReason) return;
    setSubmitting(true);
    try {
      await onConfirm(finalReason);
      onClose();
      setSelectedReason("");
      setCustomComment("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CrmCenterModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Property Listing"
      subtitle={propertyTitle ? `Reviewing submission for: ${propertyTitle}` : "Provide reason for rejection"}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <p>
            Rejecting this listing will return it to rejected status on 2Bigha. The seller/agent will receive the moderation feedback.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick Select Reason
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(isSelected ? "" : reason)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-rose-600 dark:text-rose-400" />}
                  {reason}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Additional Comments / Instructions
          </label>
          <textarea
            value={customComment}
            onChange={(e) => setCustomComment(e.target.value)}
            placeholder="Add specific details or instructions for the seller to rectify..."
            rows={3}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CrmButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </CrmButton>
          <CrmButton
            variant="danger"
            onClick={handleConfirm}
            disabled={submitting || (!selectedReason && !customComment.trim())}
            className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            <XCircle className="h-4 w-4" />
            {submitting ? "Rejecting..." : "Confirm Rejection"}
          </CrmButton>
        </div>
      </div>
    </CrmCenterModalShell>
  );
}
