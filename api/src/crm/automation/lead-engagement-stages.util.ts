/** Canonical stage / pipeline labels for lead email engagement automation. */
export const LEAD_STAGE_CONTACTED = 'Contacted';
export const LEAD_STAGE_EMAIL_NOT_OPENED = 'Email/Message Not Opened';
export const LEAD_PIPELINE_POTENTIAL_LEADS = 'Potential Leads';

export function followUpStageName(stepNumber: number): string {
  return `Follow-up ${stepNumber}`;
}

export function normalizeStageKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const CONTACTED_ALIASES = new Set(
  ['contacted', 'contact', 'contact made'].map(normalizeStageKey),
);

const POTENTIAL_PIPELINE_ALIASES = new Set(
  ['potential leads', 'potential lead', 'potential'].map(normalizeStageKey),
);

const NOT_OPENED_ALIASES = new Set(
  [
    'email message not opened',
    'email/message not opened',
    'email not opened',
    'message not opened',
    'email message not replied',
    'not replied',
    'no reply',
  ].map(normalizeStageKey),
);

export function stageMatchesContacted(stageName: string): boolean {
  return CONTACTED_ALIASES.has(normalizeStageKey(stageName));
}

export function stageMatchesFollowUp(stageName: string, stepNumber: number): boolean {
  const key = normalizeStageKey(stageName);
  const n = stepNumber;
  return (
    key === normalizeStageKey(`follow up ${n}`) ||
    key === normalizeStageKey(`follow-up ${n}`) ||
    key === normalizeStageKey(`followup ${n}`) ||
    key === `follow up ${n}`
  );
}

export function stageMatchesNotOpened(stageName: string): boolean {
  return NOT_OPENED_ALIASES.has(normalizeStageKey(stageName));
}

export function pipelineMatchesPotentialLeads(pipelineName: string): boolean {
  return POTENTIAL_PIPELINE_ALIASES.has(normalizeStageKey(pipelineName));
}

export type PipelineStage = {
  name: string;
  probability?: number;
  order?: number;
  isDefault?: boolean;
};

export function findStageInPipeline(
  stages: PipelineStage[],
  matchers: Array<(name: string) => boolean>,
): PipelineStage | null {
  for (const s of stages) {
    const name = String(s.name || '');
    if (matchers.some((fn) => fn(name))) return s;
  }
  return null;
}

export function findFollowUpStage(
  stages: PipelineStage[],
  stepNumber: number,
): PipelineStage | null {
  return findStageInPipeline(stages, [(n) => stageMatchesFollowUp(n, stepNumber)]);
}
