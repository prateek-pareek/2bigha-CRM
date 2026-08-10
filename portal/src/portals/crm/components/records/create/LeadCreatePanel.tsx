"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Loader2, Save, Settings2, Plus, Check } from "lucide-react";
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
      setLayoutTick((t) => t + 1);
    }
  }, [isOpen, entity, fetchCustomFields, fetchOrganizations, fetchServiceOfferings]);

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
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[38px] items-center justify-center rounded-[var(--radius-md)] border-0 bg-[var(--surface-dim)] px-3.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
            >
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
        }
      >
        <form id={formId} ref={formRef} onSubmit={handleSubmit} className="space-y-3">
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
