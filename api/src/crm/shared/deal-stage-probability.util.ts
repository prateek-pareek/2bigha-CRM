/** Resolve win probability from a pipeline stage (CRM-standard stage-driven forecast). */

function normStage(name: string | undefined | null): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function resolveStageProbability(
  stages:
    | Array<{ name?: string; probability?: number }>
    | undefined
    | null,
  stageName: string | undefined | null,
  fallback = 0,
): number {
  if (!stageName || !stages?.length) {
    return clampProbability(fallback);
  }
  const want = normStage(stageName);
  if (!want) return clampProbability(fallback);

  const exact = stages.find((s) => normStage(s?.name) === want);
  if (exact && Number.isFinite(Number(exact.probability))) {
    return clampProbability(Number(exact.probability));
  }

  // Fuzzy: "Proposal Sent" ↔ "Proposal", etc.
  let best: { score: number; probability: number } | null = null;
  for (const s of stages) {
    const n = normStage(s?.name);
    if (!n || !Number.isFinite(Number(s.probability))) continue;
    let score = 0;
    if (n.includes(want) || want.includes(n)) score = Math.min(n.length, want.length);
    if (score > 0 && (!best || score > best.score)) {
      best = { score, probability: Number(s.probability) };
    }
  }
  if (best) return clampProbability(best.probability);
  return clampProbability(fallback);
}

/** pipelineId → (stageNameLower → probability). Only stores stages with a defined probability. */
export function buildPipelineStageProbabilityMaps(
  pipelines: Array<{
    _id?: unknown;
    stages?: Array<{ name?: string; probability?: number }>;
  }>,
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const p of pipelines) {
    const stages = new Map<string, number>();
    for (const s of p.stages || []) {
      const name = normStage(s?.name);
      if (!name) continue;
      const raw = Number(s.probability);
      if (!Number.isFinite(raw)) continue;
      stages.set(name, clampProbability(raw));
    }
    map.set(String(p._id), stages);
  }
  return map;
}

function lookupInStageMap(
  byStage: Map<string, number>,
  stage: string,
): number | null {
  if (byStage.has(stage)) return byStage.get(stage)!;
  let best: { score: number; probability: number } | null = null;
  for (const [name, probability] of byStage.entries()) {
    let score = 0;
    if (name === stage) score = 1000;
    else if (name.includes(stage) || stage.includes(name)) {
      score = Math.min(name.length, stage.length);
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { score, probability };
    }
  }
  return best ? best.probability : null;
}

export function resolveDealProbabilityFromStages(
  deal: {
    pipeline?: unknown;
    stage?: string;
    probability?: number;
  },
  stageMaps: Map<string, Map<string, number>>,
): number {
  const stage = normStage(deal.stage);
  const fallback = clampProbability(Number(deal.probability) || 0);
  if (!stage) return fallback;

  const pipelineId = deal.pipeline ? String(deal.pipeline) : '';
  if (pipelineId) {
    const byStage = stageMaps.get(pipelineId);
    if (byStage) {
      const hit = lookupInStageMap(byStage, stage);
      if (hit != null) return hit;
    }
  }

  for (const byStage of stageMaps.values()) {
    const hit = lookupInStageMap(byStage, stage);
    if (hit != null) return hit;
  }

  return fallback;
}
