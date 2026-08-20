"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Loader2, Save } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { invalidateCrmAfterMutation } from "@/lib/crm/shared/invalidate-on-mutation";
import CRMLegalCaseFormFields from "@/components/crm/records/forms/CRMLegalCaseFormFields";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import type { LegalCase } from "@/lib/crm/legal-cases-api";

export interface LegalCaseCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPipelineId?: string;
  onSuccess?: (updated?: LegalCase) => void;
  /** When set, the panel edits this case instead of creating a new one. */
  editingCase?: LegalCase | null;
}

function stripEmpty(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) out[k] = v;
  });
  return out;
}

export default function LegalCaseCreatePanel({
  isOpen,
  onClose,
  initialPipelineId = "",
  onSuccess,
  editingCase = null,
}: LegalCaseCreatePanelProps) {
  const { user } = usePermissions();
  const isEditing = Boolean(editingCase?._id);
  const defaultCaseOwner = useMemo(() => {
    const n = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return n || String(user?.email || "").trim();
  }, [user?.firstName, user?.lastName, user?.email]);
  const [loading, setLoading] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>(initialPipelineId);
  const [contacts, setContacts] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

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

  const fetchLeads = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/leads?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setLeads(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPipelines = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/pipelines?type=legal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        const editingPipelineId =
          editingCase?.pipeline && typeof editingCase.pipeline === "object"
            ? (editingCase.pipeline as any)?._id
            : editingCase?.pipeline;
        if (editingPipelineId && data.some((p: any) => p._id === editingPipelineId)) {
          setSelectedPipeline(String(editingPipelineId));
        } else if (initialPipelineId && data.some((p: any) => p._id === initialPipelineId)) {
          setSelectedPipeline(initialPipelineId);
        } else if (data.length > 0) {
          setSelectedPipeline((data.find((p: any) => p.isDefault) || data[0])._id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPipelines();
      fetchContacts();
      fetchLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only on open
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(
      Array.from(formData.keys()).map((k) => [k, formData.get(k)]),
    ) as Record<string, string>;

    if (!data.title?.trim()) {
      toast.error("Case title is required");
      return;
    }

    setLoading(true);

    const num = (s: string | undefined) =>
      s !== undefined && s !== "" && !Number.isNaN(Number(s)) ? Number(s) : undefined;

    const payload = stripEmpty({
      title: data.title,
      caseType: data.caseType,
      description: data.description,
      counterpartyName: data.counterpartyName,
      contractValue: num(data.contractValue),
      currency: data.currency,
      priority: data.priority,
      startDate: data.startDate || undefined,
      expiryDate: data.expiryDate || undefined,
      jurisdiction: data.jurisdiction,
      caseOwner: data.caseOwner,
      pipeline: selectedPipeline || undefined,
      stage: data.stage,
      associatedContacts: formData.getAll("associatedContacts").map(String),
      associatedLeads: formData.getAll("associatedLeads").map(String),
    });

    try {
      const token = localStorage.getItem("token");
      const url = isEditing
        ? `${CRM_API_URL}/crm/legal-cases/${editingCase!._id}`
        : `${CRM_API_URL}/crm/legal-cases`;
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        invalidateCrmAfterMutation("workspace", "attention");
        toast.success(isEditing ? "Legal case updated" : "Legal case created");
        if (payload.pipeline) localStorage.setItem("crm_active_pipeline_legal", String(payload.pipeline));
        if (saveAndAddAnother && !isEditing) {
          formRef.current?.reset();
        } else {
          onClose();
        }
        onSuccess?.(saved);
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err?.message === "string"
            ? err.message
            : Array.isArray(err?.message)
              ? err.message.join(", ")
              : `Failed to ${isEditing ? "update" : "create"} legal case`;
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
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Legal Case" : "Add New Legal Case"}
      subtitle="Case details, pipeline, and associations"
      headerTone="hubspot"
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[38px] items-center justify-center rounded-[var(--radius-md)] border-0 bg-[var(--surface-dim)] px-3.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
          >
            Cancel
          </button>
          {!isEditing && (
            <button
              form="legal-case-form"
              type="submit"
              disabled={loading}
              onClick={() => setSaveAndAddAnother(true)}
              className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3.5 text-sm font-medium text-[var(--text-main)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
            >
              {loading && saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading && saveAndAddAnother ? "Saving…" : "Save & Add Another"}
            </button>
          )}
          <button
            form="legal-case-form"
            type="submit"
            disabled={loading}
            onClick={() => setSaveAndAddAnother(false)}
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-dark)] transition-colors shadow-sm disabled:opacity-50"
          >
            {loading && !saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {loading && !saveAndAddAnother ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save changes" : "Create"}
          </button>
        </div>
      }
    >
      <form id="legal-case-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <CRMLegalCaseFormFields
          pipelines={pipelines}
          selectedPipeline={selectedPipeline}
          setSelectedPipeline={setSelectedPipeline}
          contacts={contacts}
          leads={leads}
          defaultCaseOwner={defaultCaseOwner}
          initialData={editingCase || undefined}
        />
      </form>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panelInner}</CrmJiraPortal>;
}
