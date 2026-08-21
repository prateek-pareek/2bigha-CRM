"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import { usePermissions } from "@/hooks/usePermissions";

type CrmPortalUser = { _id: string; firstName?: string; lastName?: string; email?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  entityType: "Lead" | "LegalCase";
  entityId: string;
  entityLabel?: string;
  /** Lead only — current workspace, so the module picker (Super Admin only) can show it as the default. */
  currentModule?: "2Bigha" | "PROPERTY_MGMT" | "LEGAL";
  onSuccess?: () => void;
};

const WORKSPACE_LABELS: Record<string, string> = {
  "2Bigha": "2Bigha",
  PROPERTY_MGMT: "Property Management",
  LEGAL: "Legal",
};

export default function TransferOwnershipModal({
  open,
  onClose,
  entityType,
  entityId,
  entityLabel,
  currentModule,
  onSuccess,
}: Props) {
  const { isAdmin } = usePermissions();
  const [users, setUsers] = useState<CrmPortalUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newOwnerUserId, setNewOwnerUserId] = useState("");
  const [newModule, setNewModule] = useState<string>(currentModule || "2Bigha");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewOwnerUserId("");
    setReason("");
    setNewModule(currentModule || "2Bigha");
    setUsersLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
    void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => (res.ok ? res.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [open, currentModule]);

  const userOptions = useMemo(
    () =>
      users
        .map((u) => ({
          id: u._id,
          label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || String(u.email || "").trim(),
        }))
        .filter((u) => u.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [users],
  );

  if (!open) return null;

  const canChangeModule = isAdmin && entityType === "Lead";
  const moduleChanged = canChangeModule && newModule !== (currentModule || "2Bigha");

  const handleTransfer = async () => {
    if (!newOwnerUserId) {
      toast.error("Choose a new owner");
      return;
    }
    setSubmitting(true);
    const token = localStorage.getItem("token");
    const path = entityType === "Lead" ? "leads" : "legal-cases";
    try {
      const res = await fetch(`${CRM_API_URL}/crm/${path}/${entityId}/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newOwnerUserId,
          ...(moduleChanged ? { newModule } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Transfer failed");
      }
      toast.success(`Transferred ${entityLabel || "record"} successfully`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <Users size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">Transfer ownership</h3>
              <p className="text-xs text-[var(--text-muted)]">{entityLabel || entityType}</p>
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

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
              New owner
            </label>
            <select
              value={newOwnerUserId}
              onChange={(e) => setNewOwnerUserId(e.target.value)}
              disabled={usersLoading}
              className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
            >
              <option value="">{usersLoading ? "Loading…" : "Select a user"}</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {canChangeModule ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
                Workspace
              </label>
              <select
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
              >
                <option value="2Bigha">{WORKSPACE_LABELS["2Bigha"]}</option>
                <option value="PROPERTY_MGMT">{WORKSPACE_LABELS.PROPERTY_MGMT}</option>
              </select>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Only Super Admin can move a record across workspaces.
              </p>
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being transferred?"
              className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            type="button"
            disabled={submitting || !newOwnerUserId}
            onClick={handleTransfer}
            className="gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            {submitting ? "Transferring…" : "Transfer"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
