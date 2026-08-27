"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, FileText, RefreshCw, CheckCheck } from "lucide-react";
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

  const getCategoryBadge = (category?: string) => {
    const cat = String(category || '').toUpperCase();
    if (cat.includes('MARKETING')) {
      return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-200 shrink-0">Marketing</span>;
    }
    if (cat.includes('UTILITY')) {
      return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-50 text-sky-600 border border-sky-200 shrink-0">Utility</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 shrink-0">{category || 'Template'}</span>;
  };
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">WhatsApp templates</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Send an approved Meta template to {to ? `+${to.replace(/\D/g, "")}` : "recipient"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3 bg-slate-50/30">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved templates…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition"
            />
          </div>
          <CrmButton
            variant="secondary"
            disabled={syncing}
            onClick={() => void syncTemplates()}
            className="h-10 gap-2 border-slate-200"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync
          </CrmButton>
        </div>

        <div className="grid min-h-[450px] flex-1 grid-cols-1 md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-slate-100 md:border-b-0 md:border-r custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-400">
                <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="mx-auto mb-3 text-slate-300" size={32} />
                <p className="text-xs font-bold text-slate-700">No approved templates</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
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
                      "relative flex w-full flex-col gap-1.5 border-b border-slate-100/60 px-5 py-3.5 text-left transition",
                      active ? "bg-emerald-50/70" : "hover:bg-slate-50/50",
                    )}
                  >
                    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600 rounded-r" />}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-800 truncate">{t.name}</span>
                      {getCategoryBadge(t.category)}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {t.language}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-6 custom-scrollbar bg-slate-50/20">
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 bg-slate-50/30 rounded-xl border border-dashed border-slate-200">
                <FileText className="h-10 w-10 text-slate-300 mb-3 animate-pulse" />
                <h4 className="text-xs font-bold text-slate-700">No Template Selected</h4>
                <p className="mt-1.5 text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
                  Choose an approved template from the list on the left to customize variables and send.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xs font-extrabold text-slate-800 break-all">{selected.name}</h3>
                    {getCategoryBadge(selected.category)}
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    Language: {selected.language}
                  </p>
                </div>

                {/* WhatsApp Chat Bubble Preview */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    Preview Bubble
                  </span>
                  <div 
                    className="p-4 rounded-xl border border-slate-200/50 shadow-inner flex justify-end min-h-[100px]"
                    style={{
                      backgroundColor: "#e5ddd5",
                      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cg fill='none' stroke='%23c4b8a0' stroke-width='1.2' opacity='0.35'%3E%3Ccircle cx='12' cy='14' r='5'/%3E%3Cpath d='M40 10c4 4 4 10 0 14-4-4-4-10 0-14z'/%3E%3Cpath d='M70 20l6 6-6 6-6-6z'/%3E%3Ccircle cx='85' cy='55' r='4'/%3E%3Cpath d='M20 60c4 4 4 10 0 14-4-4-4-10 0-14z'/%3E%3Cpath d='M55 70l6 6-6 6-6-6z'/%3E%3Ccircle cx='45' cy='90' r='4'/%3E%3C/g%3E%3C/svg%3E\")"
                    }}
                  >
                    <div 
                      className="relative max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] text-[#111b21] rounded-tr-none"
                      style={{ backgroundColor: "#d9fdd3" }}
                    >
                      {bodyPreview(selected, values)}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[#667781] select-none">
                        <span>Preview</span>
                        <CheckCheck size={11} style={{ color: "#53bdeb" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Campaign selector */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    AiSensy API Campaign
                  </span>
                  {matchingCampaigns.length > 0 ? (
                    <select
                      value={selectedCampaignName}
                      onChange={(e) => setSelectedCampaignName(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/20"
                    >
                      {matchingCampaigns.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} (Live)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={selectedCampaignName}
                          onChange={(e) => setSelectedCampaignName(e.target.value)}
                          placeholder="Type Campaign Name manually..."
                          className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <CrmButton
                          variant="primary"
                          disabled={linking || !selectedCampaignName.trim()}
                          onClick={() => void registerCampaign()}
                          className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold shrink-0"
                        >
                          {linking ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            "Register"
                          )}
                        </CrmButton>
                      </div>
                      <p className="text-[10px] text-amber-600 font-semibold leading-relaxed">
                        ⚠️ No live API campaigns found for this template on AiSensy. Click "Register" to create & activate this campaign instantly!
                      </p>
                    </div>
                  )}
                </div>

                {hasMediaHeader && (
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Header Media URL (Required)
                      </span>
                      <input
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        placeholder="e.g. https://example.com/image.jpg"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Header File Name (Optional)
                      </span>
                      <input
                        value={mediaFilename}
                        onChange={(e) => setMediaFilename(e.target.value)}
                        placeholder="e.g. banner.jpg"
                        className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </label>
                  </div>
                )}

                {slots.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Template Variables
                    </span>
                    {slots.map((slot) => (
                      <label key={slot.key} className="block space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500">
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
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <CrmButton
                  variant="primary"
                  disabled={sending}
                  onClick={() => void handleSend()}
                  className="h-11 w-full bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg transition font-semibold"
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
          <div className="border-t border-slate-100 px-6 py-2.5 bg-slate-50 text-[10px] text-slate-400 font-semibold">
            Last synced {new Date(syncedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
