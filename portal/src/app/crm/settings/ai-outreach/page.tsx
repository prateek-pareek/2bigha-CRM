"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type OutreachAiSettings = {
  enabled: boolean;
  businessName: string;
  businessSummary: string;
  servicesOffered: string;
  idealClientProfile: string;
  tonePreset: string;
  signatureOrClosing: string;
  mustMention: string;
  avoidSaying: string;
  additionalSystemContext: string;
  anthropicModel: string;
  llmProvider?: string;
  llmModel?: string;
  updatedAt?: string;
  /** Server reports whether any LLM API key is set — app works fine if false. */
  apiKeyConfigured?: boolean;
  personDraftAvailable?: boolean;
  settingsPersisted?: boolean;
};

const EMPTY: OutreachAiSettings = {
  enabled: true,
  businessName: "",
  businessSummary: "",
  servicesOffered: "",
  idealClientProfile: "",
  tonePreset: "consultative",
  signatureOrClosing: "",
  mustMention: "",
  avoidSaying: "",
  additionalSystemContext: "",
  anthropicModel: "",
  llmProvider: "auto",
  llmModel: "",
};

const TONE_OPTIONS = [
  { value: "consultative", label: "Consultative (default for IT services)" },
  { value: "direct", label: "Direct & concise" },
  { value: "warm", label: "Warm & personable" },
  { value: "formal", label: "Formal / enterprise" },
];

export default function AiOutreachSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canRead =
    hasAccess("settings:read") || hasAccess("settings:write");
  const canWrite = hasAccess("settings:write");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OutreachAiSettings>(EMPTY);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ai/settings`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        toast.error("Could not load AI outreach settings");
        setForm(EMPTY);
        return;
      }
      const data = (await res.json()) as Partial<OutreachAiSettings>;
      setForm({
        enabled: data.enabled !== false,
        businessName: data.businessName ?? "",
        businessSummary: data.businessSummary ?? "",
        servicesOffered: data.servicesOffered ?? "",
        idealClientProfile: data.idealClientProfile ?? "",
        tonePreset: data.tonePreset || "consultative",
        signatureOrClosing: data.signatureOrClosing ?? "",
        mustMention: data.mustMention ?? "",
        avoidSaying: data.avoidSaying ?? "",
        additionalSystemContext: data.additionalSystemContext ?? "",
        anthropicModel: data.llmModel || data.anthropicModel || "",
        llmProvider: data.llmProvider || "auto",
        llmModel: data.llmModel || data.anthropicModel || "",
        updatedAt: data.updatedAt,
        apiKeyConfigured: data.apiKeyConfigured,
        personDraftAvailable: data.personDraftAvailable,
        settingsPersisted: data.settingsPersisted,
      });
    } catch {
      toast.error("Network error loading settings");
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ai/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(", ")
          : typeof data.message === "string"
            ? data.message
            : "Save failed";
        toast.error(msg);
        return;
      }
      if ((data as { saveFailed?: boolean }).saveFailed) {
        toast.error("Could not save to the database. Settings are shown from defaults.");
      } else {
        toast.success("AI outreach settings saved");
      }
      setForm((prev) => ({
        ...prev,
        ...(data as OutreachAiSettings),
      }));
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 py-8 text-center">
        <p className="text-text-muted">
          You need settings access to view AI outreach configuration.
        </p>
        <Link
          href="/crm/settings"
          className="text-primary font-semibold hover:underline"
        >
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div>
        <Link
          href="/crm/settings"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-primary"
        >
          <ChevronLeft size={16} />
          Settings
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <div className="rounded-[var(--radius-md)] bg-primary/10 p-3 text-primary">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">
              AI outreach (leads & contacts)
            </h1>
            <p className="mt-1 text-sm text-text-muted leading-relaxed">
              Configure how Claude drafts first-touch emails for your IT
              consulting business: positioning, services, tone, and guardrails.
              Everything here works without any AI env vars—the CRM keeps running;
              drafts only appear in the email composer when an LLM API key is set
              on the API server (
              <code className="rounded bg-slate-100 px-1 text-xs">ANTHROPIC_API_KEY</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">OPENAI_API_KEY</code>, or{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">GOOGLE_API_KEY</code>). Use{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">AI_LLM_PROVIDER</code> on the
              server or the provider setting below.
              Drafts automatically avoid the same spam trigger phrases used in
              the email composer spam checker (including an automatic rewrite if
              the first draft scores too low).
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] dark:border-slate-800 bg-card p-6 shadow-sm">
          {form.settingsPersisted === false ? (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Could not load saved settings from the database. You can still edit
              the defaults below; saves may fail until the database is available.
            </div>
          ) : null}
          {form.apiKeyConfigured === false ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] dark:border-slate-800 bg-[var(--surface-dim)] dark:bg-slate-900/50 px-4 py-3 text-sm text-text-muted">
              <strong className="text-text-main">AI drafts are off</strong> until
              your deployment sets an LLM API key (
              <code className="rounded bg-white dark:bg-slate-800 px-1 text-xs">
                ANTHROPIC_API_KEY
              </code>
              ,{' '}
              <code className="rounded bg-white dark:bg-slate-800 px-1 text-xs">
                OPENAI_API_KEY
              </code>
              , or{' '}
              <code className="rounded bg-white dark:bg-slate-800 px-1 text-xs">
                GOOGLE_API_KEY
              </code>
              ) on the API server.
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] dark:border-slate-800 pb-4">
            <div className="flex gap-3">
              <Checkbox
                id="ai-enabled"
                checked={form.enabled}
                disabled={!canWrite}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, enabled: v === true }))
                }
                className="mt-1"
              />
              <div>
                <Label htmlFor="ai-enabled" className="text-base font-semibold">
                  Enable AI drafting
                </Label>
                <p className="text-xs text-text-muted mt-1">
                  When off, “Draft with AI” in the email composer returns a clear
                  error for everyone.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Company / brand name</Label>
            <input
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-text-main"
              value={form.businessName}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, businessName: e.target.value }))
              }
              placeholder="e.g. Mathionix Technologies"
            />
          </div>

          <div className="grid gap-2">
            <Label>Positioning & context (IT consulting)</Label>
            <p className="text-xs text-text-muted">
              What you do, who you help, and how you want to sound to CIOs /
              engineering leaders. A strong default is seeded on first use.
            </p>
            <textarea
              className="min-h-[120px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.businessSummary}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, businessSummary: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Services & differentiators</Label>
            <textarea
              className="min-h-[100px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.servicesOffered}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, servicesOffered: e.target.value }))
              }
              placeholder="Cloud migration, managed SOC, product engineering, Salesforce, etc."
            />
          </div>

          <div className="grid gap-2">
            <Label>Ideal customer</Label>
            <textarea
              className="min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.idealClientProfile}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, idealClientProfile: e.target.value }))
              }
              placeholder="Industries, company size, regions, buyer roles…"
            />
          </div>

          <div className="grid gap-2">
            <Label>Tone preset</Label>
            <select
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.tonePreset}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, tonePreset: e.target.value }))
              }
            >
              {TONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Closing / CTA hint</Label>
            <textarea
              className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.signatureOrClosing}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, signatureOrClosing: e.target.value }))
              }
              placeholder="e.g. Offer a 20-min architecture review; mention calendar link if you use one."
            />
          </div>

          <div className="grid gap-2">
            <Label>Usually mention (when relevant)</Label>
            <textarea
              className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.mustMention}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, mustMention: e.target.value }))
              }
              placeholder="One point per line: security-first delivery, local presence, case study themes…"
            />
          </div>

          <div className="grid gap-2">
            <Label>Avoid saying</Label>
            <textarea
              className="min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.avoidSaying}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, avoidSaying: e.target.value }))
              }
              placeholder="e.g. “world-class”, “synergy”, guaranteed ROI…"
            />
          </div>

          <div className="grid gap-2">
            <Label>Extra instructions (always sent to the model)</Label>
            <textarea
              className="min-h-[80px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.additionalSystemContext}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  additionalSystemContext: e.target.value,
                }))
              }
              placeholder="Compliance notes, regions you serve, languages, etc."
            />
          </div>

          <div className="grid gap-2">
            <Label>LLM provider</Label>
            <select
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm"
              value={form.llmProvider || "auto"}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({ ...f, llmProvider: e.target.value }))
              }
            >
              <option value="auto">Auto (first configured key on server)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="google">Google (Gemini)</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Model ID (optional)</Label>
            <input
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 font-mono text-xs"
              value={form.llmModel || form.anthropicModel}
              disabled={!canWrite}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  llmModel: e.target.value,
                  anthropicModel: e.target.value,
                }))
              }
              placeholder="e.g. claude-sonnet-4-6, gpt-4o, gemini-2.0-flash — or leave empty for server default"
            />
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
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save settings
            </button>
          ) : (
            <p className="text-sm text-amber-700">
              You can view these settings but need{" "}
              <strong>settings:write</strong> to edit them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
