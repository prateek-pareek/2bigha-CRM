"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Phone, Settings, X } from "lucide-react";
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
  relatedType?: "Lead" | "Contact" | "Property";
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
  const router = useRouter();
  const [toNumber, setToNumber] = useState("");
  const [agentNumber, setAgentNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAgentSynced, setIsAgentSynced] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [calling, setCalling] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToNumber(String(phone || "").trim());
    setStatusMsg(null);
    setLoading(true);

    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${CRM_API_URL}/crm-users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          const stored = localStorage.getItem(AGENT_NUMBER_STORAGE_KEY);
          const mobile = String(data?.agentMobile || stored || "").trim();

          const userIsAdmin =
            data?.role === "admin" ||
            data?.role === "ADMIN" ||
            (Array.isArray(data?.permissions) && data.permissions.includes("settings:admin"));
          setIsAdmin(Boolean(userIsAdmin));

          if (mobile && mobile.length >= 8) {
            setAgentNumber(mobile);
            setIsAgentSynced(true);
          } else {
            setAgentNumber("");
            setIsAgentSynced(false);
          }
        })
        .catch((err) => {
          console.error("Failed to load user profile in call modal", err);
          const stored = String(localStorage.getItem(AGENT_NUMBER_STORAGE_KEY) || "").trim();
          if (stored && stored.length >= 8) {
            setAgentNumber(stored);
            setIsAgentSynced(true);
          } else {
            setIsAgentSynced(false);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [open, phone]);

  if (!open) return null;

  const handleCall = async () => {
    if (!toNumber.trim()) {
      toast.error("Enter a phone number");
      return;
    }
    if (!agentNumber.trim()) {
      toast.error("No registered agent number found for this user.");
      setIsAgentSynced(false);
      return;
    }

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

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
        <div className="flex w-full max-w-md items-center justify-center rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-8 shadow-xl">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      </div>
    );
  }

  // Warning modal when agent is not synced/added
  if (!isAgentSynced) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle size={16} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Kommuno Agent Not Synced
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Agent registration required
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

          <div className="space-y-3 p-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
              <p className="font-semibold text-amber-950">
                Your agent number is not added or synced with Kommuno.
              </p>
              <p className="mt-1 text-amber-800 leading-relaxed">
                To place outbound calls, your agent account must first be added/synced in Voice Calling integration.
              </p>
            </div>

            {!isAdmin && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Please ask your CRM administrator to add and sync your agent mobile number in voice settings.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
            <CrmButton type="button" variant="secondary" onClick={onClose}>
              Close
            </CrmButton>
            {isAdmin && (
              <CrmButton
                type="button"
                onClick={() => {
                  onClose();
                  router.push("/crm/settings/integrations/voice");
                }}
                className="gap-2"
              >
                <Settings size={14} />
                Configure Voice Settings
              </CrmButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Direct Call Confirmation Modal (Agent is synced/added)
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
              <Phone size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                {relatedType === "Property" ? "Call" : "Call lead"}
              </h3>
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
              readOnly
              className="h-10 w-full rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--surface-dim,#f8fafc)] px-3 text-sm font-medium text-[var(--text-main)] outline-none cursor-not-allowed select-none"
            />
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
            disabled={calling || !toNumber.trim()}
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
