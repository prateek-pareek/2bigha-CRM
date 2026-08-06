"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CRM_API_URL } from '@/lib/crm/config';
import { Building2, Globe, Mail, Phone, ChevronLeft, Trash2, Edit2, Settings2, MessageSquare, Info } from 'lucide-react';
import Timeline from '@/components/crm/inbox/Timeline';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import CrmPlaybookPanel from '@/components/crm/automation/playbooks/CrmPlaybookPanel';
import OrganizationAssociationsPanel from '@/components/crm/records/associations/OrganizationAssociationsPanel';
import EditModal from '@/components/crm/records/create/EditModal';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import CRMOrganizationRecordFields from '@/components/crm/records/forms/CRMOrganizationRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import CrmRecordDetailTabs from '@/components/crm/records/detail/CrmRecordDetailTabs';
import CrmRecordDetailSkeleton from '@/components/crm/records/detail/CrmRecordDetailSkeleton';

export default function OrganizationDetailPage() {
 const { id } = useParams();
 const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
 const router = useRouter();
 const { hasAccess } = usePermissions();
 const [org, setOrg] = useState<any>(null);
 const [activities, setActivities] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [newComment, setNewComment] = useState('');
 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
 const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
 const [customFieldDefs, setCustomFieldDefs] = useState<{ key: string; name: string; type?: string; options?: string[] }[]>([]);
 const [showRecordCustomize, setShowRecordCustomize] = useState(false);
 const [layoutTickRecord, setLayoutTickRecord] = useState(0);
 const [activeTab, setActiveTab] = useState<'Activity' | 'Details'>('Activity');
 const [activityType, setActivityType] = useState('Activity');
 const [recordMetaLoaded, setRecordMetaLoaded] = useState(false);

 const visibleRecordKeys = useMemo(
   () => getVisibleFieldKeysOrdered('organizations', 'record', customFieldDefs.map((f) => f.key)),
   [customFieldDefs, layoutTickRecord]
 );

 const fetchRecordMetadata = useCallback(async () => {
 if (!recordId || recordMetaLoaded) return;
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/custom-fields?module=organizations`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const cfData = res.ok ? await res.json() : [];
 setCustomFieldDefs(
        (cfData || []).map((f: any) => ({ key: f.key, name: f.name, type: f.type, options: f.options })),
      );
 setRecordMetaLoaded(true);
 } catch (err) {
 console.error(err);
 }
 }, [recordId, recordMetaLoaded]);

 useEffect(() => {
 if (!recordId) return;
 const token = localStorage.getItem('token');
 let isCancelled = false;
 Promise.all([
 fetch(`${CRM_API_URL}/crm/organizations/${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => {
 if (res.status === 401) { router.push('/auth/login?error=unauthorized'); return; }
 return res.json();
 }),
 fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Organization`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
 ]).then(([orgData, activityData]) => {
 if (isCancelled) return;
 setOrg(orgData);
 setActivities(activityData);
 setLoading(false);
 }).catch(err => {
 console.error(err);
 if (isCancelled) return;
 setLoading(false);
 setOrg({
 name: 'Acme Corp', website: 'acme.com', industry: 'Manufacturing', phone: '123-456-7890',
 email: 'info@acme.com', territory: 'North America', noOfEmployees: '500-1000',
 annualRevenue: 50000000, createdAt: new Date().toISOString()
 });
 setActivities([]);
 });
 return () => {
 isCancelled = true;
 };
 }, [recordId]);

 useEffect(() => {
 if (activeTab !== 'Details') return;
 void fetchRecordMetadata();
 }, [activeTab, fetchRecordMetadata]);

 const refreshActivities = async () => {
 if (!recordId) return;
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Organization`, { headers: { 'Authorization': `Bearer ${token}` } });
 if (res.ok) setActivities(await res.json());
 } catch { /* ignore */ }
 };

 const refreshOrg = async () => {
   if (!recordId) return;
   const token = localStorage.getItem('token');
   try {
     const res = await fetch(`${CRM_API_URL}/crm/organizations/${recordId}`, {
       headers: { Authorization: `Bearer ${token}` },
     });
     if (res.ok) setOrg(await res.json());
   } catch { /* ignore */ }
 };

 if (loading || !org) return <CrmRecordDetailSkeleton />;

 return (
 <>
 <div className={cn(crmRecordChrome.page, 'animate-in fade-in duration-300')}>
 <SendEmailModal
 isOpen={isSendEmailModalOpen}
 onClose={() => setIsSendEmailModalOpen(false)}
 recipientEmail={org.email}
 recipientName={org.name}
 module="organizations"
 entityId={recordId}
 />
 <ScheduleMeetingModal
 isOpen={isMeetingModalOpen}
 onClose={() => setIsMeetingModalOpen(false)}
 entityId={String(recordId)}
 module="organizations"
 recipientName={org.name}
 onSuccess={() => { void refreshActivities(); }}
 />
 <button type="button" onClick={() => router.back()} className={crmRecordChrome.backLink}>
 <ChevronLeft size={14} />
 Back to Companies
 </button>

 <div className={crmRecordChrome.panel}>
 <div className={crmRecordChrome.header}>
 <div className="flex min-w-0 items-start gap-4">
 <div className={crmRecordChrome.avatar}>
 <Building2 size={22} />
 </div>
 <div className="min-w-0 flex-1">
 <h1 className={crmRecordChrome.title}>{org.name}</h1>
 {(org.industry || org.website || org.email || org.phone) ? (
 <div className="mt-2 space-y-1.5">
 {org.industry ? (
 <div>
 <span className="inline-flex items-center rounded-md bg-[var(--primary-light)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--primary)]">
 {org.industry}
 </span>
 </div>
 ) : null}
 <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
 {org.website ? (
 <a
 href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
 target="_blank"
 rel="noopener noreferrer"
 className={cn(crmRecordChrome.metaLine, 'min-w-0 font-medium text-[var(--hs-link)] hover:underline')}
 title={org.website}
 >
 <Globe size={14} className="shrink-0 opacity-80" />
 <span className="truncate">
 {org.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
 </span>
 </a>
 ) : null}
 {org.email ? (
 <a
 href={`mailto:${org.email}`}
 className={cn(crmRecordChrome.metaLine, 'min-w-0 font-medium text-[var(--hs-link)] hover:underline')}
 >
 <Mail size={14} className="shrink-0 opacity-80" />
 <span className="truncate">{org.email}</span>
 </a>
 ) : null}
 {org.phone ? (
 <a
 href={`tel:${org.phone}`}
 className={cn(crmRecordChrome.metaLine, 'min-w-0 font-medium text-[var(--text-muted)] hover:text-[var(--primary)]')}
 >
 <Phone size={14} className="shrink-0 opacity-80" />
 <span className="truncate">{org.phone}</span>
 </a>
 ) : null}
 </div>
 </div>
 ) : null}
 </div>
 </div>
 <div className={crmRecordChrome.actions}>
 {hasAccess('organizations:delete') && (
 <button
 type="button"
 onClick={async () => {
 if (confirm('Move this organization to Trash? Only an admin can restore it.')) {
 const token = localStorage.getItem('token');
 const res = await fetch(`${CRM_API_URL}/crm/organizations/${recordId}`, {
 method: 'DELETE',
 headers: { 'Authorization': `Bearer ${token}` }
 });
 if (res.ok) router.push('/crm/organizations');
 }
 }}
 className="inline-flex h-9 items-center gap-1.5 rounded-[var(--crm-radius-ui)] border border-[var(--error)]/30 px-3 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error-light)]"
 >
 <Trash2 size={14} />
 Delete
 </button>
 )}
 <button
 type="button"
 onClick={() => setIsSendEmailModalOpen(true)}
 className="inline-flex h-9 items-center gap-1.5 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] px-3 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-dim)]"
 >
 <Mail size={14} />
 Email
 </button>
 <button
 type="button"
 onClick={() => setIsEditModalOpen(true)}
 className="inline-flex h-9 items-center gap-1.5 rounded-[var(--crm-radius-ui)] bg-[var(--primary)] px-4 text-xs font-bold text-white hover:bg-[var(--primary-dark)]"
 >
 <Edit2 size={14} />
 Edit Company
 </button>
 <EditModal
 isOpen={isEditModalOpen}
 onClose={() => setIsEditModalOpen(false)}
 type="Org"
 initialData={org}
 onSuccess={() => {
 fetch(`${CRM_API_URL}/crm/organizations/${recordId}`, {
 headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
 }).then(r => r.json()).then(data => setOrg(data));
 }}
 />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
 <div className="min-w-0">
 <div className={cn(crmRecordChrome.panel, 'flex min-h-[520px] flex-col')}>
 <CrmRecordDetailTabs
 tabs={[
 { id: 'Activity' as const, label: 'Activity', icon: MessageSquare },
 { id: 'Details' as const, label: 'Details', icon: Info },
 ]}
 activeTab={activeTab}
 onTabChange={setActiveTab}
 detailsToolbar={
 <>
 <button
 type="button"
 onClick={() => setShowRecordCustomize(true)}
 className="inline-flex items-center gap-1.5 rounded-[var(--crm-radius-ui)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
 >
 <Settings2 size={13} />
 Layout
 </button>
 <button
 type="button"
 onClick={() => setIsEditModalOpen(true)}
 className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--crm-radius-ui)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
 title="Edit"
 >
 <Edit2 size={14} />
 </button>
 </>
 }
 />

 <div className={cn(crmRecordChrome.tabBody, 'flex-1')}>
 {activeTab === 'Activity' && (
 <div className="space-y-5 animate-in fade-in duration-300">
 <CrmRecordActivityComposer
 activityType={activityType}
 setActivityType={setActivityType}
 newComment={newComment}
 setNewComment={setNewComment}
 relatedTo={recordId}
 relatedType="Organization"
 onActivityPosted={(data) => {
 setActivities([data as any, ...activities]);
 }}
 onMeetingScheduleClick={() => setIsMeetingModalOpen(true)}
 />
 <Timeline
 activities={activities}
 filterType={activityType}
 onRefreshNeeded={refreshActivities}
 timelineReplyContext={
 recordId
 ? { module: 'organizations', entityId: String(recordId) }
 : undefined
 }
 onEmailReplySent={() => {
 void refreshActivities();
 }}
 />
 </div>
 )}

 {activeTab === 'Details' && (
 <div className="animate-in fade-in duration-300">
 <h3 className="mb-6 flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
 <Building2 size={14} />
 Company properties
 </h3>
 <CRMOrganizationRecordFields org={org} visibleKeys={visibleRecordKeys} customFieldDefs={customFieldDefs} />
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="space-y-4">
 <CrmPlaybookPanel
 relatedTo={recordId}
 relatedType="Organization"
 onApplied={() => { void refreshActivities(); }}
 />
 <OrganizationAssociationsPanel
 organizationId={recordId}
 org={org as Record<string, unknown>}
 onUpdated={() => {
   void Promise.all([refreshOrg(), refreshActivities()]);
 }}
 />
 <div className={crmRecordChrome.sidebarPanel}>
 <h3 className={crmRecordChrome.sectionTitle}>Contact Info</h3>
 <div className="space-y-4">
 {(org.email || org.phone || org.website || org.address) ? (
 <>
 {org.email && (
 <div className="flex flex-col gap-1 border-b border-[var(--border-color)] pb-3 last:border-0 last:pb-0">
 <span className="text-xs font-medium text-[var(--text-muted)]">Primary Email</span>
 <span className="group flex items-center justify-between text-sm font-semibold text-[var(--text-main)]">
 {org.email}
 <a href={`mailto:${org.email}`} className="rounded-lg p-1.5 text-[var(--primary)] opacity-0 transition-opacity hover:bg-[var(--primary-light)] group-hover:opacity-100"><Mail size={14} /></a>
 </span>
 </div>
 )}
 {org.phone && (
 <div className="flex flex-col gap-1 border-b border-[var(--border-color)] pb-3 last:border-0 last:pb-0">
 <span className="text-xs font-medium text-[var(--text-muted)]">Phone Number</span>
 <span className="group flex items-center justify-between text-sm font-semibold text-[var(--text-main)]">
 {org.phone}
 <a href={`tel:${org.phone}`} className="rounded-lg p-1.5 text-emerald-500 opacity-0 transition-opacity hover:bg-emerald-50 group-hover:opacity-100"><Phone size={14} /></a>
 </span>
 </div>
 )}
 {org.website && (
 <div className="flex flex-col gap-1 border-b border-[var(--border-color)] pb-3 last:border-0 last:pb-0">
 <span className="text-xs font-medium text-[var(--text-muted)]">Website</span>
 <span className="group flex w-full items-center justify-between overflow-hidden text-sm font-semibold text-[var(--text-main)]">
 <span className="truncate">{org.website}</span>
 <a href={org.website.startsWith('http') ? org.website : `https://${org.website}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg p-1.5 text-[var(--primary)] opacity-0 transition-opacity hover:bg-[var(--primary-light)] group-hover:opacity-100"><Globe size={14} /></a>
 </span>
 </div>
 )}
 {org.address && (
 <div className="flex flex-col gap-1">
 <span className="text-xs font-medium text-[var(--text-muted)]">Address</span>
 <span className="text-sm font-semibold text-[var(--text-main)]">{org.address}</span>
 </div>
 )}
 </>
 ) : (
 <p className="text-xs italic text-[var(--text-muted)]">No contact information provided.</p>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 <CRMFieldLayoutCustomizer
 isOpen={showRecordCustomize}
 onClose={() => setShowRecordCustomize(false)}
 module="organizations"
 context="record"
 customFieldKeys={customFieldDefs.map((f) => ({ key: f.key, label: f.name }))}
 onSaved={() => setLayoutTickRecord((t) => t + 1)}
 />
 </>
 );
}

