"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Plus, Search, User, X, Building2, ExternalLink, RefreshCw, Paperclip, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import WhatsAppNavTabs from "@/components/crm/whatsapp/WhatsAppNavTabs";
import type { WhatsAppTemplateRecord } from "@/components/crm/whatsapp/types";
import { extractSlots, type VariableSlot } from "@/lib/crm/whatsapp/template-variables";
import { generatePropertyBrochurePdf } from "@/lib/crm/whatsapp/property-share-api";
import {
  fetchTwoBighaProperties,
  mapTwoBighaPropertyToRecord,
} from "@/portals/crm/lib/property-listings/backend-api";
import PropertySearchDropdown from "@/portals/crm/components/inbox/PropertySearchDropdown";

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

  // Campaign-level default template variable values
  const [templateParamValues, setTemplateParamValues] = useState<Record<string, string>>({});

  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);

  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");
  const [throttlePerMinute, setThrottlePerMinute] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");

  // Brochure Attachment States
  const [attachBrochure, setAttachBrochure] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [brochurePdfUrl, setBrochurePdfUrl] = useState<string>("");
  const [brochurePdfFilename, setBrochurePdfFilename] = useState<string>("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === templateId) || null,
    [templates, templateId],
  );

  const allSlots = useMemo(
    () => (selectedTemplate ? extractSlots(selectedTemplate) : []),
    [selectedTemplate],
  );
  const slotCount = allSlots.length;

  const hasMediaHeader = useMemo(() => {
    if (!selectedTemplate) return false;
    const header = selectedTemplate.components?.find(
      (c) => String(c.type).toUpperCase() === "HEADER"
    );
    return header ? ["IMAGE", "VIDEO", "DOCUMENT"].includes(String(header.format).toUpperCase()) : false;
  }, [selectedTemplate]);

  const templateButtons = useMemo(() => {
    if (!selectedTemplate) return [];
    const btnComp = selectedTemplate.components?.find(
      (c) => String(c.type).toUpperCase() === "BUTTONS"
    );
    if (Array.isArray(btnComp?.buttons) && btnComp.buttons.length > 0) {
      return btnComp.buttons;
    }
    const body = selectedTemplate.components?.find(
      (c) => String(c.type).toUpperCase() === "BODY"
    );
    if (body?.text && body.text.includes("| [")) {
      const buttonRegex = /\|\s*\[([^\]]+)\]/g;
      const buttons: any[] = [];
      let match: RegExpExecArray | null;
      while ((match = buttonRegex.exec(body.text)) !== null) {
        const content = match[1];
        if (content.includes(",")) {
          const parts = content.split(",");
          buttons.push({ text: parts[0].trim(), type: "URL" });
        } else {
          buttons.push({ text: content.trim(), type: "QUICK_REPLY" });
        }
      }
      return buttons;
    }
    return [];
  }, [selectedTemplate]);

  // Resolves recipient parameters array using current values and recipient's name
  const resolveRecipientParams = (
    recipientName: string,
    currentValues: Record<string, string>,
  ): string[] => {
    return allSlots.map((slot, i) => {
      const val = currentValues[slot.key] ?? "";
      if (/\{\{\s*name\s*\}\}/i.test(val) || /\{\s*name\s*\}/i.test(val)) {
        return val.replace(/\{\{\s*name\s*\}\}/gi, recipientName).replace(/\{\s*name\s*\}/gi, recipientName);
      }
      if (!val && slot.componentType === "BODY" && i === 0) {
        return recipientName;
      }
      return val || slot.example || "";
    });
  };

  // When selectedTemplate changes, re-initialize templateParamValues
  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateParamValues({});
      return;
    }
    const initial: Record<string, string> = {};
    allSlots.forEach((slot, i) => {
      if (slot.componentType === "BODY" && i === 0) {
        initial[slot.key] = "{{name}}";
      } else {
        initial[slot.key] = slot.example || "";
      }
    });
    setTemplateParamValues(initial);

    // Sync any existing recipients
    setRecipients((prev) =>
      prev.map((r) => ({
        ...r,
        templateParams: resolveRecipientParams(r.name, initial),
      })),
    );
  }, [selectedTemplate, allSlots]);

  const handleTemplateParamChange = (slotKey: string, val: string) => {
    setTemplateParamValues((prev) => {
      const updated = { ...prev, [slotKey]: val };
      // Also propagate to existing recipients
      setRecipients((prevRecipients) =>
        prevRecipients.map((r) => ({
          ...r,
          templateParams: resolveRecipientParams(r.name, updated),
        }))
      );
      return updated;
    });
  };

  const applyDefaultsToAllRecipients = () => {
    setRecipients((prev) =>
      prev.map((r) => ({
        ...r,
        templateParams: resolveRecipientParams(r.name, templateParamValues),
      }))
    );
    toast.success("Applied template variables to all recipients");
  };

  // Dynamic preview text replacing variables with entered values or placeholders
  const previewBodyText = useMemo(() => {
    if (!selectedTemplate) return "";
    const body = selectedTemplate.components?.find(
      (c) => String(c.type).toUpperCase() === "BODY"
    );
    let rawText = body?.text || "";
    let text = rawText.replace(/(\s*\|\s*\[[^\]]+\])+$/g, "").trim();
    allSlots
      .filter((s) => s.componentType === "BODY")
      .forEach((slot) => {
        let val = templateParamValues[slot.key]?.trim();
        if (val && (/\{\{\s*name\s*\}\}/i.test(val) || /\{\s*name\s*\}/i.test(val))) {
          val = val.replace(/\{\{\s*name\s*\}\}/gi, "[Lead Name]").replace(/\{\s*name\s*\}/gi, "[Lead Name]");
        }
        const placeholderNum = slot.key.startsWith("body_") ? slot.key.replace("body_", "") : String(slot.index + 1);
        const displayVal = val || (slot.example ? `[${slot.example}]` : `{{${placeholderNum}}}`);
        text = text.replace(new RegExp(`\\{\\{\\s*${placeholderNum}\\s*\\}\\}`, "g"), displayVal);
      });
    return text;
  }, [selectedTemplate, allSlots, templateParamValues]);

  const previewHeaderText = useMemo(() => {
    if (!selectedTemplate) return "";
    const header = selectedTemplate.components?.find(
      (c) => String(c.type).toUpperCase() === "HEADER" && String(c.format || "TEXT").toUpperCase() === "TEXT"
    );
    if (!header?.text) return "";
    let text = header.text;
    allSlots
      .filter((s) => s.componentType === "HEADER")
      .forEach((slot) => {
        let val = templateParamValues[slot.key]?.trim();
        if (val && (/\{\{\s*name\s*\}\}/i.test(val) || /\{\s*name\s*\}/i.test(val))) {
          val = val.replace(/\{\{\s*name\s*\}\}/gi, "[Lead Name]").replace(/\{\s*name\s*\}/gi, "[Lead Name]");
        }
        const placeholderNum = slot.key.startsWith("header_") ? slot.key.replace("header_", "") : String(slot.index + 1);
        const displayVal = val || (slot.example ? `[${slot.example}]` : `{{${placeholderNum}}}`);
        text = text.replace(new RegExp(`\\{\\{\\s*${placeholderNum}\\s*\\}\\}`, "g"), displayVal);
      });
    return text;
  }, [selectedTemplate, allSlots, templateParamValues]);

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

    // Load active property listings from 2Bigha GraphQL and CRM
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

        // 1. Live 2Bigha GraphQL properties
        try {
          const { data: twoBighaData } = await fetchTwoBighaProperties({ limit: 100 });
          if (Array.isArray(twoBighaData)) {
            for (const item of twoBighaData) {
              const mapped = mapTwoBighaPropertyToRecord(item);
              addUnique(mapped);
            }
          }
        } catch (gqlErr) {
          console.warn("Could not load 2Bigha GraphQL properties:", gqlErr);
        }

        // 2. CRM-local listings
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
        if (list.length > 0) {
          setSelectedPropertyId(list[0]._id || list[0].id);
        }
      } catch {
        // ignore
      } finally {
        setLoadingProperties(false);
      }
    };
    void loadProps();
  }, []);

  const generateBrochure = async (propId: string, forceRegenerate = false) => {
    if (!propId) return null;
    setGeneratingPdf(true);
    try {
      const result = await generatePropertyBrochurePdf({ propertyId: propId, forceRegenerate });
      if (result?.url) {
        setBrochurePdfUrl(result.url);
        setBrochurePdfFilename(result.filename || "2Bigha-Property-Brochure.pdf");
        setMediaUrl(result.url);
        setMediaFilename(result.filename || "2Bigha-Property-Brochure.pdf");
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

  const selectedProperty = useMemo(() => {
    return properties.find((p) => (p._id || p.id) === selectedPropertyId);
  }, [properties, selectedPropertyId]);

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
    const params = resolveRecipientParams(name, templateParamValues);
    setRecipients((prev) => [
      ...prev,
      { leadId: lead._id, name, waId, templateParams: params },
    ]);
  };

  const addCustomRecipient = (numberStr: string) => {
    const waId = numberStr.replace(/\D/g, "");
    if (waId.length < 10) {
      toast.error("Enter a valid phone number with country code (at least 10 digits)");
      return;
    }
    if (recipients.some((r) => r.waId === waId)) {
      toast.error("Already added");
      return;
    }
    const name = `Custom Recipient (+${waId})`;
    const params = resolveRecipientParams(name, templateParamValues);
    setRecipients((prev) => [
      ...prev,
      { leadId: "", name, waId, templateParams: params },
    ]);
    setLeadSearch("");
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
    if (hasMediaHeader && !mediaUrl.trim()) {
      toast.error("Header Media URL is required for this template type");
      return;
    }
    if (hasMediaHeader && !attachBrochure) {
      let host = "";
      try {
        const u = new URL(mediaUrl.trim());
        host = u.protocol === "https:" || u.protocol === "http:" ? u.hostname : "";
      } catch {
        host = "";
      }
      if (!host || host === "localhost" || host === "127.0.0.1") {
        toast.error("Header Media URL must be a public link to the image / file (e.g. https://…/banner.jpg)");
        return;
      }
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
          mediaUrl: hasMediaHeader ? mediaUrl.trim() : undefined,
          mediaFilename: hasMediaHeader ? mediaFilename.trim() : undefined,
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
    <div id="new-campaign-page-container" className="w-full space-y-6 animate-in fade-in duration-500 pb-10">
      <style dangerouslySetInnerHTML={{ __html: `
        #new-campaign-page-container input, 
        #new-campaign-page-container select {
          border: 1px solid #cbd5e1 !important;
          border-radius: 0.5rem !important;
          box-shadow: none !important;
          transition: all 0.15s ease-in-out !important;
          background-color: #ffffff !important;
          color: #1e293b !important;
        }
        #new-campaign-page-container input:focus, 
        #new-campaign-page-container select:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
          outline: none !important;
        }
        #new-campaign-page-container .rounded-\[var\(--radius-md\)\] {
          border-radius: 0.75rem !important;
          border-color: #e2e8f0 !important;
          background-color: #ffffff !important;
        }
      `}} />
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

        <div className="space-y-3">
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
                      void generateBrochure(selectedPropertyId);
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
                          setMediaUrl(prop.brochurePdfUrl);
                          setMediaFilename(`${prop.title || '2Bigha-Brochure'}.pdf`);
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

          {/* Header Media URL / File Name Inputs */}
          {hasMediaHeader && !attachBrochure && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  Header Media URL (Required)
                </label>
                <input
                  value={mediaUrl}
                  name="wa-header-media-url"
                  autoComplete="off"
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="e.g. https://example.com/image.jpg"
                  className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  Header File Name (Optional)
                </label>
                <input
                  value={mediaFilename}
                  name="wa-header-media-filename"
                  autoComplete="off"
                  onChange={(e) => setMediaFilename(e.target.value)}
                  placeholder="e.g. banner.jpg"
                  className="h-10 w-full rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          )}

          {/* Template Variables / Parameters Section */}
          {slotCount > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-800 flex items-center gap-2">
                    <span>Template Variables / Parameters</span>
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                      {slotCount} variable{slotCount === 1 ? "" : "s"}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure default values for all recipients. Use <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[10px] font-mono text-emerald-700 font-bold">&#123;&#123;name&#125;&#125;</code> to automatically insert each recipient&apos;s name.
                  </p>
                </div>
                {recipients.length > 0 && (
                  <button
                    type="button"
                    onClick={applyDefaultsToAllRecipients}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline shrink-0"
                  >
                    Apply to all ({recipients.length})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {allSlots.map((slot) => (
                  <div key={slot.key} className="space-y-1 bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-slate-700 truncate" title={slot.label}>
                        {slot.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTemplateParamChange(slot.key, (templateParamValues[slot.key] || '') + '{{name}}')}
                        className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60"
                        title="Insert recipient name tag"
                      >
                        + &#123;&#123;name&#125;&#125;
                      </button>
                    </div>
                    <input
                      value={templateParamValues[slot.key] || ""}
                      onChange={(e) => handleTemplateParamChange(slot.key, e.target.value)}
                      placeholder={slot.example ? `e.g. ${slot.example}` : `Enter value for ${slot.label}`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Template Preview */}
          {selectedTemplate && (previewBodyText || previewHeaderText) && (
            <div className="rounded-[var(--radius-md)] border border-border bg-slate-50 p-4 space-y-2 mt-2">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-text-muted">
                Template Preview (Live)
              </span>
              {previewHeaderText && (
                <p className="text-xs font-bold text-slate-900 border-b border-slate-200/80 pb-1.5">
                  {previewHeaderText}
                </p>
              )}
              {previewBodyText && (
                <div className="text-xs leading-relaxed text-text-main whitespace-pre-wrap">
                  {previewBodyText}
                </div>
              )}
              {templateButtons.length > 0 && (
                <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-2">
                  {templateButtons.map((btn, bi) => (
                    <span
                      key={bi}
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700 shadow-2xs"
                    >
                      {btn.text || btn.button_title || `Button ${bi + 1}`}
                      {btn.type === "URL" && <ExternalLink size={10} className="text-slate-400" />}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recipients Section */}
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
          <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-white shadow-sm">
            {leadSearch.replace(/\D/g, "").length >= 10 && (
              <button
                type="button"
                onClick={() => addCustomRecipient(leadSearch)}
                className="flex w-full items-center gap-3 border-b border-border/40 bg-emerald-50/50 px-3 py-2 text-left hover:bg-emerald-50 text-emerald-700 font-semibold"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Plus size={12} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs">Add manual number: &quot;+{leadSearch.replace(/\D/g, "")}&quot;</p>
                </div>
              </button>
            )}

            {searchingLeads ? (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin" /> Searching…
              </div>
            ) : (
              <>
                {leadResults.map((lead) => {
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
                })}
                {leadResults.length === 0 && (
                  <p className="p-4 text-center text-xs text-text-muted">No matching leads found.</p>
                )}
              </>
            )}
          </div>
        )}

        {recipients.length > 0 && (
          <div className="space-y-3 pt-2">
            {recipients.map((r) => (
              <div key={r.waId} className="rounded-[var(--radius-md)] border border-border/70 p-3.5 bg-slate-50/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-main">{r.name}</p>
                    <p className="text-[11px] text-text-muted">+{r.waId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.waId)}
                    className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-rose-50 hover:text-rose-600"
                    title="Remove recipient"
                  >
                    <X size={14} />
                  </button>
                </div>

                {slotCount > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Recipient Variables
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {allSlots.map((slot, i) => (
                        <div key={slot.key} className="space-y-0.5">
                          <label className="text-[10px] font-medium text-slate-500 truncate block" title={slot.label}>
                            {slot.label}
                          </label>
                          <input
                            value={r.templateParams[i] ?? ""}
                            onChange={(e) => updateParam(r.waId, i, e.target.value)}
                            placeholder={templateParamValues[slot.key] || slot.example || `{{${slot.index + 1}}}`}
                            className="h-8 w-full rounded-md border border-border px-2.5 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
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
