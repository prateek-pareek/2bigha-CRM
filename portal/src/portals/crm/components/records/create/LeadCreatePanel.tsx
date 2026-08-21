"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Loader2, Save, Settings2, Plus, Check, Search, X } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import { getVisibleFieldKeysOrdered } from "@/lib/crm/crm-field-layout";
import CRMFieldLayoutCustomizer from "@/components/crm/records/forms/CRMFieldLayoutCustomizer";
import CRMLeadFormFields from "@/components/crm/records/forms/CRMLeadFormFields";
import CRMContactFormFields from "@/components/crm/records/forms/CRMContactFormFields";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import { hasPersonContactMethodOrPortalListing } from "@/lib/crm/crm-contact-method";
import { parseAdditionalEmailsFromForm } from "@/lib/crm/crm-additional-emails";
import DeleteCustomFieldMergeDialog, {
  type CustomFieldMergeRow,
} from "@/components/crm/records/detail/DeleteCustomFieldMergeDialog";
import LeadIntentChips from "@/components/crm/records/forms/LeadIntentChips";

export type CrmPersonEntity = "lead" | "contact";

export interface LeadCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPipelineId?: string;
  onSuccess?: () => void;
  /** Use `contact` for the same slide-panel UX on the Contacts page */
  entity?: CrmPersonEntity;
}

/** Style token for the inline "existing contact" search box — matches CRMLeadFormFields' own INP. */
const INP_STACK =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all";
const INP_SEARCH = `${INP_STACK} pl-9`;

function stripEmpty(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) out[k] = v;
  });
  return out;
}

export default function LeadCreatePanel({
  isOpen,
  onClose,
  initialPipelineId = "",
  onSuccess,
  entity = "lead",
}: LeadCreatePanelProps) {
  const { user, hasAccess } = usePermissions();
  const layoutModule = entity === "contact" ? "contacts" : "leads";
  const [loading, setLoading] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>(initialPipelineId);
  const [selectedStage, setSelectedStage] = useState("");
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  const [showCustomize, setShowCustomize] = useState(false);
  const isAdmin = hasAccess("admin") || user?.role === "ADMIN";

  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [mergeDeleteField, setMergeDeleteField] = useState<CustomFieldMergeRow | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [serviceOfferings, setServiceOfferings] = useState<Array<{ _id: string; name: string }>>([]);
  const [leadCategories, setLeadCategories] = useState<Array<{ _id: string; label: string }>>([]);
  const [leadGroups, setLeadGroups] = useState<Array<{ _id: string; label: string }>>([]);
  const [selectedIntents, setSelectedIntents] = useState<string[]>([]);
  const [intentFollowUpAt, setIntentFollowUpAt] = useState("");

  // --- Add Lead: optional inline "existing contact" search that auto-fills the form below ---
  type ClientLite = {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    role?: string;
    kind: "client" | "lead" | "contact";
  };
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/organizations/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOrganizations(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchServiceOfferings = useCallback(async () => {
    if (entity !== "lead") return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : [];
      setServiceOfferings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setServiceOfferings([]);
    }
  }, [entity]);

  const fetchLeadPicklists = useCallback(async () => {
    if (entity !== "lead") return;
    const token = localStorage.getItem("token");
    try {
      const [catRes, groupRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=leadCategory`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=group`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const cats = catRes.ok ? await catRes.json() : [];
      const groupsData = groupRes.ok ? await groupRes.json() : [];
      setLeadCategories(Array.isArray(cats) ? cats : []);
      setLeadGroups(Array.isArray(groupsData) ? groupsData : []);
    } catch (err) {
      console.error(err);
      setLeadCategories([]);
      setLeadGroups([]);
    }
  }, [entity]);

  const fetchCustomFields = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=${layoutModule}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setCustomFields(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [layoutModule]);

  useEffect(() => {
    if (isOpen) {
      fetchPipelines();
      fetchCustomFields();
      if (entity === "contact") void fetchOrganizations();
      void fetchServiceOfferings();
      void fetchLeadPicklists();
      setLayoutTick((t) => t + 1);
      // Reset the optional "existing contact" search each time the panel (re)opens.
      setSelectedClient(null);
      setClientQuery("");
      setClientResults([]);
      setShowClientSearch(false);
    }
  }, [isOpen, entity, fetchCustomFields, fetchOrganizations, fetchServiceOfferings, fetchLeadPicklists]);

  useEffect(() => {
    if (isOpen && initialPipelineId) setSelectedPipeline(initialPipelineId);
  }, [isOpen, initialPipelineId]);

  useEffect(() => {
    const handler = () => fetchCustomFields();
    window.addEventListener("cf-reordered", handler);
    return () => window.removeEventListener("cf-reordered", handler);
  }, [fetchCustomFields]);

  const fetchPipelines = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        if (!selectedPipeline && data.length > 0)
          setSelectedPipeline((data.find((p: any) => p.isDefault) || data[0])._id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Debounced client search (name or phone) against the existing global search endpoint.
  useEffect(() => {
    if (!showClientSearch || selectedClient) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientResults([]);
      setClientSearchLoading(false);
      return;
    }
    let cancelled = false;
    setClientSearchLoading(true);
    const timer = setTimeout(async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : {};
        const clients: ClientLite[] = Array.isArray(data.clients)
          ? data.clients.map((c: any) => ({
              _id: c._id,
              name: c.name,
              phone: c.phone,
              email: c.email,
              role: c.role,
              kind: "client" as const,
            }))
          : [];
        const leads: ClientLite[] = Array.isArray(data.leads)
          ? data.leads.map((l: any) => ({
              _id: l._id,
              name: [l.firstName, l.lastName].filter(Boolean).join(" "),
              phone: l.mobileNo || l.phone,
              email: l.email,
              kind: "lead" as const,
            }))
          : [];
        const contacts: ClientLite[] = Array.isArray(data.contacts)
          ? data.contacts.map((c: any) => ({
              _id: c._id,
              name: [c.firstName, c.lastName].filter(Boolean).join(" "),
              phone: c.mobileNo || c.phone,
              email: c.email,
              kind: "contact" as const,
            }))
          : [];
        if (!cancelled) setClientResults([...clients, ...leads, ...contacts]);
      } catch (err) {
        console.error(err);
        if (!cancelled) setClientResults([]);
      } finally {
        if (!cancelled) setClientSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientQuery, showClientSearch, selectedClient]);

  /** Auto-populate the (uncontrolled) form inputs from a selected existing contact. */
  const applyClientToForm = (c: ClientLite) => {
    const setVal = (name: string, value: string) => {
      const el = formRef.current?.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el && value) el.value = value;
    };
    const [firstName, ...rest] = c.name.trim().split(/\s+/);
    setVal("firstName", firstName || "");
    setVal("lastName", rest.join(" "));
    setVal("email", c.email || "");
    setVal("mobileNo", c.phone || "");
  };

  const currentPipeline = pipelines.find((p) => p._id === selectedPipeline);
  useEffect(() => {
    if (!currentPipeline?.stages?.length) return;
    const sorted = [...currentPipeline.stages].sort((a: any, b: any) => a.order - b.order);
    const names = sorted.map((s: any) => s.name);
    setSelectedStage((prev) => (prev && names.includes(prev) ? prev : names[0] || "New"));
  }, [selectedPipeline, currentPipeline]);

  const visibleKeys = useMemo(() => {
    const keys = getVisibleFieldKeysOrdered(layoutModule, "form", customFields.map((f) => f.key));
    // Owner is assigned on the server when creating; keep the field off create UX.
    return keys.filter((k) => k !== "leadOwner");
  }, [customFields, layoutTick, layoutModule]);

  const handleAddNewField = async () => {
    if (!newFieldName.trim()) {
      toast.error("Enter a property name");
      return;
    }
    setAddingField(true);
    const token = localStorage.getItem("token");
    try {
      const key = newFieldName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      const optionsPayload =
        newFieldType === "select" || newFieldType === "multiselect" ? ["Option A", "Option B"] : [];
      const res = await fetch(`${CRM_API_URL}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newFieldName.trim(),
          key,
          type: newFieldType,
          module: layoutModule,
          required: false,
          options: optionsPayload,
        }),
      });
      if (res.ok) {
        toast.success(`"${newFieldName.trim()}" added`);
        setNewFieldName("");
        setNewFieldType("text");
        setShowAddField(false);
        await fetchCustomFields();
        window.dispatchEvent(new CustomEvent("cf-reordered"));
      } else {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        toast.error(err.message || "Failed to add field");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAddingField(false);
    }
  };

  const handleDeleteField = (id: string) => {
    const f = customFields.find((x) => x._id === id);
    if (f) setMergeDeleteField({ _id: f._id, name: f.name, key: f.key });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;
    const additionalEmails = parseAdditionalEmailsFromForm(formData, data.email);

    if (data.mobileNo_countryCode && data.mobileNo) {
      data.mobileNo = `${data.mobileNo_countryCode} ${data.mobileNo}`.trim();
      delete data.mobileNo_countryCode;
    }

    if (
      !hasPersonContactMethodOrPortalListing({
        email: data.email,
        mobileNo: data.mobileNo,
        phone: data.phone,
        linkedinUrl: data.linkedinUrl,
        twitterHandle: data.twitterHandle,
        opportunityListingUrl: data.opportunityListingUrl,
      })
    ) {
      toast.error(
        entity === "contact"
          ? "Add at least one of email, phone (mobile or alternate), or LinkedIn URL so we can reach this contact."
          : "Add at least one of email, phone, or a job/freelance listing URL (https) when you do not have direct contact details yet.",
      );
      return;
    }

    setLoading(true);

    const pipeline = pipelines.find((p) => p._id === selectedPipeline);
    const firstStage =
      pipeline?.stages?.sort((a: any, b: any) => a.order - b.order)[0]?.name || "New";
    const stage = selectedStage || data.stage || firstStage;

    const cfData: Record<string, string | string[]> = {};
    customFields.forEach((f) => {
      if (f.type === "multiselect") {
        const vals = formData
          .getAll(`cf_${f.key}`)
          .filter((x) => x != null && String(x).trim() !== "") as string[];
        if (vals.length) cfData[f.key] = vals;
      } else {
        const v = data[`cf_${f.key}`];
        if (v !== undefined && v !== "") cfData[f.key] = v;
      }
    });

    const annualRaw = data.annualRevenue;
    const annual = annualRaw !== undefined && annualRaw !== "" ? Number(annualRaw) : undefined;

    let sourceMetadata: unknown = undefined;
    if (data.sourceMetadata) {
      try {
        sourceMetadata = JSON.parse(data.sourceMetadata as string);
      } catch {
        sourceMetadata = undefined;
      }
    }

    const orgVal = data.organization?.trim?.() ?? data.organization;
    const payload = stripEmpty({
      salutation: data.salutation,
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      email: data.email,
      additionalEmails: additionalEmails.length ? additionalEmails : undefined,
      mobileNo: data.mobileNo,
      phone: data.phone,
      organization:
        entity === "contact" &&
        (orgVal === "" || orgVal === "Select organization..." || orgVal === "Select Organization...")
          ? undefined
          : data.organization,
      jobTitle: data.jobTitle,
      website: data.website,
      linkedinUrl: data.linkedinUrl,
      twitterHandle: data.twitterHandle,
      source: data.source,
      opportunityListingUrl: entity === "lead" ? data.opportunityListingUrl : undefined,
      opportunitySourcePlatform:
        entity === "lead" ? data.opportunitySourcePlatform : undefined,
      industry: data.industry,
      annualRevenue: annual !== undefined && !Number.isNaN(annual) ? annual : undefined,
      noOfEmployees: data.noOfEmployees,
      territory: data.territory,
      relatedService: entity === "lead" ? data.relatedService : undefined,
      pipeline: selectedPipeline,
      stage,
      status: data.status || stage,
      callStatus: entity === "lead" ? data.callStatus || "Not Called" : undefined,
      clientId:
        entity === "lead" && selectedClient?.kind === "client" ? selectedClient._id : undefined,
      leadCategory: entity === "lead" ? data.leadCategory : undefined,
      group: entity === "lead" ? data.group : undefined,
      notes: entity === "lead" ? data.notes : undefined,
      leadIntents: entity === "lead" && selectedIntents.length ? selectedIntents : undefined,
      leadIntentFollowUpAt: entity === "lead" && selectedIntents.length ? intentFollowUpAt || undefined : undefined,
      sourceMetadata,
      customFields: Object.keys(cfData).length > 0 ? cfData : undefined,
    });

    const endpoint = entity === "contact" ? "contacts" : "leads";

    try {
      const res = await fetch(`${CRM_API_URL}/crm/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        invalidateCrmForEntityType(entity);
        toast.success(entity === "contact" ? "Contact created" : "Lead created");
        if (payload.pipeline)
          localStorage.setItem("crm_active_pipeline_leads", String(payload.pipeline));
        if (saveAndAddAnother) {
          formRef.current?.reset();
          if (entity === "lead") {
            setSelectedClient(null);
            setClientQuery("");
            setClientResults([]);
            setShowClientSearch(false);
            setSelectedIntents([]);
            setIntentFollowUpAt("");
          }
        } else {
          onClose();
          if (onSuccess) onSuccess();
          else window.location.reload();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err?.message === "string"
            ? err.message
            : Array.isArray(err?.message)
              ? err.message.join(", ")
              : entity === "contact"
                ? "Failed to create contact"
                : "Failed to create lead";
        toast.error(msg);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  const formId = entity === "contact" ? "contact-create-form" : "lead-create-form";
  const title = entity === "contact" ? "Add New Contact" : "Add New Lead";
  const submitLabel = "Create New";

  const cancelBtnClass =
    "inline-flex h-[38px] items-center justify-center rounded-[var(--radius-md)] border-0 bg-[var(--surface-dim)] px-3.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors";

  const detailsFooter = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onClose} className={cancelBtnClass}>
        Cancel
      </button>
      <button
        form={formId}
        type="submit"
        disabled={loading}
        onClick={() => setSaveAndAddAnother(true)}
        className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
      >
        {loading && saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : null}
        {loading && saveAndAddAnother ? "Saving…" : "Save & Add Another"}
      </button>
      <button
        form={formId}
        type="submit"
        disabled={loading}
        onClick={() => setSaveAndAddAnother(false)}
        className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors shadow-sm disabled:opacity-50"
      >
        {loading && !saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {loading && !saveAndAddAnother ? "Creating…" : submitLabel}
      </button>
    </div>
  );

  const panelInner = (
    <>
      <CrmSlidePanelShell
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        headerTone="hubspot"
        maxWidthClass="max-w-2xl"
        headerActions={
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
          >
            <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
          </button>
        }
        footer={detailsFooter}
      >
        <form id={formId} ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          {selectedClient && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Prefilled from</p>
                <p className="text-sm font-semibold text-[var(--text-main)] truncate">{selectedClient.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{selectedClient.phone || selectedClient.email || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="shrink-0 inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)] transition-colors"
              >
                <X size={12} /> Clear
              </button>
            </div>
          )}
          {!selectedClient && (
            <div className="space-y-2">
              {!showClientSearch ? (
                <button
                  type="button"
                  onClick={() => setShowClientSearch(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
                >
                  <Search size={12} /> Search existing people (optional)
                </button>
              ) : (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] p-3 space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      autoFocus
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      placeholder="Search by name or phone number…"
                      className={`${INP_SEARCH} bg-[var(--card-bg)]`}
                    />
                  </div>
                  {clientSearchLoading ? (
                    <div className="flex justify-center py-3 text-[var(--text-muted)]">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : clientQuery.trim().length >= 2 && clientResults.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      No matches found for &ldquo;{clientQuery.trim()}&rdquo; — just fill in the fields below.
                    </p>
                  ) : (
                    clientResults.map((c) => (
                      <div
                        key={`${c.kind}-${c._id}`}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-main)] truncate">{c.name || "—"}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {c.phone || c.email || "—"} · {c.kind}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClient(c);
                            setShowClientSearch(false);
                            applyClientToForm(c);
                          }}
                          className="shrink-0 inline-flex h-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-2.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors"
                        >
                          Use
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowClientSearch(false);
                      setClientQuery("");
                      setClientResults([]);
                    }}
                    className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
          {entity === "contact" ? (
            <CRMContactFormFields
              visibleKeys={visibleKeys}
              customFields={customFields}
              pipelines={pipelines}
              selectedPipeline={selectedPipeline}
              setSelectedPipeline={setSelectedPipeline}
              selectedStage={selectedStage}
              setSelectedStage={setSelectedStage}
              variant="stack"
              organizations={organizations}
              isAdmin={isAdmin}
              onDeleteCustom={(fieldId) => handleDeleteField(fieldId)}
              identifierContext={{ entityType: "contact" }}
            />
          ) : (
            <CRMLeadFormFields
              visibleKeys={visibleKeys}
              customFields={customFields}
              pipelines={pipelines}
              selectedPipeline={selectedPipeline}
              setSelectedPipeline={setSelectedPipeline}
              selectedStage={selectedStage}
              setSelectedStage={setSelectedStage}
              variant="stack"
              isAdmin={isAdmin}
              onDeleteCustom={(fieldId) => handleDeleteField(fieldId)}
              identifierContext={{ entityType: "lead" }}
              services={serviceOfferings}
              leadCategories={leadCategories}
              leadGroups={leadGroups}
              visualVariant="hubspot"
            />
          )}

          {entity === "lead" && (
            <div className="pt-4 border-t border-[var(--surface-dim)]">
              <h4 className="mb-1 text-sm font-semibold text-[var(--text-main)]">Lead Intent</h4>
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                Select intent types for this lead
              </p>
              <LeadIntentChips
                selected={selectedIntents}
                onChange={setSelectedIntents}
                followUpAt={intentFollowUpAt}
                onFollowUpAtChange={setIntentFollowUpAt}
              />
            </div>
          )}

          {isAdmin && (
            <div className="pt-4 border-t border-[var(--surface-dim)]">
              {!showAddField ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddField(true);
                    setTimeout(() => document.getElementById("new-field-input")?.focus(), 50);
                  }}
                  className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--hs-link)] hover:bg-[var(--background)] py-3 rounded-md flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-all"
                >
                  <Plus size={14} /> Add custom property
                </button>
              ) : (
                <div className="p-4 bg-[var(--background)] rounded-md border border-[var(--border-color)] space-y-3">
                  <p className="text-xs font-semibold text-[var(--text-main)]">New custom property</p>
                  <input
                    id="new-field-input"
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNewField()}
                    placeholder="e.g. Company size"
                    className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/35 transition-all placeholder:text-[var(--primary-muted)]"
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    className="block w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/35 appearance-none cursor-pointer"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="url">URL (link)</option>
                    <option value="select">Dropdown (single)</option>
                    <option value="multiselect">Dropdown (multi)</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddField(false);
                        setNewFieldName("");
                      }}
                      className="flex-1 py-2 rounded-md border border-[var(--border-color)] bg-white hover:bg-[var(--background)] text-sm font-semibold text-[var(--text-main)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNewField}
                      disabled={addingField || !newFieldName.trim()}
                      className="flex-1 py-2 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-[var(--hs-link-hover)]"
                    >
                      {addingField ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {addingField ? "Adding…" : "Add property"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </CrmSlidePanelShell>

      <CRMFieldLayoutCustomizer
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        module={layoutModule}
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTick((t) => t + 1)}
      />

      <DeleteCustomFieldMergeDialog
        open={!!mergeDeleteField}
        onOpenChange={(open) => !open && setMergeDeleteField(null)}
        field={mergeDeleteField}
        module={layoutModule}
        siblingCustomFields={customFields
          .filter((f) => f._id !== mergeDeleteField?._id)
          .map((f) => ({ _id: f._id, name: f.name, key: f.key }))}
        onSuccess={async () => {
          setMergeDeleteField(null);
          await fetchCustomFields();
          window.dispatchEvent(new CustomEvent("cf-reordered"));
        }}
      />
    </>
  );

  if (!isOpen) return null;

  return <CrmJiraPortal>{panelInner}</CrmJiraPortal>;
}

/** Same slide-panel UX as lead create, for the Contacts list page */
export function ContactCreatePanel(props: Omit<LeadCreatePanelProps, "entity">) {
  return <LeadCreatePanel {...props} entity="contact" />;
}
