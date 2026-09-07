"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { CheckSquare, MessageSquare, History, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCrmUserLabel, taskAssigneeOptionValue, type CrmPortalUserOption } from "@/components/crm/inbox/ActivityLogger";
import { CrmPersonSearchSelect } from "@/components/crm/ui/CrmPersonSearchSelect";
import { buildCrmUserSearchOptions } from "@/lib/crm/build-crm-user-search-options";

export type TaskChecklistItem = { id: string; title: string; done?: boolean };
export type TaskComment = {
  id: string;
  body: string;
  authorName?: string;
  createdAt?: string;
};
export type TaskLogEntry = {
  id: string;
  at?: string;
  action?: string;
  detail?: string;
  actorName?: string;
};

export type CrmTask = {
  _id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
  status: string;
  relatedTo?: string | { _id?: string };
  relatedType?: string;
  metadata?: {
    priority?: string;
    dueDate?: string;
    checklist?: TaskChecklistItem[];
    comments?: TaskComment[];
    activityLog?: TaskLogEntry[];
    relatedPropertyId?: string;
    relatedPropertyTitle?: string;
    propertyListingId?: string;
    pmRole?: string;
    pmPipeline?: boolean;
    escalated?: boolean;
    /** Explicitly marked overdue from Column / board (not only past due date). */
    markedOverdue?: boolean;
    assigneeName?: string;
    pmAssigneeName?: string;
  };
  author?: CrmPortalUserOption | string;
  assignee?: CrmPortalUserOption | string;
};

function personId(p: CrmPortalUserOption | string | undefined): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  return taskAssigneeOptionValue(p);
}

export function normalizeTaskStatus(status?: string): string {
  const s = String(status || "").trim();
  if (!s || ["Backlog", "To Do", "Pending", "Open"].includes(s)) return "Open";
  if (["Completed", "Done"].includes(s)) return "Done";
  return s || "Open";
}

export function isTaskOverdue(task: CrmTask): boolean {
  if (normalizeTaskStatus(task.status) === "Done") return false;
  if (task.metadata?.markedOverdue) return true;
  const due = task.metadata?.dueDate;
  if (!due) return false;
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return dueDate.getTime() < startOfToday.getTime();
}

/** Yesterday ISO for forcing a task into the Overdue lane. */
export function yesterdayDueDateIso(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

/** Open escalations — Done tasks leave this lane. */
export function isTaskEscalated(task: CrmTask): boolean {
  if (normalizeTaskStatus(task.status) === "Done") return false;
  return Boolean(task.metadata?.escalated);
}

export function TaskDetailBody({
  task,
  crmUsers,
  onPatch,
  canManageTeam,
}: {
  task: CrmTask;
  crmUsers: CrmPortalUserOption[];
  onPatch: (payload: Record<string, unknown>) => Promise<void>;
  canManageTeam?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [escalateTo, setEscalateTo] = useState("");
  const [reassignTo, setReassignTo] = useState(personId(task.assignee as CrmPortalUserOption));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"reassign" | "escalate" | "comment" | "checklist" | null>(null);

  const checklist = task.metadata?.checklist || [];
  const comments = task.metadata?.comments || [];
  const log = task.metadata?.activityLog || [];
  const assigneeOptions = useMemo(() => buildCrmUserSearchOptions(crmUsers), [crmUsers]);
  const escalateOptions = useMemo(
    () => buildCrmUserSearchOptions(crmUsers, { taskAssigneeValues: false }),
    [crmUsers],
  );

  useEffect(() => {
    setReassignTo(personId(task.assignee as CrmPortalUserOption));
  }, [task._id, task.assignee]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  const listingId = task.metadata?.relatedPropertyId || task.metadata?.propertyListingId;
  const relatedId =
    typeof task.relatedTo === "string"
      ? task.relatedTo
      : task.relatedTo && typeof task.relatedTo === "object"
        ? String((task.relatedTo as { _id?: string })._id || "")
        : "";

  const run = async (
    payload: Record<string, unknown>,
    kind?: "reassign" | "escalate" | "comment" | "checklist",
  ) => {
    setBusy(true);
    try {
      await onPatch(payload);
      if (kind) setFlash(kind);
    } catch {
      // Toast handled by parent when available
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-5">
      {task.metadata?.pmPipeline ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
          Property Management pipeline{task.metadata.pmRole ? ` · ${task.metadata.pmRole}` : ""}
          {task.metadata.escalated ? " · Escalated" : ""}
        </p>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">Description</h3>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-sm leading-relaxed text-[var(--text-main)]">
          {task.content?.replace(/<[^>]*>?/gm, "") || "No description."}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {relatedId && task.relatedType === "Lead" ? (
          <Link href={`/crm/leads/${relatedId}`} className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline">
            Open lead <ArrowUpRight size={12} />
          </Link>
        ) : null}
        {listingId ? (
          <Link
            href={`/crm/property-listings/${listingId}`}
            className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline"
          >
            {task.metadata?.relatedPropertyTitle || "Open property"} <ArrowUpRight size={12} />
          </Link>
        ) : null}
      </div>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <CheckSquare size={13} /> Checklist / sub-tasks
        </h3>
        <ul className="space-y-1.5">
          {checklist.map((item, idx) => (
            <li key={`check-${item.id || "x"}-${idx}`}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(item.done)}
                  disabled={busy}
                  onChange={() => {
                    const next = checklist.map((c, i) =>
                      i === idx ? { ...c, done: !c.done } : c,
                    );
                    void run({ metadata: { checklist: next } }, "checklist");
                  }}
                />
                <span className={cn(item.done && "line-through text-[var(--text-muted)]")}>{item.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex min-w-0 gap-2">
          <input
            value={checklistTitle}
            onChange={(e) => setChecklistTitle(e.target.value)}
            placeholder="Add a sub-task…"
            className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border-color)] px-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !checklistTitle.trim()}
            className="h-9 shrink-0 rounded-md bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => {
              const next = [
                ...checklist,
                { id: `c-${Date.now()}`, title: checklistTitle.trim(), done: false },
              ];
              setChecklistTitle("");
              void run({ metadata: { checklist: next } }, "checklist");
            }}
          >
            {flash === "checklist" ? (
              <span className="inline-flex items-center gap-1">
                <Check size={12} strokeWidth={2.5} /> Saved
              </span>
            ) : (
              "Add"
            )}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <MessageSquare size={13} /> Comments
        </h3>
        <ul className="max-h-40 space-y-2 overflow-y-auto">
          {comments.length === 0 ? (
            <li className="text-xs text-[var(--text-muted)]">No comments yet.</li>
          ) : (
            comments.map((c, idx) => (
              <li
                key={`comment-${c.id || "x"}-${idx}`}
                className="rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
              >
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                  {c.authorName || "Someone"} · {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                </p>
                <p className="mt-0.5">{c.body}</p>
              </li>
            ))
          )}
        </ul>
        <div className="flex min-w-0 gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a comment…"
            className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border-color)] px-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !comment.trim()}
            className="h-9 shrink-0 rounded-md border border-[var(--border-color)] px-3 text-xs font-semibold disabled:opacity-50"
            onClick={() => {
              const body = comment.trim();
              setComment("");
              void run({ comment: body }, "comment");
            }}
          >
            {busy && !flash ? (
              <Loader2 size={12} className="animate-spin" />
            ) : flash === "comment" ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check size={12} strokeWidth={2.5} /> Posted
              </span>
            ) : (
              "Post"
            )}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Reassign</p>
          <div className="flex min-w-0 items-center gap-2">
            <CrmPersonSearchSelect
              className="min-w-0 flex-1"
              value={reassignTo}
              onChange={setReassignTo}
              options={assigneeOptions}
              emptyLabel="Unassigned"
              placeholder="Type a name to search…"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy}
              className={cn(
                "h-9 shrink-0 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 transition-colors",
                flash === "reassign" ? "bg-emerald-600" : "bg-[var(--primary)]",
              )}
              onClick={() => {
                const picked = crmUsers.find(
                  (u) => taskAssigneeOptionValue(u) === reassignTo || u._id === reassignTo,
                );
                void run(
                  {
                    assignee: reassignTo || null,
                    metadata: picked
                      ? {
                          assigneeSource: picked.source || "crm",
                          assigneeName: formatCrmUserLabel(picked),
                          assigneeEmail: picked.email,
                          twobighaAdminId: picked.twobighaAdminId,
                          assigneeRole: picked.roleLabel,
                        }
                      : undefined,
                  },
                  "reassign",
                );
              }}
            >
              {busy && flash !== "reassign" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Saving
                </span>
              ) : flash === "reassign" ? (
                <span className="inline-flex items-center gap-1">
                  <Check size={12} strokeWidth={2.5} /> Assigned
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>

        {canManageTeam ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--text-muted)]">Escalate</p>
            <div className="flex min-w-0 items-center gap-2">
              <CrmPersonSearchSelect
                className="min-w-0 flex-1"
                value={escalateTo}
                onChange={setEscalateTo}
                options={escalateOptions}
                emptyLabel="Manager (reports-to)"
                placeholder="Type a name to search…"
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "h-9 shrink-0 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 transition-colors",
                  flash === "escalate" ? "bg-emerald-600" : "bg-amber-500",
                )}
                onClick={() =>
                  void run(
                    { escalate: true, escalateTo: escalateTo || undefined },
                    "escalate",
                  )
                }
              >
                {busy && flash !== "escalate" ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> …
                  </span>
                ) : flash === "escalate" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check size={12} strokeWidth={2.5} /> Escalated
                  </span>
                ) : (
                  "Escalate"
                )}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
          <History size={13} /> Activity log
        </h3>
        <ul className="max-h-36 space-y-1.5 overflow-y-auto text-xs text-[var(--text-muted)]">
          {log.length === 0 ? (
            <li>No history yet.</li>
          ) : (
            log.map((row, idx) => (
              <li
                key={`log-${row.id || "x"}-${idx}-${row.at || ""}`}
                className="border-l-2 border-[var(--border-color)] pl-2"
              >
                <span className="font-semibold text-[var(--text-main)]">{row.action}</span>
                {row.detail ? ` — ${row.detail}` : ""}
                <div>
                  {row.actorName || "System"}
                  {row.at ? ` · ${new Date(row.at).toLocaleString()}` : ""}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
