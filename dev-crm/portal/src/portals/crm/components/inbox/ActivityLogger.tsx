"use client";

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  CheckCircle,
  PhoneCall,
  Save,
  Clock,
} from 'lucide-react';
import { DatePickerField } from '@/components/ui/date-picker';

export type CrmPortalUserOption = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function crmUserRefId(u: unknown): string {
  if (u == null) return '';
  if (typeof u === 'object' && '_id' in (u as object)) {
    return String((u as { _id: unknown })._id);
  }
  if (typeof u === 'string') return u;
  return '';
}

export function formatCrmUserLabel(u: CrmPortalUserOption): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return n || (u.email ? u.email.split('@')[0] : '') || u._id;
}

interface ActivityLoggerProps {
  onSave: (data: any) => Promise<void>;
  relatedTo?: string;
  relatedType?: string;
  fixedType?: 'Note' | 'Task' | 'Call';
  initialData?: any;
  statuses?: string[];
  className?: string;
  /** Overrides the primary action label for the active tab (e.g. "Save changes" when editing). */
  submitLabel?: string;
  /** When set (e.g. tasks page), show Reporter / Assignee for tasks. */
  crmUsers?: CrmPortalUserOption[];
  /** Pre-select reporter on new tasks when it matches `crmUsers` (typically current user). */
  defaultReporterId?: string;
  /** UI style variant for inputs/buttons */
  variant?: 'hubspot' | 'default';
}

export default function ActivityLogger({
  onSave,
  relatedTo,
  relatedType,
  fixedType,
  initialData,
  statuses,
  className,
  submitLabel,
  crmUsers,
  defaultReporterId,
  variant = 'default',
}: ActivityLoggerProps) {
  const [activeTab, setActiveTab] = useState<'Note' | 'Task' | 'Call'>(fixedType || initialData?.type || 'Note');
  const [content, setContent] = useState(initialData?.content || '');
  const [title, setTitle] = useState(initialData?.title || '');
  const [loading, setLoading] = useState(false);

  const [priority, setPriority] = useState(initialData?.metadata?.priority || 'Medium');
  const [dueDate, setDueDate] = useState(
    initialData?.metadata?.dueDate
      ? new Date(initialData.metadata.dueDate).toISOString().split('T')[0]
      : ''
  );
  const [status, setStatus] = useState(
    initialData?.status || initialData?.metadata?.status || (statuses && statuses.length > 0 ? statuses[0] : 'Backlog')
  );
  const [reporterId, setReporterId] = useState(() => crmUserRefId(initialData?.author));
  const [assigneeId, setAssigneeId] = useState(() => crmUserRefId(initialData?.assignee));

  const taskEditId = initialData?._id;
  const authorSync = crmUserRefId(initialData?.author);
  const assigneeSync = crmUserRefId(initialData?.assignee);

  useEffect(() => {
    setReporterId(authorSync);
    setAssigneeId(assigneeSync);
  }, [taskEditId, authorSync, assigneeSync]);

  useEffect(() => {
    if (taskEditId || !defaultReporterId || !crmUsers?.length) return;
    if (!crmUsers.some((u) => u._id === defaultReporterId)) return;
    setReporterId((prev) => (prev ? prev : defaultReporterId));
  }, [taskEditId, defaultReporterId, crmUsers]);
  const [callType, setCallType] = useState(initialData?.metadata?.type || 'Outbound');
  const [duration, setDuration] = useState(
    initialData?.metadata?.duration ? (initialData.metadata.duration / 60).toString() : '5'
  );
  const [callStatus, setCallStatus] = useState(initialData?.metadata?.status || 'Completed');

  const isFixedTask = fixedType === 'Task';
  const canSubmitTask = title.trim().length > 0;
  const canSubmitNoteOrCall =
    activeTab === 'Note' || activeTab === 'Call' ? !!(content.trim() || title.trim()) : true;

  const saveDisabled =
    loading ||
    (activeTab === 'Task' ? !canSubmitTask : !canSubmitNoteOrCall);

  const handleSave = async () => {
    if (activeTab === 'Task') {
      if (!title.trim()) return;
    } else if (!content && !title) return;

    setLoading(true);

    const payload: any = {
      type: activeTab,
      title: title.trim() || `${activeTab} on ${new Date().toLocaleDateString()}`,
      content,
      relatedTo,
      relatedType,
      metadata: {}
    };

    if (activeTab === 'Task') {
      payload.status = status;
      payload.metadata = { priority, dueDate: dueDate || undefined };
      if (crmUsers) {
        const isEdit = !!initialData?._id;
        if (reporterId) payload.author = reporterId;
        if (assigneeId) payload.assignee = assigneeId;
        else if (isEdit) payload.assignee = null;
      }
    } else if (activeTab === 'Call') {
      payload.metadata = { type: callType, duration: parseInt(duration) * 60, status: callStatus };
    }

    try {
      await onSave(payload);
      setContent('');
      setTitle('');
    } catch (err) {
      console.error('Failed to save activity', err);
    } finally {
      setLoading(false);
    }
  };

  const isHubspot = variant === 'hubspot';
  const labelClass = isHubspot 
    ? "block text-sm font-semibold text-[var(--text-main)] mb-1.5" 
    : "block text-sm font-semibold text-text-muted mb-1.5";
    
  const inputClass = isHubspot
    ? "w-full h-10 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-primary focus:ring-1 focus:ring-primary/35 transition-all"
    : "w-full h-10 bg-surface-dim border border-border/60 rounded-[var(--radius-md)] px-3 text-sm text-text-main outline-none placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all";

  const textareaClass = isHubspot
    ? "w-full bg-white border border-[var(--border-color)] rounded-md px-3 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-primary focus:ring-1 focus:ring-primary/35 transition-all resize-y"
    : "w-full bg-surface-dim border border-border/60 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-text-main outline-none placeholder:text-text-muted/50 focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-y";

  const selectClass = isHubspot
    ? "w-full h-10 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-primary focus:ring-1 focus:ring-primary/35 transition-all appearance-none"
    : "w-full h-10 bg-surface-dim border border-border/60 rounded-[var(--radius-md)] px-3 text-sm text-text-main outline-none cursor-pointer focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all appearance-none";

  const btnClass = isHubspot
    ? "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
    : "inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-dark active:scale-95 disabled:pointer-events-none disabled:opacity-45";

  return (
    <div
      className={cn(
        !isFixedTask &&
          'bg-white rounded-[var(--crm-radius-ui)] border border-border/60 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500',
        isFixedTask && 'rounded-[var(--radius-md)] border-0 bg-transparent shadow-none overflow-visible',
        className,
      )}
    >
      {!fixedType && (
        <div className="flex border-b border-border/40 bg-surface-dim/30">
          {[
            { id: 'Note', icon: <FileText size={16} />, label: 'Log Note' },
            { id: 'Task', icon: <CheckCircle size={16} />, label: 'Create Task' },
            { id: 'Call', icon: <PhoneCall size={16} />, label: 'Log Call' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as 'Note' | 'Task' | 'Call')}
              className={`flex-1 flex items-center justify-center gap-2 py-5 text-xs font-semibold transition-all ${activeTab === tab.id
                ? 'text-primary bg-white border-x border-border/40'
                : 'text-text-muted hover:text-text-main hover:bg-white/50'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className={cn(isFixedTask ? 'p-0 space-y-5' : 'p-8 space-y-6')}>
        <div className="space-y-5">
          {activeTab === 'Task' ? (
            <>
              <div>
                <label className={labelClass}>
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Description
                </label>
                <textarea
                  className={cn(textareaClass, 'min-h-[110px]')}
                  placeholder="Optional details or checklist…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            </>
          ) : activeTab === 'Call' ? (
            <>
              <div>
                <label className={labelClass}>
                  Call Subject
                </label>
                <input
                  type="text"
                  placeholder="What was the call about?"
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Key Takeaways
                </label>
                <textarea
                  className={cn(textareaClass, 'min-h-[100px]')}
                  placeholder="Summary of the call, next steps, or action items…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelClass}>
                  Title
                </label>
                <input
                  type="text"
                  placeholder="Note title..."
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Note
                </label>
                <textarea
                  className={cn(textareaClass, 'min-h-[110px]')}
                  placeholder="Start typing your notes here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {activeTab === 'Task' && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  className={selectClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Due date</label>
                <DatePickerField
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="No due date"
                  buttonClassName={isHubspot ? "h-10 rounded-md border-[var(--border-color)] bg-white hover:bg-[var(--background)] text-sm text-[var(--text-main)] font-normal w-full justify-start text-left pl-3" : "h-10 rounded-[var(--radius-md)] border-border/60 bg-surface-dim hover:bg-white text-sm text-text-main font-normal w-full justify-start text-left pl-3"}
                />
              </div>
              <div>
                <label className={labelClass}>Column</label>
                <select
                  className={selectClass}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {statuses && statuses.length > 0 ? (
                    statuses.map((s) => <option key={s} value={s}>{s}</option>)
                  ) : (
                    <>
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            {crmUsers && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Reporter</label>
                  <select
                    className={selectClass}
                    value={reporterId}
                    onChange={(e) => setReporterId(e.target.value)}
                  >
                    <option value="">{initialData?._id ? '—' : 'Default (you)'}</option>
                    {crmUsers.map((u) => (
                      <option key={u._id} value={u._id}>{formatCrmUserLabel(u)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Assignee</label>
                  <select
                    className={selectClass}
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {crmUsers.map((u) => (
                      <option key={u._id} value={u._id}>{formatCrmUserLabel(u)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'Call' && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={cn(labelClass, "flex items-center gap-1.5")}>
                <PhoneCall size={13} className={isHubspot ? "text-[var(--text-muted)]" : "text-text-muted"} /> Direction
              </label>
              <select
                className={selectClass}
                value={callType}
                onChange={(e) => setCallType(e.target.value)}
              >
                <option>Outbound</option>
                <option>Inbound</option>
              </select>
            </div>
            <div>
              <label className={cn(labelClass, "flex items-center gap-1.5")}>
                <Clock size={13} className={isHubspot ? "text-[var(--text-muted)]" : "text-text-muted"} /> Duration
              </label>
              <select
                className={selectClass}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="1">1 Min</option>
                <option value="5">5 Mins</option>
                <option value="15">15 Mins</option>
                <option value="30">30 Mins</option>
              </select>
            </div>
            <div>
              <label className={cn(labelClass, "flex items-center gap-1.5")}>
                <CheckCircle size={13} className={isHubspot ? "text-[var(--text-muted)]" : "text-text-muted"} /> Outcome
              </label>
              <select
                className={selectClass}
                value={callStatus}
                onChange={(e) => setCallStatus(e.target.value)}
              >
                <option>Completed</option>
                <option>Missed</option>
                <option>Busy</option>
                <option>Failed</option>
              </select>
            </div>
          </div>
        )}

        {(!isHubspot || isFixedTask) && (
          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className={btnClass}
            >
              {loading ? <Clock size={16} className="animate-spin" /> : <Save size={16} />}
              {submitLabel ??
                (activeTab === 'Note' ? 'Post entry' : activeTab === 'Task' ? 'Save task' : 'Log call')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
