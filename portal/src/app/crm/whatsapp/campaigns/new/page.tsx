"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Search, User, X } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";
import type { WhatsAppTemplateRecord } from "@/components/crm/whatsapp/types";
import { extractSlots } from "@/lib/crm/whatsapp/template-variables";

interface LeadSearchResult {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobileNo?: string;
}

interface RecipientRow {
  leadId: string;
  name: string;
  waId: string;
  templateParams: string[];
}

export default function NewWhatsAppCampaignPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<WhatsAppTemplateRecord[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);

  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [throttlePerMinute, setThrottlePerMinute] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) || null,
    [templates, templateId],
  );
  const bodySlotCount = useMemo(
    () => (selectedTemplate ? extractSlots(selectedTemplate).filter((s) => s.componentType === "BODY").length : 0),
    [selectedTemplate],
  );

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/whatsapp-templates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: WhatsAppTemplateRecord[]) => {
        const mapped = Array.isArray(data) ? data.filter((t) => !!t.aisensyCampaignName) : [];
        setTemplates(mapped);
        if (mapped.length) setTemplateId(mapped[0]._id);
      })
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoadingTemplates(false));
  }, []);

  // Recipients' templateParams length should track the selected template's
  // variable count — pad/trim in place so the input row stays in sync.
  useEffect(() => {
    setRecipients((prev) =>
      prev.map((r) => ({
        ...r,
        templateParams: Array.from({ length: bodySlotCount }, (_, i) => r.templateParams[i] || ""),
      })),
    );
  }, [bodySlotCount]);

  useEffect(() => {
    const term = leadSearch.trim();
    const token = localStorage.getItem("token");
    const timeout = setTimeout(() => {
      setSearchingLeads(true);
      fetch(
        `${CRM_API_URL}/crm/leads?pageSize=8${term ? `&search=${encodeURIComponent(term)}` : ""}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((body) => setLeadResults(Array.isArray(body?.data) ? body.data : []))
        .catch(() => setLeadResults([]))
        .finally(() => setSearchingLeads(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [leadSearch]);

  const addRecipient = (lead: LeadSearchResult) => {
    const waId = (lead.mobileNo || lead.phone || "").replace(/\D/g, "");
    if (waId.length < 10) {
      toast.error("This lead has no valid phone number");
      return;
    }
    if (recipients.some((r) => r.waId === waId)) {
      toast.error("Already added");
      return;
    }
    const name = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";
    setRecipients((prev) => [
      ...prev,
      { leadId: lead._id, name, waId, templateParams: Array.from({ length: bodySlotCount }, () => name) },
    ]);
  };

  const removeRecipient = (waId: string) => {
    setRecipients((prev) => prev.filter((r) => r.waId !== waId));
  };

  const updateParam = (waId: string, index: number, value: string) => {
    setRecipients((prev) =>
      prev.map((r) =>
        r.waId === waId
          ? { ...r, templateParams: r.templateParams.map((v, i) => (i === index ? value : v)) }
          : r,
      ),
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the campaign a name");
      return;
    }
    if (!templateId) {
      toast.error("Pick a template mapped to an AiSensy campaign");
      return;
    }
    if (!recipients.length) {
      toast.error("Add at least one recipient");
      return;
    }
    setSubmitting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          templateId,
          recipients: recipients.map((r) => ({
            leadId: r.leadId,
            waId: r.waId,
            name: r.name,
            templateParams: r.templateParams,
          })),
          throttlePerMinute,
          sendNow,
          scheduledAt: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to create campaign");
        return;
      }
      toast.success(sendNow ? "Campaign launched" : "Campaign saved");
      router.push(`/crm/whatsapp/campaigns/${data._id || data.id}`);
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-start gap-3">
        <Link
          href="/crm/whatsapp/campaigns"
          className="mt-0.5 rounded-full p-2 text-text-muted transition-colors hover:bg-slate-100 hover:text-text-main"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-medium tracking-tight text-text-main">New WhatsApp campaign</h1>
          <p className="text-sm font-medium text-text-muted">
            Send an approved template to a list of leads via AiSensy.
          </p>
        </div>
      </div>

      <WhatsAppNavTabs active="campaigns" />

      <div className="space-y-5 rounded-[var(--radius-md)] border border-border bg-white p-5">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Campaign name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. New listings — Gurgaon leads"
            className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Template
          </label>
          {loadingTemplates ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-xs text-rose-600">
              No templates are mapped to an AiSensy campaign yet — open a template under WhatsApp →
              Templates and set its AiSensy campaign mapping first.
            </p>
          ) : (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.aisensyCampaignName})
                </option>
              ))}
            </select>
          )}
          {bodySlotCount > 0 && (
            <p className="text-[11px] text-text-muted">
              This template has {bodySlotCount} variable{bodySlotCount === 1 ? "" : "s"} — fill them in
              per recipient below.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-[var(--radius-md)] border border-border bg-white p-5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
          Recipients ({recipients.length})
        </label>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
            placeholder="Search leads by name, email, phone…"
            className="h-10 w-full rounded-[var(--radius-md)] border border-border pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        {leadSearch.trim() && (
          <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-border">
            {searchingLeads ? (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin" /> Searching…
              </div>
            ) : leadResults.length === 0 ? (
              <p className="p-4 text-center text-xs text-text-muted">No leads found.</p>
            ) : (
              leadResults.map((lead) => {
                const leadName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead";
                return (
                  <button
                    key={lead._id}
                    type="button"
                    onClick={() => addRecipient(lead)}
                    className="flex w-full items-center gap-3 border-b border-border/40 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                      <User size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-main">{leadName}</p>
                      <p className="truncate text-[11px] text-text-muted">
                        {lead.mobileNo || lead.phone || lead.email || "No phone"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {recipients.length > 0 && (
          <div className="space-y-2 pt-2">
            {recipients.map((r) => (
              <div key={r.waId} className="rounded-[var(--radius-md)] border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-main">{r.name}</p>
                    <p className="text-[11px] text-text-muted">+{r.waId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.waId)}
                    className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X size={14} />
                  </button>
                </div>
                {bodySlotCount > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {r.templateParams.map((val, i) => (
                      <input
                        key={i}
                        value={val}
                        onChange={(e) => updateParam(r.waId, i, e.target.value)}
                        placeholder={`{{${i + 1}}}`}
                        className="h-8 rounded-[var(--radius-md)] border border-border px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-white p-5">
        <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
          Sending
        </label>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-text-main">
            <input type="radio" checked={sendNow} onChange={() => setSendNow(true)} /> Send now
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-text-main">
            <input type="radio" checked={!sendNow} onChange={() => setSendNow(false)} /> Schedule for later
          </label>
        </div>
        {!sendNow && (
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="h-10 w-full max-w-xs rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        )}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Throttle (messages per minute)
          </label>
          <input
            type="number"
            min={1}
            max={1000}
            value={throttlePerMinute}
            onChange={(e) => setThrottlePerMinute(Math.max(1, parseInt(e.target.value, 10) || 60))}
            className="h-10 w-full max-w-[160px] rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="text-[11px] text-text-muted">
            Sends are spaced out to stay under this rate — keep it conservative to avoid AiSensy/WhatsApp
            throttling.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/crm/whatsapp/campaigns">
          <CrmButton variant="secondary" className="h-10">
            Cancel
          </CrmButton>
        </Link>
        <CrmButton
          variant="primary"
          disabled={submitting}
          onClick={() => void submit()}
          className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {sendNow ? "Launch campaign" : "Schedule campaign"}
        </CrmButton>
      </div>
    </div>
  );
}
