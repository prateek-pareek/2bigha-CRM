"use client";

import { useEffect, useState } from "react";
import { CrmFormSection, CrmFormGrid } from "@/components/crm/records/forms/crm-form-primitives";

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

const LABEL = "mb-1.5 block text-[13px] font-medium text-[var(--text-main)]";
const INPUT =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all";
const SELECT =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none";
const TEXTAREA = `${INPUT} h-auto min-h-[84px] py-2 resize-y`;

export const CASE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "contract_review", label: "Contract Review" },
  { value: "dispute", label: "Dispute" },
  { value: "compliance", label: "Compliance" },
  { value: "nda", label: "NDA" },
  { value: "other", label: "Other" },
];

export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function toDateInputValue(value?: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export interface CRMLegalCaseFormFieldsProps {
  pipelines: any[];
  selectedPipeline: string;
  setSelectedPipeline: (id: string) => void;
  contacts?: any[];
  leads?: any[];
  defaultCaseOwner?: string;
  /** Present when editing an existing case — prefills field defaultValues. */
  initialData?: Record<string, any> | null;
}

/** Reusable field set for the Legal Case create + edit panel (modeled on CRMDealFormFields). */
export default function CRMLegalCaseFormFields({
  pipelines,
  selectedPipeline,
  setSelectedPipeline,
  contacts = [],
  leads = [],
  defaultCaseOwner = "",
  initialData,
}: CRMLegalCaseFormFieldsProps) {
  const currentPipeline = pipelines.find((p) => pipelineIdEq(p._id, selectedPipeline));
  const sortedStages = currentPipeline
    ? [...(currentPipeline.stages || [])].sort((a: any, b: any) => a.order - b.order)
    : [];
  const stageOptions = sortedStages.length ? sortedStages.map((s: any) => s.name) : ["Intake"];
  const initialStageName =
    initialData?.stage && stageOptions.includes(initialData.stage)
      ? initialData.stage
      : sortedStages.find((s: any) => s.isDefault)?.name || stageOptions[0] || "Intake";

  const [selectedStage, setSelectedStage] = useState(initialStageName);

  useEffect(() => {
    const nextStage = stageOptions.includes(selectedStage) ? selectedStage : initialStageName;
    if (nextStage !== selectedStage) setSelectedStage(nextStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync when pipeline/stage options change
  }, [selectedPipeline, stageOptions.join("|")]);

  const initialContactIds = new Set(
    (initialData?.associatedContacts || []).map((c: any) => String(c?._id || c)),
  );
  const initialLeadIds = new Set(
    (initialData?.associatedLeads || []).map((l: any) => String(l?._id || l)),
  );

  return (
    <div className="space-y-3">
      <CrmFormSection title="Case Details" defaultOpen>
        <CrmFormGrid>
          <div className="sm:col-span-2">
            <label className={LABEL}>
              Case title <span className="text-[#f2545b]">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              defaultValue={initialData?.title || ""}
              placeholder="MSA renewal — Acme Corp"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Case type</label>
            <select name="caseType" className={SELECT} defaultValue={initialData?.caseType || "contract_review"}>
              {CASE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Priority</label>
            <select name="priority" className={SELECT} defaultValue={initialData?.priority || "medium"}>
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Description</label>
            <textarea
              name="description"
              defaultValue={initialData?.description || ""}
              placeholder="What this case covers…"
              className={TEXTAREA}
            />
          </div>
        </CrmFormGrid>
      </CrmFormSection>

      <CrmFormSection title="Contract">
        <CrmFormGrid>
          <div>
            <label className={LABEL}>Counterparty</label>
            <input
              name="counterpartyName"
              type="text"
              defaultValue={initialData?.counterpartyName || ""}
              placeholder="Other party's name"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Jurisdiction</label>
            <input
              name="jurisdiction"
              type="text"
              defaultValue={initialData?.jurisdiction || ""}
              placeholder="e.g. Delhi, India"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Contract value</label>
            <input
              name="contractValue"
              type="number"
              min={0}
              defaultValue={initialData?.contractValue ?? ""}
              placeholder="0.00"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Currency</label>
            <select name="currency" className={SELECT} defaultValue={initialData?.currency || "USD"}>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="INR">INR — Indian Rupee (₹)</option>
              <option value="EUR">EUR — Euro (€)</option>
              <option value="GBP">GBP — British Pound (£)</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Start date</label>
            <input
              name="startDate"
              type="date"
              defaultValue={toDateInputValue(initialData?.startDate)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Expiry date</label>
            <input
              name="expiryDate"
              type="date"
              defaultValue={toDateInputValue(initialData?.expiryDate)}
              className={INPUT}
            />
          </div>
        </CrmFormGrid>
      </CrmFormSection>

      <CrmFormSection title="Pipeline & Ownership">
        <CrmFormGrid>
          <div>
            <label className={LABEL}>Pipeline</label>
            <select
              name="pipeline"
              value={selectedPipeline ? String(selectedPipeline) : ""}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className={SELECT}
            >
              {pipelines.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Stage</label>
            <select
              name="stage"
              className={SELECT}
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
            >
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Case owner</label>
            <input
              name="caseOwner"
              type="text"
              defaultValue={initialData?.caseOwner || defaultCaseOwner}
              placeholder="Assigned lawyer / owner"
              className={INPUT}
            />
          </div>
        </CrmFormGrid>
      </CrmFormSection>

      {(contacts.length > 0 || leads.length > 0) && (
        <CrmFormSection title="Associations" description="Link contacts and leads related to this case (optional).">
          <CrmFormGrid>
            {contacts.length > 0 && (
              <div>
                <label className={LABEL}>Contacts</label>
                <div className="max-h-[140px] space-y-1.5 overflow-y-auto rounded-md border border-[var(--border-color)] bg-white px-3 py-2">
                  {contacts.map((c) => (
                    <label key={c._id} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                      <input
                        type="checkbox"
                        name="associatedContacts"
                        value={c._id}
                        defaultChecked={initialContactIds.has(String(c._id))}
                        className="rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
                      />
                      {`${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Contact"}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {leads.length > 0 && (
              <div>
                <label className={LABEL}>Leads</label>
                <div className="max-h-[140px] space-y-1.5 overflow-y-auto rounded-md border border-[var(--border-color)] bg-white px-3 py-2">
                  {leads.map((l) => (
                    <label key={l._id} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                      <input
                        type="checkbox"
                        name="associatedLeads"
                        value={l._id}
                        defaultChecked={initialLeadIds.has(String(l._id))}
                        className="rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
                      />
                      {`${l.firstName || ""} ${l.lastName || ""}`.trim() || l.email || "Lead"}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CrmFormGrid>
        </CrmFormSection>
      )}
    </div>
  );
}
