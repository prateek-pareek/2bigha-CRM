"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton, CrmInput, CrmLabel } from "@/components/crm/ui";

interface WhatsAppContact {
  waId: string;
  lastMessageAt: string;
}

function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

/** Last-10-digit compare so country-code formatting differences still match. */
function phonesLikelyMatch(a: string, b: string): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (da.length < 6 || db.length < 6) return false;
  return da.slice(-10) === db.slice(-10);
}

function formatPhone(waId: string): string {
  return `+${digitsOnly(waId)}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName?: string;
  leadPhone?: string;
  leadMobileNo?: string;
  onSuccess?: () => void;
};

/** Attach an existing WhatsApp conversation to a lead, opened from the lead detail page. */
export default function LinkWhatsAppModal({
  open,
  onClose,
  leadId,
  leadName,
  leadPhone,
  leadMobileNo,
  onSuccess,
}: Props) {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWaId, setSelectedWaId] = useState<string | null>(null);
  const [customPhone, setCustomPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedWaId(null);
    setCustomPhone("");
    setSearch("");
    setLoading(true);
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/whatsapp/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((body) => setContacts(Array.isArray(body) ? body : []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [open]);

  const suggestedWaId = useMemo(() => {
    for (const phone of [leadPhone, leadMobileNo]) {
      if (!phone) continue;
      const match = contacts.find((c) => phonesLikelyMatch(c.waId, phone));
      if (match) return match.waId;
    }
    return null;
  }, [contacts, leadPhone, leadMobileNo]);

  useEffect(() => {
    if (suggestedWaId && !selectedWaId) setSelectedWaId(suggestedWaId);
  }, [suggestedWaId, selectedWaId]);

  const filteredContacts = useMemo(() => {
    const q = digitsOnly(search);
    if (!q) return contacts;
    return contacts.filter((c) => c.waId.includes(q));
  }, [contacts, search]);

  if (!open) return null;

  const save = async () => {
    const waId = selectedWaId || digitsOnly(customPhone);
    if (digitsOnly(waId).length < 10) {
      toast.error("Select a chat or enter a valid phone number");
      return;
    }
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ waId: digitsOnly(waId), leadId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to attach chat");
        return;
      }
      toast.success("WhatsApp chat attached");
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Failed to attach chat");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <MessageCircle size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">Attach WhatsApp chat</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {leadName ? `Linked to ${leadName}` : "Linked to this lead"}
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

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
          <div>
            <CrmLabel>Search existing chats</CrmLabel>
            <div className="relative mt-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <CrmInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by phone number…"
                className="pl-8"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : filteredContacts.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              No WhatsApp conversations found yet — enter a phone number below instead.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-border p-1">
              {filteredContacts.map((c) => (
                <button
                  key={c.waId}
                  type="button"
                  onClick={() => setSelectedWaId(c.waId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition",
                    selectedWaId === c.waId
                      ? "bg-emerald-50 text-emerald-800"
                      : "hover:bg-slate-50",
                  )}
                >
                  <span className="font-medium">{formatPhone(c.waId)}</span>
                  {c.waId === suggestedWaId && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Suggested match
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div>
            <CrmLabel>Or enter a phone number directly</CrmLabel>
            <CrmInput
              value={customPhone}
              onChange={(e) => {
                setCustomPhone(e.target.value);
                setSelectedWaId(null);
              }}
              placeholder="+1 555 000 0000"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton type="button" disabled={saving} onClick={() => void save()} className="gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
            {saving ? "Attaching…" : "Attach chat"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
