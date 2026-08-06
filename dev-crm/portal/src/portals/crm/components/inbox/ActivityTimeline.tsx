import React from 'react';
import {
  buildCrmEmailPreviewSrcDoc,
  stripCidNoiseFromPlainText,
} from '@/lib/crm/email-preview-iframe';
import { CrmEmailActivityAttachments, CrmEmailActivityBody } from './CrmEmailActivityMedia';
import {
 FileText,
 CheckCircle,
 PhoneCall,
 Clock,
 MoreHorizontal,
 Trash2,
 Edit2,
 Calendar,
 Mail,
 ArrowUpRight,
 ArrowDownLeft,
 X,
 TrendingUp,
 Paperclip
} from 'lucide-react';

function isSentEmailActivity(activity: { title?: string; content?: string }) {
 const c = typeof activity.content === 'string' ? activity.content : '';
 return (
  activity.title === 'Email Sent' ||
  activity.title === 'Email sent' ||
  c.startsWith('Email sent to') ||
  c.startsWith('Email sent from')
 );
}

interface Activity {
 _id: string;
 type: string;
 content: string;
 title?: string;
 createdAt: string;
 metadata?: any;
 author?: { name: string };
}

interface ActivityTimelineProps {
 activities: Activity[];
 loading: boolean;
 onDelete?: (id: string) => void;
 onEdit?: (activity: Activity) => void;
 /** When true, show delete (typically administrators). */
 allowDelete?: boolean;
 /** Customize empty state (defaults to generic activity copy). */
 emptyTitle?: string;
 emptyDescription?: string;
 emptyIcon?: React.ReactNode;
}

export default function ActivityTimeline({
 activities,
 loading,
 onDelete,
 onEdit,
 allowDelete = false,
 emptyTitle,
 emptyDescription,
 emptyIcon,
}: ActivityTimelineProps) {
 if (loading) {
 return (
 <div className="flex flex-col gap-6 animate-pulse">
 {[1, 2, 3].map(i => (
 <div key={i} className="bg-surface-dim h-32 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)]" />
 ))}
 </div>
 );
 }

 if (!activities || activities.length === 0) {
 return (
 <div className="py-16 flex flex-col items-center justify-center text-center space-y-4 rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
 <div className="w-16 h-16 bg-[var(--surface-dim)] rounded-md flex items-center justify-center text-[var(--text-muted)]">
 {emptyIcon ?? <Clock size={32} />}
 </div>
 <div>
 <h3 className="text-base font-semibold text-[var(--text-main)] tracking-tight">
 {emptyTitle ?? 'No Activity Recorded'}
 </h3>
 <p className="text-sm text-[var(--text-muted)] font-normal max-w-sm mx-auto mt-2 leading-relaxed">
 {emptyDescription ??
 'Start a conversation or log a task to build your timeline.'}
 </p>
 </div>
 </div>
 );
 }

 // Group by date
 const groups: { [key: string]: Activity[] } = {};
 activities.forEach(activity => {
 const date = new Date(activity.createdAt).toLocaleDateString('en-US', {
 weekday: 'long',
 year: 'numeric',
 month: 'long',
 day: 'numeric'
 });
 if (!groups[date]) groups[date] = [];
 groups[date].push(activity);
 });

 const getIcon = (activity: Activity) => {
 if (isSentEmailActivity(activity)) {
  return <Mail size={18} className="text-[var(--primary)]" />;
 }
 switch (activity.type) {
 case 'Note': return <FileText size={18} className="text-primary" />;
 case 'Task': return <CheckCircle size={18} className={activity.metadata?.status === 'Completed' ? 'text-emerald-500' : 'text-amber-500'} />;
 case 'Call': return <PhoneCall size={18} className="text-rose-500" />;
 case 'Meeting': return <Calendar size={18} className="text-indigo-500" />;
 case 'Email': return <Mail size={18} className="text-[var(--primary)]" />;
 case 'System': return <TrendingUp size={18} className="text-indigo-600" />;
 default: return <Clock size={18} className="text-text-muted" />;
 }
 };

 const getBg = (activity: Activity) => {
 if (isSentEmailActivity(activity)) return 'bg-[var(--primary-light)]';
 switch (activity.type) {
 case 'Note': return 'bg-primary/5';
 case 'Task': return 'bg-amber-50';
 case 'Call': return 'bg-rose-50';
 case 'Meeting': return 'bg-indigo-50';
 case 'Email': return 'bg-[var(--primary-light)]';
 case 'System': return 'bg-indigo-50';
 default: return 'bg-surface-dim';
 }
 };

 return (
 <div className="space-y-12 relative before:absolute before:inset-0 before:left-6 before:w-px before:bg-slate-100 before:z-0">
 {Object.keys(groups).map((date) => (
 <div key={date} className="space-y-6 relative z-10">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 bg-card border-2 border-[var(--border-color)] rounded-[var(--radius-md)] flex items-center justify-center text-text-muted shadow-sm">
 <Calendar size={18} />
 </div>
 <h3 className="text-xs font-black text-text-muted uppercase tracking-[0.2em]">{date}</h3>
 </div>

 <div className="space-y-4 ml-6 pl-10 border-l border-transparent">
 {groups[date].map((activity) => (
 <div key={activity._id} className="group relative bg-card p-7 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
 <div className="absolute -left-[54px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card border-4 border-slate-50 flex items-center justify-center shadow-sm z-20 group-hover:scale-125 transition-transform">
 <div className={`w-3 h-3 rounded-full ${
    isSentEmailActivity(activity)
      ? 'bg-[var(--primary)]'
      : activity.type === 'Note'
        ? 'bg-[var(--primary)]'
        : activity.type === 'Task'
          ? 'bg-amber-500'
          : activity.type === 'Call'
            ? 'bg-rose-500'
            : activity.type === 'Meeting'
              ? 'bg-indigo-500'
              : activity.type === 'System'
                ? 'bg-indigo-500'
                : 'bg-[var(--primary)]'
  }`} />
 </div>

 <div className="flex justify-between items-start mb-4">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 ${getBg(activity)} rounded-[var(--radius-md)] flex items-center justify-center`}>
 {getIcon(activity)}
 </div>
 <div>
 <h4 className={`font-black tracking-tight ${activity.type === 'System' ? 'text-indigo-900' : 'text-text-main'}`}>{activity.title || activity.type}</h4>
 <p className="text-xs font-bold text-text-muted">
   {activity.type === 'System' ? 'SYSTEM LOG' : activity.type} • {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 {onEdit && (
 <button type="button" onClick={() => onEdit(activity)} className="p-2 text-text-muted hover:text-primary hover:bg-primary/5 rounded-[var(--radius-md)] transition-all"><Edit2 size={16} /></button>
 )}
 {allowDelete && onDelete && (
 <button type="button" onClick={() => onDelete(activity._id)} className="p-2 text-text-muted hover:text-rose-500 hover:bg-rose-50 rounded-[var(--radius-md)] transition-all"><Trash2 size={16} /></button>
 )}
 </div>
 </div>

 <div className="text-sm text-text-main font-medium leading-relaxed mb-4 space-y-3">
 {activity.type === 'Email' && activity.metadata ? (
   <div className="space-y-3">
     <div className="font-bold text-slate-900 border-b border-[var(--border-color)] pb-2">
       Subject: {activity.metadata.subject || activity.title}
     </div>
     {activity.metadata.direction === 'inbound' ? (
       <div className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/90 px-3 py-2 text-xs font-semibold text-slate-700">
         <p>
           <span className="text-slate-500">From: </span>
           {activity.metadata.fromDisplay || activity.metadata.fromEmail || '—'}
         </p>
         {(activity.metadata.toEmail || activity.metadata.to) && (
           <p>
             <span className="text-slate-500">To: </span>
             {activity.metadata.toEmail || activity.metadata.to}
           </p>
         )}
       </div>
     ) : (
       <div className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/90 px-3 py-2 text-xs font-semibold text-slate-700">
         {activity.metadata.fromEmail ? (
           <p>
             <span className="text-slate-500">From: </span>
             {activity.metadata.fromEmail}
           </p>
         ) : null}
         {(activity.metadata.toEmail || activity.metadata.to) ? (
           <p>
             <span className="text-slate-500">To: </span>
             {activity.metadata.toEmail || activity.metadata.to}
           </p>
         ) : null}
         {Array.isArray(activity.metadata.cc) &&
         activity.metadata.cc.length > 0 ? (
           <p>
             <span className="text-slate-500">CC: </span>
             {activity.metadata.cc.join(', ')}
           </p>
         ) : null}
       </div>
     )}
    {activity.metadata.bodyHtml ? (
      <CrmEmailActivityBody
        bodyHtml={activity.metadata.bodyHtml}
        emailId={
          activity.metadata.inboxEmailId || activity.metadata.emailId || null
        }
        attachments={activity.metadata.attachments}
        className="w-full min-h-[280px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white"
      />
    ) : activity.metadata.bodyPlain ? (
       <pre className="max-h-[min(70vh,520px)] overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4 text-sm leading-relaxed text-slate-800">
         {activity.metadata.bodyPlain}
       </pre>
     ) : (
       <div className="whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-4 text-sm leading-relaxed text-slate-700">
         {activity.metadata?.direction === 'inbound'
           ? stripCidNoiseFromPlainText(activity.content)
           : activity.content}
       </div>
     )}
     {Array.isArray(activity.metadata.attachments) &&
     activity.metadata.attachments.length > 0 ? (
       <CrmEmailActivityAttachments
         emailId={
           activity.metadata.inboxEmailId || activity.metadata.emailId || null
         }
         attachments={activity.metadata.attachments}
       />
     ) : null}
   </div>
 ) : isSentEmailActivity(activity) ? (
   <div className="space-y-2">
     <p className="text-slate-700">{activity.content}</p>
     {(activity.metadata?.bodyHtml || activity.metadata?.bodyPlain) && (
       <details className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/80">
         <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary">
           View full email
         </summary>
         <div className="px-3 pb-3 border-t border-[var(--border-color)]">
           {activity.metadata?.bodyHtml ? (
             <iframe
               title="Sent email preview"
               className="mt-2 w-full min-h-[240px] rounded-lg border border-[var(--border-color)] bg-white"
               sandbox=""
               srcDoc={buildCrmEmailPreviewSrcDoc(activity.metadata.bodyHtml)}
             />
           ) : (
             <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-white p-3 text-xs leading-relaxed">
               {activity.metadata?.bodyPlain}
             </pre>
           )}
         </div>
       </details>
     )}
   </div>
 ) : (
   activity.content
 )}
 </div>

 {(activity.type === 'Call' || activity.type === 'Meeting') && activity.metadata && (
 <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-50">
 {activity.type === 'Call' && (
    <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-tighter">
    {activity.metadata.type === 'Inbound' ? <ArrowDownLeft size={14} className="text-emerald-500" /> : <ArrowUpRight size={14} className="text-primary" />}
    {activity.metadata.type || 'Outbound'}
    </div>
 )}
 {activity.metadata.scheduledAt && (
    <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-tighter">
    <Calendar size={14} className="text-indigo-500" />
    Scheduled: {new Date(activity.metadata.scheduledAt).toLocaleString()}
    </div>
 )}
 {activity.metadata.duration && (
    <div className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-tighter">
    <Clock size={14} />
    {Math.floor((activity.metadata.duration || 0) / 60)}m {(activity.metadata.duration || 0) % 60}s
    </div>
 )}
 <div className="px-3 py-1 bg-surface-dim text-xs font-black text-text-muted rounded-full border border-[var(--border-color)]">
 {activity.metadata.status || 'Completed'}
 </div>
 </div>
 )}

 {activity.type === 'Task' && activity.metadata && (
 <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-50">
 <div className={`px-3 py-1 text-xs font-black rounded-full border  ${activity.metadata.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
 }`}>
 {activity.metadata.status || 'Pending'}
 </div>
 {activity.metadata.priority && (
 <div className="px-3 py-1 bg-surface-dim text-xs font-black text-text-muted rounded-full border border-[var(--border-color)]">
 Priority: {activity.metadata.priority}
 </div>
 )}
 </div>
 ) }

 <div className="mt-4 space-y-1">
 <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-wider">
 Logged by {activity.author?.name || 'Administrator'}
 </div>
 {(isSentEmailActivity(activity) ||
   (activity.type === 'Email' &&
     activity.metadata?.direction === 'outbound')) &&
 activity.metadata?.fromEmail ? (
 <p className="text-xs font-semibold normal-case tracking-normal text-slate-600">
 Sending mailbox: <span className="text-slate-900">{activity.metadata.fromEmail}</span>
 </p>
 ) : activity.type === 'Email' &&
   activity.metadata?.direction === 'inbound' &&
   activity.metadata?.toEmail ? (
 <p className="text-xs font-semibold normal-case tracking-normal text-slate-600">
 Delivered to inbox:{' '}
 <span className="text-slate-900">{activity.metadata.toEmail}</span>
 </p>
 ) : null}
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 );
}
