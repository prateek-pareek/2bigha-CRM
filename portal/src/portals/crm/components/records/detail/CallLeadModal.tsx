"use client";

import { useEffect, useState } from "react";
import { Loader2, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";

const AGENT_NUMBER_STORAGE_KEY = "crm_ivr_agent_number";

type Props = {
  open: boolean;
  onClose: () => void;
  phone?: string | null;
  leadId?: string;
  leadName?: string;
  relatedType?: "Lead" | "Contact";
  onSuccess?: () => void;
};

export default function CallLeadModal({
  open,
  onClose,
  phone,
  leadId,
  leadName,
  relatedType = "Lead",
  onSuccess,
}: Props) {
  const [toNumber, setToNumber] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToNumber(String(phone || "").trim());
    setAgentNumber(localStorage.getItem(AGENT_NUMBER_STORAGE_KEY) || "");
    setStatusMsg(null);
  }, [open, phone]);

  if (!open) return null;

  const handleCall = async () => {
    if (!toNumber.trim()) {
      toast.error("Enter a phone number");
      return;
    }
    if (!agentNumber.trim()) {
      toast.error("Enter the agent number to call from (must be registered with Kommuno)");
      return;
    }
    localStorage.setItem(AGENT_NUMBER_STORAGE_KEY, agentNumber.trim());
    setCalling(true);
    setStatusMsg(null);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ivr/calls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerNumber: toNumber.trim(),
          agentNumber: agentNumber.trim(),
          ...(leadId ? { relatedTo: leadId, relatedType } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Call failed");
      }
      setStatusMsg(data.message || "Call started");
      toast.success(data.message || "Call started");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Call failed");
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <Phone size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">Call lead</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {leadName || "Outbound call"}
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

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
              Customer phone number
            </label>
            <input
              type="tel"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              placeholder="+91…"
              className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-muted)]">
              Your agent number
            </label>
            <input
              type="tel"
              value={agentNumber}
              onChange={(e) => setAgentNumber(e.target.value)}
              placeholder="+91… (must be registered with Kommuno)"
              className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-sm outline-none focus:border-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)]/10"
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Kommuno rings this number first, then bridges the call to the customer. Remembered on this device.
            </p>
          </div>

          {statusMsg && (
            <p className="rounded-lg bg-[var(--success-light)] px-3 py-2 text-xs font-medium text-[var(--success)]">
              {statusMsg}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Close
          </CrmButton>
          <CrmButton
            type="button"
            disabled={calling || !toNumber.trim() || !agentNumber.trim()}
            onClick={handleCall}
            className="gap-2"
          >
            {calling ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            {calling ? "Calling…" : "Call now"}
          </CrmButton>
        </div>
      </div>
    </div>
  );
}
