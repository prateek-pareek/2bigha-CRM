/** Mirror of api-hrms platform-opportunity-pipeline.util defaults for settings UI. */
export const DEFAULT_PLATFORM_OPPORTUNITY_STAGES = [
  { name: 'Saved (not applied yet)', probability: 5, order: 1, isDefault: true },
  { name: 'Applied', probability: 20, order: 2, isDefault: false },
  { name: 'Messaged client', probability: 35, order: 3, isDefault: false },
  { name: 'Interview / call', probability: 55, order: 4, isDefault: false },
  { name: 'Hired / won', probability: 100, order: 5, isDefault: false },
  { name: 'Rejected', probability: 0, order: 6, isDefault: false },
  { name: 'Withdrawn', probability: 0, order: 7, isDefault: false },
  { name: 'No response', probability: 10, order: 8, isDefault: false },
] as const;

export type PlatformPipelineStage = {
  name: string;
  probability: number;
  order: number;
  isDefault?: boolean;
};

export function sortPipelineStages<T extends { order?: number }>(stages: T[]): T[] {
  return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
