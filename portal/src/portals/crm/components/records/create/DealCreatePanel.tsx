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
import CRMDealFormFields from "@/components/crm/records/forms/CRMDealFormFields";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";

export interface DealCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPipelineId?: string;
  onSuccess?: () => void;
}

function stripEmpty(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) out[k] = v;
  });
  return out;
}

export default function DealCreatePanel({
  isOpen,
  onClose,
  initialPipelineId = "",
  onSuccess,
}: DealCreatePanelProps) {
  const { user, hasAccess, canViewCrmRevenue } = usePermissions();
  const defaultDealOwner = useMemo(() => {
    const n = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return n || String(user?.email || "").trim();
  }, [user?.firstName, user?.lastName, user?.email]);
  const [loading, setLoading] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>(initialPipelineId);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);
  const [showCustomize, setShowCustomize] = useState(false);
  const isAdmin = hasAccess("admin") || user?.role === "ADMIN";

  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);
  const [showAddField, setShowAddField] = useState(false);

  const fetchCustomFields = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=deals`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setCustomFields(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchOrganizations = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/organizations/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOrganizations(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContacts = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/contacts/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setContacts(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPipelines = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        const assignedId = (user as any)?.assignedDealsPipeline;
        if (assignedId && data.some((p: any) => p._id === assignedId)) {
          setSelectedPipeline(assignedId);
        } else if (initialPipelineId && data.some((p: any) => p._id === initialPipelineId)) {
          setSelectedPipeline(initialPipelineId);
        } else if (data.length > 0) {
          const saved = localStorage.getItem("crm_active_pipeline_deals");
          if (saved && data.some((p: any) => p._id === saved)) setSelectedPipeline(saved);
          else setSelectedPipeline((data.find((p: any) => p.isDefault) || data[0])._id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPipelines();
      fetchOrganizations();
      fetchContacts();
      fetchCustomFields();
      setLayoutTick((t) => t + 1);
    }
  }, [isOpen, fetchCustomFields]);

  useEffect(() => {
    if (isOpen && initialPipelineId && !(user as any)?.assignedDealsPipeline) {
      setSelectedPipeline(initialPipelineId);
    }
  }, [isOpen, initialPipelineId, user]);

  useEffect(() => {
    const handler = () => fetchCustomFields();
    window.addEventListener("cf-reordered", handler);
    return () => window.removeEventListener("cf-reordered", handler);
  }, [fetchCustomFields]);

  const visibleKeys = useMemo(
    () => getVisibleFieldKeysOrdered("deals", "form", customFields.map((f) => f.key)),
    [customFields, layoutTick],
  );

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
          module: "deals",
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;

    if (!data.title?.trim()) {
      toast.error("Deal title is required");
      return;
    }
    if (
      canViewCrmRevenue &&
      (data.dealValue === undefined || data.dealValue === "")
    ) {
      toast.error("Amount is required");
      return;
    }

    setLoading(true);

    const pipeline = pipelines.find((p) => p._id === selectedPipeline);
    const sortedStages = [...(pipeline?.stages || [])].sort(
      (a: any, b: any) => a.order - b.order,
    );
    const firstStage =
      sortedStages.find((s: any) => s.isDefault)?.name ||
      sortedStages[0]?.name ||
      "Qualification";
    const stage = (data.stage as string) || firstStage;
    const stageProb = sortedStages.find((s: any) => s.name === stage)?.probability;

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

    const num = (s: string | undefined) =>
      s !== undefined && s !== "" && !Number.isNaN(Number(s)) ? Number(s) : undefined;

    const payload = stripEmpty({
      title: data.title,
      dealValue: num(data.dealValue),
      pricingType: data.pricingType === "monthly" ? "monthly" : "fixed",
      contractMonths:
        data.pricingType === "monthly" ? num(data.contractMonths) || 12 : undefined,
      pipeline: selectedPipeline,
      stage,
      status: data.status || stage,
      organization:
        data.organization && data.organization !== "Select Organization..." ? data.organization : undefined,
      contactPerson: data.contactPerson || undefined,
      // Stage owns win probability — never collect it on the create form.
      probability: typeof stageProb === "number" ? stageProb : undefined,
      expectedClosureDate: data.expectedClosureDate || undefined,
      closedDate: data.closedDate || undefined,
      nextStep: data.nextStep,
      expectedDealValue: num(data.expectedDealValue),
      dealOwner: data.dealOwner,
      currency: data.currency,
      exchangeRate: num(data.exchangeRate),
      customFields: Object.keys(cfData).length > 0 ? cfData : undefined,
    });

    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        invalidateCrmForEntityType("deal");
        toast.success("Deal created");
        if (payload.pipeline) localStorage.setItem("crm_active_pipeline_deals", String(payload.pipeline));
        if (saveAndAddAnother) {
          formRef.current?.reset();
        } else {
          onClose();
          if (onSuccess) onSuccess();
          else window.location.reload();
        }
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err?.message === "string"
            ? err.message
            : Array.isArray(err?.message)
              ? err.message.join(", ")
              : "Failed to create deal";
        toast.error(msg);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const panelInner = (
    <>
      <CrmSlidePanelShell
        isOpen={isOpen}
        onClose={onClose}
        title="Add New Deal"
        subtitle="Deal details, pipeline, and associations"
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
              form="deal-create-form"
              type="submit"
              disabled={loading}
              onClick={() => setSaveAndAddAnother(true)}
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
            >
              {loading && saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading && saveAndAddAnother ? "Saving…" : "Save & Add Another"}
            </button>
            <button
              form="deal-create-form"
              type="submit"
              disabled={loading}
              onClick={() => setSaveAndAddAnother(false)}
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors shadow-sm disabled:opacity-50"
            >
              {loading && !saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {loading && !saveAndAddAnother ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <form id="deal-create-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <CRMDealFormFields
            visibleKeys={visibleKeys}
            customFields={customFields}
            pipelines={pipelines}
            selectedPipeline={selectedPipeline}
            setSelectedPipeline={setSelectedPipeline}
            organizations={organizations}
            contacts={contacts}
            userAssignedPipeline={(user as any)?.assignedDealsPipeline}
            defaultDealOwner={defaultDealOwner}
            variant="stack"
            visualVariant="hubspot"
          />

          {isAdmin && (
            <div className="pt-4 border-t border-[var(--surface-dim)]">
              {!showAddField ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddField(true);
                    setTimeout(() => document.getElementById("deal-new-field-input")?.focus(), 50);
                  }}
                  className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--hs-link)] hover:bg-[var(--background)] py-3 rounded-md flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-all"
                >
                  <Plus size={14} /> Add custom property
                </button>
              ) : (
                <div className="p-4 bg-[var(--background)] rounded-md border border-[var(--border-color)] space-y-3">
                  <p className="text-xs font-semibold text-[var(--text-main)]">New custom property</p>
                  <input
                    id="deal-new-field-input"
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNewField()}
                    placeholder="e.g. Contract type"
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
                      onClick={() => { setShowAddField(false); setNewFieldName(""); }}
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
        module="deals"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTick((t) => t + 1)}
      />
    </>
  );

  return <CrmJiraPortal>{panelInner}</CrmJiraPortal>;
}
