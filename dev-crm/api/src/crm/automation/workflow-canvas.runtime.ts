import { Types } from 'mongoose';
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasGraph,
  WorkflowCanvasNode,
} from './workflow-canvas.types';

/** Result of resolving Yes/No edges from `wf_wait_email_engagement`. */
export type WaitEmailOutgoingResolution =
  | {
      mode: 'both';
      openedEdge: WorkflowCanvasEdge;
      timeoutEdge: WorkflowCanvasEdge;
    }
  | {
      /** Only a timeout (No) edge — opens end the workflow with no follow-up step. */
      mode: 'timeout_only';
      timeoutEdge: WorkflowCanvasEdge;
    };

export function hashPercent(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 100;
}

export function pickAbVariant(
  entityId: Types.ObjectId,
  workflowId: Types.ObjectId,
  splitPercentA: number,
): 'A' | 'B' {
  const p = Math.min(100, Math.max(0, splitPercentA));
  const v = hashPercent(`${entityId.toString()}:${workflowId.toString()}`);
  return v < p ? 'A' : 'B';
}

export function buildNodeMap(
  g: WorkflowCanvasGraph,
): Map<string, WorkflowCanvasNode> {
  const m = new Map<string, WorkflowCanvasNode>();
  for (const n of g.nodes || []) m.set(n.id, n);
  return m;
}

export function outgoingEdges(
  g: WorkflowCanvasGraph,
  sourceId: string,
): WorkflowCanvasEdge[] {
  return (g.edges || []).filter((e) => e.source === sourceId);
}

export function pickEdge(
  edges: WorkflowCanvasEdge[],
  branch: 'default' | 'yes' | 'no' | 'a' | 'b',
): WorkflowCanvasEdge | undefined {
  const exact = edges.find((e) => (e.branch || 'default') === branch);
  if (exact) return exact;
  // Named branches must match exactly — do not fall back to "default" or both
  // Yes/No (condition, wait open) and A/B would otherwise resolve to the same edge.
  if (branch !== 'default') return undefined;
  return edges.find((e) => !e.branch || e.branch === 'default');
}

/**
 * Resolves Yes / No outgoing edges for `wf_wait_email_engagement`.
 * Handles: explicit yes+no, two unlabeled edges (legacy), one labeled + one default,
 * or a single No/default edge (timeout follow-up only; opens end the run).
 */
export function resolveWaitEmailOutgoingEdges(
  outs: WorkflowCanvasEdge[],
): WaitEmailOutgoingResolution | null {
  if (outs.length === 0) return null;

  if (outs.length === 1) {
    const e = outs[0];
    const b = e.branch || 'default';
    if (b === 'yes') {
      return null;
    }
    return { mode: 'timeout_only', timeoutEdge: e };
  }

  let openedEdge = pickEdge(outs, 'yes');
  let timeoutEdge = pickEdge(outs, 'no');

  if (openedEdge && timeoutEdge && openedEdge.id !== timeoutEdge.id) {
    return { mode: 'both', openedEdge, timeoutEdge };
  }

  const legacyBothDefault =
    outs.length === 2 &&
    outs.every((e) => !e.branch || e.branch === 'default');
  if ((!openedEdge || !timeoutEdge) && legacyBothDefault) {
    const [e0, e1] = [...outs].sort((x, y) => x.id.localeCompare(y.id));
    return { mode: 'both', openedEdge: e0, timeoutEdge: e1 };
  }

  if (outs.length === 2) {
    const defaults = outs.filter((e) => !e.branch || e.branch === 'default');
    if (defaults.length === 1) {
      const d = defaults[0];
      if (openedEdge && !timeoutEdge && openedEdge.id !== d.id) {
        return { mode: 'both', openedEdge, timeoutEdge: d };
      }
      if (timeoutEdge && !openedEdge && timeoutEdge.id !== d.id) {
        return { mode: 'both', openedEdge: d, timeoutEdge };
      }
    }
  }

  return null;
}
