"use client";

import { useState, useEffect } from 'react';
import { MessageSquare, FileText, Phone, Calendar, User, Mail, Video, Clock, MapPin, CheckSquare, Info, Check, Eye, MousePointerClick, Reply, Loader2, TrendingUp, Paperclip, MessageCircle } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import type { CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { formatCrmEmailOpenBadge } from '@/lib/crm/crm-email-tracking';
import {
  stripCidNoiseFromPlainText,
} from '@/lib/crm/email-preview-iframe';
import { buildReplyPresetFromInboxItem } from '@/lib/crm/inbox-reply';
import { useEmailComposerStore } from '@/stores/emailComposerStore';
import { toast } from 'sonner';
import { resolveMediaUrl } from '@/lib/media/upload-media';
import {
  CrmEmailActivityAttachments,
  CrmEmailActivityBody,
  type CrmEmailActivityAttachment,
} from './CrmEmailActivityMedia';

function extractRemoteImagesFromHtml(
  html: string,
): CrmEmailActivityAttachment[] {
  const out: CrmEmailActivityAttachment[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*\ssrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(String(html || ""))) !== null) {
    const src = m[1];
    if (!src || seen.has(src)) continue;
    // Skip tracking pixels
    if (/\/crm\/track\/open\//i.test(src)) continue;
    if (/width\s*=\s*["']?1["']?/i.test(m[0]) && /height\s*=\s*["']?1["']?/i.test(m[0])) {
      continue;
    }
    seen.add(src);
    i += 1;
    out.push({
      id: `body-img-${i}`,
      filename: `Image ${i}`,
      contentType: "image/*",
      url: src,
    });
  }
  return out;
}

function mergeEmailActivityAttachments(
  activity: Activity,
): CrmEmailActivityAttachment[] {
  const meta = Array.isArray(activity.metadata?.attachments)
    ? (activity.metadata.attachments as CrmEmailActivityAttachment[])
    : [];
  const fromBody = activity.metadata?.bodyHtml
    ? extractRemoteImagesFromHtml(String(activity.metadata.bodyHtml))
    : [];
  if (!fromBody.length) return meta;
  const existingUrls = new Set(
    meta
      .map((a) => String(a.url || "").trim())
      .filter(Boolean),
  );
  const extras = fromBody.filter((a) => a.url && !existingUrls.has(String(a.url)));
  return [...meta, ...extras];
}

interface Activity {
  _id: string;
  type: string;
  title?: string;
  content: string;
  createdAt: string;
  author?: { 
    name?: string; 
    firstName?: string; 
    lastName?: string;
  };
  metadata?: any;
}

function normalizeActivities(data: any): Activity[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.activities)) return data.activities;
  return [];
}

/** Legacy: outbound was type Call + title "Email Sent". New: type Email + metadata.direction outbound. */
function isSentEmailActivity(a: Activity): boolean {
  const c = typeof a.content === 'string' ? a.content : '';
  return (
    a.title === 'Email Sent' ||
    a.title === 'Email sent' ||
    c.startsWith('Email sent to') ||
    c.startsWith('Email sent from')
  );
}

function isOutboundEmailTimeline(a: Activity): boolean {
  return isSentEmailActivity(a) || a.metadata?.direction === 'outbound';
}

function isInboundEmailTimeline(a: Activity): boolean {
  return a.type === 'Email' && a.metadata?.direction === 'inbound';
}

/** Same synced reply can appear twice via lead/contact rollup — keep one card. */
function dedupeInboundEmailActivities(items: Activity[]): Activity[] {
  const seenInbox = new Set<string>();
  const seenLogical = new Set<string>();
  const out: Activity[] = [];
  for (const a of items) {
    if (isInboundEmailTimeline(a)) {
      const inboxId = String(a.metadata?.inboxEmailId || '').trim();
      if (inboxId) {
        if (seenInbox.has(inboxId)) continue;
        seenInbox.add(inboxId);
      } else {
        const logical = [
          String(a.metadata?.fromEmail || '').trim().toLowerCase(),
          String(a.metadata?.subject || a.title || '').trim().toLowerCase(),
          String(a.createdAt || '').trim(),
        ].join('\0');
        if (seenLogical.has(logical)) continue;
        seenLogical.add(logical);
      }
    }
    out.push(a);
  }
  return out;
}

/** One timeline card for inbound sync, inbox/Graph replies, SMTP sends, and legacy "Email Sent" rows. */
function isUnifiedEmailCard(a: Activity): boolean {
  return (a.type === 'Email' && !!a.metadata) || isSentEmailActivity(a);
}

function hasInlineFileAttachments(a: Activity): boolean {
  return (
    Array.isArray(a.metadata?.attachments) &&
    a.metadata.attachments.some(
      (att: any) =>
        att &&
        typeof att === 'object' &&
        typeof att.url === 'string' &&
        att.url.trim().length > 0,
    )
  );
}

export default function Timeline({
  activities,
  filterType = 'Activity',
  emailTrackingByEmailId,
  emailTrackingByToken,
  onRefreshNeeded,
  /** When set, inbound synced emails with `metadata.inboxEmailId` show Reply (same flow as CRM Inbox). */
  timelineReplyContext,
  onEmailReplySent,
}: {
  activities?: any;
  filterType?: string;
  emailTrackingByEmailId?: Record<string, CrmEmailTrackingRow>;
  emailTrackingByToken?: Record<string, CrmEmailTrackingRow>;
  onRefreshNeeded?: () => void;
  timelineReplyContext?: { module: string; entityId: string };
  onEmailReplySent?: () => void;
}) {
  const [localItems, setLocalItems] = useState<Activity[]>([]);
  const [replyLoadingInboxId, setReplyLoadingInboxId] = useState<string | null>(null);
  const openComposer = useEmailComposerStore((s) => s.openComposer);

  useEffect(() => {
    setLocalItems(dedupeInboundEmailActivities(normalizeActivities(activities)));
  }, [activities]);

  const items =
    filterType === 'Activity'
      ? localItems
      : filterType === 'Email'
        ? localItems.filter(
            (a) =>
              a.type === 'Email' ||
              isSentEmailActivity(a),
          )
        : filterType === 'Meeting'
          ? localItems.filter((a) => a.type === 'Meeting')
          : filterType === 'Call'
            ? localItems.filter((a) => a.type === 'Call' && !isSentEmailActivity(a))
            : localItems.filter((a) => a.type === filterType);

  const handleTimelineReply = async (inboxEmailId: string) => {
    if (!timelineReplyContext) return;
    setReplyLoadingInboxId(inboxEmailId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(inboxEmailId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(err?.message || 'Could not load message for reply');
        return;
      }
      const item = await res.json();
      const accEmail = item.accountId?.email || '';
      openComposer({
        module: timelineReplyContext.module,
        entityId: timelineReplyContext.entityId,
        replyToInboxEmailId: String(item._id),
        lockRecipient: true,
        replyPreset: buildReplyPresetFromInboxItem(item, accEmail),
        replyThreadMailbox:
          item.accountId?._id && item.accountId?.email
            ? {
                accountId: String(item.accountId._id),
                email: String(item.accountId.email),
              }
            : undefined,
        defaultAccountId: item.accountId?._id
          ? String(item.accountId._id)
          : undefined,
        onSuccess: () => {
          toast.success('Email sent');
          onEmailReplySent?.();
        },
        onClose: () => {},
      });
    } catch {
      toast.error('Could not start reply');
    } finally {
      setReplyLoadingInboxId(null);
    }
  };

  const handleDownloadAttachment = async (emailId: string, attachment: { id: string; filename: string }) => {
    const token = localStorage.getItem('token');
    const url = `${CRM_API_URL}/crm/inbox-accounts/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachment.id)}`;
    const safeName = (attachment.filename || 'attachment').replace(/[/\\?%*:|"<>]/g, '_').trim();

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');

      const saveBlobDownload = (blob: Blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
      };

      // Stream bytes straight to disk when supported (File System Access API)
      const w = window as any;
      if (res.body && typeof w.showSaveFilePicker === 'function') {
        try {
          const handle = await w.showSaveFilePicker({ suggestedName: safeName });
          const writable = await handle.createWritable();
          await res.body.pipeTo(writable);
          toast.success('Download saved');
          return;
        } catch (pickerErr: any) {
          if (pickerErr.name === 'AbortError') return;
          // Fallback if picker fails
          const res2 = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (res2.ok) saveBlobDownload(await res2.blob());
        }
      } else {
        saveBlobDownload(await res.blob());
      }
      toast.success('Download started');
    } catch (err) {
      toast.error('Failed to download attachment');
    }
  };

  const handleTaskToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Completed' ? 'Pending' : 'Completed';
    setLocalItems(prev => prev.map(a => 
      a._id === id ? { ...a, metadata: { ...a.metadata, status: newStatus } } : a
    ));
    try {
      const token = localStorage.getItem('token');
      await fetch(`${CRM_API_URL}/crm/activities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ metadata: { status: newStatus } })
      });
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err) {
      console.error('Failed to update task status', err);
      setLocalItems(prev => prev.map(a => 
        a._id === id ? { ...a, metadata: { ...a.metadata, status: currentStatus } } : a
      ));
    }
  };

  const getIcon = (activity: Activity) => {
    if (isUnifiedEmailCard(activity)) {
      return <Mail size={14} className="text-blue-500" />;
    }
    const type = activity.type;
    switch (type) {
      case 'Activity':
      case 'Comment': return <MessageSquare size={14} className="text-primary" />;
      case 'Note': return <FileText size={14} className="text-orange-500" />;
      case 'Call': return <Phone size={14} className="text-green-500" />;
      case 'Task': return <CheckSquare size={14} className="text-red-500" />;
      case 'Meeting': return <Calendar size={14} className="text-info" />;
      case 'Email': return <Mail size={14} className="text-blue-500" />;
      case 'DM': return <MessageCircle size={14} className="text-violet-500" />;
      case 'System': return <TrendingUp size={14} className="text-indigo-600" />;
      default: return <Info size={14} className="text-text-muted" />;
    }
  };

  const getAuthorName = (author: any) => {
    if (!author) return 'System';
    if (author.firstName || author.lastName) {
      return `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'User';
    }
    return author.name || author.fullName || 'User';
  };

  return (
    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
      {items.map((activity) => (
        <div key={activity._id} className="relative flex items-start group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-card border border-border shadow-sm z-10 group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
            {getIcon(activity)}
          </div>
          <div className="ml-5 flex-1 animate-in slide-in-from-left-2 duration-300">
            <div className="bg-card p-5 rounded-[var(--crm-radius-ui)] border border-border shadow-sm group-hover:shadow-lg group-hover:border-primary/10 transition-all duration-300">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-surface-dim flex items-center justify-center">
                    <User size={12} className="text-text-muted" />
                  </div>
                  <span className="text-sm font-bold text-text-main">
                    {getAuthorName(activity.author)}
                    <span className="text-text-muted font-medium ml-2 text-xs">
                      {activity.type === 'Activity'
                        ? 'posted an update'
                        : activity.type === 'DM'
                          ? 'sent a direct message'
                          : activity.type === 'System'
                          ? 'recorded a system log entry'
                          : isOutboundEmailTimeline(activity)
                            ? 'sent an email'
                            : isInboundEmailTimeline(activity)
                              ? 'synced an inbound email to the timeline'
                              : `logged a ${activity.type.toLowerCase()}`}
                    </span>
                  </span>
                </div>
                <time className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  {new Date(activity.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </div>

              {activity.type === 'Task' ? (
                <div className="flex items-start gap-3 mt-1">
                  <button 
                    onClick={() => handleTaskToggle(activity._id, activity.metadata?.status || 'Pending')}
                    className={`mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                      activity.metadata?.status === 'Completed' 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'border-border hover:border-emerald-500 bg-surface-dim'
                    }`}
                  >
                    {activity.metadata?.status === 'Completed' && <Check size={14} />}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    {activity.title && (
                      <p className={`text-sm font-bold ${activity.metadata?.status === 'Completed' ? 'text-text-muted line-through' : 'text-text-main'}`}>
                        {activity.title}
                      </p>
                    )}
                    {activity.metadata?.dueDate && (
                      <p className="text-xs font-semibold text-text-muted flex items-center gap-1">
                        <Clock size={11} />
                        Due {activity.metadata.dueDate}
                      </p>
                    )}
                    {activity.content &&
                      (!activity.title || activity.content !== activity.title) && (
                        <div
                          className={`text-sm font-medium leading-relaxed whitespace-pre-wrap ${
                            activity.metadata?.status === 'Completed' ? 'text-text-muted line-through' : 'text-text-main'
                          }`}
                        >
                          {activity.content}
                        </div>
                      )}
                  </div>
                </div>
              ) : isUnifiedEmailCard(activity) && activity.metadata ? (
                <div className="space-y-3">
                  {isOutboundEmailTimeline(activity) &&
                  activity.metadata?.fromEmail ? (
                    <p className="mb-1 rounded-[var(--radius-md)] border border-border/60 bg-surface-dim/40 px-3 py-2 text-xs font-medium leading-snug text-text-muted">
                      {activity.metadata?.workflowEmailSend ||
                      activity.metadata?.followUpSequence ? (
                        <span className="mb-1 block text-[10px] font-semibold text-indigo-600">
                          Follow-up sequence send
                          {activity.metadata?.alternateEngagementStep != null
                            ? ` · alternate ${Number(activity.metadata.alternateEngagementStep) + 1}`
                            : ''}
                        </span>
                      ) : null}
                      <span className="font-bold uppercase tracking-wide text-text-muted/90">
                        Sending mailbox
                      </span>
                      :{' '}
                      <span className="font-semibold text-text-main">
                        {activity.metadata.fromEmail}
                      </span>
                      <span className="block mt-1 text-xs font-normal text-text-muted/85">
                        Platform login ({getAuthorName(activity.author)}) logged this
                        send; the address above is the From header on the message.
                      </span>
                    </p>
                  ) : null}

                  <p className="text-sm font-semibold text-text-main">
                    {activity.metadata.subject ||
                      (activity.title &&
                      activity.title !== 'Email sent' &&
                      activity.title !== 'Email Sent'
                        ? activity.title
                        : null) ||
                      '(No subject)'}
                  </p>

                  {isInboundEmailTimeline(activity) ? (
                    <div className="rounded-[var(--radius-md)] border border-border/70 bg-surface-dim/40 px-3 py-2 text-xs font-semibold text-text-main">
                      <span className="text-text-muted">From: </span>
                      {activity.metadata.fromDisplay ||
                        activity.metadata.fromEmail ||
                        '—'}
                      {activity.metadata.toEmail || activity.metadata.to ? (
                        <>
                          <span className="mx-2 text-border">·</span>
                          <span className="text-text-muted">To: </span>
                          {activity.metadata.toEmail || activity.metadata.to}
                        </>
                      ) : null}
                    </div>
                  ) : isOutboundEmailTimeline(activity) ? (
                    <div className="rounded-[var(--radius-md)] border border-border/70 bg-surface-dim/40 px-3 py-2 text-xs font-semibold text-text-main space-y-1">
                      {activity.metadata.fromEmail ? (
                        <div>
                          <span className="text-text-muted">From: </span>
                          {activity.metadata.fromEmail}
                        </div>
                      ) : null}
                      {activity.metadata.toEmail || activity.metadata.to ? (
                        <div>
                          <span className="text-text-muted">To: </span>
                          {activity.metadata.toEmail || activity.metadata.to}
                        </div>
                      ) : null}
                      {Array.isArray(activity.metadata.cc) &&
                      activity.metadata.cc.length > 0 ? (
                        <div>
                          <span className="text-text-muted">CC: </span>
                          {activity.metadata.cc.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {activity.metadata.bodyHtml ? (
                    <CrmEmailActivityBody
                      bodyHtml={activity.metadata.bodyHtml}
                      emailId={
                        activity.metadata.inboxEmailId ||
                        activity.metadata.emailId ||
                        null
                      }
                      attachments={mergeEmailActivityAttachments(activity)}
                    />
                  ) : activity.metadata.bodyPlain ? (
                    <pre className="max-h-[min(60vh,400px)] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-card p-3 text-sm leading-relaxed text-text-main">
                      {activity.metadata.bodyPlain}
                    </pre>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-surface-dim/30 p-3 text-sm leading-relaxed text-text-main">
                      {isInboundEmailTimeline(activity)
                        ? stripCidNoiseFromPlainText(activity.content)
                        : activity.content}
                    </div>
                  )}

                  {(() => {
                    const merged = mergeEmailActivityAttachments(activity);
                    if (!merged.length) return null;
                    return (
                      <CrmEmailActivityAttachments
                        emailId={
                          activity.metadata.inboxEmailId ||
                          activity.metadata.emailId ||
                          null
                        }
                        attachments={merged}
                        onDownload={(emailId, att) =>
                          handleDownloadAttachment(emailId, att)
                        }
                      />
                    );
                  })()}


                  {timelineReplyContext &&
                    activity.metadata?.inboxEmailId &&
                    String(activity.metadata.inboxEmailId).trim() && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleTimelineReply(
                              String(activity.metadata.inboxEmailId),
                            )
                          }
                          disabled={
                            replyLoadingInboxId ===
                            String(activity.metadata.inboxEmailId)
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-60"
                        >
                          {replyLoadingInboxId ===
                          String(activity.metadata.inboxEmailId) ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Reply size={12} aria-hidden />
                          )}
                          Reply
                        </button>
                      </div>
                    )}
                </div>
              ) : (
                <div className="space-y-2">
                  {activity.type === 'DM' && activity.metadata?.channel ? (
                    <p className="text-[10px] font-semibold text-violet-600/90">
                      {String(activity.metadata.channel)}
                    </p>
                  ) : null}
                  <div className="text-sm text-text-main font-medium leading-relaxed whitespace-pre-wrap">
                    {activity.content}
                  </div>
                  {activity.metadata?.workflowEmailSent ? (
                    <p className="rounded-[var(--radius-md)] border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-semibold text-indigo-900">
                      An email was sent as part of this sequence — look for a separate{' '}
                      <span className="font-black">Email sent</span> entry on this timeline
                      showing the sending mailbox and full message.
                    </p>
                  ) : null}
                  {hasInlineFileAttachments(activity) ? (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40 mt-3">
                      {activity.metadata.attachments
                        .filter((att: any) => att?.url)
                        .map((att: any) => (
                          <a
                            key={String(att.id || att.url)}
                            href={resolveMediaUrl(String(att.url))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/att flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-dim/20 px-3 py-2 text-xs font-bold text-text-main hover:bg-surface-dim/40 hover:border-primary/20 transition-all"
                          >
                            <Paperclip size={12} className="text-text-muted group-hover/att:text-primary transition-colors" />
                            <span className="truncate max-w-[220px]">
                              {String(att.name || att.filename || "Attachment")}
                            </span>
                            {att.size ? (
                              <span className="text-xs text-text-muted font-medium">
                                ({(Number(att.size) / 1024).toFixed(1)} KB)
                              </span>
                            ) : null}
                          </a>
                        ))}
                    </div>
                  ) : null}
                </div>
              )}

              {(isSentEmailActivity(activity) ||
                (activity.type === 'Email' &&
                  activity.metadata?.direction === 'outbound')) &&
                (() => {
                  const m = activity.metadata;
                  const trk: CrmEmailTrackingRow | undefined =
                    m?.emailId && emailTrackingByEmailId?.[String(m.emailId)]
                      ? emailTrackingByEmailId[String(m.emailId)]
                      : m?.trackingToken && emailTrackingByToken?.[m.trackingToken]
                        ? emailTrackingByToken[m.trackingToken]
                        : undefined;
                  if (!trk) return null;
                  const clickCount = trk.clicks?.length ?? 0;
                  const openBadge = formatCrmEmailOpenBadge(trk);
                  return (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[#e0f4f7] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-main)]">
                        <Eye size={12} className="shrink-0 text-[var(--hs-link)]" aria-hidden />
                        {openBadge.label}
                        {openBadge.lastAt ? (
                          <span className="font-medium text-[var(--text-muted)]">· {openBadge.lastAt}</span>
                        ) : null}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-main)]">
                        <MousePointerClick size={12} className="shrink-0 text-[#425b76]" aria-hidden />
                        {clickCount === 0
                          ? 'No link clicks'
                          : `${clickCount} link click${clickCount === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  );
                })()}

              {activity.type === 'Meeting' && activity.metadata && (
                <div className="mt-4 p-4 bg-surface-dim/40 rounded-[var(--radius-md)] border border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activity.metadata.title && (
                    <div className="col-span-1 sm:col-span-2 flex items-center gap-2 text-sm font-black text-primary">
                      <Video size={14} />
                      {activity.metadata.title}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
                    <Calendar size={12} />
                    {activity.metadata.date || 'TBD'}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
                    <Clock size={12} />
                    {activity.metadata.time || '--:--'} ({activity.metadata.duration || '30'}m)
                  </div>
                  {activity.metadata.location && (
                    <div className="col-span-1 sm:col-span-2 flex items-center gap-2 text-xs font-bold text-text-muted truncate">
                      <MapPin size={12} />
                      {activity.metadata.location}
                    </div>
                  )}
                  {activity.metadata.meetingLink && (
                    <div className="col-span-1 sm:col-span-2 mt-1">
                      <a
                        href={activity.metadata.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-[var(--radius-md)] text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all shadow-sm shadow-primary/20"
                      >
                        <Video size={12} />
                        Join Meeting
                      </a>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-20 bg-surface-dim/20 rounded-[var(--crm-radius-ui)] border border-dashed border-border/50">
          <div className="w-16 h-16 rounded-[var(--radius-md)] bg-surface-dim flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={24} className="text-text-muted/30" />
          </div>
          <h3 className="text-sm font-black text-text-main">No Activity Yet</h3>
          <p className="text-xs text-text-muted mt-1 font-medium italic">Communicate with your contact to see history here.</p>
        </div>
      )}
    </div>
  );
}
