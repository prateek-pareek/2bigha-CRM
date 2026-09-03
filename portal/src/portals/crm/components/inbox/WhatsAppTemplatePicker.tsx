"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, FileText, RefreshCw, CheckCheck, ExternalLink, Building2, Paperclip } from "lucide-react";
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
import { generatePropertyBrochurePdf } from "@/lib/crm/whatsapp/property-share-api";
import {
  fetchBackendPropertyListingsByLead,
  fetchTwoBighaProperties,
  mapTwoBighaPropertyToRecord,
} from "@/portals/crm/lib/property-listings/backend-api";
import PropertySearchDropdown from "./PropertySearchDropdown";

export type { WhatsAppCachedTemplate, WhatsAppTemplateComponent };

type Props = {
  open: boolean;
  to: string;
  onClose: () => void;
  onSent: () => void;
  leadId?: string;
  leadName?: string;
};

export default function WhatsAppTemplatePicker({
  open,
  to,
  onClose,
  onSent,
  leadId,
  leadName,
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

  // Brochure Attachment States
  const [attachBrochure, setAttachBrochure] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [brochurePdfUrl, setBrochurePdfUrl] = useState<string>("");
  const [brochurePdfFilename, setBrochurePdfFilename] = useState<string>("");

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

  // Load properties on open
  useEffect(() => {
    if (!open) {
      setAttachBrochure(false);
      setSelectedPropertyId("");
      setBrochurePdfUrl("");
      setBrochurePdfFilename("");
      return;
    }
    const token = localStorage.getItem("token");
    setLoadingProperties(true);

    const loadProps = async () => {
      try {
        let list: any[] = [];
        const existingKeys = new Set<string>();

        const addUnique = (p: any) => {
          if (!p) return;
          const key = String(p._id || p.id || p.twobighaPropertyId || p.slug || "").trim();
          if (key && !existingKeys.has(key)) {
            existingKeys.add(key);
            list.push(p);
          }
        };

        // 1. Prioritize properties associated with this lead
        if (leadId) {
          try {
            const leadProps = await fetchBackendPropertyListingsByLead(leadId);
            if (Array.isArray(leadProps)) {
              for (const lp of leadProps) addUnique(lp);
            }
          } catch {
            // ignore
          }
        }

        // 2. Fetch live properties directly from 2Bigha GraphQL server
        try {
          const { data: twoBighaData } = await fetchTwoBighaProperties({
            limit: 100,
          });
          if (Array.isArray(twoBighaData)) {
            for (const item of twoBighaData) {
              const mapped = mapTwoBighaPropertyToRecord(item);
              addUnique(mapped);
            }
          }
        } catch (gqlErr) {
          console.warn("Could not load 2Bigha GraphQL properties:", gqlErr);
        }

        // 3. Also include locally stored CRM listings
        try {
          const res = await fetch(`${CRM_API_URL}/crm/property-listings?pageSize=50`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json().catch(() => ({}));
          const allProps = Array.isArray(data) ? data : (data.data || []);
          for (const p of allProps) {
            addUnique(p);
          }
        } catch {
          // ignore
        }

        setProperties(list);
        if (list.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(list[0]._id || list[0].id);
        }
      } catch (e) {
        console.error("Failed to load property listings:", e);
      } finally {
        setLoadingProperties(false);
      }
    };
    void loadProps();
  }, [open, leadId]);

  const generateBrochure = async (propId: string, forceRegenerate = false) => {
    if (!propId) return null;
    setGeneratingPdf(true);
    try {
      const result = await generatePropertyBrochurePdf({ propertyId: propId, forceRegenerate });
      if (result?.url) {
        setBrochurePdfUrl(result.url);
        setBrochurePdfFilename(result.filename || "2Bigha-Property-Brochure.pdf");
        if (hasMediaHeader) {
          setMediaUrl(result.url);
          setMediaFilename(result.filename || "2Bigha-Property-Brochure.pdf");
        }
        if (result.cached) {
          toast.success("Loaded saved Azure brochure PDF (0ms)");
        } else {
          toast.success("2Bigha Project Brochure PDF generated & saved on Azure!");
        }
        return result;
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to generate brochure PDF");
    } finally {
      setGeneratingPdf(false);
    }
    return null;
  };

  const handleSend = async () => {
    if (!selected || !to) return;
    for (const slot of slots) {
      if (!values[slot.key]?.trim()) {
        toast.error(`Fill ${slot.label}`);
        return;
      }
    }

    let finalBrochureUrl = brochurePdfUrl;
    let finalBrochureFilename = brochurePdfFilename;

    if (attachBrochure && selectedPropertyId && !finalBrochureUrl) {
      const gen = await generateBrochure(selectedPropertyId, false);
      if (gen?.url) {
        finalBrochureUrl = gen.url;
        finalBrochureFilename = gen.filename;
      }
    }

    if (hasMediaHeader && !mediaUrl.trim() && !finalBrochureUrl) {
      toast.error("Header Media URL is required for this template type");
      return;
    }

    setSending(true);
    const token = localStorage.getItem("token");
    try {
      const components = buildComponents(slots, values);
      const headerComp = selected.components?.find(
        (c: any) => String(c.type).toUpperCase() === "HEADER"
      );
      const headerFormatType = headerComp ? String(headerComp.format || "").toUpperCase() : null;
      const isDocumentHeader = headerFormatType === "DOCUMENT" || headerFormatType === "FILE";
      const isImageHeader = headerFormatType === "IMAGE";
      const isVideoHeader = headerFormatType === "VIDEO";

      let templateMediaUrl: string | undefined = undefined;
      let templateMediaFilename: string | undefined = undefined;
      let templateMediaType: "image" | "document" | "video" | "audio" | undefined = undefined;

      if (isDocumentHeader) {
        templateMediaUrl = finalBrochureUrl || mediaUrl.trim() || undefined;
        templateMediaFilename = finalBrochureFilename || mediaFilename.trim() || "Property-Brochure.pdf";
        templateMediaType = "document";
      } else if (isImageHeader) {
        templateMediaUrl = mediaUrl.trim() || (selectedProperty?.images?.[0] || selectedProperty?.photos?.[0]) || "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800";
        templateMediaFilename = mediaFilename.trim() || "header.jpg";
        templateMediaType = "image";
      } else if (isVideoHeader) {
        templateMediaUrl = mediaUrl.trim() || undefined;
        templateMediaFilename = mediaFilename.trim() || "video.mp4";
        templateMediaType = "video";
      }

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
          mediaUrl: templateMediaUrl,
          mediaFilename: templateMediaFilename,
          mediaType: templateMediaType,
          attachDocumentAfter:
            attachBrochure && finalBrochureUrl && !isDocumentHeader
              ? {
                  url: finalBrochureUrl,
                  filename: finalBrochureFilename || "2Bigha-Property-Brochure.pdf",
                  title: "2Bigha Project Brochure",
                }
              : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        toast.success(
          attachBrochure
            ? "Template sent with 2Bigha Project Brochure attached!"
            : "Template sent",
        );
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

  const selectedProperty = useMemo(() => {
    return properties.find((p) => (p._id || p.id) === selectedPropertyId);
  }, [properties, selectedPropertyId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shadow-sm">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Send WhatsApp Template
              </h2>
              <p className="text-xs text-slate-500">
                Recipient: <span className="font-semibold text-slate-700">{to}</span>
                {leadName && ` (${leadName})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Left: Template Search & Selector */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-xs outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <CrmButton
                variant="secondary"
                disabled={syncing}
                onClick={() => void syncTemplates()}
                className="h-10 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold shrink-0"
                title="Sync from Meta"
              >
                <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
              </CrmButton>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[440px] pr-1">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-slate-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No approved templates found.
                </div>
              ) : (
                filtered.map((t) => {
                  const isSelected = selected?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelected(t)}
                      className={cn(
                        "w-full rounded-xl p-3.5 text-left transition border",
                        isSelected
                          ? "border-emerald-500 bg-emerald-50/40 shadow-sm"
                          : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/70",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 break-all">
                          {t.name}
                        </span>
                        {getCategoryBadge(t.category)}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Language: {t.language}</span>
                        {t.components?.some(
                          (c: any) => String(c.type).toUpperCase() === "HEADER",
                        ) && (
                          <span className="font-semibold text-emerald-600">
                            + Media Header
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Variable Fill, Brochure Attachment, Preview & Send */}
          <div className="p-6 bg-slate-50/30 overflow-y-auto">
            {!selected ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-xs text-slate-400">
                <FileText size={36} className="mb-2 text-slate-300 stroke-1" />
                Select a template to configure variables and brochure attachment
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
                      {attachBrochure && (
                        <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-600/10 p-1.5 text-[10px] font-semibold text-emerald-800 border border-emerald-500/20">
                          <Paperclip size={12} className="text-emerald-700 shrink-0" />
                          <span className="truncate">
                            {brochurePdfFilename || "2Bigha-Property-Brochure.pdf"}
                          </span>
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[#667781] select-none">
                        <span>Preview</span>
                        <CheckCheck size={11} style={{ color: "#53bdeb" }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attach Project Brochure PDF Section */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={attachBrochure}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAttachBrochure(val);
                          if (val && selectedPropertyId && !brochurePdfUrl) {
                            void generateBrochure(selectedPropertyId, false);
                          }
                        }}
                        className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                      />
                      <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <Building2 size={14} className="text-emerald-600" />
                        Attach Project Brochure PDF (Auto-Generate)
                      </span>
                    </label>
                    <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                      2Bigha PDF
                    </span>
                  </div>

                  {attachBrochure && (
                    <div className="space-y-3 pt-2 border-t border-emerald-200/50">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          Select Property / Project
                        </span>
                        {loadingProperties ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                            <Loader2 size={13} className="animate-spin" /> Loading properties...
                          </div>
                        ) : properties.length === 0 ? (
                          <p className="text-xs text-slate-400">No properties available to attach.</p>
                        ) : (
                          <PropertySearchDropdown
                            properties={properties}
                            selectedPropertyId={selectedPropertyId}
                            onSelect={(propId, prop) => {
                              setSelectedPropertyId(propId);
                              if (prop?.brochurePdfUrl) {
                                setBrochurePdfUrl(prop.brochurePdfUrl);
                                setBrochurePdfFilename(`${prop.title || '2Bigha-Brochure'}.pdf`);
                                if (hasMediaHeader) {
                                  setMediaUrl(prop.brochurePdfUrl);
                                  setMediaFilename(`${prop.title || '2Bigha-Brochure'}.pdf`);
                                }
                              } else {
                                setBrochurePdfUrl("");
                                setBrochurePdfFilename("");
                                if (propId) {
                                  void generateBrochure(propId, false);
                                }
                              }
                            }}
                          />
                        )}
                      </div>

                      {/* Selected Property Preview Summary Card */}
                      {selectedProperty && (
                        <div className="rounded-lg bg-white p-3 border border-emerald-200/60 shadow-xs space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-slate-800">
                                {selectedProperty.title || "Selected Property"}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {[selectedProperty.city, selectedProperty.district, selectedProperty.state].filter(Boolean).join(", ") || selectedProperty.address || "Location on Request"}
                              </p>
                            </div>
                            {selectedProperty.price && (
                              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                ₹{Number(selectedProperty.price).toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <CrmButton
                              type="button"
                              variant="secondary"
                              disabled={generatingPdf || !selectedPropertyId}
                              onClick={() => void generateBrochure(selectedPropertyId, !!brochurePdfUrl)}
                              className="h-7 px-2.5 text-[11px] font-semibold bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                            >
                              {generatingPdf ? (
                                <>
                                  <Loader2 size={11} className="animate-spin" /> Generating...
                                </>
                              ) : (
                                <>
                                  <RefreshCw size={11} /> {brochurePdfUrl ? "Regenerate PDF" : "Generate Brochure PDF"}
                                </>
                              )}
                            </CrmButton>

                            {brochurePdfUrl && (
                              <a
                                href={brochurePdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline px-2 py-1 rounded bg-white border border-slate-200"
                              >
                                <ExternalLink size={11} /> Preview PDF
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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

                {hasMediaHeader && !attachBrochure && (
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
