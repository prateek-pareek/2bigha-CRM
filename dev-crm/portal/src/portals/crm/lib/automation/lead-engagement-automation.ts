export type LeadEngagementStageTarget = {
  stageName?: string;
  pipelineName?: string;
  stageNameInTargetPipeline?: string;
};

export type LeadEngagementTaskAction = {
  title: string;
  body?: string;
  dueInDays?: number;
  calendarEnabled?: boolean;
  reminderEnabled?: boolean;
  reminderBeforeMinutes?: number;
};

export type LeadEngagementNotifyAction = {
  message: string;
  email?: string;
  link?: string;
};

export type LeadEngagementRuleExtras = {
  enabled?: boolean;
  onlyIfStages?: string[];
  createTask?: LeadEngagementTaskAction;
  notifyTeams?: LeadEngagementNotifyAction;
};

export type LeadEngagementAutoFollowUp = {
  enabled: boolean;
  cadenceDays?: number[];
  defaultEmailTemplateId?: string;
  templateIdByDay?: Record<string, string>;
  cancelOnReply?: boolean;
  sendMode?: "template" | "ai_draft";
  aiInstructions?: string;
};

export type LeadEngagementAutoOutreach = {
  enabled: boolean;
  sendMode?: "ai_draft" | "template";
  templateId?: string;
  aiInstructions?: string;
  inboxAccountId?: string;
  delayMinutes?: number;
  requiredContextFields?: string[];
  missingContextAction?: "skip" | "draft_anyway" | "create_task";
  missingContextTaskTitle?: string;
};

export type PipelineOutreachAiContext = {
  useGlobalSettings?: boolean;
  businessName?: string;
  businessSummary?: string;
  servicesOffered?: string;
  idealClientProfile?: string;
  tonePreset?: "consultative" | "direct" | "warm" | "formal";
  signatureOrClosing?: string;
  mustMention?: string;
  avoidSaying?: string;
  additionalContext?: string;
  aiInstructions?: string;
  requiredContextFields?: string[];
  missingContextAction?: "skip" | "draft_anyway" | "create_task";
  missingContextTaskTitle?: string;
};

export const OUTREACH_CONTEXT_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "organization", label: "Company" },
  { key: "jobTitle", label: "Job title" },
  { key: "industry", label: "Industry" },
  { key: "source", label: "Source" },
  { key: "website", label: "Website" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "linkedInPost", label: "LinkedIn post / listing" },
  { key: "relatedServiceName", label: "Related service" },
  { key: "customFields.requirements", label: "Requirements" },
  { key: "customFields.budget", label: "Budget" },
  { key: "customFields.timeline", label: "Timeline" },
];

export const DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS = [2, 5, 7, 15, 30];

export const DEFAULT_AUTO_FOLLOW_UP: LeadEngagementAutoFollowUp = {
  enabled: false,
  cadenceDays: [...DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS],
  cancelOnReply: true,
};

export type LeadStageConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty"
  | "in_list";

export type LeadStageConditionRule = {
  id: string;
  enabled?: boolean;
  label?: string;
  onlyIfPipelineNames?: string[];
  onlyIfStages?: string[];
  field: string;
  operator: LeadStageConditionOperator;
  value?: string;
  target: LeadEngagementStageTarget;
  createTask?: LeadEngagementTaskAction;
  notifyTeams?: LeadEngagementNotifyAction;
};

export type LeadEngagementAutomationRules = {
  onEmailOpened?: LeadEngagementStageTarget &
    LeadEngagementRuleExtras & { syncContact?: boolean };
  onReply?: LeadEngagementStageTarget & LeadEngagementRuleExtras;
  onFollowUpSent?: { stageNamePattern: string } & LeadEngagementRuleExtras;
  onFollowUpSequenceComplete?: LeadEngagementStageTarget &
    LeadEngagementRuleExtras;
  stageRules?: LeadStageConditionRule[];
};

export type LeadEngagementTemplate = {
  _id: string;
  name: string;
  description?: string;
  enabled: boolean;
  presetKey?: string;
  rules: LeadEngagementAutomationRules;
  autoFollowUp?: LeadEngagementAutoFollowUp;
  autoOutreach?: LeadEngagementAutoOutreach;
  isSystem?: boolean;
};

export type PipelineAssignment = {
  pipelineId: string;
  pipelineName: string;
  templateId: string | null;
  templateName: string | null;
};

export type SystemPresetMeta = {
  key: string;
  name: string;
  description: string;
};

export type LeadPipelineStage = {
  name: string;
  order?: number;
  probability?: number;
  isDefault?: boolean;
};

export type LeadPipelineOption = {
  _id: string;
  name: string;
  stages: LeadPipelineStage[];
  isDefault?: boolean;
  categoryType?: "it_consulting" | "freelancer";
  outreachAiContext?: PipelineOutreachAiContext;
};

/** Stage names from a pipeline, in board order. */
export function leadPipelineStageNames(
  pipeline: LeadPipelineOption | undefined,
): string[] {
  if (!pipeline?.stages?.length) return [];
  return [...pipeline.stages]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => String(s.name || "").trim())
    .filter(Boolean);
}

/** e.g. "FOLLOW-UP 1" → "FOLLOW-UP {n}" for automation storage. */
export function stageNameToFollowUpPattern(stageName: string): string {
  const trimmed = stageName.trim();
  const m = trimmed.match(/^(.+?)\s*(\d+)\s*$/i);
  if (m) return `${m[1].trim()} {n}`;
  return trimmed;
}

/** Pick a pipeline stage option that matches a stored follow-up pattern. */
export function followUpPatternToStageOption(
  pattern: string,
  stageNames: string[],
): string {
  const p = pattern.trim();
  if (!p) return "";
  const step1 = p.replace(/\{n\}/gi, "1");
  if (stageNames.includes(step1)) return step1;
  for (const name of stageNames) {
    if (stageNameToFollowUpPattern(name) === p) return name;
  }
  const base = normStageName(p.replace(/\{n\}/gi, ""));
  for (const name of stageNames) {
    const n = normStageName(name);
    if (base && (n.startsWith(base) || base.startsWith(n)) && /\d/.test(name)) {
      return name;
    }
  }
  return "";
}

function normStageName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match a preferred stage name to an actual pipeline stage (exact, then fuzzy). */
export function matchStageName(
  stages: string[],
  preferred: string,
): string {
  const want = preferred.trim();
  if (!want || !stages.length) return "";
  if (stages.includes(want)) return want;
  const normWant = normStageName(want);
  const exact = stages.find((s) => normStageName(s) === normWant);
  if (exact) return exact;
  const partial = stages.find((s) => {
    const n = normStageName(s);
    return n.includes(normWant) || normWant.includes(n);
  });
  return partial || "";
}

/** Match pipeline by display name (exact, then fuzzy). */
export function matchPipelineByName(
  pipelines: LeadPipelineOption[],
  preferred: string,
): LeadPipelineOption | undefined {
  const want = preferred.trim();
  if (!want) return undefined;
  const exact = pipelines.find((p) => p.name === want);
  if (exact) return exact;
  const normWant = normStageName(want);
  return pipelines.find((p) => {
    const n = normStageName(p.name);
    return n === normWant || n.includes(normWant) || normWant.includes(n);
  });
}

function pickStage(stages: string[], tests: RegExp[]): string {
  for (const re of tests) {
    const hit = stages.find((s) => re.test(s));
    if (hit) return hit;
  }
  return "";
}

/**
 * Default automation rules derived from a pipeline's real stage names
 * (no hardcoded "Contacted" / "FOLLOW-UP 1" labels).
 */
export function buildRulesFromPipeline(
  pipeline: LeadPipelineOption | undefined,
  allPipelines: LeadPipelineOption[],
): LeadEngagementAutomationRules {
  const stages = leadPipelineStageNames(pipeline);
  if (!stages.length) return {};

  const newStage =
    pickStage(stages, [/^new$/i, /\bnew\b/i]) || stages[0];
  const contacted =
    pickStage(stages, [/contacted/i, /\bcontact\b/i, /engaged/i]) ||
    stages[1] ||
    stages[0];
  const followUp =
    pickStage(stages, [
      /follow[\s-]*up\s*1/i,
      /follow[\s-]*up/i,
      /touch\s*1/i,
      /sequence\s*1/i,
    ]) || "";
  const sequenceEnd =
    pickStage(stages, [
      /not\s*open/i,
      /no\s*reply/i,
      /unopened/i,
      /no\s*response/i,
      /\bcold\b/i,
    ]) || stages[stages.length - 1];

  const replyPipe =
    matchPipelineByName(allPipelines, "Potential Leads") ||
    allPipelines.find((p) => /potential|qualified/i.test(p.name)) ||
    pipeline;
  const replyStages = leadPipelineStageNames(replyPipe);
  let replyStage = "";
  if (replyPipe && pipeline && replyPipe._id === pipeline._id) {
    replyStage =
      pickStage(replyStages, [/potential/i, /qualified/i, /replied/i, /won/i]) ||
      contacted;
  } else if (replyPipe) {
    replyStage =
      matchStageName(replyStages, replyPipe.name) ||
      pickStage(replyStages, [/potential/i, /qualified/i]) ||
      replyStages[0] ||
      "";
  }

  const rules: LeadEngagementAutomationRules = {
    onEmailOpened: {
      stageName: contacted,
      syncContact: true,
      onlyIfStages: newStage ? [newStage] : [],
    },
  };

  if (replyPipe && replyStage) {
    rules.onReply = {
      pipelineName: replyPipe.name,
      stageNameInTargetPipeline: replyStage,
    };
  }

  if (followUp) {
    rules.onFollowUpSent = {
      stageNamePattern: stageNameToFollowUpPattern(followUp),
    };
  }

  if (sequenceEnd) {
    rules.onFollowUpSequenceComplete = { stageName: sequenceEnd };
  }

  return rules;
}

/**
 * Remap stored rule targets onto stages/pipelines that exist in the selected context.
 */
export function resolveRulesForPipeline(
  rules: LeadEngagementAutomationRules,
  contextPipeline: LeadPipelineOption | undefined,
  allPipelines: LeadPipelineOption[],
): LeadEngagementAutomationRules {
  const stages = leadPipelineStageNames(contextPipeline);
  if (!stages.length) return { ...rules };

  const next: LeadEngagementAutomationRules = { ...rules };

  if (next.onEmailOpened) {
    const stageName = matchStageName(
      stages,
      next.onEmailOpened.stageName || "",
    );
    const onlyIfStages = (next.onEmailOpened.onlyIfStages || [])
      .map((s) => matchStageName(stages, s))
      .filter((s) => s && stages.includes(s));
    next.onEmailOpened = {
      ...next.onEmailOpened,
      ...(stageName ? { stageName } : {}),
      ...(onlyIfStages.length ? { onlyIfStages } : { onlyIfStages: undefined }),
    };
  }

  if (next.onReply) {
    const replyPipe = matchPipelineByName(
      allPipelines,
      next.onReply.pipelineName || "",
    );
    const replyStages = leadPipelineStageNames(replyPipe);
    const preferred =
      next.onReply.stageNameInTargetPipeline ||
      next.onReply.stageName ||
      "";
    const stageNameInTargetPipeline = matchStageName(replyStages, preferred);
    next.onReply = {
      ...next.onReply,
      ...(replyPipe ? { pipelineName: replyPipe.name } : {}),
      ...(stageNameInTargetPipeline
        ? { stageNameInTargetPipeline }
        : {}),
    };
  }

  if (next.onFollowUpSent?.stageNamePattern) {
    const pattern = next.onFollowUpSent.stageNamePattern;
    const matched = followUpPatternToStageOption(pattern, stages);
    if (matched) {
      next.onFollowUpSent = {
        ...next.onFollowUpSent,
        stageNamePattern: stageNameToFollowUpPattern(matched),
      };
    }
  }

  if (next.onFollowUpSequenceComplete?.stageName) {
    const stageName = matchStageName(
      stages,
      next.onFollowUpSequenceComplete.stageName,
    );
    if (stageName) {
      next.onFollowUpSequenceComplete = { stageName };
    }
  }

  if (next.stageRules?.length) {
    next.stageRules = next.stageRules.map((rule) => {
      const onlyIfStages = (rule.onlyIfStages || [])
        .map((s) => matchStageName(stages, s))
        .filter((s) => s && stages.includes(s));
      const onlyIfPipelineNames = (rule.onlyIfPipelineNames || [])
        .map((name) => matchPipelineByName(allPipelines, name)?.name || name)
        .filter(Boolean);

      let value = rule.value;
      if (
        (rule.field === "stage" || rule.field === "status") &&
        value &&
        rule.operator !== "is_empty" &&
        rule.operator !== "is_not_empty"
      ) {
        if (rule.operator === "in_list") {
          value = value
            .split(/[,;\n]+/)
            .map((part) => matchStageName(stages, part.trim()) || part.trim())
            .filter(Boolean)
            .join(", ");
        } else {
          value = matchStageName(stages, value) || value;
        }
      }

      let target = { ...rule.target };
      if (target.pipelineName?.trim()) {
        const replyPipe = matchPipelineByName(allPipelines, target.pipelineName);
        const replyStages = leadPipelineStageNames(replyPipe);
        const preferred =
          target.stageNameInTargetPipeline || target.stageName || "";
        const stageNameInTargetPipeline = matchStageName(replyStages, preferred);
        target = {
          ...target,
          ...(replyPipe ? { pipelineName: replyPipe.name } : {}),
          ...(stageNameInTargetPipeline
            ? { stageNameInTargetPipeline }
            : {}),
        };
      } else {
        const stageName = matchStageName(stages, target.stageName || "");
        if (stageName) target = { ...target, stageName };
      }

      return {
        ...rule,
        ...(onlyIfStages.length
          ? { onlyIfStages }
          : { onlyIfStages: undefined }),
        ...(onlyIfPipelineNames.length
          ? { onlyIfPipelineNames }
          : { onlyIfPipelineNames: undefined }),
        ...(value !== rule.value ? { value } : {}),
        target,
      };
    });
  }

  return next;
}

/** @deprecated Use buildRulesFromPipeline — kept for type imports only. */
export const DEFAULT_LEAD_ENGAGEMENT_RULES: LeadEngagementAutomationRules = {};
