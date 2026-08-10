"use client";

import Link from "next/link";
import { Building2, Loader2, Save, User } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export type ProposalAiSettingsForm = {
  enabled: boolean;
  defaultIssuerProfile: "agency" | "freelancer";
  useSharedOutreachContext: boolean;
  agencyName: string;
  agencyIntro: string;
  agencyServices: string;
  agencyDifferentiators: string;
  agencyPaymentTerms: string;
  agencyTechStack: string;
  agencyPortfolio: string;
  freelancerName: string;
  freelancerIntro: string;
  freelancerServices: string;
  freelancerDifferentiators: string;
  freelancerPaymentTerms: string;
  freelancerTechStack: string;
  freelancerPortfolio: string;
  tonePreset: string;
  sectionOutline: string;
  mustInclude: string;
  mustAvoid: string;
  additionalContext: string;
  updatedAt?: string;
  apiKeyConfigured?: boolean;
  settingsPersisted?: boolean;
};

const TONE_OPTIONS = [
  { value: "consultative", label: "Consultative" },
  { value: "direct", label: "Direct & concise" },
  { value: "warm", label: "Warm & personable" },
  { value: "formal", label: "Formal / enterprise" },
];

const inputCls = "w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm";
const textareaCls = "min-h-[88px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm";

type Props = {
  form: ProposalAiSettingsForm;
  canWrite: boolean;
  saving: boolean;
  applyingMathionix?: boolean;
  profileTab: "agency" | "freelancer";
  onProfileTab: (tab: "agency" | "freelancer") => void;
  onChange: (patch: Partial<ProposalAiSettingsForm>) => void;
  onSave: () => void;
  onApplyMathionixDefaults?: () => void;
};

export function AiProposalSettingsForm({
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
  const nameKey = p === "agency" ? "agencyName" : "freelancerName";
  const introKey = p === "agency" ? "agencyIntro" : "freelancerIntro";
  const servicesKey = p === "agency" ? "agencyServices" : "freelancerServices";
  const diffKey = p === "agency" ? "agencyDifferentiators" : "freelancerDifferentiators";
  const payKey = p === "agency" ? "agencyPaymentTerms" : "freelancerPaymentTerms";
  const techKey = p === "agency" ? "agencyTechStack" : "freelancerTechStack";
  const portKey = p === "agency" ? "agencyPortfolio" : "freelancerPortfolio";

  return (
    <div className="space-y-6 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-card p-6 shadow-sm">
      {form.settingsPersisted === false ? (
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load saved settings from the database.
        </div>
      ) : null}
      {form.apiKeyConfigured === false ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-4 py-3 text-sm text-text-muted">
          <strong className="text-text-main">AI drafts need ANTHROPIC_API_KEY</strong> on the API server.
        </div>
      ) : null}

      <div className="flex gap-3 border-b border-[var(--border-color)] pb-4">
        <Checkbox
          id="proposal-ai-enabled"
          checked={form.enabled}
          disabled={!canWrite}
          onCheckedChange={(v) => onChange({ enabled: v === true })}
          className="mt-1"
        />
        <div>
          <Label htmlFor="proposal-ai-enabled" className="text-base font-semibold">
            Enable AI proposal drafting
          </Label>
          <p className="text-xs text-text-muted mt-1">
            Powers &quot;Draft with AI&quot; on CRM → Proposals.
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
          checked={form.useSharedOutreachContext}
          disabled={!canWrite}
          onCheckedChange={(v) => onChange({ useSharedOutreachContext: v === true })}
          className="mt-1"
        />
        <div>
          <Label htmlFor="shared-outreach">Merge AI outreach settings when empty</Label>
          <p className="text-xs text-text-muted mt-1">
            Pulls company name and services from{" "}
            <Link href="/crm/settings/ai-outreach" className="text-primary underline">
              AI outreach
            </Link>{" "}
            for unfilled fields.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--border-color)]">
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
          ? "Proposals use we/our voice, company branding, and team positioning."
          : "Proposals use I/my voice and solo-consultant positioning."}
      </p>

      <div className="grid gap-2">
        <Label>{p === "agency" ? "Company name" : "Your name / brand"}</Label>
        <input
          className={inputCls}
          value={form[nameKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [nameKey]: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Introduction</Label>
        <textarea
          className={textareaCls}
          value={form[introKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [introKey]: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Services offered</Label>
        <textarea
          className={textareaCls}
          value={form[servicesKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [servicesKey]: e.target.value })}
          placeholder="Cloud, mobile apps, DevOps, managed services…"
        />
      </div>
      <div className="grid gap-2">
        <Label>Differentiators</Label>
        <textarea
          className={textareaCls}
          value={form[diffKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [diffKey]: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Payment terms & bank details</Label>
        <textarea
          className={textareaCls}
          value={form[payKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [payKey]: e.target.value })}
          placeholder="Milestone %, bank/UPI, validity…"
        />
      </div>
      <div className="grid gap-2">
        <Label>Default tech stack</Label>
        <textarea
          className={textareaCls}
          value={form[techKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [techKey]: e.target.value })}
          placeholder="One per line: Mobile: React Native…"
        />
      </div>
      <div className="grid gap-2">
        <Label>Portfolio / case studies</Label>
        <textarea
          className={textareaCls}
          value={form[portKey]}
          disabled={!canWrite}
          onChange={(e) => onChange({ [portKey]: e.target.value })}
        />
      </div>

      <div className="border-t border-[var(--border-color)] pt-4 space-y-4">
        <p className="text-sm font-semibold text-text-main">Document structure & guardrails</p>
        <div className="grid gap-2">
          <Label>Section outline (one per line)</Label>
          <textarea
            className={textareaCls}
            value={form.sectionOutline}
            disabled={!canWrite}
            onChange={(e) => onChange({ sectionOutline: e.target.value })}
            placeholder={"1. Introduction\n2. Project overview\n3. Scope…"}
          />
        </div>
        <div className="grid gap-2">
          <Label>Usually include</Label>
          <textarea
            className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
            value={form.mustInclude}
            disabled={!canWrite}
            onChange={(e) => onChange({ mustInclude: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Avoid saying</Label>
          <textarea
            className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
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
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save settings
          </button>
          {onApplyMathionixDefaults ? (
            <button
              type="button"
              onClick={onApplyMathionixDefaults}
              disabled={saving || applyingMathionix}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-5 py-2.5 text-sm font-semibold text-text-main hover:bg-[var(--surface-dim)] disabled:opacity-60"
            >
              {applyingMathionix ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}
              Load 2Bigha defaults
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
