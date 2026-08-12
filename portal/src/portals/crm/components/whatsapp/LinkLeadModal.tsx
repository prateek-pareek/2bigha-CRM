"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, User, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";

interface LeadSearchResult {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobileNo?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  waId: string;
  onSuccess: (lead: { leadId: string; leadName: string }) => void;
};

/** Search-and-attach a lead to the currently open WhatsApp conversation. */
export default function LinkLeadModal({ open, onClose, waId, onSuccess }: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    const token = localStorage.getItem("token");
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(
        `${CRM_API_URL}/crm/leads?pageSize=8${term ? `&search=${encodeURIComponent(term)}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((body) => setResults(Array.isArray(body?.data) ? body.data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [open, search]);

  if (!open) return null;

  const attach = async (lead: LeadSearchResult) => {
    setLinkingId(lead._id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ waId, leadId: lead._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to attach lead");
        return;
      }
      const leadName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";
      toast.success(`Attached to ${leadName}`);
      onSuccess({ leadId: lead._id, leadName });
      onClose();
    } catch {
      toast.error("Failed to attach lead");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-bold text-text-main">Link to a lead</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads by name, email, phone…"
              className="h-10 w-full rounded-[var(--radius-md)] border border-border pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-xs text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : results.length === 0 ? (
            <p className="p-8 text-center text-xs text-text-muted">No leads found.</p>
          ) : (
            results.map((lead) => {
              const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";
              return (
                <button
                  key={lead._id}
                  type="button"
                  disabled={linkingId === lead._id}
                  onClick={() => void attach(lead)}
                  className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                    <User size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-main">{name}</p>
                    <p className="truncate text-[11px] text-text-muted">
                      {lead.email || lead.phone || lead.mobileNo || ""}
                    </p>
                  </div>
                  {linkingId === lead._id && <Loader2 size={14} className="animate-spin" />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end border-t border-border px-4 py-3">
          <CrmButton variant="secondary" onClick={onClose} className="h-9">
            Cancel
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
