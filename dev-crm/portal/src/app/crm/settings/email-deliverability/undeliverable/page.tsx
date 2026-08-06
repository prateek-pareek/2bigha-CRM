"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Loader2,
  MailX,
  RefreshCw,
  Trash2,
  UserMinus,
  RotateCcw,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from "sonner";
import { CrmBulkDeleteConfirmModal } from "@/components/crm/records/detail/CrmBulkDeleteConfirmModal";

type UndeliverableRecord = {
  module: "leads" | "contacts" | "clients";
  entityId: string;
  label: string;
  primaryEmail: string | null;
  additionalEmails: string[];
  invalidEmails: string[];
  primaryIsInvalid: boolean;
};

type UndeliverableItem = {
  email: string;
  reason: string | null;
  flaggedAt: string | null;
  records: UndeliverableRecord[];
};

type SelectedRecord = {
  module: "leads" | "contacts" | "clients";
  entityId: string;
  email: string;
  label: string;
};

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

function recordHref(module: string, id: string) {
  if (module === "leads") return `/crm/leads/${id}`;
  if (module === "contacts") return `/crm/contacts/${id}`;
  return `/crm/clients/${id}`;
}

function selectionKey(module: string, entityId: string) {
  return `${module}:${entityId}`;
}

export default function UndeliverableContactsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UndeliverableItem[]>([]);
  const [flagEmail, setFlagEmail] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, SelectedRecord>>(new Map());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/inbox-accounts/undeliverable-contacts`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      toast.error("Failed to load undeliverable contacts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allRecords = useMemo(() => {
    const seen = new Set<string>();
    const rows: SelectedRecord[] = [];
    for (const item of items) {
      for (const rec of item.records) {
        const key = selectionKey(rec.module, rec.entityId);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          module: rec.module,
          entityId: rec.entityId,
          email: item.email,
          label: rec.label,
        });
      }
    }
    return rows;
  }, [items]);

  const allSelected =
    allRecords.length > 0 && allRecords.every((r) => selected.has(selectionKey(r.module, r.entityId)));

  const toggleSelect = (rec: UndeliverableRecord, email: string) => {
    const key = selectionKey(rec.module, rec.entityId);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else {
        next.set(key, {
          module: rec.module,
          entityId: rec.entityId,
          email,
          label: rec.label,
        });
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Map());
      return;
    }
    const next = new Map<string, SelectedRecord>();
    for (const row of allRecords) {
      next.set(selectionKey(row.module, row.entityId), row);
    }
    setSelected(next);
  };

  const handleFlag = async () => {
    const email = flagEmail.trim();
    if (!email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setFlagging(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/undeliverable-contacts/flag`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({ email, reason: flagReason.trim() || undefined }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed");
      toast.success(
        `Flagged on ${data.matchedRecords ?? 0} record(s). They cannot receive mail until you allow retry.`,
      );
      setFlagEmail("");
      setFlagReason("");
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to flag email");
    } finally {
      setFlagging(false);
    }
  };

  const resolve = async (
    item: UndeliverableItem,
    rec: UndeliverableRecord,
    action: "clear_email" | "remove_contact" | "allow_retry",
  ) => {
    const key = `${rec.module}-${rec.entityId}-${item.email}-${action}`;
    if (
      action === "remove_contact" &&
      !window.confirm(`Remove ${rec.label} from CRM? This cannot be undone.`)
    ) {
      return;
    }
    setResolvingKey(key);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/undeliverable-contacts/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({
            module: rec.module,
            entityId: rec.entityId,
            email: item.email,
            action,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed");
      toast.success(data.message || "Updated");
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(selectionKey(rec.module, rec.entityId));
        return next;
      });
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setResolvingKey(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/undeliverable-contacts/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({
            items: Array.from(selected.values()).map((r) => ({
              module: r.module,
              entityId: r.entityId,
              email: r.email,
            })),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed");
      toast.success(data.message || `Removed ${selected.size} record(s)`);
      setSelected(new Map());
      setShowConfirmDelete(false);
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-rose-100">
              <MailX className="h-4 w-4 text-rose-700" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">
                Undeliverable contacts
              </h1>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--primary-muted)] leading-relaxed">
                Addresses flagged from bounce notices (address not found), failed sends, or
                unsubscribe. Remove bad emails or delete contacts so lists stay clean.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                disabled={isDeleting || resolvingKey !== null}
                className="inline-flex items-center gap-2 rounded-md bg-rose-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                <Trash2 size={13} />
                Delete {selected.size}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-3.5 py-2 text-xs font-semibold hover:bg-[var(--background)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-[var(--surface-dim)] bg-amber-50/50">
          <p className="text-xs text-amber-900 leading-relaxed flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            New sends to flagged addresses are blocked in the email composer. Sync your inbox
            to pick up bounce / DSN messages automatically.
          </p>
        </div>

        <div className="px-6 py-4 border-b border-[var(--surface-dim)]">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Flag manually
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={flagEmail}
              onChange={(e) => setFlagEmail(e.target.value)}
              placeholder="bad@example.com"
              className="h-9 min-w-[200px] flex-1 rounded-md border border-[var(--border-color)] px-3 text-sm"
            />
            <input
              type="text"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Reason (optional)"
              className="h-9 min-w-[180px] flex-1 rounded-md border border-[var(--border-color)] px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleFlag()}
              disabled={flagging}
              className="h-9 rounded-md bg-rose-700 px-4 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {flagging ? "Flagging…" : "Flag undeliverable"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-[var(--border-color)] bg-white px-6 py-12 text-center text-sm text-[var(--text-muted)]">
          No undeliverable addresses flagged yet. They appear when a bounce or failed send is
          detected.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] select-none"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-all ${
                  allSelected
                    ? "border-rose-700 bg-rose-700 text-white"
                    : "border-slate-300 bg-white"
                }`}
                aria-hidden
              >
                {allSelected ? <Check size={10} strokeWidth={4} /> : null}
              </span>
              Select all flagged records ({allRecords.length})
            </button>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Clear selection
              </button>
            ) : null}
          </div>

          {items.map((item) => (
            <div
              key={item.email}
              className="rounded-md border border-rose-200/80 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-rose-100 bg-rose-50/60 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-rose-900">{item.email}</p>
                  <p className="text-[11px] text-rose-800/90 mt-0.5">
                    {item.reason || "Undeliverable"}
                    {item.flaggedAt
                      ? ` · ${new Date(item.flaggedAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-white border border-rose-200 rounded px-2 py-1">
                  {item.records.length} record{item.records.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-[var(--surface-dim)]">
                {item.records.map((rec) => {
                  const keyBase = `${rec.module}-${rec.entityId}-${item.email}`;
                  const selKey = selectionKey(rec.module, rec.entityId);
                  const isSelected = selected.has(selKey);
                  return (
                    <li
                      key={keyBase}
                      className={`px-5 py-3 flex flex-wrap items-center justify-between gap-3 ${
                        isSelected ? "bg-rose-50/40" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleSelect(rec, item.email)}
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-all ${
                            isSelected
                              ? "border-rose-700 bg-rose-700 text-white"
                              : "border-slate-300 bg-white hover:border-rose-400"
                          }`}
                          aria-label={`Select ${rec.label}`}
                        >
                          {isSelected ? <Check size={10} strokeWidth={4} /> : null}
                        </button>
                        <div className="min-w-0">
                          <Link
                            href={recordHref(rec.module, rec.entityId)}
                            className="text-sm font-semibold text-[var(--hs-link)] hover:underline"
                          >
                            {rec.label}
                          </Link>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {rec.module.slice(0, -1)} · Primary:{" "}
                            {rec.primaryEmail || "—"}
                            {rec.primaryIsInvalid ? (
                              <span className="ml-1 font-bold text-rose-700">
                                (undeliverable)
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={resolvingKey !== null || isDeleting}
                          onClick={() => void resolve(item, rec, "clear_email")}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--background)] disabled:opacity-50"
                        >
                          {resolvingKey === `${keyBase}-clear_email` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Clear email
                        </button>
                        <button
                          type="button"
                          disabled={resolvingKey !== null || isDeleting}
                          onClick={() => void resolve(item, rec, "allow_retry")}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--background)] disabled:opacity-50"
                        >
                          {resolvingKey === `${keyBase}-allow_retry` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Allow retry
                        </button>
                        <button
                          type="button"
                          disabled={resolvingKey !== null || isDeleting}
                          onClick={() => void resolve(item, rec, "remove_contact")}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-50"
                        >
                          {resolvingKey === `${keyBase}-remove_contact` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <UserMinus size={12} />
                          )}
                          Remove contact
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <CrmBulkDeleteConfirmModal
        isOpen={showConfirmDelete}
        onClose={() => !isDeleting && setShowConfirmDelete(false)}
        onConfirm={() => void handleBulkDelete()}
        title="Delete flagged contacts?"
        confirmLabel="Move to Trash"
        loading={isDeleting}
        description={
          <>
            You are about to permanently remove{" "}
            <span className="font-medium text-[var(--error)]">{selected.size} records</span> from
            CRM. This cannot be undone.
          </>
        }
      />
    </div>
  );
}
