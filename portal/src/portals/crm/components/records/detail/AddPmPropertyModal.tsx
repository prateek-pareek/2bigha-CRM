"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import {
  EMPTY_PM_PROPERTY_DRAFT,
  PmPropertyFormFields,
  pmDraftToCreateInput,
  validatePmPropertyDraft,
  type PmPropertyDraft,
} from "@/components/crm/property-listings/PmPropertyForm";
import { createThirdPartyProperty } from "@/lib/crm/property-listings/third-party-api";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";

type Props = {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  leadName?: string;
  onSuccess?: (property: PropertyListingRecord) => void;
};

/** Create a Property Management case (subscription + verification pipeline). */
export default function AddPmPropertyModal({
  open,
  onClose,
  leadId,
  leadName,
  onSuccess,
}: Props) {
  const [draft, setDraft] = useState<PmPropertyDraft>(EMPTY_PM_PROPERTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft({ ...EMPTY_PM_PROPERTY_DRAFT });
  }, [open]);

  if (!open) return null;

  const set = <K extends keyof PmPropertyDraft>(key: K, value: PmPropertyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const error = validatePmPropertyDraft(draft);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const created = await createThirdPartyProperty(
        pmDraftToCreateInput(draft, { leadId }),
      );
      if (created.userPropertyId) {
        toast.success("PM property bound on 2bigha — assignment can use this case");
      } else if (created.twobighaSyncStatus === "failed") {
        toast.error(
          created.twobighaSyncError ||
            "Saved locally, but 2bigha did not create a userPropertyId",
        );
      } else {
        toast.success("PM property submitted — now in Property Submitted stage");
      }
      onSuccess?.(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit PM property");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ClipboardList size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                Create PM property
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {leadName
                  ? `Linked to ${leadName} · recorded on that client’s 2bigha user`
                  : "Link a lead first — PM create needs the client’s twobighaUserId"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <PmPropertyFormFields draft={draft} onChange={set} />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            type="button"
            disabled={saving || !leadId}
            onClick={() => void save()}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
            {saving ? "Submitting…" : "Submit PM property"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
