"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, ChevronRight, Loader2, Save, X } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  fetchSalesAgentSettings,
  fetchSalesAgentStatus,
  updateSalesAgentSettings,
  type SalesAgentSettings,
} from "@/lib/crm/sales-agent";

type PipelineOption = { _id: string; name: string; type?: string };

function pipelineId(p: PipelineOption): string {
  return String(p._id);
}

export default function SalesAgentSettingsPage() {
  const [settings, setSettings] = useState<SalesAgentSettings | null>(null);
  const [leadPipelines, setLeadPipelines] = useState<PipelineOption[]>([]);
  const [dealPipelines, setDealPipelines] = useState<PipelineOption[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoApproveStagesText, setAutoApproveStagesText] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const token = getCrmAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      try {
        const [status, s, leadRes, dealRes] = await Promise.all([
          fetchSalesAgentStatus(),
          fetchSalesAgentSettings(),
          fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, { headers }),
          fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, { headers }),
        ]);
        setConfigured(status.configured);
        setSettings(s);
        setAutoApproveStagesText((s.autoApproveStageNames || []).join(", "));
        if (leadRes.ok) setLeadPipelines(await leadRes.json());
        if (dealRes.ok) setDealPipelines(await dealRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const autoApproveStageNames = autoApproveStagesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateSalesAgentSettings({
        ...settings,
        autoApproveStageNames,
      });
      setSettings(updated);
      setMessage("Settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [settings, autoApproveStagesText]);

  const toggle = (key: keyof SalesAgentSettings) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const togglePipeline = (kind: "lead" | "deal", id: string) => {
    if (!settings) return;
    const key = kind === "lead" ? "enabledLeadPipelineIds" : "enabledDealPipelineIds";
    const current = (settings[key] || []).map(String);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setSettings({ ...settings, [key]: next });
  };

  const selectAllPipelines = (kind: "lead" | "deal") => {
    if (!settings) return;
    const key = kind === "lead" ? "enabledLeadPipelineIds" : "enabledDealPipelineIds";
    const list = kind === "lead" ? leadPipelines : dealPipelines;
    setSettings({ ...settings, [key]: list.map(pipelineId) });
  };

  const clearPipelines = (kind: "lead" | "deal") => {
    if (!settings) return;
    const key = kind === "lead" ? "enabledLeadPipelineIds" : "enabledDealPipelineIds";
    setSettings({ ...settings, [key]: [] });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!settings) {
    return <p className="p-8 text-sm text-red-600">{error || "Settings unavailable"}</p>;
  }

  const renderPipelineGroup = (
    kind: "lead" | "deal",
    label: string,
    pipelines: PipelineOption[],
    selected: string[],
  ) => (
    <fieldset className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-medium text-[var(--text-main)]">{label}</legend>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => selectAllPipelines(kind)}
            className="text-violet-600 hover:underline"
          >
            Select all
          </button>
          <span className="text-[var(--text-muted)]">·</span>
          <button
            type="button"
            onClick={() => clearPipelines(kind)}
            className="text-[var(--text-muted)] hover:underline"
          >
            All pipelines (default)
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Leave none selected to allow agents on every {kind} pipeline. Select specific pipelines to
        limit scope.
      </p>
      {pipelines.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No {kind} pipelines found.</p>
      ) : (
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border-color)] p-3">
          {pipelines.map((p) => {
            const id = pipelineId(p);
            const checked = selected.map(String).includes(id);
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[var(--background)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePipeline(kind, id)}
                  className="h-4 w-4"
                />
                <span>{p.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/crm/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
      >
        <ChevronRight className="h-4 w-4 rotate-180" /> CRM settings
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-violet-500/10 text-violet-600">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales agents</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Supervised AI agents for outreach, qualification, and closing.
          </p>
        </div>
      </div>

      {configured === false && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ANTHROPIC_API_KEY is not configured. Agent runs will fail until AI is enabled on the server.
        </p>
      )}

      <div className="space-y-6 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-6">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium text-[var(--text-main)]">Enable sales agents</span>
            <span className="text-sm text-[var(--text-muted)]">Master switch for agent runs and cron.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={() => toggle("enabled")}
            className="h-5 w-5"
          />
        </label>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">Scheduled scan (every 15 min)</span>
            <span className="text-sm text-[var(--text-muted)]">Process sales attention queue automatically.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.cronEnabled}
            onChange={() => toggle("cronEnabled")}
            className="h-5 w-5"
          />
        </label>

        <fieldset className="space-y-3 border-t border-[var(--border-color)] pt-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Triggers
          </legend>
          {(
            [
              ["triggerOnLeadCreated", "New lead created"],
              ["triggerOnEmailReply", "Email reply received"],
              ["triggerOnNeverContacted", "Never contacted (cron)"],
              ["triggerOnReplyAwaiting", "Reply awaiting response (cron)"],
              ["triggerOnStaleLeads", "Stale leads needing follow-up (cron)"],
              ["triggerOnWebsiteInbound", "Website lead converted"],
              ["triggerOnChatInbound", "Website chat with visitor email"],
              ["resumeAfterApproval", "Resume agent after approval"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </fieldset>

        <div className="space-y-4 border-t border-[var(--border-color)] pt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Pipeline scope
          </p>
          {renderPipelineGroup(
            "lead",
            "Lead pipelines",
            leadPipelines,
            settings.enabledLeadPipelineIds || [],
          )}
          {renderPipelineGroup(
            "deal",
            "Deal pipelines",
            dealPipelines,
            settings.enabledDealPipelineIds || [],
          )}
        </div>

        <label className="block border-t border-[var(--border-color)] pt-4 text-sm">
          <span className="font-medium">Auto-approve stage names</span>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Comma-separated stage names agents may move to without approval (e.g. Contacted,
            Qualified).
          </p>
          <input
            type="text"
            value={autoApproveStagesText}
            onChange={(e) => setAutoApproveStagesText(e.target.value)}
            placeholder="Contacted, Qualified, Discovery"
            className="mt-2 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Default agent role</span>
          <select
            value={settings.defaultAgentRole || "sales"}
            onChange={(e) =>
              setSettings({ ...settings, defaultAgentRole: e.target.value })
            }
            className="mt-1 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
          >
            <option value="sales">General sales</option>
            <option value="sdr">SDR (outreach)</option>
            <option value="qualification">Qualification</option>
            <option value="ae">Account executive</option>
            <option value="renewal">Client success / renewal</option>
          </select>
        </label>

        <div className="grid gap-4 border-t border-[var(--border-color)] pt-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Max runs per cron tick</span>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.maxRunsPerCronTick}
              onChange={(e) =>
                setSettings({ ...settings, maxRunsPerCronTick: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Cooldown (hours)</span>
            <input
              type="number"
              min={1}
              value={settings.cooldownHours}
              onChange={(e) =>
                setSettings({ ...settings, cooldownHours: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Max emails per day</span>
            <input
              type="number"
              min={1}
              value={settings.maxEmailsPerDay}
              onChange={(e) =>
                setSettings({ ...settings, maxEmailsPerDay: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Max emails per run</span>
            <input
              type="number"
              min={1}
              value={settings.maxEmailsPerRun}
              onChange={(e) =>
                setSettings({ ...settings, maxEmailsPerRun: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-[var(--border-color)] px-3 py-2"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-[var(--border-color)] pt-4">
          <Link
            href="/crm/agents/inbox"
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold hover:bg-[var(--background)]"
          >
            Open approval inbox
          </Link>
          <Link
            href="/crm/reports"
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold hover:bg-[var(--background)]"
          >
            View reports
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        </div>

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
