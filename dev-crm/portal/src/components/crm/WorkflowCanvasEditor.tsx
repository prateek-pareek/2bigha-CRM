"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useEdges,
  Panel,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch, Timer, Zap, Split, MousePointerClick, Waypoints, Mail, Trash2 } from "lucide-react";
import {
  WORKFLOW_FLOW_START,
  type WorkflowCanvasApiEdge,
  type WorkflowCanvasApiGraph,
  type WorkflowCanvasApiNode,
  type WorkflowCanvasPipelineOption,
} from "@/lib/crm/workflow-canvas-graph";
import {
  type WorkflowCanvasEntityKind,
  type WorkflowCustomFieldDef,
} from "@/lib/crm/workflow-field-presets";
import { WorkflowFilterList } from "@/components/crm/WorkflowFilterList";
import { normalizeWorkflowFilter } from "@/lib/crm/workflow-filter-utils";
import WorkflowSendEmailActionFields from "@/components/crm/WorkflowSendEmailActionFields";
import { WorkflowSetPropertyFields } from "@/components/crm/WorkflowSetPropertyFields";
import { WorkflowMovePipelineStageFields } from "@/components/crm/WorkflowMovePipelineStageFields";
import { WorkflowSegmentActionFields } from "@/components/crm/WorkflowSegmentActionFields";

export type { WorkflowCanvasEntityKind } from "@/lib/crm/workflow-field-presets";

function newId(prefix: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${prefix}-${crypto.randomUUID().slice(0, 8)}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function apiToFlow(g: WorkflowCanvasApiGraph): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = [
    {
      id: WORKFLOW_FLOW_START,
      type: "wf_start",
      position: { x: 0, y: 160 },
      data: {},
      draggable: false,
      deletable: false,
    },
  ];
  const depths = new Map<string, number>();
  const q = [WORKFLOW_FLOW_START];
  depths.set(WORKFLOW_FLOW_START, 0);
  while (q.length) {
    const id = q.shift()!;
    const d = depths.get(id)!;
    for (const e of g.edges.filter((x) => x.source === id)) {
      const nd = d + 1;
      if (!depths.has(e.target) || (depths.get(e.target) ?? 0) < nd) {
        depths.set(e.target, nd);
        q.push(e.target);
      }
    }
  }
  for (const n of g.nodes) {
    const depth = depths.get(n.id) ?? 1;
    const idx = g.nodes.filter((x) => (depths.get(x.id) ?? 1) === depth).indexOf(n);
    const row = g.nodes.filter((x) => (depths.get(x.id) ?? 1) === depth).length;
    const yOff = (idx - (row - 1) / 2) * 140;
    flowNodes.push({
      id: n.id,
      type: n.type,
      position: { x: 60 + depth * 280, y: 80 + yOff },
      data: { ...n },
    });
  }
  const flowEdges: Edge[] = g.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle:
      e.branch === "yes" ? "yes" : e.branch === "no" ? "no" : e.branch === "a" ? "a" : e.branch === "b" ? "b" : undefined,
    label:
      e.branch === "yes"
        ? "Yes"
        : e.branch === "no"
          ? "No"
          : e.branch === "a"
            ? "A"
            : e.branch === "b"
              ? "B"
              : undefined,
    style: {
      stroke:
        e.branch === "yes" ? "#059669" : e.branch === "no" ? "#dc2626" : e.branch === "a" ? "#7c3aed" : e.branch === "b" ? "#ea580c" : "#94a3b8",
    },
  }));
  return { nodes: flowNodes, edges: flowEdges };
}

function flowToApi(nodes: Node[], edges: Edge[]): WorkflowCanvasApiGraph {
  const apiNodes: WorkflowCanvasApiNode[] = [];
  for (const n of nodes) {
    if (n.id === WORKFLOW_FLOW_START) continue;
    const d = (n.data || {}) as WorkflowCanvasApiNode;
    apiNodes.push({
      ...d,
      id: n.id,
      type: (n.type || d.type) as WorkflowCanvasApiNode["type"],
    });
  }
  const apiEdges: WorkflowCanvasApiEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    branch:
      e.sourceHandle === "yes"
        ? "yes"
        : e.sourceHandle === "no"
          ? "no"
          : e.sourceHandle === "a"
            ? "a"
            : e.sourceHandle === "b"
              ? "b"
              : "default",
  }));
  return { nodes: apiNodes, edges: apiEdges };
}

function StartNode() {
  return (
    <div className="rounded-[3px] border-2 border-violet-400 bg-gradient-to-br from-violet-50 to-white px-4 py-3 shadow-md min-w-[140px]">
      <Handle type="source" position={Position.Right} className="!bg-violet-600 !w-3 !h-3" />
      <div className="flex items-center gap-2 text-violet-900">
        <Zap size={16} />
        <span className="text-xs font-semibold">Start</span>
      </div>
      <p className="mt-1 text-xs font-medium text-violet-800/80">After entry criteria</p>
    </div>
  );
}

function defaultActionForCanvasType(t: string): Record<string, unknown> {
  switch (t) {
    case "move_pipeline_stage":
      return { type: "move_pipeline_stage", pipelineId: "", stage: "" };
    case "set_property":
      return { type: "set_property", field: "stage", value: "" };
    case "add_to_segment":
      return { type: "add_to_segment", segmentId: "" };
    case "remove_from_segment":
      return { type: "remove_from_segment", segmentId: "" };
    case "assign_owner":
      return { type: "assign_owner", ownerName: "" };
    case "create_note":
      return { type: "create_note", body: "" };
    case "notify_teams":
      return { type: "notify_teams", message: "", email: "" };
    case "http_webhook":
      return { type: "http_webhook", url: "", method: "POST" };
    case "send_email_template":
      return {
        type: "send_email_template",
        sendMode: "template",
        templateId: "",
        inboxAccountId: "",
      };
    default:
      return { type: "create_task", title: "Follow up", body: "", dueInDays: 1 };
  }
}

function WfActionNode({
  id,
  data,
  selected,
  emailTemplates,
  inboxAccounts,
  entityKind,
  pipelines,
  customFields,
}: NodeProps & {
  emailTemplates: { _id: string; name: string }[];
  inboxAccounts: { _id: string; email: string; displayName?: string }[];
  entityKind: WorkflowCanvasEntityKind;
  pipelines: WorkflowCanvasPipelineOption[];
  customFields: WorkflowCustomFieldDef[];
}) {
  const d = data as WorkflowCanvasApiNode & { onPatch?: (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => void };
  const action = (d.action || { type: "create_task", title: "Task" }) as Record<string, unknown>;
  const t = String(action.type || "create_task");
  const patchAction = (patch: Record<string, unknown>) => d.onPatch?.(id, { action: { ...action, ...patch } });

  return (
    <div
      className={`rounded-[3px] border bg-white px-3 py-2 shadow-md min-w-[220px] max-w-[320px] ${
        selected ? "border-violet-500 ring-2 ring-violet-200" : "border-[#dfe1e6]"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} className="!bg-violet-600 !w-3 !h-3" />
      <div className="flex items-center gap-1 text-slate-900">
        <MousePointerClick size={14} className="text-violet-600" />
        <span className="text-[9px] font-black uppercase tracking-wider">Action</span>
      </div>
      <select
        className="mt-1 w-full rounded-lg border border-[#ebecf0] py-1 px-1 text-xs font-bold"
        value={t}
        onChange={(e) => d.onPatch?.(id, { action: defaultActionForCanvasType(e.target.value) })}
      >
        <option value="move_pipeline_stage">Move pipeline & stage</option>
        <option value="set_property">Set property</option>
        <option value="add_to_segment">Add to segment</option>
        <option value="remove_from_segment">Remove from segment</option>
        <option value="create_task">Task</option>
        <option value="create_note">Note</option>
        <option value="send_email_template">Send email (template)</option>
        <option value="notify_teams">Teams</option>
        <option value="http_webhook">Webhook</option>
        <option value="assign_owner">Assign owner</option>
      </select>
      <div className="mt-1 space-y-0.5">
        {t === "move_pipeline_stage" && (
          <WorkflowMovePipelineStageFields
            pipelineId={String(action.pipelineId ?? "")}
            stage={String(action.stage ?? "")}
            onChange={(patch) => patchAction(patch as Record<string, unknown>)}
            entityKind={entityKind}
            pipelines={pipelines}
            variant="canvas"
            nodrag
          />
        )}
        {t === "set_property" && (
          <WorkflowSetPropertyFields
            field={String(action.field ?? "")}
            value={action.value}
            onChange={(patch) => patchAction(patch as Record<string, unknown>)}
            entityKind={entityKind}
            pipelines={pipelines}
            customFields={customFields}
            variant="canvas"
            nodrag
          />
        )}
        {(t === "add_to_segment" || t === "remove_from_segment") && (
          <WorkflowSegmentActionFields
            segmentId={String(action.segmentId ?? "")}
            onChange={(patch) => patchAction(patch as Record<string, unknown>)}
            entityKind={entityKind}
            variant="canvas"
            nodrag
          />
        )}
        {t === "create_task" && (
          <>
            <input
              className="w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
              placeholder="title"
              value={String(action.title ?? "")}
              onChange={(e) => patchAction({ title: e.target.value })}
            />
            <input
              type="number"
              min={0}
              className="w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
              placeholder="due days"
              value={action.dueInDays != null ? Number(action.dueInDays) : ""}
              onChange={(e) => patchAction({ dueInDays: parseInt(e.target.value, 10) || 0 })}
            />
          </>
        )}
        {t === "create_note" && (
          <input
            className="w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
            placeholder="note body"
            value={String(action.body ?? "")}
            onChange={(e) => patchAction({ body: e.target.value })}
          />
        )}
        {t === "send_email_template" && (
          <WorkflowSendEmailActionFields
            row={action}
            onChange={(patch) => patchAction(patch)}
            emailTemplates={emailTemplates}
            inboxAccounts={inboxAccounts}
            variant="canvas"
          />
        )}
        {t === "notify_teams" && (
          <>
            <p className="text-[8px] text-amber-800/90 leading-tight rounded border border-amber-100 bg-amber-50/90 px-1 py-0.5">
              Server env: TEAMS_* + TEAMS_SENDER_ID (user object ID).
            </p>
            <input
              className="nodrag nopan w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
              placeholder="M365 recipient email"
              value={String(action.email ?? "")}
              onChange={(e) => patchAction({ email: e.target.value })}
            />
            <input
              className="nodrag nopan w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
              placeholder="message"
              value={String(action.message ?? "")}
              onChange={(e) => patchAction({ message: e.target.value })}
            />
          </>
        )}
        {t === "http_webhook" && (
          <input
            className="w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
            placeholder="https://…"
            value={String(action.url ?? "")}
            onChange={(e) => patchAction({ url: e.target.value })}
          />
        )}
        {t === "assign_owner" && (
          <input
            className="w-full rounded-lg border border-[#ebecf0] px-1 py-0.5 text-xs"
            placeholder="owner name"
            value={String(action.ownerName ?? "")}
            onChange={(e) => patchAction({ ownerName: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

function WfDelayNode({ id, data, selected }: NodeProps) {
  const d = data as WorkflowCanvasApiNode & { onPatch?: (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => void };
  return (
    <div
      className={`rounded-[3px] border bg-amber-50 px-3 py-2 shadow-md min-w-[180px] ${
        selected ? "border-amber-400 ring-2 ring-amber-200" : "border-amber-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} className="!bg-amber-600 !w-3 !h-3" />
      <div className="flex items-center gap-1 text-amber-950">
        <Timer size={14} />
        <span className="text-[9px] font-black uppercase">Delay</span>
      </div>
      <div className="mt-1 flex gap-1 text-[9px]">
        <input
          type="number"
          min={0}
          className="w-10 rounded border border-amber-100 px-0.5"
          value={d.days ?? 0}
          onChange={(e) => d.onPatch?.(id, { days: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        />
        d
        <input
          type="number"
          min={0}
          className="w-10 rounded border border-amber-100 px-0.5"
          value={d.hours ?? 0}
          onChange={(e) => d.onPatch?.(id, { hours: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        />
        h
        <input
          type="number"
          min={0}
          className="w-10 rounded border border-amber-100 px-0.5"
          value={d.minutes ?? 0}
          onChange={(e) => d.onPatch?.(id, { minutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        />
        m
      </div>
    </div>
  );
}

function WfConditionNode({
  id,
  data,
  selected,
  entityKind,
  pipelines,
}: NodeProps & { entityKind: WorkflowCanvasEntityKind; pipelines: WorkflowCanvasPipelineOption[] }) {
  const d = data as WorkflowCanvasApiNode & { onPatch?: (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => void };
  const filters = d.filters?.length
    ? d.filters.map((f) => normalizeWorkflowFilter(f))
    : [];

  const setFilters = (next: WorkflowCanvasApiNode["filters"]) =>
    d.onPatch?.(id, { filters: next });

  return (
    <div
      className={`rounded-[3px] border bg-violet-50 px-3 py-2 shadow-md min-w-[260px] max-w-[320px] ${
        selected ? "border-violet-500 ring-2 ring-violet-200" : "border-violet-200"
      }`}
      onPointerDownCapture={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("select, input, button, option")) {
          e.stopPropagation();
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} id="yes" className="!bg-emerald-500 !w-3 !h-3 !top-[38%]" />
      <Handle type="source" position={Position.Right} id="no" className="!bg-rose-500 !w-3 !h-3 !top-[62%]" />
      <div className="flex items-center gap-1 text-violet-950">
        <GitBranch size={14} />
        <span className="text-[9px] font-black uppercase">Condition (AND)</span>
      </div>
      <div className="mt-1 max-h-[280px] overflow-y-auto flex flex-col gap-2">
        <WorkflowFilterList
          filters={filters}
          onChange={(next) => setFilters(next)}
          entityKind={entityKind}
          pipelines={pipelines}
          variant="canvas"
          nodrag
          showEventFilters
        />
        {filters.length === 0 && (
          <p className="text-[8px] text-violet-800/80 leading-snug px-0.5">
            No rules = always take the Yes path. Add property, segment, or email rules below.
          </p>
        )}
      </div>
    </div>
  );
}

function WfWaitEmailEngagementNode({ id, data, selected }: NodeProps) {
  const d = data as WorkflowCanvasApiNode & { onPatch?: (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => void };
  const rfEdges = useEdges();
  const outgoing = rfEdges.filter((e) => e.source === id);
  const hs = outgoing.map((e) => e.sourceHandle ?? "");
  const branchOk = (() => {
    if (outgoing.length === 0) return false;
    if (outgoing.length === 1) return hs[0] !== "yes";
    if (outgoing.length === 2) {
      const hasY = hs.includes("yes");
      const hasN = hs.includes("no");
      if (hasY && hasN) return true;
      if (hs.every((h) => !h)) return true;
      if ((hasY || hasN) && hs.some((h) => !h)) return true;
      return false;
    }
    return false;
  })();
  const needsBranches = !branchOk;
  return (
    <div
      className={`rounded-[3px] border bg-sky-50 px-3 py-2 shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "border-sky-500 ring-2 ring-sky-200" : "border-sky-200"
      } ${needsBranches ? "ring-2 ring-amber-300 border-amber-400/80" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-sky-500 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} id="yes" className="!bg-emerald-500 !w-3 !h-3 !top-[38%]" />
      <Handle type="source" position={Position.Right} id="no" className="!bg-rose-500 !w-3 !h-3 !top-[62%]" />
      <div className="flex items-center gap-1 text-sky-950">
        <Mail size={14} />
        <span className="text-[9px] font-black uppercase">Wait · email open</span>
      </div>
      <p className="mt-1 text-[8px] font-medium text-sky-900/90 leading-snug">
        After a tracked Send email in this flow, polls opens. <span className="font-bold text-emerald-800">Yes</span> = opened ·{" "}
        <span className="font-bold text-rose-800">No</span> = not opened by deadline.
      </p>
      <p className="mt-1 text-[8px] font-medium text-sky-900/80 leading-snug">
        Red <span className="font-bold text-rose-800">No</span> = not opened by deadline (required for timeout follow-up). Green{" "}
        <span className="font-bold text-emerald-800">Yes</span> is optional if you only send on timeout.
      </p>
      {needsBranches && (
        <p className="mt-1.5 rounded-md bg-amber-100/90 px-1.5 py-1 text-[8px] font-semibold leading-snug text-amber-950">
          Connect the <span className="text-rose-800">red No</span> handle for your timeout follow-up (or both Yes and No for different paths). Green Yes alone skips this step.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-bold text-sky-900">
        <label className="inline-flex flex-col gap-0.5">
          <span className="text-[8px] font-semibold text-sky-800/90">Max wait (min)</span>
          <input
            type="number"
            min={1}
            max={10080}
            step={1}
            title="Minutes until the No (timeout) branch runs if the email was not opened (1 min to 7 days)."
            className="w-14 rounded border border-sky-100 px-0.5"
            value={
              d.waitTotalMinutes != null && d.waitTotalMinutes !== undefined
                ? d.waitTotalMinutes
                : (d.waitHours != null ? d.waitHours * 60 : 48 * 60)
            }
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              const clamped = Math.min(10080, Math.max(1, Number.isFinite(v) ? v : 48 * 60));
              d.onPatch?.(id, { waitTotalMinutes: clamped });
            }}
          />
        </label>
        <label className="inline-flex flex-col gap-0.5">
          <span className="text-[8px] font-semibold text-sky-800/90">Poll every (min)</span>
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            className="w-12 rounded border border-sky-100 px-0.5"
            value={d.pollMinutes ?? 5}
            onChange={(e) =>
              d.onPatch?.(id, { pollMinutes: Math.min(120, Math.max(1, parseInt(e.target.value, 10) || 5)) })
            }
          />
        </label>
      </div>
    </div>
  );
}

function WfAbSplitNode({ id, data, selected }: NodeProps) {
  const d = data as WorkflowCanvasApiNode & { onPatch?: (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => void };
  return (
    <div
      className={`rounded-[3px] border bg-fuchsia-50 px-3 py-2 shadow-md min-w-[200px] ${
        selected ? "border-fuchsia-500 ring-2 ring-fuchsia-200" : "border-fuchsia-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-fuchsia-500 !w-3 !h-3" />
      <Handle type="source" position={Position.Right} id="a" className="!bg-violet-600 !w-3 !h-3 !top-[38%]" />
      <Handle type="source" position={Position.Right} id="b" className="!bg-orange-500 !w-3 !h-3 !top-[62%]" />
      <div className="flex items-center gap-1 text-fuchsia-950">
        <Split size={14} />
        <span className="text-[9px] font-black uppercase">A / B</span>
      </div>
      <label className="mt-1 block text-[9px] font-bold text-fuchsia-900">
        % to A
        <input
          type="number"
          min={0}
          max={100}
          className="ml-1 w-14 rounded border border-fuchsia-100 px-1"
          value={d.splitPercentA ?? 50}
          onChange={(e) => d.onPatch?.(id, { splitPercentA: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
        />
      </label>
    </div>
  );
}

/** Must render inside <ReactFlow>; deletes selected nodes/edges except Start. */
function CanvasDeleteControls() {
  const { getNodes, getEdges, deleteElements } = useReactFlow();
  const removeSelected = useCallback(() => {
    const nodes = getNodes().filter((n) => n.selected && n.id !== WORKFLOW_FLOW_START);
    const edges = getEdges().filter((e) => e.selected);
    if (nodes.length === 0 && edges.length === 0) return;
    void deleteElements({
      ...(nodes.length ? { nodes } : {}),
      ...(edges.length ? { edges } : {}),
    });
  }, [getNodes, getEdges, deleteElements]);

  return (
    <Panel position="top-right" className="m-2">
      <button
        type="button"
        onClick={removeSelected}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
        title="Remove selected nodes or edges (Delete / Backspace)"
      >
        <Trash2 size={13} strokeWidth={2.25} />
        Remove selected
      </button>
    </Panel>
  );
}

export default function WorkflowCanvasEditor({
  value,
  onChange,
  entityKind = "any",
  pipelines = [],
  emailTemplates = [],
  inboxAccounts = [],
  customFields = [],
  layout = "default",
}: {
  value: WorkflowCanvasApiGraph | null;
  onChange: (g: WorkflowCanvasApiGraph) => void;
  entityKind?: WorkflowCanvasEntityKind;
  pipelines?: WorkflowCanvasPipelineOption[];
  emailTemplates?: { _id: string; name: string }[];
  inboxAccounts?: { _id: string; email: string; displayName?: string }[];
  customFields?: WorkflowCustomFieldDef[];
  /** `page` = taller surface for full-page workflow editor */
  layout?: "default" | "page";
}) {
  const nodeTypes = useMemo(
    () => ({
      wf_start: StartNode,
      wf_action: (props: NodeProps) => (
        <WfActionNode
          {...props}
          emailTemplates={emailTemplates}
          inboxAccounts={inboxAccounts}
          entityKind={entityKind}
          pipelines={pipelines}
          customFields={customFields}
        />
      ),
      wf_delay: WfDelayNode,
      wf_condition: (props: NodeProps) => <WfConditionNode {...props} entityKind={entityKind} pipelines={pipelines} />,
      wf_wait_email_engagement: WfWaitEmailEngagementNode,
      wf_ab_split: WfAbSplitNode,
    }),
    [entityKind, pipelines, emailTemplates, inboxAccounts, customFields],
  );
  const initial = useMemo(
    () => apiToFlow(value?.nodes?.length ? value! : { nodes: [], edges: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset via parent `key` when switching workflow
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const lastJson = useRef("");

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<WorkflowCanvasApiNode>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          return { ...n, data: { ...(n.data as object), ...patch } };
        }),
      );
    },
    [setNodes],
  );

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === WORKFLOW_FLOW_START) return n;
        return {
          ...n,
          data: {
            ...(n.data as object),
            onPatch: patchNode,
          },
        };
      }),
    );
  }, [patchNode, setNodes]);

  useEffect(() => {
    const g = flowToApi(nodes, edges);
    const s = JSON.stringify(g);
    if (s === lastJson.current) return;
    lastJson.current = s;
    onChange(g);
  }, [nodes, edges, onChange]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges],
  );

  const isValidConnection = useCallback(
    (edgeOrConn: Connection | Edge) => {
      const src = edgeOrConn.source;
      if (!src || src === WORKFLOW_FLOW_START) return true;
      const srcNode = nodes.find((n) => n.id === src);
      const t = srcNode?.type;
      if (
        t === "wf_wait_email_engagement" ||
        t === "wf_condition" ||
        t === "wf_ab_split"
      ) {
        const sh =
          "sourceHandle" in edgeOrConn ? edgeOrConn.sourceHandle : undefined;
        return !!(sh != null && String(sh).length);
      }
      return true;
    },
    [nodes],
  );

  const addNode = (type: WorkflowCanvasApiNode["type"]) => {
    const id = newId(type);
    const base: WorkflowCanvasApiNode = {
      id,
      type,
      ...(type === "wf_delay" ? { days: 0, hours: 1, minutes: 0 } : {}),
      ...(type === "wf_condition" ? { filters: [{ field: "stage", operator: "equals", value: "" }] } : {}),
      ...(type === "wf_ab_split" ? { splitPercentA: 50 } : {}),
      ...(type === "wf_wait_email_engagement"
        ? { waitTotalMinutes: 48 * 60, pollMinutes: 5 }
        : {}),
      ...(type === "wf_action" ? { action: { type: "create_task", title: "Follow up" } } : {}),
    };
    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: { x: 400 + Math.random() * 40, y: 120 + Math.random() * 40 },
        data: { ...base, onPatch: patchNode },
      },
    ]);
  };

  const surfaceClass =
    layout === "page"
      ? "min-h-[min(720px,78vh)] h-[min(780px,78vh)]"
      : "min-h-[520px] h-[min(560px,58vh)]";

  return (
    <ReactFlowProvider>
      <div
        className={`${surfaceClass} w-full rounded-[3px] border border-[#dfe1e6]/90 bg-gradient-to-b from-slate-100/40 via-white to-slate-50/30 shadow-inner ring-1 ring-slate-100/80 overflow-hidden`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          deleteKeyCode={["Backspace", "Delete"]}
          onBeforeDelete={async ({ nodes: nodeList, edges: edgeList }) => {
            const nodes = nodeList.filter((n) => n.id !== WORKFLOW_FLOW_START);
            if (nodes.length === 0 && edgeList.length === 0) return false;
            return { nodes, edges: edgeList };
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.35}
          maxZoom={1.6}
          nodeDragThreshold={8}
          defaultEdgeOptions={{
            style: { stroke: "#94a3b8", strokeWidth: 1.75 },
            animated: true,
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} className="!bg-transparent" />
          <Controls className="!shadow-lg !border-[#dfe1e6]/80 !rounded-[3px] !overflow-hidden" />
          <MiniMap
            className="!rounded-[3px] !border !border-[#dfe1e6]/80 !shadow-md !bg-white/90"
            maskColor="rgb(148, 163, 184, 0.12)"
          />
          <Panel position="top-left" className="m-2 flex flex-wrap gap-1.5 rounded-[3px] border border-[#dfe1e6]/80 bg-white/95 p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => addNode("wf_action")}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors"
            >
              <MousePointerClick size={13} strokeWidth={2.25} /> Action
            </button>
            <button
              type="button"
              onClick={() => addNode("wf_delay")}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors"
            >
              <Timer size={13} strokeWidth={2.25} /> Delay
            </button>
            <button
              type="button"
              onClick={() => addNode("wf_condition")}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors"
            >
              <Waypoints size={13} strokeWidth={2.25} /> Condition
            </button>
            <button
              type="button"
              onClick={() => addNode("wf_wait_email_engagement")}
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-cyan-700 transition-colors"
            >
              <Mail size={13} strokeWidth={2.25} /> Wait open
            </button>
            <button
              type="button"
              onClick={() => addNode("wf_ab_split")}
              className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-fuchsia-700 transition-colors"
            >
              <Split size={13} strokeWidth={2.25} /> A/B
            </button>
          </Panel>
          <CanvasDeleteControls />
        </ReactFlow>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 leading-snug">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
          <Zap size={12} className="text-amber-500" /> Connect from Start
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
          <Trash2 size={12} className="text-rose-500" /> Select a node or edge, then Delete / Backspace or &quot;Remove selected&quot;
        </span>
        <span>
          Condition → Yes / No · Wait open → Yes (opened) / No (timeout) · A/B → A / B · Put Send email before Wait open.
        </span>
      </p>
    </ReactFlowProvider>
  );
}
