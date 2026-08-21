"use client";

import { useEffect, useState } from "react";
import { CRM_HS_SELECT_CLASS, CRM_DEFAULT_SELECT_CLASS, CrmFormSection, CrmFormGrid } from "@/components/crm/records/forms/crm-form-primitives";
import {
  formatDealAmountLabel,
  normalizeDealPricingType,
  type DealPricingType,
} from "@/lib/crm/deal-pricing";
import { usePermissions } from "@/hooks/usePermissions";

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

const LABEL = "mb-1.5 block text-[13px] font-medium text-[var(--text-main)]";
const INPUT =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all";
const SELECT =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none";

interface CRMDealFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  pipelines: any[];
  selectedPipeline: string;
  setSelectedPipeline: (id: string) => void;
  organizations: any[];
  contacts: any[];
  properties?: any[];
  userAssignedPipeline?: string | null;
  defaultDealOwner?: string;
  variant: "stack" | "grid";
  visualVariant?: "default" | "hubspot";
}

export default function CRMDealFormFields({
  visibleKeys,
  customFields,
  pipelines,
  selectedPipeline,
  setSelectedPipeline,
  organizations,
  contacts,
  properties = [],
  userAssignedPipeline,
  defaultDealOwner = "",
  variant,
}: CRMDealFormFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const currentPipeline = pipelines.find((p) => pipelineIdEq(p._id, selectedPipeline));
  const sortedStages = currentPipeline
    ? [...currentPipeline.stages].sort((a: any, b: any) => a.order - b.order)
    : [];
  const stageOptions = sortedStages.length
    ? sortedStages.map((s: any) => s.name)
    : ["Qualification"];
  const defaultStageName =
    sortedStages.find((s: any) => s.isDefault)?.name || stageOptions[0] || "Qualification";

  const [selectedStage, setSelectedStage] = useState(defaultStageName);
  const [pricingType, setPricingType] = useState<DealPricingType>("fixed");
  const [probability, setProbability] = useState<number | "">(() => {
    const stage = sortedStages.find((s: any) => s.name === defaultStageName);
    return typeof stage?.probability === "number" ? stage.probability : "";
  });
  const amountLabel = formatDealAmountLabel(pricingType);

  useEffect(() => {
    const nextStage = stageOptions.includes(selectedStage)
      ? selectedStage
      : defaultStageName;
    if (nextStage !== selectedStage) setSelectedStage(nextStage);
    const stage = sortedStages.find((s: any) => s.name === nextStage);
    if (stage && typeof stage.probability === "number") {
      setProbability(stage.probability);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when pipeline/stage options change
  }, [selectedPipeline, defaultStageName, stageOptions.join("|")]);

  const pipelineLocked = !!userAssignedPipeline;

  const renderField = (key: string) => {
    switch (key) {
      case "title":
        return (
          <div key={key}>
            <label className={LABEL}>Deal name <span className="text-[#f2545b]">*</span></label>
            <input name="title" type="text" required placeholder="Enterprise deal" className={INPUT} />
          </div>
        );
      case "propertyListingId":
        return (
          <div key={key}>
            <label className={LABEL}>Property Listing</label>
            <select name="propertyListingId" className={SELECT} defaultValue="">
              <option value="">Select property...</option>
              {properties.map((p) => (
                <option key={p._id} value={p._id}>{p.title}</option>
              ))}
            </select>
            {properties.length === 0 && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                No approved property listings yet — create one under Property Listings first.
              </p>
            )}
          </div>
        );
      case "pricingType":
        return (
          <div key={key}>
            <label className={LABEL}>Pricing type</label>
            <select
              name="pricingType"
              className={SELECT}
              value={pricingType}
              onChange={(e) => setPricingType(normalizeDealPricingType(e.target.value))}
            >
              <option value="fixed">Fixed price project</option>
              <option value="monthly">Monthly payment</option>
            </select>
          </div>
        );
      case "dealValue":
        return (
          <div key={key}>
            <label className={LABEL}>
              {amountLabel} <span className="text-[#f2545b]">*</span>
            </label>
            <input name="dealValue" type="number" required placeholder="0.00" className={INPUT} />
            {pricingType === "monthly" ? (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Enter the monthly payment for this retainer / monthly project.
              </p>
            ) : null}
          </div>
        );
      case "contractMonths":
        if (pricingType !== "monthly") {
          return <input key={key} type="hidden" name="contractMonths" value="" />;
        }
        return (
          <div key={key}>
            <label className={LABEL}>Contract months</label>
            <input
              name="contractMonths"
              type="number"
              min={1}
              max={60}
              defaultValue={12}
              placeholder="12"
              className={INPUT}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Total contract value in forecast = monthly × months.
            </p>
          </div>
        );
      case "pipeline":
        return (
          <div key={key}>
            <label className={LABEL}>Pipeline</label>
            <select
              name="pipeline"
              value={selectedPipeline ? String(selectedPipeline) : ""}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              disabled={pipelineLocked}
              className={`${SELECT} ${pipelineLocked ? "opacity-60 cursor-not-allowed bg-[var(--background)]" : ""}`}
            >
              {pipelines.map((p) => (
                <option key={String(p._id)} value={String(p._id)}>{p.name}</option>
              ))}
            </select>
          </div>
        );
      case "stage":
        return (
          <div key={key}>
            <label className={LABEL}>Deal stage</label>
            <select
              name="stage"
              className={SELECT}
              value={selectedStage}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedStage(next);
                const stage = sortedStages.find((s: any) => s.name === next);
                if (stage && typeof stage.probability === "number") {
                  setProbability(stage.probability);
                }
              }}
            >
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      case "probability":
        return (
          <div key={key}>
            <label className={LABEL}>Probability (%)</label>
            <input
              name="probability"
              type="number"
              placeholder="0"
              className={INPUT}
              value={probability === "" ? "" : probability}
              onChange={(e) => {
                const n = e.target.value === "" ? "" : Number(e.target.value);
                setProbability(n === "" || Number.isFinite(n) ? n : "");
              }}
            />
          </div>
        );
      case "organization":
        return (
          <div key={key}>
            <label className={LABEL}>Organization</label>
            <select name="organization" className={SELECT}>
              <option value="">Select organization...</option>
              {organizations.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
            </select>
          </div>
        );
      case "contactPerson":
        return (
          <div key={key}>
            <label className={LABEL}>Contact</label>
            <select name="contactPerson" className={SELECT}>
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c._id} value={c._id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
        );
      case "expectedClosureDate":
        return (
          <div key={key}>
            <label className={LABEL}>Expected close date</label>
            <input name="expectedClosureDate" type="date" className={INPUT} />
          </div>
        );
      case "closedDate":
        return (
          <div key={key}>
            <label className={LABEL}>Closed date</label>
            <input name="closedDate" type="date" className={INPUT} />
          </div>
        );
      case "nextStep":
        return (
          <div key={key}>
            <label className={LABEL}>Next step</label>
            <input name="nextStep" type="text" placeholder="Follow-up call…" className={INPUT} />
          </div>
        );
      case "expectedDealValue":
        return (
          <div key={key}>
            <label className={LABEL}>Expected deal value</label>
            <input name="expectedDealValue" type="number" placeholder="0" className={INPUT} />
          </div>
        );
      case "dealOwner":
        return (
          <div key={key}>
            <label className={LABEL}>Deal owner</label>
            <input name="dealOwner" type="text" defaultValue={defaultDealOwner} className={INPUT} />
          </div>
        );
      case "currency":
        return (
          <div key={key}>
            <label className={LABEL}>Currency</label>
            <select name="currency" className={SELECT}>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="INR">INR — Indian Rupee (₹)</option>
            </select>
          </div>
        );
      default:
        return null;
    }
  };

  const renderCustomField = (key: string) => {
    if (!key.startsWith("cf:")) return null;
    const fk = key.slice(3);
    const field = customFields.find((f) => f.key === fk);
    if (!field) return null;

    if (field.type === "select" || field.type === "multiselect") {
      return (
        <div key={key}>
          <label className={LABEL}>{field.name}{field.required && <span className="text-[#f2545b] ml-0.5">*</span>}</label>
          {field.type === "multiselect" ? (
            <div className="rounded-md border border-[var(--border-color)] bg-white px-3 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
              {(field.options as string[]).map((opt: string) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                  <input type="checkbox" name={`cf_${field.key}`} value={opt} className="rounded border-[var(--border-color)] text-[var(--hs-link)] focus:ring-[var(--hs-link)]/30" />
                  {opt}
                </label>
              ))}
            </div>
          ) : (
            <select name={`cf_${field.key}`} required={field.required} className={SELECT}>
              {(field.options as string[]).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <div key={key}>
          <label className={LABEL}>{field.name}{field.required && <span className="text-[#f2545b] ml-0.5">*</span>}</label>
          <textarea name={`cf_${field.key}`} required={field.required} className={`${INPUT} h-auto min-h-[80px] py-2 resize-y`} />
        </div>
      );
    }
    return (
      <div key={key}>
        <label className={LABEL}>{field.name}{field.required && <span className="text-[#f2545b] ml-0.5">*</span>}</label>
        <input name={`cf_${field.key}`} type={field.type === "url" ? "url" : field.type || "text"} required={field.required} className={INPUT} />
      </div>
    );
  };

  const SECTION_LABEL: Record<string, string> = {
    core: "Basic Info",
    pipeline: "Pipeline",
    associations: "Associations",
    financials: "Value & Ownership",
    custom: "Additional Info",
    other: "Other Info",
  };

  const sectionForKey = (key: string): string => {
    if (key.startsWith("cf:")) return "custom";
    if (["title", "pricingType", "dealValue", "contractMonths"].includes(key)) return "core";
    if (["pipeline", "stage", "probability", "expectedClosureDate", "closedDate", "nextStep", "status"].includes(key)) return "pipeline";
    if (["organization", "contactPerson"].includes(key)) return "associations";
    if (["expectedDealValue", "dealOwner", "currency"].includes(key)) return "financials";
    return "other";
  };

  // Ensure pricing fields appear even if older localStorage layouts omit them.
  let keys = [...visibleKeys];
  if (canViewCrmRevenue) {
    if (!keys.includes("pricingType")) {
      const amountIdx = keys.indexOf("dealValue");
      keys.splice(amountIdx >= 0 ? amountIdx : 1, 0, "pricingType");
    }
    if (!keys.includes("contractMonths")) {
      const amountIdx = keys.indexOf("dealValue");
      keys.splice(amountIdx >= 0 ? amountIdx + 1 : keys.length, 0, "contractMonths");
    }
  } else {
    keys = keys.filter(
      (k) =>
        k !== "dealValue" &&
        k !== "expectedDealValue" &&
        k !== "pricingType" &&
        k !== "contractMonths" &&
        k !== "currency" &&
        k !== "exchangeRate",
    );
  }

  if (variant === "grid") {
    const nodes = keys.map((key) =>
      key.startsWith("cf:") ? renderCustomField(key) : renderField(key)
    );
    return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{nodes}</div>;
  }

  // Stack: group fields under compact section labels
  const groups: { section: string; keys: string[] }[] = [];
  for (const key of keys) {
    const sec = sectionForKey(key);
    const last = groups[groups.length - 1];
    if (last && last.section === sec) {
      last.keys.push(key);
    } else {
      groups.push({ section: sec, keys: [key] });
    }
  }

  return (
    <div className="space-y-3">
      {groups.map((group, idx) => (
        <CrmFormSection
          key={`${group.section}-${idx}`}
          title={SECTION_LABEL[group.section]}
          defaultOpen={idx === 0}
        >
          <CrmFormGrid>
            {group.keys.map((key) => {
              const node = key.startsWith("cf:") ? renderCustomField(key) : renderField(key);
              if (key.startsWith("cf:") || key === "title" || key === "nextStep" || key === "description") {
                return (
                  <div key={key} className="sm:col-span-2">
                    {node}
                  </div>
                );
              }
              return node;
            })}
          </CrmFormGrid>
        </CrmFormSection>
      ))}
    </div>
  );
}
