"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Loader2, Save, Settings2, Plus, Check, Search, UserPlus, ArrowLeft, X } from "lucide-react";
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

export type CrmPersonEntity = "lead" | "contact";

export interface LeadCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPipelineId?: string;
  onSuccess?: () => void;
  /** Use `contact` for the same slide-panel UX on the Contacts page */
  entity?: CrmPersonEntity;
}

/** Style tokens for the client-selection wizard steps — matches CRMLeadFormFields' own LBL/INP/SEL. */
const LBL_STACK = "mb-1.5 block text-[13px] font-medium text-[var(--text-main)]";
const INP_STACK =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all";
const SEL_STACK =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none";
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

  // --- Add Lead client-selection step (search existing client / create new) ---
  type ClientLite = { _id: string; name: string; phone?: string; email?: string; role?: string };
  const [step, setStep] = useState<"search" | "create-client" | "details">(
    entity === "lead" ? "search" : "details",
  );
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [newClient, setNewClient] = useState({
    role: "USER",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    whatsappNumber: "",
    address: "",
  });
  const [creatingClient, setCreatingClient] = useState(false);

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
      // Reset the client-selection wizard each time the panel (re)opens.
      setStep(entity === "lead" ? "search" : "details");
      setSelectedClient(null);
      setClientQuery("");
      setClientResults([]);
      setNewClient({ role: "USER", firstName: "", lastName: "", email: "", phone: "", whatsappNumber: "", address: "" });
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
    if (step !== "search") return;
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
        const data = res.ok ? await res.json() : { clients: [] };
        if (!cancelled) setClientResults(Array.isArray(data.clients) ? data.clients : []);
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
  }, [clientQuery, step]);

  const handleCreateClient = async () => {
    const name = `${newClient.firstName} ${newClient.lastName}`.trim();
    if (!name) {
      toast.error("Enter a first name");
      return;
    }
    if (!newClient.phone.trim() && !newClient.email.trim()) {
      toast.error("Enter a phone number or email");
      return;
    }
    setCreatingClient(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name,
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
          whatsappNumber: newClient.whatsappNumber.trim() || undefined,
          address: newClient.address.trim() || undefined,
          role: newClient.role || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setSelectedClient({
          _id: created._id,
          name: created.name,
          phone: created.phone,
          email: created.email,
          role: created.role,
        });
        toast.success("Client created");
        setStep("details");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to create client");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreatingClient(false);
    }
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
          : "Add at least one of email, phone, LinkedIn, or a job/freelance listing URL (https) when you do not have direct contact details yet.",
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
      clientId: entity === "lead" ? selectedClient?._id : undefined,
      leadCategory: entity === "lead" ? data.leadCategory : undefined,
      group: entity === "lead" ? data.group : undefined,
      notes: entity === "lead" ? data.notes : undefined,
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
            setStep("search");
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
  const backLinkClass =
    "mr-auto inline-flex h-[38px] items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors";

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

  const searchFooter = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => setStep("details")}
        className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors underline-offset-2 hover:underline"
      >
        Skip — enter lead details manually
      </button>
      <button type="button" onClick={onClose} className={cancelBtnClass}>
        Cancel
      </button>
    </div>
  );

  const createClientFooter = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={() => setStep("search")} className={backLinkClass}>
        <ArrowLeft size={14} /> Back
      </button>
      <button type="button" onClick={onClose} className={cancelBtnClass}>
        Cancel
      </button>
      <button
        type="button"
        disabled={creatingClient}
        onClick={handleCreateClient}
        className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors shadow-sm disabled:opacity-50"
      >
        {creatingClient ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
        {creatingClient ? "Creating…" : "Create User"}
      </button>
    </div>
  );

  const isWizardStep = entity === "lead" && step !== "details";

  const panelInner = (
    <>
      <CrmSlidePanelShell
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        subtitle={
          step === "search"
            ? "Step 1 of 2 — find the client, or create a new one"
            : step === "create-client"
              ? "Step 1 of 2 — create a new client record"
              : undefined
        }
        headerTone="hubspot"
        maxWidthClass="max-w-2xl"
        headerActions={
          isWizardStep ? undefined : (
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
            >
              <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
            </button>
          )
        }
        footer={step === "search" ? searchFooter : step === "create-client" ? createClientFooter : detailsFooter}
      >
        {step === "search" && entity === "lead" ? (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                autoFocus
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Search by client name or phone number…"
                className={`${INP_SEARCH}`}
              />
            </div>

            {clientSearchLoading ? (
              <div className="flex justify-center py-8 text-[var(--text-muted)]">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : clientQuery.trim().length >= 2 && clientResults.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No clients found for &ldquo;{clientQuery.trim()}&rdquo;.{" "}
                <button
                  type="button"
                  onClick={() => setStep("create-client")}
                  className="font-semibold text-[var(--hs-link)] hover:underline"
                >
                  Create a new user
                </button>
                .
              </p>
            ) : (
              <div className="space-y-2">
                {clientResults.map((c) => (
                  <div
                    key={c._id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-main)] truncate">{c.name}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {c.phone || c.email || "—"}
                        {c.role ? ` · ${c.role}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(c);
                        setStep("details");
                      }}
                      className="shrink-0 inline-flex h-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors"
                    >
                      Select
                    </button>
                  </div>
                ))}
                {clientResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep("create-client")}
                    className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
                  >
                    Can&apos;t find them? Create a new user instead.
                  </button>
                )}
              </div>
            )}

            {clientQuery.trim().length < 2 && (
              <button
                type="button"
                onClick={() => setStep("create-client")}
                className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--hs-link)] hover:bg-[var(--background)] py-3 rounded-md flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-all"
              >
                <UserPlus size={14} /> Create a new user
              </button>
            )}
          </div>
        ) : step === "create-client" && entity === "lead" ? (
          <div className="space-y-4">
            <div>
              <label className={LBL_STACK}>User Type</label>
              <select
                value={newClient.role}
                onChange={(e) => setNewClient((f) => ({ ...f, role: e.target.value }))}
                className={SEL_STACK}
              >
                <option value="OWNER">OWNER</option>
                <option value="AGENT">AGENT</option>
                <option value="USER">USER</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL_STACK}>First name<span className="text-[var(--primary)]">*</span></label>
                <input
                  value={newClient.firstName}
                  onChange={(e) => setNewClient((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  className={INP_STACK}
                />
              </div>
              <div>
                <label className={LBL_STACK}>Last name</label>
                <input
                  value={newClient.lastName}
                  onChange={(e) => setNewClient((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Doe"
                  className={INP_STACK}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL_STACK}>Email</label>
                <input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className={INP_STACK}
                />
              </div>
              <div>
                <label className={LBL_STACK}>Phone number</label>
                <input
                  value={newClient.phone}
                  onChange={(e) => setNewClient((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                  className={INP_STACK}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL_STACK}>WhatsApp number</label>
                <input
                  value={newClient.whatsappNumber}
                  onChange={(e) => setNewClient((f) => ({ ...f, whatsappNumber: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                  className={INP_STACK}
                />
              </div>
              <div>
                <label className={LBL_STACK}>Address</label>
                <input
                  value={newClient.address}
                  onChange={(e) => setNewClient((f) => ({ ...f, address: e.target.value }))}
                  placeholder="City, State"
                  className={INP_STACK}
                />
              </div>
            </div>
          </div>
        ) : (
        <form id={formId} ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          {entity === "lead" && selectedClient && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Selected Contact</p>
                <p className="text-sm font-semibold text-[var(--text-main)] truncate">{selectedClient.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{selectedClient.phone || selectedClient.email || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedClient(null);
                  setStep("search");
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)] transition-colors"
              >
                <X size={12} /> Clear
              </button>
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
        )}
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
