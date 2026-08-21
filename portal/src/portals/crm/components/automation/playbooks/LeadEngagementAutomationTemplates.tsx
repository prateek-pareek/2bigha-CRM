"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Save, Plus, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  DEFAULT_AUTO_FOLLOW_UP,
  DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS,
  buildRulesFromPipeline,
  followUpPatternToStageOption,
  leadPipelineStageNames,
  resolveRulesForPipeline,
  stageNameToFollowUpPattern,
  type LeadEngagementAutoFollowUp,
  type LeadEngagementAutoOutreach,
  type LeadEngagementAutomationRules,
  type LeadEngagementTemplate,
  type LeadPipelineOption,
  type LeadStageConditionRule,
  type PipelineAssignment,
  type SystemPresetMeta,
} from "@/lib/crm/lead-engagement-automation";

const DEFAULT_AUTO_OUTREACH: LeadEngagementAutoOutreach = {
  enabled: false,
  sendMode: "ai_draft",
  missingContextAction: "draft_anyway",
};

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30";
const SEL =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 appearance-none disabled:opacity-50";

const STAGE_RULE_FIELDS: { field: string; label: string }[] = [
  { field: "source", label: "Source" },
  { field: "stage", label: "Stage" },
  { field: "status", label: "Status" },
  { field: "industry", label: "Industry" },
  { field: "organization", label: "Organization" },
  { field: "leadOwner", label: "Owner" },
  { field: "leadType", label: "Lead type" },
  { field: "email", label: "Email" },
];

const STAGE_RULE_OPERATORS: { value: LeadStageConditionRule["operator"]; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is known" },
  { value: "in_list", label: "is any of (comma-separated)" },
];

function newStageRule(
  contextPipeline: LeadPipelineOption | undefined,
): LeadStageConditionRule {
  const stages = leadPipelineStageNames(contextPipeline);
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    label: "",
    onlyIfPipelineNames: contextPipeline?.name
      ? [contextPipeline.name]
      : undefined,
    onlyIfStages: [],
    field: "source",
    operator: "equals",
    value: "",
    target: { stageName: stages[0] || "" },
  };
}

type Props = {
  canEdit: boolean;
};

function rulesForPipeline(
  pipeline: LeadPipelineOption | undefined,
  allPipelines: LeadPipelineOption[],
  existing?: LeadEngagementAutomationRules,
): LeadEngagementAutomationRules {
  const base =
    existing && Object.keys(existing).length > 0
      ? existing
      : buildRulesFromPipeline(pipeline, allPipelines);
  return resolveRulesForPipeline(base, pipeline, allPipelines);
}

function StageSelect({
  value,
  stages,
  onChange,
  disabled,
  placeholder = "Select stage…",
}: {
  value: string;
  stages: string[];
  onChange: (stageName: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const legacy = value.trim() && !stages.includes(value.trim());
  return (
    <select
      className={SEL}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {stages.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      {legacy ? (
        <option value={value}>{value} (not on selected pipeline)</option>
      ) : null}
    </select>
  );
}

function resolveContextPipelineId(
  pipelines: LeadPipelineOption[],
  templateId: string | undefined,
  assignments: PipelineAssignment[],
): string {
  if (!pipelines.length) return "";
  if (templateId) {
    const assigned = assignments.find((a) => a.templateId === templateId);
    if (assigned && pipelines.some((p) => p._id === assigned.pipelineId)) {
      return assigned.pipelineId;
    }
  }
  const defaultPipe = pipelines.find((p) => p.isDefault);
  return defaultPipe?._id || pipelines[0]._id;
}

export default function LeadEngagementAutomationTemplates({ canEdit }: Props) {
  const [templates, setTemplates] = useState<LeadEngagementTemplate[]>([]);
  const [assignments, setAssignments] = useState<PipelineAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeadEngagementTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRules, setEditRules] = useState<LeadEngagementAutomationRules>({});
  const [editAutoFollowUp, setEditAutoFollowUp] =
    useState<LeadEngagementAutoFollowUp>({ ...DEFAULT_AUTO_FOLLOW_UP });
  const [editAutoOutreach, setEditAutoOutreach] =
    useState<LeadEngagementAutoOutreach>({ ...DEFAULT_AUTO_OUTREACH });
  const [emailTemplates, setEmailTemplates] = useState<
    { _id: string; name: string }[]
  >([]);
  const [systemPresets, setSystemPresets] = useState<SystemPresetMeta[]>([]);
  const [assignmentsLoadFailed, setAssignmentsLoadFailed] = useState(false);
  const [leadPipelines, setLeadPipelines] = useState<LeadPipelineOption[]>([]);
  const [rulesContextPipelineId, setRulesContextPipelineId] = useState("");
  const [prevRulesContextPipelineId, setPrevRulesContextPipelineId] =
    useState("");

  const parseJsonArray = async <T,>(res: Response): Promise<T[]> => {
    try {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

  const pipelinesToAssignments = (
    pipelines: LeadPipelineOption[],
  ): PipelineAssignment[] =>
    pipelines.map((p) => ({
      pipelineId: String(p._id),
      pipelineName: String(p.name),
      templateId: null,
      templateName: null,
    }));

  const load = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) return;
    setLoading(true);
    setAssignmentsLoadFailed(false);
    const headers = { Authorization: `Bearer ${t}` };
    let loadErrors = 0;

    const pipelinesRes = await fetch(
      `${CRM_API_URL}/crm/pipelines?type=leads`,
      { headers },
    );
    let pipelines: LeadPipelineOption[] = [];
    if (pipelinesRes.ok) {
      const raw = await parseJsonArray<LeadPipelineOption>(pipelinesRes);
      pipelines = raw.map((p) => ({
        _id: String(p._id),
        name: String(p.name),
        stages: Array.isArray(p.stages) ? p.stages : [],
        isDefault: !!p.isDefault,
      }));
      setLeadPipelines(pipelines);
    } else {
      loadErrors += 1;
    }

    try {
      const [tRes, aRes, pRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/lead-engagement-templates`, { headers }),
        fetch(
          `${CRM_API_URL}/crm/lead-engagement-templates/pipeline-assignments`,
          { headers },
        ),
        fetch(
          `${CRM_API_URL}/crm/lead-engagement-templates/system-presets`,
          { headers },
        ),
      ]);

      if (tRes.ok) {
        setTemplates(await parseJsonArray<LeadEngagementTemplate>(tRes));
      } else {
        loadErrors += 1;
      }
      if (pRes.ok) {
        setSystemPresets(await parseJsonArray<SystemPresetMeta>(pRes));
      }

      let assignmentRows: PipelineAssignment[] = [];
      if (aRes.ok) {
        assignmentRows = await parseJsonArray<PipelineAssignment>(aRes);
      } else {
        setAssignmentsLoadFailed(true);
        loadErrors += 1;
      }

      if (!assignmentRows.length && pipelines.length > 0) {
        assignmentRows = pipelinesToAssignments(pipelines);
        setAssignmentsLoadFailed(false);
      }

      setAssignments(assignmentRows);
    } catch {
      loadErrors += 1;
    }

    if (loadErrors > 0 && pipelines.length === 0) {
      toast.error(
        "Could not load lead automation. Restart the API server if you recently deployed.",
      );
    } else if (loadErrors > 0) {
      toast.error("Some lead automation data could not be loaded.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || rulesContextPipelineId || leadPipelines.length === 0) {
      return;
    }
    const id = resolveContextPipelineId(
      leadPipelines,
      editing._id,
      assignments,
    );
    setRulesContextPipelineId(id);
    setPrevRulesContextPipelineId(id);
  }, [editing, leadPipelines, assignments, rulesContextPipelineId]);

  useEffect(() => {
    if (
      !editing ||
      !rulesContextPipelineId ||
      rulesContextPipelineId === prevRulesContextPipelineId
    ) {
      return;
    }
    const pipe = leadPipelines.find((p) => p._id === rulesContextPipelineId);
    setEditRules((prev) =>
      resolveRulesForPipeline(prev, pipe, leadPipelines),
    );
    setPrevRulesContextPipelineId(rulesContextPipelineId);
  }, [
    editing,
    rulesContextPipelineId,
    prevRulesContextPipelineId,
    leadPipelines,
  ]);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return;
    void fetch(`${CRM_API_URL}/email-templates`, {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) =>
        setEmailTemplates(
          (Array.isArray(data) ? data : []).map(
            (x: { _id: string; name: string }) => ({
              _id: x._id,
              name: x.name,
            }),
          ),
        ),
      )
      .catch(() => setEmailTemplates([]));
  }, []);

  const cadenceDays =
    editAutoFollowUp.cadenceDays?.length
      ? editAutoFollowUp.cadenceDays
      : DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS;

  const openEdit = (tpl: LeadEngagementTemplate) => {
    const contextId = resolveContextPipelineId(
      leadPipelines,
      tpl._id,
      assignments,
    );
    const contextPipe = leadPipelines.find((p) => p._id === contextId);
    setEditing(tpl);
    setEditName(tpl.name);
    setEditDesc(tpl.description || "");
    setEditRules(rulesForPipeline(contextPipe, leadPipelines, tpl.rules));
    setRulesContextPipelineId(contextId);
    setPrevRulesContextPipelineId(contextId);
    setEditAutoOutreach({
      ...DEFAULT_AUTO_OUTREACH,
      ...tpl.autoOutreach,
    });
    setEditAutoFollowUp({
      ...DEFAULT_AUTO_FOLLOW_UP,
      ...tpl.autoFollowUp,
      cadenceDays:
        tpl.autoFollowUp?.cadenceDays?.length
          ? tpl.autoFollowUp.cadenceDays
          : [...DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS],
    });
  };

  const createFromPreset = async (presetKey: string) => {
    if (!canEdit || !presetKey) return;
    const t = localStorage.getItem("token");
    setSavingId("preset");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/from-preset`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ presetKey }),
        },
      );
      if (!res.ok) {
        toast.error("Could not create from preset");
        return;
      }
      toast.success("Template created from preset");
      void load();
    } finally {
      setSavingId(null);
    }
  };

  const openNew = () => {
    const contextId = resolveContextPipelineId(
      leadPipelines,
      undefined,
      assignments,
    );
    const contextPipe = leadPipelines.find((p) => p._id === contextId);
    const initialRules = rulesForPipeline(contextPipe, leadPipelines);
    setEditing({
      _id: "",
      name: "",
      description: "",
      enabled: true,
      rules: initialRules,
      autoFollowUp: { ...DEFAULT_AUTO_FOLLOW_UP },
      autoOutreach: { ...DEFAULT_AUTO_OUTREACH },
    });
    setEditName("My outreach automation");
    setEditAutoOutreach({ ...DEFAULT_AUTO_OUTREACH });
    setEditDesc("");
    setEditRules(initialRules);
    setRulesContextPipelineId(contextId);
    setPrevRulesContextPipelineId(contextId);
    setEditAutoFollowUp({ ...DEFAULT_AUTO_FOLLOW_UP });
  };

  const contextPipeline = leadPipelines.find(
    (p) => p._id === rulesContextPipelineId,
  );
  const contextStageNames = leadPipelineStageNames(contextPipeline);
  const replyPipeline = leadPipelines.find(
    (p) => p.name === (editRules.onReply?.pipelineName || "").trim(),
  );
  const replyStageNames = leadPipelineStageNames(replyPipeline);
  const followUpPattern = editRules.onFollowUpSent?.stageNamePattern || "";
  const followUpStageSelectValue = followUpPatternToStageOption(
    followUpPattern,
    contextStageNames,
  );

  const saveTemplate = async () => {
    if (!editing || !canEdit) return;
    const t = localStorage.getItem("token");
    const name = editName.trim();
    if (name.length < 2) {
      toast.error("Template name is required");
      return;
    }
    setSavingId(editing._id || "new");
    try {
      const body = {
        name,
        description: editDesc.trim() || undefined,
        enabled: true,
        rules: editRules,
        autoFollowUp: editAutoFollowUp,
        autoOutreach: editAutoOutreach,
      };
      const res = editing._id
        ? await fetch(
            `${CRM_API_URL}/crm/lead-engagement-templates/${editing._id}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${t}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            },
          )
        : await fetch(
            `${CRM_API_URL}/crm/lead-engagement-templates`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${t}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            },
          );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || "Could not save template");
        return;
      }
      toast.success("Template saved");
      setEditing(null);
      void load();
    } finally {
      setSavingId(null);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!canEdit || !confirm("Delete this template? Pipelines using it will be unassigned.")) {
      return;
    }
    const t = localStorage.getItem("token");
    const res = await fetch(
      `${CRM_API_URL}/crm/lead-engagement-templates/${id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${t}` } },
    );
    if (!res.ok) {
      toast.error("Could not delete template");
      return;
    }
    toast.success("Template deleted");
    void load();
  };

  const assignTemplate = async (pipelineId: string, templateId: string) => {
    if (!canEdit) return;
    const t = localStorage.getItem("token");
    setAssignSaving(pipelineId);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/lead-engagement-templates/pipeline-assignments/${pipelineId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateId: templateId || null,
          }),
        },
      );
      if (!res.ok) {
        toast.error("Could not update pipeline");
        return;
      }
      toast.success(templateId ? "Template applied to pipeline" : "Automation removed");
      void load();
    } finally {
      setAssignSaving(null);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--text-muted)] flex items-center gap-2 py-6">
        <Loader2 size={16} className="animate-spin" />
        Loading lead email automation…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-main)] flex items-center gap-2">
              <Mail size={18} className="text-[var(--hs-link)]" />
              Lead email automation templates
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
              Per-pipeline automation: stage moves on email open / reply / follow-ups,
              property-based stage rules (score, source, etc.), plus optional
              auto-scheduled follow-up emails when a lead is added. Assign a template
              per lead pipeline below. Rules run automatically on events; use the
              branch icon on the Leads board to manually re-apply rules for selected
              leads or the whole pipeline.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              {systemPresets.length > 0 ? (
                <select
                  className="h-9 rounded-lg border border-[var(--border-color)] px-2 text-sm bg-white"
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) void createFromPreset(v);
                    e.target.value = "";
                  }}
                  disabled={!!savingId}
                >
                  <option value="">Add from preset…</option>
                  {systemPresets.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--hs-link)] text-white hover:opacity-90"
              >
                <Plus size={15} />
                New template
              </button>
            </div>
          ) : null}
        </div>

        <ul className="space-y-2">
          {templates.map((tpl) => (
            <li
              key={tpl._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  {tpl.name}
                  {tpl.isSystem ? (
                    <span className="ml-2 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                      Preset
                    </span>
                  ) : null}
                </p>
                {tpl.description ? (
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {tpl.description}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(tpl)}
                      className="text-xs font-semibold text-[var(--hs-link)] hover:underline"
                    >
                      Edit
                    </button>
                    {!tpl.isSystem ? (
                      <button
                        type="button"
                        onClick={() => void deleteTemplate(tpl._id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2 mb-3">
          <GitBranch size={16} className="text-[var(--hs-link)]" />
          Apply to lead pipelines
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {assignmentsLoadFailed
              ? "Could not load lead pipelines (check CRM workflow or pipeline permissions). Ask an admin to grant Settings → Workflows or Leads access."
              : "No lead pipelines found. Create one under Settings → Pipelines (Leads tab)."}
          </p>
        ) : (
          <div className="space-y-2">
            {assignments.map((row) => (
              <div
                key={row.pipelineId}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-color)] px-3 py-2"
              >
                <span className="text-sm font-medium text-[var(--text-main)] min-w-[120px]">
                  {row.pipelineName}
                </span>
                <select
                  disabled={!canEdit || assignSaving === row.pipelineId}
                  value={row.templateId || ""}
                  onChange={(e) =>
                    void assignTemplate(row.pipelineId, e.target.value)
                  }
                  className="flex-1 min-w-[200px] h-9 rounded-md border border-[var(--border-color)] px-2 text-sm bg-white disabled:opacity-50"
                >
                  <option value="">No automation</option>
                  {templates.map((tpl) => (
                    <option key={tpl._id} value={tpl._id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                {assignSaving === row.pipelineId ? (
                  <Loader2 size={14} className="animate-spin text-[var(--hs-link)]" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && canEdit ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--hs-link)]/30 bg-[#fff8f6] p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-main)]">
            {editing._id ? "Edit template" : "New template"}
          </h3>
          <div>
            <label className={LBL}>Name</label>
            <input
              className={INP}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={editing.isSystem}
            />
          </div>
          <div>
            <label className={LBL}>Description</label>
            <input
              className={INP}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          {leadPipelines.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              No lead pipelines loaded. Create pipelines under Settings → Pipelines
              (Leads tab) to pick stages here.
            </p>
          ) : (
            <div>
              <label className={LBL}>Pipeline context (for stage options)</label>
              <select
                className={SEL}
                value={rulesContextPipelineId}
                onChange={(e) => setRulesContextPipelineId(e.target.value)}
              >
                {leadPipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Stage dropdowns list this pipeline&apos;s stages only. When you
                change pipeline, all rule targets (email + property rules) remap to
                the closest matching stage names. At runtime, each lead uses its
                own pipeline with the same fuzzy matching.
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LBL}>On email open → stage</label>
              <StageSelect
                value={editRules.onEmailOpened?.stageName || ""}
                stages={contextStageNames}
                disabled={!contextStageNames.length}
                onChange={(stageName) =>
                  setEditRules({
                    ...editRules,
                    onEmailOpened: {
                      ...editRules.onEmailOpened,
                      stageName,
                      syncContact:
                        editRules.onEmailOpened?.syncContact !== false,
                    },
                  })
                }
              />
              <label className={`${LBL} mt-2`}>Only if lead is currently in</label>
              {contextStageNames.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Select a pipeline above.</p>
              ) : (
                <div className="flex flex-wrap gap-2 rounded-md border border-[var(--border-color)] bg-white p-2 max-h-28 overflow-y-auto">
                  {contextStageNames.map((stage) => {
                    const checked = (
                      editRules.onEmailOpened?.onlyIfStages || []
                    ).includes(stage);
                    return (
                      <label
                        key={stage}
                        className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const prev =
                              editRules.onEmailOpened?.onlyIfStages || [];
                            const onlyIfStages = checked
                              ? prev.filter((s) => s !== stage)
                              : [...prev, stage];
                            setEditRules({
                              ...editRules,
                              onEmailOpened: {
                                ...editRules.onEmailOpened,
                                stageName:
                                  editRules.onEmailOpened?.stageName ||
                                  contextStageNames[0] ||
                                  "",
                                onlyIfStages,
                              },
                            });
                          }}
                        />
                        {stage}
                      </label>
                    );
                  })}
                </div>
              )}
              <label className={`${LBL} mt-1`}>Task on open (title)</label>
              <input
                className={INP}
                placeholder="Optional — e.g. Call today"
                value={editRules.onEmailOpened?.createTask?.title || ""}
                onChange={(e) =>
                  setEditRules({
                    ...editRules,
                    onEmailOpened: {
                      ...editRules.onEmailOpened,
                      createTask: e.target.value.trim()
                        ? {
                            ...editRules.onEmailOpened?.createTask,
                            title: e.target.value,
                            dueInDays:
                              editRules.onEmailOpened?.createTask?.dueInDays ?? 0,
                          }
                        : undefined,
                    },
                  })
                }
              />
              {editRules.onEmailOpened?.createTask ? (
                <div className="mt-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={
                          editRules.onEmailOpened.createTask.calendarEnabled !== false
                        }
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onEmailOpened: {
                              ...editRules.onEmailOpened,
                              createTask: {
                                ...editRules.onEmailOpened!.createTask!,
                                calendarEnabled: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Show auto task on calendar
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={
                          editRules.onEmailOpened.createTask.reminderEnabled !== false
                        }
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onEmailOpened: {
                              ...editRules.onEmailOpened,
                              createTask: {
                                ...editRules.onEmailOpened!.createTask!,
                                reminderEnabled: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Auto reminder
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Due in days
                      <input
                        type="number"
                        min={0}
                        className={`${INP} mt-1`}
                        value={editRules.onEmailOpened.createTask.dueInDays ?? 0}
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onEmailOpened: {
                              ...editRules.onEmailOpened,
                              createTask: {
                                ...editRules.onEmailOpened!.createTask!,
                                dueInDays: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          })
                        }
                      />
                    </label>
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Remind before
                      <select
                        className={`${SEL} mt-1`}
                        disabled={
                          editRules.onEmailOpened.createTask.reminderEnabled === false
                        }
                        value={
                          editRules.onEmailOpened.createTask.reminderBeforeMinutes ?? 0
                        }
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onEmailOpened: {
                              ...editRules.onEmailOpened,
                              createTask: {
                                ...editRules.onEmailOpened!.createTask!,
                                reminderBeforeMinutes: Number(e.target.value),
                              },
                            },
                          })
                        }
                      >
                        <option value={0}>At due time</option>
                        <option value={10}>10 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={60}>1 hour</option>
                        <option value={1440}>1 day</option>
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <label className={LBL}>On reply → pipeline</label>
              <select
                className={SEL}
                value={editRules.onReply?.pipelineName || ""}
                onChange={(e) => {
                  const pipelineName = e.target.value;
                  const pipe = leadPipelines.find((p) => p.name === pipelineName);
                  const stages = leadPipelineStageNames(pipe);
                  setEditRules({
                    ...editRules,
                    onReply: {
                      ...editRules.onReply,
                      pipelineName,
                      stageNameInTargetPipeline:
                        editRules.onReply?.stageNameInTargetPipeline &&
                        stages.includes(
                          editRules.onReply.stageNameInTargetPipeline,
                        )
                          ? editRules.onReply.stageNameInTargetPipeline
                          : stages[0] || "",
                    },
                  });
                }}
              >
                <option value="">Select pipeline…</option>
                {leadPipelines.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
                {editRules.onReply?.pipelineName &&
                !leadPipelines.some(
                  (p) => p.name === editRules.onReply?.pipelineName,
                ) ? (
                  <option value={editRules.onReply.pipelineName}>
                    {editRules.onReply.pipelineName} (not found)
                  </option>
                ) : null}
              </select>
            </div>
            <div>
              <label className={LBL}>On reply → stage (in that pipeline)</label>
              <StageSelect
                value={
                  editRules.onReply?.stageNameInTargetPipeline ||
                  editRules.onReply?.stageName ||
                  ""
                }
                stages={replyStageNames}
                disabled={!editRules.onReply?.pipelineName}
                onChange={(stageNameInTargetPipeline) =>
                  setEditRules({
                    ...editRules,
                    onReply: {
                      ...editRules.onReply,
                      stageNameInTargetPipeline,
                    },
                  })
                }
              />
              <label className={`${LBL} mt-1`}>Task on reply (title)</label>
              <input
                className={INP}
                placeholder="Optional — e.g. Respond within 2h"
                value={editRules.onReply?.createTask?.title || ""}
                onChange={(e) =>
                  setEditRules({
                    ...editRules,
                    onReply: {
                      ...editRules.onReply,
                      createTask: e.target.value.trim()
                        ? {
                            ...editRules.onReply?.createTask,
                            title: e.target.value,
                            dueInDays:
                              editRules.onReply?.createTask?.dueInDays ?? 0,
                          }
                        : undefined,
                    },
                  })
                }
              />
              {editRules.onReply?.createTask ? (
                <div className="mt-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={editRules.onReply.createTask.calendarEnabled !== false}
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onReply: {
                              ...editRules.onReply,
                              createTask: {
                                ...editRules.onReply!.createTask!,
                                calendarEnabled: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Show auto task on calendar
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={editRules.onReply.createTask.reminderEnabled !== false}
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onReply: {
                              ...editRules.onReply,
                              createTask: {
                                ...editRules.onReply!.createTask!,
                                reminderEnabled: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Auto reminder
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Due in days
                      <input
                        type="number"
                        min={0}
                        className={`${INP} mt-1`}
                        value={editRules.onReply.createTask.dueInDays ?? 0}
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onReply: {
                              ...editRules.onReply,
                              createTask: {
                                ...editRules.onReply!.createTask!,
                                dueInDays: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          })
                        }
                      />
                    </label>
                    <label className="text-[11px] font-medium text-[var(--text-muted)]">
                      Remind before
                      <select
                        className={`${SEL} mt-1`}
                        disabled={editRules.onReply.createTask.reminderEnabled === false}
                        value={editRules.onReply.createTask.reminderBeforeMinutes ?? 0}
                        onChange={(e) =>
                          setEditRules({
                            ...editRules,
                            onReply: {
                              ...editRules.onReply,
                              createTask: {
                                ...editRules.onReply!.createTask!,
                                reminderBeforeMinutes: Number(e.target.value),
                              },
                            },
                          })
                        }
                      >
                        <option value={0}>At due time</option>
                        <option value={10}>10 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={60}>1 hour</option>
                        <option value={1440}>1 day</option>
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <label className={LBL}>Each follow-up sent → stage</label>
              <StageSelect
                value={followUpStageSelectValue}
                stages={contextStageNames}
                disabled={!contextStageNames.length}
                placeholder="Select follow-up stage (step 1)…"
                onChange={(stageName) =>
                  setEditRules({
                    ...editRules,
                    onFollowUpSent: {
                      stageNamePattern: stageNameToFollowUpPattern(stageName),
                    },
                  })
                }
              />
              {followUpPattern && !followUpStageSelectValue ? (
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Stored pattern: {followUpPattern}. Pick a matching stage above.
                </p>
              ) : followUpStageSelectValue &&
                stageNameToFollowUpPattern(followUpStageSelectValue) !==
                  followUpPattern ? (
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Uses pattern: {followUpPattern}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>
                All follow-ups done, no reply → stage
              </label>
              <StageSelect
                value={
                  editRules.onFollowUpSequenceComplete?.stageName || ""
                }
                stages={contextStageNames}
                disabled={!contextStageNames.length}
                onChange={(stageName) =>
                  setEditRules({
                    ...editRules,
                    onFollowUpSequenceComplete: { stageName },
                  })
                }
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={editRules.onEmailOpened?.syncContact !== false}
              onChange={(e) =>
                setEditRules({
                  ...editRules,
                  onEmailOpened: {
                    ...editRules.onEmailOpened,
                    stageName:
                      editRules.onEmailOpened?.stageName ||
                      contextStageNames[0] ||
                      "",
                    syncContact: e.target.checked,
                  },
                })
              }
            />
            Sync / create contact when email is opened
          </label>

          <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[var(--text-main)]">
                  Property-based stage rules
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-xl">
                  When a lead is created or updated, the first matching rule moves it
                  to the target stage. Stages and pipeline names are resolved against
                  each lead&apos;s own pipeline at runtime (same labels work across
                  pipelines with different stage lists).
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
                  onClick={() =>
                    setEditRules({
                      ...editRules,
                      stageRules: [
                        ...(editRules.stageRules || []),
                        newStageRule(contextPipeline),
                      ],
                    })
                  }
                >
                  <Plus size={14} />
                  Add rule
                </button>
              ) : null}
            </div>

            {(editRules.stageRules || []).length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                No property rules yet. Use Add rule for score, source, or other field
                conditions.
              </p>
            ) : (
              <div className="space-y-3">
                {(editRules.stageRules || []).map((rule, index) => (
                  <div
                    key={rule.id}
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-dim)]/60 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={rule.enabled !== false}
                          onChange={(e) => {
                            const stageRules = [...(editRules.stageRules || [])];
                            stageRules[index] = {
                              ...rule,
                              enabled: e.target.checked,
                            };
                            setEditRules({ ...editRules, stageRules });
                          }}
                        />
                        Enabled
                      </label>
                      <input
                        className={`${INP} flex-1 min-w-[140px]`}
                        placeholder="Rule label (optional)"
                        value={rule.label || ""}
                        onChange={(e) => {
                          const stageRules = [...(editRules.stageRules || [])];
                          stageRules[index] = { ...rule, label: e.target.value };
                          setEditRules({ ...editRules, stageRules });
                        }}
                      />
                      <button
                        type="button"
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                        aria-label="Remove rule"
                        onClick={() => {
                          const stageRules = (editRules.stageRules || []).filter(
                            (_, i) => i !== index,
                          );
                          setEditRules({ ...editRules, stageRules });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={LBL}>Only when pipeline is</label>
                        <select
                          className={SEL}
                          value={rule.onlyIfPipelineNames?.[0] || ""}
                          onChange={(e) => {
                            const stageRules = [...(editRules.stageRules || [])];
                            const name = e.target.value.trim();
                            stageRules[index] = {
                              ...rule,
                              onlyIfPipelineNames: name ? [name] : undefined,
                            };
                            setEditRules({ ...editRules, stageRules });
                          }}
                        >
                          <option value="">Any pipeline (template assigned)</option>
                          {leadPipelines.map((p) => (
                            <option key={p._id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LBL}>Only when current stage is</label>
                        {contextStageNames.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">
                            Pick a pipeline context above.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2 rounded-md border border-[var(--border-color)] bg-white p-2 max-h-24 overflow-y-auto">
                            {contextStageNames.map((stage) => {
                              const checked = (rule.onlyIfStages || []).includes(
                                stage,
                              );
                              return (
                                <label
                                  key={stage}
                                  className="inline-flex items-center gap-1.5 text-xs cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const prev = rule.onlyIfStages || [];
                                      const onlyIfStages = checked
                                        ? prev.filter((s) => s !== stage)
                                        : [...prev, stage];
                                      const stageRules = [
                                        ...(editRules.stageRules || []),
                                      ];
                                      stageRules[index] = {
                                        ...rule,
                                        onlyIfStages,
                                      };
                                      setEditRules({ ...editRules, stageRules });
                                    }}
                                  />
                                  {stage}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                          Leave unchecked to allow any stage. Matched fuzzy on the
                          lead&apos;s pipeline at runtime.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className={LBL}>When field</label>
                        <select
                          className={SEL}
                          value={rule.field}
                          onChange={(e) => {
                            const stageRules = [...(editRules.stageRules || [])];
                            stageRules[index] = { ...rule, field: e.target.value };
                            setEditRules({ ...editRules, stageRules });
                          }}
                        >
                          {STAGE_RULE_FIELDS.map((f) => (
                            <option key={f.field} value={f.field}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LBL}>Condition</label>
                        <select
                          className={SEL}
                          value={rule.operator}
                          onChange={(e) => {
                            const stageRules = [...(editRules.stageRules || [])];
                            stageRules[index] = {
                              ...rule,
                              operator: e.target
                                .value as LeadStageConditionRule["operator"],
                            };
                            setEditRules({ ...editRules, stageRules });
                          }}
                        >
                          {STAGE_RULE_OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LBL}>Value</label>
                        {(rule.field === "stage" || rule.field === "status") &&
                        rule.operator !== "is_empty" &&
                        rule.operator !== "is_not_empty" &&
                        rule.operator !== "in_list" ? (
                          <StageSelect
                            value={rule.value || ""}
                            stages={contextStageNames}
                            disabled={!contextStageNames.length}
                            placeholder="Any stage label…"
                            onChange={(stageName) => {
                              const stageRules = [...(editRules.stageRules || [])];
                              stageRules[index] = { ...rule, value: stageName };
                              setEditRules({ ...editRules, stageRules });
                            }}
                          />
                        ) : (
                          <input
                            className={INP}
                            placeholder={
                              rule.operator === "in_list"
                                ? rule.field === "stage" || rule.field === "status"
                                  ? "New, Contacted"
                                  : "Referral, Partner"
                                : "Value"
                            }
                            value={rule.value || ""}
                            disabled={
                              rule.operator === "is_empty" ||
                              rule.operator === "is_not_empty"
                            }
                            onChange={(e) => {
                              const stageRules = [...(editRules.stageRules || [])];
                              stageRules[index] = { ...rule, value: e.target.value };
                              setEditRules({ ...editRules, stageRules });
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={LBL}>Move to pipeline (optional)</label>
                        <select
                          className={SEL}
                          value={rule.target.pipelineName || ""}
                          onChange={(e) => {
                            const pipelineName = e.target.value;
                            const pipe = leadPipelines.find(
                              (p) => p.name === pipelineName,
                            );
                            const stages = leadPipelineStageNames(pipe);
                            const stageRules = [...(editRules.stageRules || [])];
                            stageRules[index] = {
                              ...rule,
                              target: {
                                ...rule.target,
                                pipelineName: pipelineName || undefined,
                                stageNameInTargetPipeline:
                                  pipelineName && stages.length
                                    ? rule.target.stageNameInTargetPipeline &&
                                      stages.includes(
                                        rule.target.stageNameInTargetPipeline,
                                      )
                                      ? rule.target.stageNameInTargetPipeline
                                      : stages[0]
                                    : undefined,
                                stageName: pipelineName
                                  ? undefined
                                  : rule.target.stageName ||
                                    contextStageNames[0] ||
                                    "",
                              },
                            };
                            setEditRules({ ...editRules, stageRules });
                          }}
                        >
                          <option value="">Same pipeline</option>
                          {leadPipelines.map((p) => (
                            <option key={p._id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={LBL}>Move to stage</label>
                        {rule.target.pipelineName ? (
                          <StageSelect
                            value={rule.target.stageNameInTargetPipeline || ""}
                            stages={leadPipelineStageNames(
                              leadPipelines.find(
                                (p) => p.name === rule.target.pipelineName,
                              ),
                            )}
                            onChange={(stageName) => {
                              const stageRules = [...(editRules.stageRules || [])];
                              stageRules[index] = {
                                ...rule,
                                target: {
                                  ...rule.target,
                                  stageNameInTargetPipeline: stageName,
                                },
                              };
                              setEditRules({ ...editRules, stageRules });
                            }}
                          />
                        ) : (
                          <StageSelect
                            value={rule.target.stageName || ""}
                            stages={contextStageNames}
                            disabled={!contextStageNames.length}
                            onChange={(stageName) => {
                              const stageRules = [...(editRules.stageRules || [])];
                              stageRules[index] = {
                                ...rule,
                                target: { ...rule.target, stageName },
                              };
                              setEditRules({ ...editRules, stageRules });
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border-color)] bg-white p-4 space-y-3">
            <h4 className="text-sm font-bold text-[var(--text-main)]">
              Auto follow-ups on new lead
            </h4>
            <p className="text-xs text-[var(--text-muted)]">
              Uses the same scheduler as &quot;Schedule follow-ups&quot; on the
              lead page. Does not send the first email — reps send that
              manually.
            </p>
            <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-3 space-y-3">
              <p className="text-xs font-semibold text-violet-950">
                Auto outreach — first email when lead enters pipeline
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAutoOutreach.enabled}
                  onChange={(e) =>
                    setEditAutoOutreach({
                      ...editAutoOutreach,
                      enabled: e.target.checked,
                    })
                  }
                />
                Send first outreach email automatically on lead create
              </label>
              {editAutoOutreach.enabled ? (
                <div className="space-y-2 pl-1">
                  <div>
                    <label className={LBL}>Send mode</label>
                    <select
                      className={SEL}
                      value={editAutoOutreach.sendMode || "ai_draft"}
                      onChange={(e) =>
                        setEditAutoOutreach({
                          ...editAutoOutreach,
                          sendMode: e.target.value as "ai_draft" | "template",
                        })
                      }
                    >
                      <option value="ai_draft">AI draft (personalized)</option>
                      <option value="template">Email template</option>
                    </select>
                  </div>
                  {editAutoOutreach.sendMode === "template" ? (
                    <div>
                      <label className={LBL}>Template</label>
                      <select
                        className={SEL}
                        value={editAutoOutreach.templateId || ""}
                        onChange={(e) =>
                          setEditAutoOutreach({
                            ...editAutoOutreach,
                            templateId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select template…</option>
                        {emailTemplates.map((tpl) => (
                          <option key={tpl._id} value={tpl._id}>
                            {tpl.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className={LBL}>AI instructions (optional)</label>
                      <textarea
                        className="w-full min-h-[72px] rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
                        placeholder="e.g. Position as freelancer for React projects; mention Upwork listing if present."
                        value={editAutoOutreach.aiInstructions || ""}
                        onChange={(e) =>
                          setEditAutoOutreach({
                            ...editAutoOutreach,
                            aiInstructions: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                  <div>
                    <label className={LBL}>Delay before send (minutes)</label>
                    <input
                      className={INP}
                      type="number"
                      min={0}
                      value={editAutoOutreach.delayMinutes ?? 0}
                      onChange={(e) =>
                        setEditAutoOutreach({
                          ...editAutoOutreach,
                          delayMinutes: Math.max(
                            0,
                            parseInt(e.target.value, 10) || 0,
                          ),
                        })
                      }
                    />
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Required context fields are configured per pipeline under{" "}
                    <strong>Settings → Pipelines</strong> → AI outreach context.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 leading-relaxed">
              <strong className="font-semibold">If first outreach not opened</strong> is configured
              per lead under <strong>Follow-ups</strong> → tab <strong>1 · First outreach</strong>,
              after you send the manual first email.
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editAutoFollowUp.enabled}
                onChange={(e) =>
                  setEditAutoFollowUp({
                    ...editAutoFollowUp,
                    enabled: e.target.checked,
                  })
                }
              />
              Schedule follow-up emails when a lead is added
            </label>
            {editAutoFollowUp.enabled ? (
              <>
                <div>
                  <label className={LBL}>
                    Cadence (days after lead is created)
                  </label>
                  <input
                    className={INP}
                    placeholder="2, 5, 7, 15, 30"
                    value={cadenceDays.join(", ")}
                    onChange={(e) => {
                      const days = e.target.value
                        .split(/[,;\s]+/)
                        .map((x) => parseInt(x.replace(/\D/g, ""), 10))
                        .filter((n) => !isNaN(n) && n > 0);
                      setEditAutoFollowUp({
                        ...editAutoFollowUp,
                        cadenceDays: days.length
                          ? days
                          : [...DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS],
                      });
                    }}
                  />
                </div>
                <div>
                  <label className={LBL}>Follow-up send mode</label>
                  <select
                    className={SEL}
                    value={editAutoFollowUp.sendMode || "template"}
                    onChange={(e) =>
                      setEditAutoFollowUp({
                        ...editAutoFollowUp,
                        sendMode: e.target.value as "template" | "ai_draft",
                      })
                    }
                  >
                    <option value="template">Email templates</option>
                    <option value="ai_draft">AI draft each step</option>
                  </select>
                </div>
                {editAutoFollowUp.sendMode === "ai_draft" ? (
                  <div>
                    <label className={LBL}>AI instructions for follow-ups</label>
                    <textarea
                      className="w-full min-h-[72px] rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
                      placeholder="Shorter follow-ups; reference prior outreach; one CTA."
                      value={editAutoFollowUp.aiInstructions || ""}
                      onChange={(e) =>
                        setEditAutoFollowUp({
                          ...editAutoFollowUp,
                          aiInstructions: e.target.value,
                        })
                      }
                    />
                  </div>
                ) : (
                <div>
                  <label className={LBL}>Email template (all steps)</label>
                  <select
                    className={INP}
                    value={editAutoFollowUp.defaultEmailTemplateId || ""}
                    onChange={(e) =>
                      setEditAutoFollowUp({
                        ...editAutoFollowUp,
                        defaultEmailTemplateId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select template…</option>
                    {emailTemplates.map((tpl) => (
                      <option key={tpl._id} value={tpl._id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
                {editAutoFollowUp.sendMode !== "ai_draft" ? (
                <div className="space-y-2">
                  <p className={LBL}>Or template per day (optional)</p>
                  {cadenceDays.map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] w-14">
                        Day {day}
                      </span>
                      <select
                        className="flex-1 h-8 rounded-md border border-[var(--border-color)] px-2 text-sm bg-white"
                        value={
                          editAutoFollowUp.templateIdByDay?.[String(day)] ||
                          ""
                        }
                        onChange={(e) =>
                          setEditAutoFollowUp({
                            ...editAutoFollowUp,
                            templateIdByDay: {
                              ...editAutoFollowUp.templateIdByDay,
                              [String(day)]: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Use default above</option>
                        {emailTemplates.map((tpl) => (
                          <option key={tpl._id} value={tpl._id}>
                            {tpl.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editAutoFollowUp.cancelOnReply !== false}
                    onChange={(e) =>
                      setEditAutoFollowUp({
                        ...editAutoFollowUp,
                        cancelOnReply: e.target.checked,
                      })
                    }
                  />
                  Stop follow-ups if they reply
                </label>
              </>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!!savingId}
              onClick={() => void saveTemplate()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--hs-link)] text-white disabled:opacity-50"
            >
              {savingId ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save template
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
