"use client";

import Link from "next/link";
import { Building2, Loader2, Save, User } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type ContractAiSettingsForm = {
  enabled: boolean;
  defaultIssuerProfile: "agency" | "freelancer";
  useSharedProposalContext: boolean;
  agencyLegalName: string;
  agencyRegisteredAddress: string;
  agencySignatoryName: string;
  agencySignatoryTitle: string;
  agencyGstOrReg: string;
  agencyStandardClauses: string;
  freelancerLegalName: string;
  freelancerAddress: string;
  freelancerIdDocument: string;
  freelancerStandardClauses: string;
  governingLaw: string;
  tonePreset: string;
  contractSectionOutline: string;
  mustInclude: string;
  mustAvoid: string;
  additionalContext: string;
  updatedAt?: string;
  apiKeyConfigured?: boolean;
  settingsPersisted?: boolean;
};

const TONE_OPTIONS = [
  { value: "formal", label: "Formal / legal (recommended)" },
  { value: "consultative", label: "Consultative" },
  { value: "direct", label: "Direct" },
  { value: "warm", label: "Warm" },
];

const inputCls = "w-full rounded-[3px] border border-[#dfe1e6] bg-white px-3 py-2 text-sm";
const textareaCls = "min-h-[88px] w-full rounded-[3px] border border-[#dfe1e6] bg-white px-3 py-2 text-sm";

type Props = {
  form: ContractAiSettingsForm;
  canWrite: boolean;
  saving: boolean;
  applyingMathionix?: boolean;
  profileTab: "agency" | "freelancer";
  onProfileTab: (tab: "agency" | "freelancer") => void;
  onChange: (patch: Partial<ContractAiSettingsForm>) => void;
  onSave: () => void;
  onApplyMathionixDefaults?: () => void;
};

export function AiContractSettingsForm({
  form,
  canWrite,
  saving,
  profileTab,
  onProfileTab,
  onChange,
  onSave,
  applyingMathionix = false,
  onApplyMathionixDefaults,
}: Props) {
  const p = profileTab;
  const clausesKey = p === "agency" ? "agencyStandardClauses" : "freelancerStandardClauses";

  return (
    <div className="space-y-6 rounded-[24px] border border-[#ebecf0] bg-card p-6 shadow-sm">
      {form.settingsPersisted === false ? (
        <div className="rounded-[3px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load saved settings from the database.
        </div>
      ) : null}
      {form.apiKeyConfigured === false ? (
        <div className="rounded-[3px] border border-[#dfe1e6] bg-[#f4f5f7] px-4 py-3 text-sm text-text-muted">
          <strong className="text-text-main">AI drafts need ANTHROPIC_API_KEY</strong> on the API server.
        </div>
      ) : null}

      <div className="flex gap-3 border-b border-[#ebecf0] pb-4">
        <Checkbox
          id="contract-ai-enabled"
          checked={form.enabled}
          disabled={!canWrite}
          onCheckedChange={(v) => onChange({ enabled: v === true })}
          className="mt-1"
        />
        <div>
          <Label htmlFor="contract-ai-enabled" className="text-base font-semibold">
            Enable AI contract drafting
          </Label>
          <p className="text-xs text-text-muted mt-1">
            Draft service agreements from CRM → Proposals (contract kind).
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Default issuer profile</Label>
          <select
            className={inputCls}
            value={form.defaultIssuerProfile}
            disabled={!canWrite}
            onChange={(e) =>
              onChange({
                defaultIssuerProfile: e.target.value as "agency" | "freelancer",
              })
            }
          >
            <option value="agency">Agency / company</option>
            <option value="freelancer">Freelancer / solo</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label>Tone</Label>
          <select
            className={inputCls}
            value={form.tonePreset}
            disabled={!canWrite}
            onChange={(e) => onChange({ tonePreset: e.target.value })}
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <Checkbox
          id="shared-outreach"
          checked={form.useSharedProposalContext}
          disabled={!canWrite}
          onCheckedChange={(v) => onChange({ useSharedProposalContext: v === true })}
          className="mt-1"
        />
        <div>
          <Label htmlFor="shared-outreach">Merge AI proposal drafter settings when empty</Label>
          <p className="text-xs text-text-muted mt-1">
            Uses company name from{" "}
            <Link href="/crm/settings/ai-proposal" className="text-primary underline">
              AI proposal drafter
            </Link>{" "}
            for unfilled legal fields.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#ebecf0]">
        <button
          type="button"
          onClick={() => onProfileTab("agency")}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
            profileTab === "agency"
              ? "border-primary text-primary"
              : "border-transparent text-text-muted"
          }`}
        >
          <Building2 size={14} /> Agency profile
        </button>
        <button
          type="button"
          onClick={() => onProfileTab("freelancer")}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
            profileTab === "freelancer"
              ? "border-primary text-primary"
              : "border-transparent text-text-muted"
          }`}
        >
          <User size={14} /> Freelancer profile
        </button>
      </div>

      <p className="text-xs text-text-muted -mt-2">
        {p === "agency"
          ? "Agency MSA / SOW — Service Provider is the company."
          : "Freelancer agreement — Service Provider is the individual."}
      </p>

      <div className="grid gap-2">
        <Label>{p === "agency" ? "Legal entity name" : "Legal name"}</Label>
        <input
          className={inputCls}
          value={p === "agency" ? form.agencyLegalName : form.freelancerLegalName}
          disabled={!canWrite}
          onChange={(e) =>
            onChange(
              p === "agency"
                ? { agencyLegalName: e.target.value }
                : { freelancerLegalName: e.target.value },
            )
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>{p === "agency" ? "Registered address" : "Address"}</Label>
        <textarea
          className={textareaCls}
          value={p === "agency" ? form.agencyRegisteredAddress : form.freelancerAddress}
          disabled={!canWrite}
          onChange={(e) =>
            onChange(
              p === "agency"
                ? { agencyRegisteredAddress: e.target.value }
                : { freelancerAddress: e.target.value },
            )
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>{p === "agency" ? "GST / registration (optional)" : "ID document (optional)"}</Label>
        <input
          className={inputCls}
          value={p === "agency" ? form.agencyGstOrReg : form.freelancerIdDocument}
          disabled={!canWrite}
          onChange={(e) =>
            onChange(
              p === "agency"
                ? { agencyGstOrReg: e.target.value }
                : { freelancerIdDocument: e.target.value },
            )
          }
          placeholder={p === "agency" ? "GSTIN, CIN, etc." : "PAN, passport, etc."}
        />
      </div>
      {p === "agency" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Signatory name</Label>
            <input
              className={inputCls}
              value={form.agencySignatoryName}
              disabled={!canWrite}
              onChange={(e) => onChange({ agencySignatoryName: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Signatory title</Label>
            <input
              className={inputCls}
              value={form.agencySignatoryTitle}
              disabled={!canWrite}
              onChange={(e) => onChange({ agencySignatoryTitle: e.target.value })}
            />
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label>Standard clauses (IP, confidentiality, liability…)</Label>
        <textarea
          className={textareaCls}
          value={form[clausesKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [clausesKey]: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Governing law & jurisdiction</Label>
        <input
          className={inputCls}
          value={form.governingLaw}
          disabled={!canWrite}
          onChange={(e) => onChange({ governingLaw: e.target.value })}
          placeholder="e.g. Laws of India; courts at Bengaluru"
        />
      </div>

      <div className="rounded-[3px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        AI-generated contracts are templates for review only — not legal advice. Have qualified counsel review before
        signing.
      </div>

      <div className="border-t border-[#ebecf0] pt-4 space-y-4">
        <p className="text-sm font-semibold text-text-main">Document structure & guardrails</p>
        <div className="grid gap-2">
          <Label>Section outline (one per line)</Label>
          <textarea
            className={textareaCls}
            value={form.contractSectionOutline}
            disabled={!canWrite}
            onChange={(e) => onChange({ contractSectionOutline: e.target.value })}
            placeholder={"1. Parties\n2. Definitions\n3. Scope of services\n4. Fees & payment…"}
          />
        </div>
        <div className="grid gap-2">
          <Label>Usually include</Label>
          <textarea
            className="min-h-[72px] w-full rounded-[3px] border border-[#dfe1e6] bg-white px-3 py-2 text-sm"
            value={form.mustInclude}
            disabled={!canWrite}
            onChange={(e) => onChange({ mustInclude: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Avoid saying</Label>
          <textarea
            className="min-h-[72px] w-full rounded-[3px] border border-[#dfe1e6] bg-white px-3 py-2 text-sm"
            value={form.mustAvoid}
            disabled={!canWrite}
            onChange={(e) => onChange({ mustAvoid: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Extra instructions</Label>
          <textarea
            className={textareaCls}
            value={form.additionalContext}
            disabled={!canWrite}
            onChange={(e) => onChange({ additionalContext: e.target.value })}
          />
        </div>
      </div>

      {form.updatedAt ? (
        <p className="text-xs text-text-muted">
          Last updated:{" "}
          {new Date(form.updatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || applyingMathionix}
            className="inline-flex items-center justify-center gap-2 rounded-[3px] bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save settings
          </button>
          {onApplyMathionixDefaults ? (
            <button
              type="button"
              onClick={onApplyMathionixDefaults}
              disabled={saving || applyingMathionix}
              className="inline-flex items-center justify-center gap-2 rounded-[3px] border border-[#dfe1e6] bg-white px-5 py-2.5 text-sm font-semibold text-text-main hover:bg-[#f4f5f7] disabled:opacity-60"
            >
              {applyingMathionix ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}
              Load Mathionix defaults
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-amber-700">
          View only — need <strong>settings:write</strong> to edit.
        </p>
      )}
    </div>
  );
}
