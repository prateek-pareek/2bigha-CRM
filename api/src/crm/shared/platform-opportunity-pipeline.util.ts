/** Default platform-opportunity board stages (matches legacy engagement statuses). */
export const DEFAULT_PLATFORM_OPPORTUNITY_STAGES: Array<{
  name: string;
  probability: number;
  order: number;
  isDefault: boolean;
  engagementStatus: string;
}> = [
  {
    name: 'Saved (not applied yet)',
    probability: 5,
    order: 1,
    isDefault: true,
    engagementStatus: 'saved',
  },
  {
    name: 'Applied',
    probability: 20,
    order: 2,
    isDefault: false,
    engagementStatus: 'applied',
  },
  {
    name: 'Messaged client',
    probability: 35,
    order: 3,
    isDefault: false,
    engagementStatus: 'messaged',
  },
  {
    name: 'Interview / call',
    probability: 55,
    order: 4,
    isDefault: false,
    engagementStatus: 'interview',
  },
  {
    name: 'Hired / won',
    probability: 100,
    order: 5,
    isDefault: false,
    engagementStatus: 'hired',
  },
  {
    name: 'Rejected',
    probability: 0,
    order: 6,
    isDefault: false,
    engagementStatus: 'rejected',
  },
  {
    name: 'Withdrawn',
    probability: 0,
    order: 7,
    isDefault: false,
    engagementStatus: 'withdrawn',
  },
  {
    name: 'No response',
    probability: 10,
    order: 8,
    isDefault: false,
    engagementStatus: 'no_response',
  },
];

const ENGAGEMENT_TO_STAGE = new Map(
  DEFAULT_PLATFORM_OPPORTUNITY_STAGES.map((s) => [s.engagementStatus, s.name]),
);

const STAGE_TO_ENGAGEMENT = new Map(
  DEFAULT_PLATFORM_OPPORTUNITY_STAGES.map((s) => [
    s.name.trim().toLowerCase(),
    s.engagementStatus,
  ]),
);

export function engagementStatusToStageName(
  status: string | undefined | null,
  pipelineStages?: Array<{ name: string }>,
): string | undefined {
  const key = String(status || '').trim();
  if (!key) return undefined;
  const fromDefault = ENGAGEMENT_TO_STAGE.get(key);
  if (fromDefault) {
    if (!pipelineStages?.length) return fromDefault;
    const hit = pipelineStages.find(
      (s) => s.name.trim().toLowerCase() === fromDefault.toLowerCase(),
    );
    return hit?.name || fromDefault;
  }
  return undefined;
}

export function stageNameToEngagementStatus(
  stageName: string | undefined | null,
): string | undefined {
  const n = String(stageName || '').trim().toLowerCase();
  if (!n) return undefined;
  return STAGE_TO_ENGAGEMENT.get(n);
}

export function defaultStageForPipeline(
  stages?: Array<{ name: string; isDefault?: boolean; order?: number }>,
): string {
  if (!stages?.length) {
    return DEFAULT_PLATFORM_OPPORTUNITY_STAGES.find((s) => s.isDefault)!.name;
  }
  const sorted = [...stages].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const def = sorted.find((s) => s.isDefault) || sorted[0];
  return String(def?.name || 'Saved (not applied yet)').trim();
}

export function normalizeStageForPipeline(
  stageInput: string | undefined | null,
  pipelineStages?: Array<{ name: string }>,
): string {
  const raw = String(stageInput || '').trim();
  if (!raw) return defaultStageForPipeline(pipelineStages);
  if (!pipelineStages?.length) return raw;
  const hit = pipelineStages.find(
    (s) => s.name.trim().toLowerCase() === raw.toLowerCase(),
  );
  return hit?.name || defaultStageForPipeline(pipelineStages);
}
