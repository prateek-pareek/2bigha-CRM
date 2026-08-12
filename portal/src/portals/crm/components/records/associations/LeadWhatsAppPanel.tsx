"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2Off, Loader2, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";

function formatPhone(waId: string): string {
  return `+${waId.replace(/\D/g, "")}`;
}

/** WhatsApp conversations attached to this lead, with a shortcut to attach one. */
export default function LeadWhatsAppPanel({
  leadId,
  onAttachClick,
  refreshKey,
}: {
  leadId: string;
  onAttachClick: () => void;
  refreshKey?: number;
}) {
  const [links, setLinks] = useState<{ waId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyWaId, setBusyWaId] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLoading(true);
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/whatsapp-links/by-lead/${encodeURIComponent(leadId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((body) => {
        if (!cancelled) setLinks(Array.isArray(body) ? body : []);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, refreshKey]);

  const unlink = async (waId: string) => {
    setBusyWaId(waId);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-links/${encodeURIComponent(waId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Failed to unlink chat");
        return;
      }
      setLinks((prev) => prev.filter((l) => l.waId !== waId));
    } catch {
      toast.error("Failed to unlink chat");
    } finally {
      setBusyWaId(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-text-muted">WhatsApp</h3>
        <button
          type="button"
          onClick={onAttachClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold uppercase tracking-wide border border-border bg-surface-dim text-text-main transition-colors hover:border-primary/40"
        >
          <Plus size={14} />
          Attach chat
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-text-muted italic">No WhatsApp chat linked to this lead yet.</p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div
              key={l.waId}
              className="crm-kanban-card group !mt-0 !p-3 flex items-center gap-2"
              style={{ ["--crm-stage-accent" as string]: "#00a884" }}
            >
              <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
                <MessageCircle size={14} />
              </div>
              <Link
                href={`/crm/whatsapp?wa=${encodeURIComponent(l.waId)}`}
                className="min-w-0 flex-1 no-underline"
              >
                <p className="crm-kanban-card-title truncate text-sm">{formatPhone(l.waId)}</p>
                <p className="crm-kanban-card-subtitle truncate">Open chat</p>
              </Link>
              <button
                type="button"
                disabled={busyWaId === l.waId}
                onClick={() => void unlink(l.waId)}
                className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                title="Unlink chat"
              >
                <Link2Off size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
