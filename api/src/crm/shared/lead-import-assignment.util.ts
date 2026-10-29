/**
 * Pure helpers for the "who owns the imported leads" options of the bulk lead import.
 * Authorization (team scope etc.) is NOT decided here — `CrmAssignmentPolicyService`
 * does that; these only parse the request and spread rows over the chosen assignees.
 */

export const LEAD_IMPORT_ASSIGN_MODES = ['self', 'single', 'round_robin', 'file'] as const;
export type LeadImportAssignMode = (typeof LEAD_IMPORT_ASSIGN_MODES)[number];

/** Upper bound on assignees in one import — keeps the up-front policy checks cheap. */
export const LEAD_IMPORT_MAX_ASSIGNEES = 200;

export type LeadImportAssignment = {
  mode: LeadImportAssignMode;
  /** HRMS user ids / emails / names exactly as the picker sent them (single → 1, round_robin → 2+). */
  assignees: string[];
  /**
   * Duplicates that already exist (merge / replace) normally keep their current owner.
   * When true they are handed to the chosen assignee too (still policy-checked per lead).
   */
  reassignExisting: boolean;
  /** `file` mode only: a row whose owner cell is blank/unknown falls back to the importer instead of failing. */
  fallbackToSelf: boolean;
};

export class LeadImportAssignmentError extends Error {}

/**
 * Parses the multipart `assignment` field. `undefined` means "legacy behaviour" (the caller
 * keeps its previous owner logic) so old clients keep working.
 */
export function parseLeadImportAssignment(raw: unknown): LeadImportAssignment | undefined {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  let obj: any;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new LeadImportAssignmentError('Invalid assignment options');
  }
  if (!obj || typeof obj !== 'object') {
    throw new LeadImportAssignmentError('Invalid assignment options');
  }
  const mode = String(obj.mode || 'self') as LeadImportAssignMode;
  if (!LEAD_IMPORT_ASSIGN_MODES.includes(mode)) {
    throw new LeadImportAssignmentError(
      `Unknown assignment mode "${String(obj.mode)}". Use one of: ${LEAD_IMPORT_ASSIGN_MODES.join(', ')}.`,
    );
  }
  const seen = new Set<string>();
  const assignees: string[] = [];
  for (const a of Array.isArray(obj.assignees) ? obj.assignees : []) {
    const v = String(a ?? '').trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    assignees.push(v);
  }
  if (assignees.length > LEAD_IMPORT_MAX_ASSIGNEES) {
    throw new LeadImportAssignmentError(
      `You can spread an import over at most ${LEAD_IMPORT_MAX_ASSIGNEES} assignees.`,
    );
  }
  if (mode === 'single' && assignees.length !== 1) {
    throw new LeadImportAssignmentError('Pick exactly one assignee.');
  }
  if (mode === 'round_robin' && assignees.length < 2) {
    throw new LeadImportAssignmentError('Pick at least two assignees to distribute leads between.');
  }
  return {
    mode,
    assignees: mode === 'single' || mode === 'round_robin' ? assignees : [],
    reassignExisting: obj.reassignExisting === true,
    fallbackToSelf: obj.fallbackToSelf === true,
  };
}

/** Cycles through `items` in order: a, b, c, a, b, … */
export function createRoundRobin<T>(items: readonly T[]): () => T {
  if (!items.length) throw new Error('createRoundRobin needs at least one item');
  let i = 0;
  return () => items[i++ % items.length];
}
