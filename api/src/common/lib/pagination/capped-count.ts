import { Model } from 'mongoose';
import {
  CRM_COUNT_SCAN_CAP,
  CRM_LIST_MAX_TIME_MS,
} from './list-pagination';

export type CappedCountResult = {
  total: number;
  approximate: boolean;
};

/**
 * Count matching docs with a hard scan cap so list APIs stay responsive at 10M+ rows.
 * When the match set reaches `cap`, `approximate` is true and `total` equals the cap.
 */
export async function countDocumentsCapped<T>(
  model: Model<T>,
  filter: Record<string, unknown>,
  opts?: { cap?: number; maxTimeMS?: number },
): Promise<CappedCountResult> {
  const cap = opts?.cap ?? CRM_COUNT_SCAN_CAP;
  const maxTimeMS = opts?.maxTimeMS ?? CRM_LIST_MAX_TIME_MS;
  const empty =
    !filter ||
    (typeof filter === 'object' && Object.keys(filter as object).length === 0);

  // Unfiltered totals: O(1) estimate from collection metadata.
  if (empty) {
    try {
      const estimated = await model.estimatedDocumentCount().exec();
      return { total: estimated, approximate: true };
    } catch {
      /* fall through to capped count */
    }
  }

  try {
    const rows = await model
      .aggregate<{ n: number }>([
        { $match: filter as Record<string, unknown> },
        { $limit: cap },
        { $count: 'n' },
      ])
      .option({ maxTimeMS })
      .exec();
    const n = rows[0]?.n ?? 0;
    return { total: n, approximate: n >= cap };
  } catch {
    // Fallback: classic count with maxTimeMS (may still be slow on huge filters).
    const total = await model
      .countDocuments(filter as any)
      .maxTimeMS(maxTimeMS)
      .exec();
    return { total, approximate: false };
  }
}
