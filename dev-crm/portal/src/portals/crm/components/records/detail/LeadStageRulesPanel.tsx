"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Eye,
  GitBranch,
  Loader2,
  MailOpen,
  Reply,
  Settings2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import type {
  LeadEngagementAutomationRules,
  LeadEngagementTemplate,
} from "@/lib/crm/lead-engagement-automation";

type PipelineTemplateResponse = {
  pipelineId: string;
  pipelineName: string;
  templateId: string | null;
  templateName: string | null;
  template: LeadEngagementTemplate | null;
};

type RunItemResult = {
  leadId: string;
  leadName?: string;
  currentStage?: string;
  moved: boolean;
  reason: string;
  ruleLabel?: string;
  newStage?: string;
  targetPipelineName?: string;
  error?: string;
};

type RunResponse = {
  processed: number;
  moved: number;
  dryRun?: boolean;
  results: RunItemResult[];
};

const REASON_LABEL: Record<string, string> = {
  email_open: "Email opened",
  reply: "Client replied",
  stage_rule: "Property rule",
  none: "—",
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  pipelineName: string;
  selectedLeadIds: string[];
  canEditRules: boolean;
  onApplied: () => void;
};

function ruleTargetLabel(
  rules: LeadEngagementAutomationRules,
  key: keyof LeadEngagementAutomationRules,
): string {
  const rule = rules[key];
  if (!rule || typeof rule !== "object") return "";
  if ("stageNameInTargetPipeline" in rule && rule.stageNameInTargetPipeline) {
    const pipe =
      "pipelineName" in rule && rule.pipelineName
        ? `${rule.pipelineName} → `
        : "";
    return `${pipe}${rule.stageNameInTargetPipeline}`;
  }
  if ("stageName" in rule && rule.stageName) return String(rule.stageName);
  if ("stageNamePattern" in rule && rule.stageNamePattern) {
    return String(rule.stageNamePattern);
  }
  return "";
}

export default function LeadStageRulesPanel({
  isOpen,
  onClose,
  pipelineId,
  pipelineName,
  selectedLeadIds,
  canEditRules,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [savingToggle, setSavingToggle] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [templateInfo, setTemplateInfo] =
    useState<PipelineTemplateResponse | null>(null);
  const [preview, setPreview] = useState<RunResponse | null>(null);

  const scopeLabel = useMemo(() => {
    if (selectedLeadIds.length > 0) {
      return `${selectedLeadIds.length} selected lead(s)`;
    }
    return `all leads in ${pipelineName}`;
  }, [selectedLeadIds.length, pipelineName]);

  const loadTemplate = useCallback(async () => {
    if (!pipelineId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/for-pipeline/${pipelineId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setTemplateInfo(null);
        return;
      }
      const data = (await res.json()) as PipelineTemplateResponse;
      setTemplateInfo(data);
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    if (isOpen) {
      setPreview(null);
      void loadTemplate();
    }
  }, [isOpen, loadTemplate]);

  const runRules = async (dryRun: boolean) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (dryRun) setPreviewing(true);
    else setApplying(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            leadIds:
              selectedLeadIds.length > 0 ? selectedLeadIds : undefined,
            pipelineId:
              selectedLeadIds.length > 0 ? undefined : pipelineId,
            includeEngagementReconcile: true,
            dryRun,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as RunResponse & {
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message || "Could not run stage rules");
        return;
      }
      if (dryRun) {
        setPreview(data);
        toast.success(
          data.moved > 0
            ? `Preview: ${data.moved} of ${data.processed} lead(s) would move`
            : `Preview: none of ${data.processed} lead(s) would move`,
        );
      } else {
        setPreview(null);
        toast.success(
          data.moved > 0
            ? `Moved ${data.moved} of ${data.processed} lead(s)`
            : `Checked ${data.processed} lead(s); no moves needed`,
        );
        if (data.moved > 0) onApplied();
        onClose();
      }
    } catch {
      toast.error("Could not run stage rules");
    } finally {
      setPreviewing(false);
      setApplying(false);
    }
  };

  const toggleEventRule = async (
    key: "onEmailOpened" | "onReply" | "onFollowUpSent" | "onFollowUpSequenceComplete",
    enabled: boolean,
  ) => {
    const templateId = templateInfo?.templateId;
    if (!templateId || !canEditRules) return;
    setSavingToggle(key);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/${templateId}/rule-toggles`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ [key]: enabled }),
        },
      );
      if (!res.ok) {
        toast.error("Could not update rule");
        return;
      }
      await loadTemplate();
    } finally {
      setSavingToggle(null);
    }
  };

  const toggleStageRule = async (ruleId: string, enabled: boolean) => {
    const templateId = templateInfo?.templateId;
    if (!templateId || !canEditRules) return;
    setSavingToggle(ruleId);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/${templateId}/rule-toggles`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ stageRules: { [ruleId]: enabled } }),
        },
      );
      if (!res.ok) {
        toast.error("Could not update rule");
        return;
      }
      await loadTemplate();
    } finally {
      setSavingToggle(null);
    }
  };

  const rules = templateInfo?.template?.rules;
  const templateDisabled = templateInfo?.template?.enabled === false;
  const previewMoves = (preview?.results || []).filter((r) => r.moved);

  return (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title="Stage automation"
      subtitle={`${pipelineName} · ${scopeLabel}`}
      maxWidthClass="max-w-xl"
      headerTone="hubspot"
      contentClassName="p-6"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-border bg-card/80">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-text-muted hover:bg-surface-dim"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={previewing || !templateInfo?.templateId || templateDisabled}
            onClick={() => void runRules(true)}
            className="inline-flex h-9 items-center gap-1.5 px-4 rounded-lg border border-border text-sm font-semibold text-text-main hover:bg-surface-dim disabled:opacity-40"
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview moves
          </button>
          <button
            type="button"
            disabled={applying || !templateInfo?.templateId || templateDisabled}
            onClick={() => void runRules(false)}
            className="inline-flex h-9 items-center gap-1.5 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Apply rules
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-text-muted flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading rules…
        </p>
      ) : !templateInfo?.templateId || !rules ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">No automation template assigned</p>
          <p className="mt-1 text-xs leading-relaxed">
            Assign a lead email automation template to this pipeline in{" "}
            <Link
              href="/crm/settings/workflows"
              className="font-semibold underline underline-offset-2"
            >
              Settings → Workflows
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-main">
                {templateInfo.templateName}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Event rules run automatically; use preview before applying manually.
              </p>
            </div>
            <Link
              href="/crm/settings/workflows"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Edit all
            </Link>
          </div>

          {templateDisabled ? (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              This template is disabled. Enable it in workflow settings to run rules.
            </p>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
              Event rules
            </h3>
            <ul className="space-y-1.5">
              {rules.onEmailOpened ? (
                <RuleToggleRow
                  icon={<MailOpen className="h-3.5 w-3.5" />}
                  label="On email open"
                  detail={ruleTargetLabel(rules, "onEmailOpened")}
                  enabled={rules.onEmailOpened.enabled !== false}
                  disabled={!canEditRules || savingToggle === "onEmailOpened"}
                  onChange={(v) => void toggleEventRule("onEmailOpened", v)}
                />
              ) : null}
              {rules.onReply ? (
                <RuleToggleRow
                  icon={<Reply className="h-3.5 w-3.5" />}
                  label="On client reply"
                  detail={ruleTargetLabel(rules, "onReply")}
                  enabled={rules.onReply.enabled !== false}
                  disabled={!canEditRules || savingToggle === "onReply"}
                  onChange={(v) => void toggleEventRule("onReply", v)}
                />
              ) : null}
              {rules.onFollowUpSent?.stageNamePattern ? (
                <RuleToggleRow
                  icon={<GitBranch className="h-3.5 w-3.5" />}
                  label="On follow-up sent"
                  detail={ruleTargetLabel(rules, "onFollowUpSent")}
                  enabled={rules.onFollowUpSent.enabled !== false}
                  disabled={!canEditRules || savingToggle === "onFollowUpSent"}
                  onChange={(v) => void toggleEventRule("onFollowUpSent", v)}
                />
              ) : null}
              {rules.onFollowUpSequenceComplete ? (
                <RuleToggleRow
                  icon={<GitBranch className="h-3.5 w-3.5" />}
                  label="Sequence complete (no reply)"
                  detail={ruleTargetLabel(rules, "onFollowUpSequenceComplete")}
                  enabled={rules.onFollowUpSequenceComplete.enabled !== false}
                  disabled={
                    !canEditRules || savingToggle === "onFollowUpSequenceComplete"
                  }
                  onChange={(v) =>
                    void toggleEventRule("onFollowUpSequenceComplete", v)
                  }
                />
              ) : null}
            </ul>
          </div>

          {(rules.stageRules || []).length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">
                Property rules
              </h3>
              <ul className="space-y-1.5">
                {(rules.stageRules || []).map((rule) => (
                  <RuleToggleRow
                    key={rule.id}
                    icon={<Zap className="h-3.5 w-3.5" />}
                    label={rule.label?.trim() || `${rule.field} ${rule.operator}`}
                    subdetail={[
                      rule.target.pipelineName,
                      rule.target.stageNameInTargetPipeline ||
                        rule.target.stageName,
                    ]
                      .filter(Boolean)
                      .join(" → ")}
                    enabled={rule.enabled !== false}
                    disabled={!canEditRules || savingToggle === rule.id}
                    onChange={(v) => void toggleStageRule(rule.id, v)}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {preview ? (
            <div className="rounded-lg border border-border bg-surface-dim/40 p-3 space-y-2">
              <p className="text-xs font-bold text-text-main">
                Preview — {preview.moved} of {preview.processed} would move
              </p>
              {previewMoves.length === 0 ? (
                <p className="text-xs text-text-muted italic">
                  No leads would change stage with current rules.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border/60">
                        <th className="py-1 pr-2 font-semibold">Lead</th>
                        <th className="py-1 pr-2 font-semibold">Rule</th>
                        <th className="py-1 font-semibold">New stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewMoves.map((row) => (
                        <tr
                          key={row.leadId}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-1.5 pr-2 font-medium text-text-main truncate max-w-[120px]">
                            {row.leadName || row.leadId.slice(-6)}
                          </td>
                          <td className="py-1.5 pr-2 text-text-muted">
                            {row.ruleLabel || REASON_LABEL[row.reason] || row.reason}
                          </td>
                          <td className="py-1.5 text-text-main">
                            {row.newStage}
                            {row.targetPipelineName ? (
                              <span className="text-text-muted">
                                {" "}
                                · {row.targetPipelineName}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </CrmSlidePanelShell>
  );
}

function RuleToggleRow({
  icon,
  label,
  detail,
  subdetail,
  enabled,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  subdetail?: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const target = subdetail || detail;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border/60 bg-white px-3 py-2">
      <span className="text-primary shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text-main truncate">{label}</p>
        {target ? (
          <p className="text-[10px] text-text-muted truncate">→ {target}</p>
        ) : null}
      </div>
      <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer">
        <span className="text-[10px] font-semibold text-text-muted">
          {enabled ? "On" : "Off"}
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border"
        />
      </label>
    </li>
  );
}
