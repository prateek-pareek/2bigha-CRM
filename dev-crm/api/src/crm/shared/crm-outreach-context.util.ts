/** Standard CRM fields used to personalize AI outreach emails. */
export type OutreachContextFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'organization'
  | 'jobTitle'
  | 'industry'
  | 'source'
  | 'website'
  | 'linkedinUrl'
  | 'linkedInPost'
  | 'relatedServiceName'
  | 'customFields.requirements'
  | 'customFields.budget'
  | 'customFields.timeline';

export const OUTREACH_CONTEXT_FIELD_DEFS: {
  key: OutreachContextFieldKey;
  label: string;
}[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'organization', label: 'Company / organization' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'industry', label: 'Industry' },
  { key: 'source', label: 'Lead source' },
  { key: 'website', label: 'Website' },
  { key: 'linkedinUrl', label: 'LinkedIn profile' },
  { key: 'linkedInPost', label: 'LinkedIn post / listing context' },
  { key: 'relatedServiceName', label: 'Related service' },
  { key: 'customFields.requirements', label: 'Requirements (custom field)' },
  { key: 'customFields.budget', label: 'Budget (custom field)' },
  { key: 'customFields.timeline', label: 'Timeline (custom field)' },
];

export type PipelineOutreachAiContext = {
  /** When false, pipeline-specific fields below override global AI outreach settings. */
  useGlobalSettings?: boolean;
  businessName?: string;
  businessSummary?: string;
  servicesOffered?: string;
  idealClientProfile?: string;
  tonePreset?: 'consultative' | 'direct' | 'warm' | 'formal';
  signatureOrClosing?: string;
  mustMention?: string;
  avoidSaying?: string;
  additionalContext?: string;
  /** Default extra instructions for AI drafts on leads in this pipeline. */
  aiInstructions?: string;
  /** CRM fields that should be present before auto-sending outreach. */
  requiredContextFields?: OutreachContextFieldKey[];
  /** What to do when required context is missing during automation. */
  missingContextAction?: 'skip' | 'draft_anyway' | 'create_task';
  /** Task created when missingContextAction is create_task. */
  missingContextTaskTitle?: string;
};

export type MissingContextAction = 'skip' | 'draft_anyway' | 'create_task';

export type OutreachContextCheckResult = {
  available: Partial<Record<OutreachContextFieldKey, string>>;
  missing: OutreachContextFieldKey[];
  missingLabels: string[];
  canDraft: boolean;
  canAutoSend: boolean;
  missingContextAction?: MissingContextAction;
  pipelineName?: string;
  pipelineCategoryType?: string;
};

function readNested(
  context: Record<string, unknown>,
  key: OutreachContextFieldKey,
): string {
  if (key.startsWith('customFields.')) {
    const cfKey = key.slice('customFields.'.length);
    const cf = context.customFields;
    if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
      const v = (cf as Record<string, unknown>)[cfKey];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }
  if (key === 'linkedInPost') {
    const lip = context.linkedInPost;
    if (lip && typeof lip === 'object') {
      const o = lip as Record<string, unknown>;
      const parts = [o.title, o.description, o.url, o.authorName]
        .map((x) => (x != null ? String(x).trim() : ''))
        .filter(Boolean);
      return parts.join(' — ');
    }
    return '';
  }
  const raw = context[key];
  if (raw == null) return '';
  return String(raw).trim();
}

export function checkOutreachContext(
  context: Record<string, unknown>,
  requiredFields: OutreachContextFieldKey[] = [],
  missingContextAction: MissingContextAction = 'draft_anyway',
): OutreachContextCheckResult {
  const available: Partial<Record<OutreachContextFieldKey, string>> = {};
  const missing: OutreachContextFieldKey[] = [];

  for (const def of OUTREACH_CONTEXT_FIELD_DEFS) {
    const val = readNested(context, def.key);
    if (val) available[def.key] = val;
  }

  const required = requiredFields.length
    ? requiredFields
    : (['email'] as OutreachContextFieldKey[]);

  for (const key of required) {
    if (!readNested(context, key)) missing.push(key);
  }

  const missingLabels = missing.map(
    (k) => OUTREACH_CONTEXT_FIELD_DEFS.find((d) => d.key === k)?.label || k,
  );

  const canDraft =
    missing.length === 0 || missingContextAction !== 'skip';
  const canAutoSend =
    missing.length === 0 ||
    missingContextAction === 'draft_anyway';

  return {
    available,
    missing,
    missingLabels,
    canDraft,
    canAutoSend,
    missingContextAction,
    pipelineName:
      typeof context.pipelineName === 'string'
        ? context.pipelineName
        : undefined,
    pipelineCategoryType:
      typeof context.pipelineCategoryType === 'string'
        ? context.pipelineCategoryType
        : undefined,
  };
}

/** Merge global outreach settings with pipeline-specific overrides. */
export function mergeOutreachPromptSettings(
  global: Record<string, unknown>,
  pipelineCtx?: PipelineOutreachAiContext | null,
  categoryType?: string,
): Record<string, unknown> {
  if (!pipelineCtx || pipelineCtx.useGlobalSettings !== false) {
    return { ...global };
  }
  const merged = { ...global };
  const setIf = (key: string, val: string | undefined) => {
    if (val != null && String(val).trim()) merged[key] = String(val).trim();
  };
  setIf('businessName', pipelineCtx.businessName);
  setIf('businessSummary', pipelineCtx.businessSummary);
  setIf('servicesOffered', pipelineCtx.servicesOffered);
  setIf('idealClientProfile', pipelineCtx.idealClientProfile);
  if (pipelineCtx.tonePreset) merged.tonePreset = pipelineCtx.tonePreset;
  setIf('signatureOrClosing', pipelineCtx.signatureOrClosing);
  setIf('mustMention', pipelineCtx.mustMention);
  setIf('avoidSaying', pipelineCtx.avoidSaying);
  const extra = [
    String(global.additionalSystemContext || '').trim(),
    String(pipelineCtx.additionalContext || '').trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
  if (extra) merged.additionalSystemContext = extra;
  if (categoryType) merged._pipelineCategoryType = categoryType;
  if (pipelineCtx.aiInstructions?.trim()) {
    merged._pipelineAiInstructions = pipelineCtx.aiInstructions.trim();
  }
  return merged;
}
