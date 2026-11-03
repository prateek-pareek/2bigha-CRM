"use client";

import { useState, useEffect, useMemo } from "react";
import { Send, Calendar, CheckSquare, Video, MessageCircle } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from "@/lib/crm/api";
import { crmRecordIdFromParams } from "@/lib/crm/crm-route-params";
import { formatCrmUserLabel, taskAssigneeOptionValue, type CrmPortalUserOption } from "@/components/crm/inbox/ActivityLogger";
import { CrmPersonSearchSelect } from "@/components/crm/ui/CrmPersonSearchSelect";
import { buildCrmUserSearchOptions } from "@/lib/crm/build-crm-user-search-options";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import SocialPostPreview from '../sales/SocialPostPreview';
import { DatePickerField } from "@/components/ui/date-picker";
import { MediaAttachToolbar } from "@/components/media/MediaAttachToolbar";
import type { MediaAttachment } from "@/lib/media/upload-media";
import { cn } from "@/lib/utils";

export type CrmActivityRelatedType =
  | "Lead"
  | "Contact"
  | "Client"
  | "Organization"
  | "Property";

const BASE_TYPES = ["Activity", "Note", "Call", "Task", "Meeting", "Email"] as const;

type RecordTaskContext = {
  record: { type: string; id: string; name: string; link: string };
  owner: { id: string; label: string } | null;
  unassigned: boolean;
  canCreate: boolean;
  reason?: string;
  canReassign: boolean;
  defaultAssigneeId: string | null;
  assignees: Array<{ _id: string; label: string; email?: string; roleName?: string }>;
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    return typeof msg === "string" && msg ? msg : fallback;
  } catch {
    return fallback;
  }
}

const DM_CHANNEL_OPTIONS = [
  { value: "", label: "Platform (optional)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "threads", label: "Threads" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "other", label: "Other" },
] as const;

export default function CrmRecordActivityComposer({
  activityType,
  setActivityType,
  newComment,
  setNewComment,
  relatedTo,
  relatedType,
  onActivityPosted,
  onMeetingScheduleClick,
  lead,
}: {
  activityType: string;
  setActivityType: (t: string) => void;
  newComment: string;
  setNewComment: (s: string) => void;
  /** Record id (Next.js route params may be `string | string[]` — normalized before POST). */
  relatedTo: string | string[];
  relatedType: CrmActivityRelatedType;
  onActivityPosted: (data: Record<string, unknown>) => void;
  onMeetingScheduleClick: () => void;
  lead?: any;
}) {
  const { user } = usePermissions();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskStatus, setTaskStatus] = useState("Open");
  const [crmUsers, setCrmUsers] = useState<CrmPortalUserOption[]>([]);
  const [taskReporterId, setTaskReporterId] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [dmChannel, setDmChannel] = useState("");
  const [noteAttachments, setNoteAttachments] = useState<MediaAttachment[]>([]);
  const [fetchedMetadata, setFetchedMetadata] = useState<Record<string, unknown> | null>(null);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);

  /** Tasks from a Lead / Client: assignee rules + picker come from the server (record-task-context). */
  const isRecordTask = relatedType === "Lead" || relatedType === "Client";
  const [recordCtx, setRecordCtx] = useState<RecordTaskContext | null>(null);
  const [recordCtxError, setRecordCtxError] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const recordEntityId = crmRecordIdFromParams(relatedTo);

  const reporterOptions = useMemo(
    () => buildCrmUserSearchOptions(crmUsers, { taskAssigneeValues: false }),
    [crmUsers],
  );
  const assigneeOptions = useMemo(() => buildCrmUserSearchOptions(crmUsers), [crmUsers]);

  const isSocialUrl = (url?: string) =>
    !!url && (
      url.includes('linkedin.com') ||
      url.includes('threads.com') ||
      url.includes('threads.net') ||
      url.includes('facebook.com') ||
      url.includes('fb.watch')
    );

  const detectedType = (src?: string) =>
    !src ? 'generic'
      : src.includes('linkedin.com') ? 'linkedin'
      : src.includes('threads.com') || src.includes('threads.net') ? 'threads'
      : src.includes('facebook.com') || src.includes('fb.watch') ? 'facebook'
      : 'generic';

  // Live-fetch when: no saved metadata, OR saved metadata has no real content, OR saved type is wrong (e.g. 'generic' for a LinkedIn URL)
  const savedType = lead?.sourceMetadata?.type;
  const expectedType = detectedType(lead?.source);
  const savedHasContent = !!(lead?.sourceMetadata?.description || lead?.sourceMetadata?.image || lead?.sourceMetadata?.title)
    && (savedType === expectedType || expectedType === 'generic');
  useEffect(() => {
    if (!isSocialUrl(lead?.source)) return;
    if (savedHasContent) return; // already have real content with correct type
    const token = getCrmAuthToken();
    if (!token) return;
    setIsFetchingMeta(true);
    void fetch(`${CRM_API_URL}/crm/fetch-link-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: lead.source }),
    })
      .then((r) => r.json())
      .then((data) => setFetchedMetadata(data))
      .catch(() => {})
      .finally(() => setIsFetchingMeta(false));
  }, [lead?.source, savedHasContent]);

  // Prefer live-fetched data when saved metadata has no content
  const socialMetadata: Record<string, unknown> | null =
    (savedHasContent ? lead?.sourceMetadata : null) ??
    fetchedMetadata ??
    (isSocialUrl(lead?.source)
      ? {
          url: lead.source,
          type: lead.source.includes('linkedin.com')
            ? 'linkedin'
            : lead.source.includes('threads.com') || lead.source.includes('threads.net')
              ? 'threads'
              : lead.source.includes('facebook.com') || lead.source.includes('fb.watch')
                ? 'facebook'
                : 'generic',
        }
      : null);

  const hasSocialPost = !!socialMetadata;
  const leadOnlyTypes = relatedType === "Lead" ? (["DM"] as const) : [];
  const types = hasSocialPost
    ? [...BASE_TYPES, ...leadOnlyTypes, "Source Post"]
    : [...BASE_TYPES, ...leadOnlyTypes];

  useEffect(() => {
    const token = getCrmAuthToken();
    if (!token) return;
    void fetch(`${CRM_API_URL}/crm-users/list/task-assignees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length) {
          setCrmUsers(data);
          return;
        }
        return fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()).then((fallback) => {
          if (Array.isArray(fallback)) setCrmUsers(fallback);
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isRecordTask || activityType !== "Task" || !recordEntityId) return;
    const token = getCrmAuthToken();
    if (!token) return;
    let cancelled = false;
    setRecordCtxError("");
    void fetch(
      `${CRM_API_URL}/crm/activities/record-task-context?relatedType=${relatedType}&relatedTo=${encodeURIComponent(recordEntityId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Could not load assignee options"));
        return r.json() as Promise<RecordTaskContext>;
      })
      .then((ctx) => {
        if (cancelled) return;
        setRecordCtx(ctx);
        // The task belongs to the record owner unless the caller picks someone else.
        setTaskAssigneeId((prev) => prev || ctx.defaultAssigneeId || "");
      })
      .catch((e) => {
        if (!cancelled) setRecordCtxError(e instanceof Error ? e.message : "Could not load assignee options");
      });
    return () => {
      cancelled = true;
    };
  }, [isRecordTask, activityType, relatedType, recordEntityId]);

  const recordAssigneeOptions = useMemo(
    () =>
      (recordCtx?.assignees || []).map((a) => ({
        value: a._id,
        label: a.roleName ? `${a.label} · ${a.roleName}` : a.label,
        keywords: a.email,
      })),
    [recordCtx],
  );
  const pickedRecordAssignee = recordCtx?.assignees.find((a) => a._id === taskAssigneeId);
  const reassigningRecord =
    !!recordCtx &&
    !!taskAssigneeId &&
    taskAssigneeId !== recordCtx.owner?.id &&
    !!recordCtx.owner;
  const claimingFreshRecord = !!recordCtx && recordCtx.unassigned && !!taskAssigneeId;

  useEffect(() => {
    if (activityType !== "Task") {
      setTaskTitle("");
      setTaskDueDate("");
      setTaskReporterId("");
      setTaskAssigneeId("");
    }
    if (activityType !== "DM") {
      setDmChannel("");
    }
  }, [activityType]);

  useEffect(() => {
    if (activityType !== "Task" || !crmUsers.length) return;
    const uid = String(user?._id || user?.id || "");
    setTaskReporterId((prev) => {
      if (prev) return prev;
      if (uid && crmUsers.some((u) => u._id === uid)) return uid;
      return prev;
    });
  }, [activityType, user?._id, user?.id, crmUsers]);

  const handlePostActivity = async () => {
    if (activityType === "Meeting" || activityType === "Source Post") return;
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Sign in to post activities");
      return;
    }

    const entityId = crmRecordIdFromParams(relatedTo);
    if (!entityId) {
      toast.error("Invalid record — refresh the page and try again");
      return;
    }

    if (activityType === "Task") {
      if (!taskTitle.trim()) {
        toast.error("Add a task title");
        return;
      }
      const body: Record<string, unknown> = {
        type: "Task",
        title: taskTitle.trim(),
        content: newComment.trim() || taskTitle.trim(),
        relatedTo: entityId,
        relatedType,
        metadata: {
          dueDate: taskDueDate || undefined,
          priority: taskPriority,
        },
        // Overdue / Escalated are lanes on the board stored as flags; the stored status stays Open.
        status: taskStatus === "Overdue" || taskStatus === "Escalated" ? "Open" : taskStatus,
      };
      if (taskStatus === "Overdue") {
        body.metadata = { ...(body.metadata as Record<string, unknown>), markedOverdue: true };
      } else if (taskStatus === "Escalated") {
        body.metadata = {
          ...(body.metadata as Record<string, unknown>),
          escalated: true,
          escalatedAt: new Date().toISOString(),
        };
      }
      if (isRecordTask) {
        // Server validates who may be assigned and keeps the record owner in sync; the reporter is
        // always the signed-in user so a task cannot be filed under someone else's name.
        body.assignee = taskAssigneeId || "";
      } else {
        if (taskReporterId) body.author = taskReporterId;
        if (taskAssigneeId) {
          body.assignee = taskAssigneeId;
          const picked = crmUsers.find(
            (u) => taskAssigneeOptionValue(u) === taskAssigneeId || u._id === taskAssigneeId,
          );
          if (picked) {
            body.metadata = {
              ...(body.metadata as Record<string, unknown>),
              assigneeSource: picked.source || "crm",
              assigneeName: formatCrmUserLabel(picked),
              assigneeEmail: picked.email,
              twobighaAdminId: picked.twobighaAdminId,
              assigneeRole: picked.roleLabel,
            };
          }
        }
      }
      setSavingTask(true);
      let res: Response;
      try {
        res = await fetch(`${CRM_API_URL}/crm/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } finally {
        setSavingTask(false);
      }
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not create task"));
        return;
      }
      const data = await res.json();
      if (isRecordTask) {
        const who = pickedRecordAssignee?.label || recordCtx?.owner?.label;
        toast.success(
          reassigningRecord || claimingFreshRecord
            ? `Task created — ${relatedType.toLowerCase()} assigned to ${who}`
            : who
              ? `Task created for ${who}`
              : "Task created",
        );
        // The record owner may have changed with the task — let the page refresh its owner card.
        window.dispatchEvent(
          new CustomEvent("crm:record-owner-changed", {
            detail: { relatedType, relatedTo: recordEntityId },
          }),
        );
      }
      onActivityPosted(data);
      setNewComment("");
      setTaskTitle("");
      setTaskDueDate("");
      setTaskPriority("Medium");
      setTaskStatus("Open");
      setTaskAssigneeId("");
      setRecordCtx(null);
      setNoteAttachments([]);
      const uid = String(user?._id || user?.id || "");
      setTaskReporterId(uid && crmUsers.some((u) => u._id === uid) ? uid : "");
      setActivityType("Activity");
      return;
    }

    if (activityType !== "DM" && !newComment.trim()) return;

    const activity: Record<string, unknown> = {
      type: activityType,
      content:
        activityType === "DM"
          ? newComment.trim() || "Direct message sent"
          : newComment,
      relatedTo: entityId,
      relatedType,
    };
    if (noteAttachments.length > 0 && activityType !== "DM") {
      activity.metadata = {
        attachments: noteAttachments.map((att) => ({
          id: att.id,
          name: att.name,
          url: att.url,
          kind: att.kind,
          mimeType: att.mimeType,
          size: att.size,
          publicId: att.publicId,
          storage: att.storage,
        })),
      };
    }
    if (activityType === "DM" && dmChannel) {
      activity.metadata = { channel: dmChannel };
    }
    const res = await fetch(`${CRM_API_URL}/crm/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(activity),
    });
    if (!res.ok) {
      toast.error("Could not save activity");
      return;
    }
    const data = await res.json();
    onActivityPosted(data);
    setNewComment("");
    setNoteAttachments([]);
    setActivityType("Activity");
  };

  return (
    <div className="mb-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[var(--text-main)]">Activities</h3>
      </div>

      {/* CRMS bordered tabs — Activities / Notes / Calls … */}
      <div
        className="mb-4 flex gap-0 overflow-x-auto border-b border-[var(--border-color)]"
        role="tablist"
        aria-label="Activity type"
      >
        {types.map((type) => {
          const active = activityType === type;
          const label =
            type === "Source Post"
              ? "Source Post"
              : type === "DM"
                ? "DMs"
                : type === "Activity"
                  ? "Activities"
                  : `${type}s`;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActivityType(type)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-[3px] px-3 text-sm font-medium transition-colors",
                active
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activityType === "Meeting" ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-[var(--radius-md)] border border-primary/15 bg-[var(--primary-light)] flex items-center justify-center text-primary shrink-0">
              <Calendar size={22} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-text-main">Schedule a meeting</h4>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Add date, time, duration, location, and a video link. Opens the full form so the timeline stays
                consistent with your other CRM activity types.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onMeetingScheduleClick}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[var(--radius-md)] bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-[0.99]"
          >
            <Video size={18} />
            Open meeting scheduler
          </button>
        </div>
      ) : activityType === "Task" ? (
        <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <CheckSquare size={16} strokeWidth={2.5} />
            <span className="text-xs font-black uppercase tracking-[0.1em]">New task</span>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-text-muted px-1">
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-4 py-3 text-sm font-semibold text-text-main placeholder:text-text-muted/60 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-text-muted px-1">
              Description
            </label>
            <textarea
              className="w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 p-4 text-sm font-medium text-text-main placeholder:text-text-muted/60 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all resize-none min-h-[100px]"
              placeholder="Details, checklist, or context…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-text-muted px-1">Status</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-3 py-2.5 text-xs font-semibold text-text-main outline-none"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
                <option value="Overdue">Overdue</option>
                <option value="Escalated">Escalated</option>
              </select>
            </div>
            <div className="space-y-1.5 max-w-xs">
            <label className="block text-xs font-black text-text-muted px-1">
              Due date
            </label>
            <DatePickerField
              value={taskDueDate}
              onChange={setTaskDueDate}
              placeholder="No due date"
              buttonClassName="h-11 rounded-[var(--radius-md)] border-border/60 bg-surface-dim/30 hover:bg-surface-dim/50"
            />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-text-muted px-1">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-3 py-2.5 text-xs font-semibold text-text-main outline-none"
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
          </div>
          {isRecordTask ? (
            <div className="space-y-2">
              <label className="block text-xs font-black text-text-muted px-1">Assignee</label>
              {recordCtxError ? (
                <p className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
                  {recordCtxError}
                </p>
              ) : !recordCtx ? (
                <p className="text-xs text-text-muted px-1">Loading assignee options…</p>
              ) : !recordCtx.canCreate ? (
                <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
                  {recordCtx.reason ||
                    `You cannot create tasks on this ${relatedType.toLowerCase()}.`}
                </p>
              ) : (
                <>
                  <CrmPersonSearchSelect
                    value={taskAssigneeId}
                    onChange={setTaskAssigneeId}
                    options={recordAssigneeOptions}
                    emptyLabel={recordCtx.unassigned ? "Leave unassigned" : "Unassigned"}
                    placeholder="Type a name to search…"
                    triggerClassName="bg-surface-dim/30"
                    disabled={!recordCtx.canReassign && recordAssigneeOptions.length <= 1}
                    allowClear={recordCtx.unassigned}
                  />
                  <p className="text-[11px] leading-relaxed text-text-muted px-1">
                    {recordCtx.unassigned
                      ? `This ${relatedType.toLowerCase()} has no owner yet. ${
                          taskAssigneeId
                            ? `Saving will also assign the ${relatedType.toLowerCase()} to ${pickedRecordAssignee?.label || "this person"}.`
                            : "Pick someone to assign both the task and the " + relatedType.toLowerCase() + "."
                        }`
                      : reassigningRecord
                        ? `Heads up: this ${relatedType.toLowerCase()} belongs to ${recordCtx.owner?.label}. Saving will reassign the ${relatedType.toLowerCase()} and its open tasks to ${pickedRecordAssignee?.label || "this person"}.`
                        : recordCtx.canReassign
                          ? `Defaults to the ${relatedType.toLowerCase()} owner (${recordCtx.owner?.label}). Pick someone else to reassign the ${relatedType.toLowerCase()} too.`
                          : `Tasks on this ${relatedType.toLowerCase()} go to its owner (${recordCtx.owner?.label}).`}
                  </p>
                </>
              )}
            </div>
          ) : null}
          {!isRecordTask && crmUsers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-text-muted px-1">
                  Reporter
                </label>
                <CrmPersonSearchSelect
                  value={taskReporterId}
                  onChange={setTaskReporterId}
                  options={reporterOptions}
                  emptyLabel="Default (you)"
                  placeholder="Type a name to search…"
                  triggerClassName="bg-surface-dim/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-text-muted px-1">
                  Assignee
                </label>
                <CrmPersonSearchSelect
                  value={taskAssigneeId}
                  onChange={setTaskAssigneeId}
                  options={assigneeOptions}
                  emptyLabel="Unassigned"
                  placeholder="Type a name to search…"
                  triggerClassName="bg-surface-dim/30"
                />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end pt-1 border-t border-border/40">
            <button
              type="button"
              onClick={handlePostActivity}
              disabled={
                !taskTitle.trim() ||
                savingTask ||
                (isRecordTask && !!recordCtx && !recordCtx.canCreate)
              }
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-[var(--radius-md)] hover:bg-primary-dark transition-all shadow-md active:scale-95 text-xs font-semibold disabled:opacity-45 disabled:pointer-events-none"
            >
              <CheckSquare size={15} strokeWidth={2.5} />
              {savingTask ? "Saving…" : "Save task"}
            </button>
          </div>
        </div>
      ) : activityType === "Source Post" ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {isFetchingMeta ? (
            <div className="flex items-center gap-3 py-10 justify-center text-text-muted">
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-xs font-semibold">Loading post preview…</span>
            </div>
          ) : socialMetadata ? (
            <SocialPostPreview metadata={socialMetadata as any} />
          ) : (
            <div className="text-center py-12 bg-surface-dim/30 rounded-[var(--radius-md)] border border-dashed border-border">
              <p className="text-sm font-bold text-text-muted">No social post found</p>
            </div>
          )}
        </div>
      ) : activityType === "DM" ? (
        <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <MessageCircle size={16} strokeWidth={2.5} />
            <span className="text-xs font-black uppercase tracking-[0.1em]">Log DM sent</span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed -mt-1">
            Log a direct message you sent to this lead on LinkedIn, X, or another platform.
          </p>
          <div className="space-y-1.5 max-w-xs">
            <label className="block text-xs font-black text-text-muted px-1">
              Platform
            </label>
            <select
              className="w-full rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/30 px-3 py-2.5 text-xs font-semibold text-text-main outline-none focus:ring-2 focus:ring-primary/20"
              value={dmChannel}
              onChange={(e) => setDmChannel(e.target.value)}
            >
              {DM_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value || "none"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="w-full border border-border/60 rounded-[var(--radius-md)] p-4 text-sm font-medium bg-surface-dim/30 focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none min-h-[88px]"
            placeholder="Optional note (thread link, opener used…)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="flex justify-end pt-1 border-t border-border/40">
            <button
              type="button"
              onClick={handlePostActivity}
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-[var(--radius-md)] hover:bg-primary-dark transition-all shadow-md active:scale-95 text-xs font-semibold"
            >
              <MessageCircle size={15} strokeWidth={2.5} />
              Log DM sent
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            className={`w-full border rounded-xl p-4 text-sm font-medium focus:ring-2 outline-none transition-all resize-none h-28 ${
              activityType === "Call"
                ? "bg-emerald-50/40 border-emerald-200 focus:ring-emerald-500/20 text-[#0f172a]"
                : activityType === "Note"
                  ? "bg-amber-50/40 border-amber-200 focus:ring-amber-500/20 text-[#0f172a]"
                  : "bg-[#f8fafc] border-[#e2e8f0] focus:ring-[#2563eb]/20 text-[#0f172a]"
            }`}
            placeholder={
              activityType === "Call"
                ? "Log call notes..."
                : activityType === "Email"
                  ? "Log email correspondence..."
                  : activityType === "Note"
                    ? "Write a note..."
                    : "Post an activity update..."
            }
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <MediaAttachToolbar
              attachments={noteAttachments}
              onChange={setNoteAttachments}
              context="crm"
              disabled={activityType === "DM"}
            />
            <button
              type="button"
              onClick={handlePostActivity}
              disabled={!newComment.trim() && noteAttachments.length === 0}
              className="inline-flex items-center gap-2 bg-[#10b981] hover:bg-[#059669] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Post activity"
            >
              <Send size={15} />
              <span>Post</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
