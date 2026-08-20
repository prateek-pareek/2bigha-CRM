"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";
import {
  bodyPreview,
  buildComponents,
  extractSlots,
  type WhatsAppCachedTemplate,
  type WhatsAppTemplateComponent,
} from "@/lib/crm/whatsapp/template-variables";

export type { WhatsAppCachedTemplate, WhatsAppTemplateComponent };

type Props = {
  open: boolean;
  to: string;
  onClose: () => void;
  onSent: () => void;
};

export default function WhatsAppTemplatePicker({
  open,
  to,
  onClose,
  onSent,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<WhatsAppCachedTemplate[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<WhatsAppCachedTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [liveCampaigns, setLiveCampaigns] = useState<any[]>([]);
  const [selectedCampaignName, setSelectedCampaignName] = useState<string>("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");
  const [linking, setLinking] = useState(false);

  const slots = useMemo(
    () => (selected ? extractSlots(selected) : []),
    [selected],
  );

  const matchingCampaigns = useMemo(() => {
    if (!selected) return [];
    return liveCampaigns.filter(
      (c) =>
        c.status === "LIVE" &&
        c.message_payload?.template?.name === selected.name
    );
  }, [selected, liveCampaigns]);

  const hasMediaHeader = useMemo(() => {
    if (!selected) return false;
    const header = selected.components?.find(
      (c: any) => String(c.type).toUpperCase() === "HEADER"
    );
    return header ? ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(header.format).toUpperCase()) : false;
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setSelectedCampaignName("");
      return;
    }
    if (matchingCampaigns.length > 0) {
      setSelectedCampaignName(matchingCampaigns[0].name);
    } else {
      setSelectedCampaignName(selected.name);
    }
  }, [selected, matchingCampaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const approved = templates.filter(
      (t) => String(t.status || "").toUpperCase() === "APPROVED",
    );
    if (!q) return approved;
    return approved.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        String(t.category || "")
          .toLowerCase()
          .includes(q),
    );
  }, [templates, search]);

  const loadTemplates = async (refresh = false) => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      if (refresh) {
        await fetch(`${CRM_API_URL}/crm/whatsapp-templates/sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const res = await fetch(
        `${CRM_API_URL}/crm/whatsapp-templates`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        toast.error("Failed to load templates");
        return;
      }
      const mapped = (Array.isArray(data) ? data : []).map((t: any) => ({
        ...t,
        id: t.id || t._id,
      }));
      setTemplates(mapped);

      try {
        const liveRes = await fetch(`${CRM_API_URL}/crm/whatsapp-campaigns/live`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const liveData = await liveRes.json().catch(() => ({}));
        if (liveRes.ok && Array.isArray(liveData?.campaign)) {
          setLiveCampaigns(liveData.campaign);
        }
      } catch (err) {
        console.error("Failed to load live campaigns", err);
      }

      const maxSync = mapped.reduce((max: number, t: any) => {
        const time = t.lastSyncedAt ? new Date(t.lastSyncedAt).getTime() : 0;
        return time > max ? time : max;
      }, 0);
      setSyncedAt(maxSync ? new Date(maxSync).toISOString() : null);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const syncTemplates = async () => {
    setSyncing(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-templates/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        toast.error(data?.error || "Sync failed");
        return;
      }
      toast.success(`Synced ${data.synced ?? 0} templates`);
      await loadTemplates(false);
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setValues({});
    setSearch("");
    setMediaUrl("");
    setMediaFilename("");
    void loadTemplates(false);
  }, [open]);

  useEffect(() => {
    if (!selected) {
      setValues({});
      setMediaUrl("");
      setMediaFilename("");
      return;
    }
    const next: Record<string, string> = {};
    for (const slot of extractSlots(selected)) {
      next[slot.key] = slot.example || "";
    }
    setValues(next);
    setMediaUrl("");
    setMediaFilename("");
  }, [selected]);

  const registerCampaign = async () => {
    if (!selected || !selectedCampaignName.trim()) {
      toast.error("Please enter a campaign name to register");
      return;
    }
    setLinking(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/whatsapp-templates/${selected.id}/aisensy-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ aisensyCampaignName: selectedCampaignName.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Activated campaign "${selectedCampaignName.trim()}" on AiSensy!`);
        await loadTemplates(false);
      } else {
        toast.error(data.message || "Failed to register campaign");
      }
    } catch {
      toast.error("Failed to register campaign");
    } finally {
      setLinking(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !to) return;
    if (hasMediaHeader && !mediaUrl.trim()) {
      toast.error("Header Media URL is required for this template type");
      return;
    }
    for (const slot of slots) {
      if (!values[slot.key]?.trim()) {
        toast.error(`Fill ${slot.label}`);
        return;
      }
    }
    setSending(true);
    const token = localStorage.getItem("token");
    try {
      const components = buildComponents(slots, values);
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/send-template`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          name: selectedCampaignName || selected.name,
          language: selected.language,
          components,
          bodyPreview: bodyPreview(selected, values),
          mediaUrl: hasMediaHeader ? mediaUrl.trim() : undefined,
          mediaFilename: hasMediaHeader ? mediaFilename.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        toast.success("Template sent");
        onSent();
        onClose();
      } else {
        toast.error(data.error || "Failed to send template");
      }
    } catch {
      toast.error("Failed to send template");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-text-main">WhatsApp templates</h2>
            <p className="text-xs text-text-muted">
              Send an approved Meta template to {to ? `+${to.replace(/\D/g, "")}` : "recipient"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-text-muted hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved templates…"
              className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <CrmButton
            variant="secondary"
            disabled={syncing}
            onClick={() => void syncTemplates()}
            className="h-10 gap-2"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync
          </CrmButton>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-xs text-text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="mx-auto mb-3 text-text-muted opacity-30" size={28} />
                <p className="text-xs font-semibold text-text-main">No approved templates</p>
                <p className="mt-1 text-xs text-text-muted">
                  Sync from Meta, or create templates in Business Manager first.
                </p>
              </div>
            ) : (
              filtered.map((t) => {
                const active =
                  selected?.name === t.name && selected?.language === t.language;
                return (
                  <button
                    key={`${t.name}:${t.language}:${t.id || ""}`}
                    type="button"
                    onClick={() => setSelected(t)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left transition",
                      active ? "bg-emerald-50" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="text-sm font-semibold text-text-main">{t.name}</span>
                    <span className="text-[11px] font-medium text-text-muted">
                      {t.language}
                      {t.category ? ` · ${t.category}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-5">
            {!selected ? (
              <p className="text-xs text-text-muted">Select a template to fill variables and send.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-text-main">{selected.name}</h3>
                  <p className="text-xs text-text-muted">
                    {selected.language}
                    {selected.category ? ` · ${selected.category}` : ""}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-border bg-slate-50 p-3 text-xs leading-relaxed text-text-main whitespace-pre-wrap">
                  {bodyPreview(selected, values)}
                </div>

                {/* Live Campaign selector */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    AiSensy API Campaign
                  </span>
                  {matchingCampaigns.length > 0 ? (
                    <select
                      value={selectedCampaignName}
                      onChange={(e) => setSelectedCampaignName(e.target.value)}
                      className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      {matchingCampaigns.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} (Live)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <input
                          value={selectedCampaignName}
                          onChange={(e) => setSelectedCampaignName(e.target.value)}
                          placeholder="Type Campaign Name manually..."
                          className="h-10 flex-1 rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <CrmButton
                          variant="primary"
                          disabled={linking || !selectedCampaignName.trim()}
                          onClick={() => void registerCampaign()}
                          className="h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold shrink-0"
                        >
                          {linking ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            "Register"
                          )}
                        </CrmButton>
                      </div>
                      <p className="mt-1.5 text-[10px] text-amber-600 font-semibold leading-relaxed">
                        ⚠️ No live API campaigns found for this template on AiSensy. Click "Register" to create & activate this campaign instantly!
                      </p>
                    </div>
                  )}
                </div>
 
                {hasMediaHeader && (
                  <div className="space-y-3 pt-1.5 border-t border-border/40">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                        Header Media URL (Required)
                      </span>
                      <input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="e.g. https://example.com/image.jpg"
                        className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                        Header File Name (Optional)
                      </span>
                      <input
                        value={mediaFilename}
                        onChange={(e) => setMediaFilename(e.target.value)}
                        placeholder="e.g. banner.jpg"
                        className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </label>
                  </div>
                )}

                {slots.length > 0 && (
                  <div className="space-y-3">
                    {slots.map((slot) => (
                      <label key={slot.key} className="block space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                          {slot.label}
                        </span>
                        <input
                          value={values[slot.key] || ""}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [slot.key]: e.target.value,
                            }))
                          }
                          placeholder={slot.example || slot.label}
                          className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <CrmButton
                  variant="primary"
                  disabled={sending}
                  onClick={() => void handleSend()}
                  className="h-11 w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {sending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send template"
                  )}
                </CrmButton>
              </div>
            )}
          </div>
        </div>

        {syncedAt && (
          <div className="border-t border-border px-5 py-2 text-[11px] text-text-muted">
            Last synced {new Date(syncedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
