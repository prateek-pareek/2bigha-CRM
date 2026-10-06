"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, User, UserPlus, Link2, X, Phone, Mail, MapPin } from "lucide-react";
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
  initialMode?: "create" | "link";
  onSuccess: (lead: { leadId: string; leadName: string }) => void;
};

/** Create a new lead or search-and-attach an existing lead to the WhatsApp conversation. */
export default function LinkLeadModal({ open, onClose, waId, initialMode = "create", onSuccess }: Props) {
  const [activeTab, setActiveTab] = useState<"create" | "link">(initialMode);
  
  // Create form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [address, setAddress] = useState("");
  const [planningToBuyLand, setPlanningToBuyLand] = useState("");
  const [creating, setCreating] = useState(false);

  // Link search state
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const cleanPhone = (waId || "").replace(/\D/g, "");
  const formattedPhone = cleanPhone.startsWith("91") && cleanPhone.length > 10 ? `+${cleanPhone}` : cleanPhone;

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialMode);
    setFirstName("");
    setLastName("");
    setEmail("");
    setState("");
    setAddress("");
    setPlanningToBuyLand("");
    setSearch("");
    setResults([]);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || activeTab !== "link") return;
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
  }, [open, activeTab, search]);

  if (!open) return null;

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    setCreating(true);
    const token = localStorage.getItem("token");
    try {
      const payload: Record<string, any> = {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: formattedPhone || waId,
        mobileNo: formattedPhone || waId,
        whatsappNumber: formattedPhone || waId,
        state: state.trim() || undefined,
        address: address.trim() || undefined,
        planningToBuyLand: planningToBuyLand || undefined,
        source: "WhatsApp",
        status: "New",
        stage: "New",
        role: "USER",
        module: "2Bigha",
      };

      const res = await fetch(`${CRM_API_URL}/crm/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const newLead = await res.json().catch(() => ({}));
      if (!res.ok || !newLead?._id) {
        toast.error(newLead?.message || "Failed to create lead");
        return;
      }

      // Link to WhatsApp conversation
      await fetch(`${CRM_API_URL}/crm/whatsapp-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ waId, leadId: newLead._id }),
      });

      const leadName = `${newLead.firstName || ""} ${newLead.lastName || ""}`.trim() || "Lead";
      toast.success(`Lead "${leadName}" created and linked!`);
      onSuccess({ leadId: newLead._id, leadName });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create lead");
    } finally {
      setCreating(false);
    }
  };

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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-text-main">
              {activeTab === "create" ? "Create New Lead from WhatsApp" : "Link Existing Lead"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-slate-50/70 px-4">
          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === "create"
                ? "border-emerald-600 text-emerald-700 bg-white"
                : "border-transparent text-text-muted hover:text-text-main"
            }`}
          >
            <UserPlus size={14} /> Create New Lead
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === "link"
                ? "border-emerald-600 text-emerald-700 bg-white"
                : "border-transparent text-text-muted hover:text-text-main"
            }`}
          >
            <Link2 size={14} /> Link Existing Lead
          </button>
        </div>

        {activeTab === "create" ? (
          <form onSubmit={handleCreateLead} className="p-5 space-y-4">
            <div className="rounded-[var(--radius-md)] bg-emerald-50/60 border border-emerald-100 p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Phone size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">WhatsApp Phone</p>
                <p className="text-xs font-bold text-emerald-950 font-mono">{formattedPhone || waId}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Rahul"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Sharma"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. rahul@example.com"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">State</label>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Rajasthan, Assam"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">Address / Tehsil / District</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Jaipur, Sanganer"
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-main mb-1">Planning to buy land</label>
                <select
                  value={planningToBuyLand}
                  onChange={(e) => setPlanningToBuyLand(e.target.value)}
                  className="h-9 w-full rounded-[var(--radius-md)] border border-border px-3 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                >
                  <option value="">Select timeframe…</option>
                  <option value="just_exploring">Just exploring</option>
                  <option value="within_1_month">Within 1 month</option>
                  <option value="1–3_months">1–3 months</option>
                  <option value="3–6_months">3–6 months</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <CrmButton variant="secondary" type="button" onClick={onClose} className="h-9 text-xs">
                Cancel
              </CrmButton>
              <CrmButton
                variant="primary"
                type="submit"
                disabled={creating || !firstName.trim()}
                className="h-9 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                {creating ? "Creating Lead…" : "Create & Link Lead"}
              </CrmButton>
            </div>
          </form>
        ) : (
          <div>
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

            <div className="max-h-64 overflow-y-auto">
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
              <CrmButton variant="secondary" onClick={onClose} className="h-9 text-xs">
                Cancel
              </CrmButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
