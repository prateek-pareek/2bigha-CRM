"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import CrmTeammatePicker, { type CrmAssignableUser } from "./CrmTeammatePicker";

type Props = {
  ownerLabel?: string | null;
  title?: string;
  /** When true, render without outer card (for nesting inside Lead Information) */
  embedded?: boolean;
  /** When provided together with `canReassign`, shows a "Reassign" control that PATCHes `leadOwner` on this lead. Backend enforces the same ownership rule as bulk-assign (owners reassign their own leads; admins reassign any). */
  leadId?: string;
  canReassign?: boolean;
  onReassigned?: (newOwner: string) => void;
};

export default function CrmRecordOwnerCard({
  ownerLabel,
  title = "Owner",
  embedded = false,
  leadId,
  canReassign = false,
  onReassigned,
}: Props) {
  const owner = String(ownerLabel || "").trim() || "Unassigned";
  const initial = owner.charAt(0).toUpperCase();

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CrmAssignableUser | null>(null);
  const [saving, setSaving] = useState(false);

  const saveReassign = async () => {
    if (!leadId || !picked) return;
    setSaving(true);
    try {
      // Send the user id — the server resolves it to the owner label and re-checks the team scope.
      const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getCrmAuthToken() || ""}`,
        },
        body: JSON.stringify({ leadOwner: picked._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to reassign");
      toast.success(`Reassigned to ${picked.label}`);
      setOpen(false);
      onReassigned?.(picked.label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3
          className={cn(
            embedded
              ? "mb-3 text-xs font-bold uppercase tracking-wider text-text-muted"
              : "text-xs font-bold uppercase tracking-wider text-text-muted mb-3",
          )}
        >
          {title}
        </h3>
        {canReassign && leadId ? (
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setOpen((v) => !v);
            }}
            className="text-[11px] font-semibold text-[var(--hs-link)] hover:underline"
          >
            Reassign
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary border border-primary/20 text-sm font-extrabold text-primary">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text-primary">{owner}</p>
          <p className="text-xs font-medium text-text-muted">Record owner</p>
        </div>
      </div>
      {open ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface-dim/40 p-3">
          <CrmTeammatePicker value={picked} onChange={setPicked} currentOwnerLabel={ownerLabel} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-dim"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !picked}
              onClick={() => void saveReassign()}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) return <div>{body}</div>;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      {body}
    </div>
  );
}
