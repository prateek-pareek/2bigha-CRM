"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Calendar,
  Edit2,
  ChevronLeft,
  Trash2,
  Info,
  Share2,
  Settings2,
  MessageSquare,
  User,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Timeline from '@/components/crm/inbox/Timeline';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import ClientModal from '@/components/crm/records/create/ClientModal';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import { CRM_API_URL } from '@/lib/crm/config';
import CRMClientRecordFields from '@/components/crm/records/forms/CRMClientRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { contactWhatsappUrl } from '@/lib/crm/crm-messaging-links';
import EmailEngagementPanel from '@/components/crm/email/engagement/EmailEngagementPanel';
import ClientAssociationsPanel from '@/components/crm/records/associations/ClientAssociationsPanel';
import { buildEmailTrackingLookup, fetchCrmEmailTrackingForEntity, type CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { useCrmEmailTrackingRealtimeRefresh } from '@/lib/crm/email/useCrmEmailTrackingRealtimeRefresh';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
  const router = useRouter();
  const { hasAccess, isAdmin, isLoaded } = usePermissions();
  const [client, setClient] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [activityType, setActivityType] = useState('Activity');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState<{ key: string; name: string; type?: string; options?: string[] }[]>([]);
  const [showRecordCustomize, setShowRecordCustomize] = useState(false);
  const [layoutTickRecord, setLayoutTickRecord] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [emailTracking, setEmailTracking] = useState<CrmEmailTrackingRow[]>([]);
  const [activeTab, setActiveTab] = useState<'Activity' | 'Details'>('Activity');
  const [recordMetaLoaded, setRecordMetaLoaded] = useState(false);

  const emailLookups = useMemo(() => buildEmailTrackingLookup(emailTracking), [emailTracking]);

  const visibleRecordKeys = useMemo(
    () => getVisibleFieldKeysOrdered('clients', 'record', customFieldDefs.map((f) => f.key)),
    [customFieldDefs, layoutTickRecord]
  );

  const whatsappUrl = useMemo(() => (client ? contactWhatsappUrl(client) : null), [client]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isAdmin) {
      router.replace('/unauthorized?module=crm-clients');
    }
  }, [isLoaded, isAdmin, router]);

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!recordId) return;
    try {
      const [clientRes, activityRes, trackRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/clients/${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Client`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${CRM_API_URL}/crm/track/entity/${recordId}?module=clients`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      if (clientRes.ok) setClient(await clientRes.json());
      if (activityRes.ok) setActivities(await activityRes.json());
      if (trackRes.ok) {
        const tr = await trackRes.json();
        setEmailTracking(Array.isArray(tr) ? tr : []);
      } else {
        setEmailTracking([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordMetadata = useCallback(async () => {
    if (!recordId || recordMetaLoaded) return;
    const token = localStorage.getItem('token');
    try {
      const cfRes = await fetch(`${CRM_API_URL}/custom-fields?module=clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const cfData = cfRes.ok ? await cfRes.json() : [];
      setCustomFieldDefs(
        (cfData || []).map((f: any) => ({
          key: f.key,
          name: f.name,
          type: f.type,
          options: f.options,
        })),
      );
      setRecordMetaLoaded(true);
    } catch (err) {
      console.error(err);
    }
  }, [recordId, recordMetaLoaded]);

  useEffect(() => {
    if (!isLoaded || !isAdmin) return;
    fetchData();
  }, [recordId, isLoaded, isAdmin]);

  useEffect(() => {
    setRecordMetaLoaded(false);
  }, [recordId]);

  useEffect(() => {
    void fetchRecordMetadata();
  }, [fetchRecordMetadata]);

  const fetchEmailTracking = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !recordId) {
      setEmailTracking([]);
      return;
    }
    const data = await fetchCrmEmailTrackingForEntity(recordId, 'clients', token);
    setEmailTracking(data);
  }, [recordId]);

  useCrmEmailTrackingRealtimeRefresh(
    () => {
      void fetchEmailTracking();
    },
    recordId,
    { enabled: activeTab === 'Activity' },
  );

  if (!isLoaded || !isAdmin) return null;

  if (loading || !client) return (
    <div className="animate-pulse space-y-6 p-8">
      <div className="h-24 bg-surface-dim rounded-[var(--crm-radius-ui)]"></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-[600px] bg-surface-dim rounded-[var(--crm-radius-ui)]"></div>
        <div className="h-96 bg-surface-dim rounded-[var(--crm-radius-ui)]"></div>
      </div>
    </div>
  );

  const recipientName = client.name || 'Client';
  const recipientEmail = client.email || '';

  return (
    <div className={cn(crmRecordChrome.page, 'animate-in fade-in duration-300')}>
      <button type="button" onClick={() => router.back()} className={crmRecordChrome.backLink}>
        <ChevronLeft size={14} />
        Back to Clients
      </button>

      <div className={crmRecordChrome.panel}>
        <div className={crmRecordChrome.header}>
          <div className="flex min-w-0 items-start gap-4">
            <div className={crmRecordChrome.avatar}>
              {client.name?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={crmRecordChrome.title}>{client.name}</h1>
                <span className={`px-3 py-1 rounded-[var(--radius-md)] text-xs font-semibold border ${
                  client.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-surface-dim text-text-muted border-[var(--border-color)]'
                }`}>
                  {client.status}
                </span>
              </div>
              
              <div className="flex items-center gap-1 mt-1 -ml-1">
                <button
                  onClick={() => setIsSendEmailModalOpen(true)}
                  className="flex flex-col items-center gap-1 p-1.5 px-2 group hover:bg-primary/5 rounded-[var(--radius-md)] transition-all"
                  title="Send Email"
                >
                  <div className="w-8 h-8 rounded-[var(--radius-md)] bg-surface-dim group-hover:bg-primary/10 flex items-center justify-center text-text-muted group-hover:text-primary transition-all shadow-sm group-hover:shadow-md">
                    <Mail size={14} />
                  </div>
                  <span className="text-[8px] font-semibold text-text-muted group-hover:text-primary">Email</span>
                </button>

                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1 p-1.5 px-2 group hover:bg-[#25D366]/5 rounded-[var(--radius-md)] transition-all"
                    title="Open WhatsApp"
                  >
                    <div className="w-8 h-8 rounded-[var(--radius-md)] bg-surface-dim group-hover:bg-[#25D366]/10 flex items-center justify-center text-[#25D366] transition-all shadow-sm group-hover:shadow-md">
                      <WhatsAppGlyph className="w-[14px] h-[14px]" />
                    </div>
                    <span className="text-[8px] font-semibold text-text-muted group-hover:text-[#128C7E]">WhatsApp</span>
                  </a>
                )}

                <button
                  onClick={() => setIsMeetingModalOpen(true)}
                  className="flex flex-col items-center gap-1 p-1.5 px-2 group hover:bg-primary/5 rounded-[var(--radius-md)] transition-all"
                  title="Schedule Meeting"
                >
                  <div className="w-8 h-8 rounded-[var(--radius-md)] bg-surface-dim group-hover:bg-primary/10 flex items-center justify-center text-text-muted group-hover:text-primary transition-all shadow-sm group-hover:shadow-md">
                    <Calendar size={14} />
                  </div>
                  <span className="text-[8px] font-semibold text-text-muted group-hover:text-primary">Meeting</span>
                </button>

                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex flex-col items-center gap-1 p-1.5 px-2 group hover:bg-[var(--surface-dim)]0/5 rounded-[var(--radius-md)] transition-all"
                  title="Edit"
                >
                  <div className="w-8 h-8 rounded-[var(--radius-md)] bg-surface-dim group-hover:bg-[var(--surface-dim)]0/10 flex items-center justify-center text-text-muted group-hover:text-slate-700 transition-all shadow-sm group-hover:shadow-md">
                    <Edit2 size={14} />
                  </div>
                  <span className="text-[8px] font-semibold text-text-muted group-hover:text-slate-700">Edit</span>
                </button>

                <button
                  disabled={isSharing}
                  onClick={async () => {
                    const shareData = {
                      title: `${client.name} - Client`,
                      text: `Client: ${client.name}`,
                      url: window.location.href,
                    };

                    if (navigator.share) {
                      setIsSharing(true);
                      try {
                        await navigator.share(shareData);
                      } catch (err: any) {
                        if (err.name !== 'AbortError') {
                          console.error('Share failed:', err);
                          navigator.clipboard.writeText(window.location.href);
                          alert("Link copied to clipboard");
                        }
                      } finally {
                        setIsSharing(false);
                      }
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                      alert("Link copied to clipboard");
                    }
                  }}
                  className="flex flex-col items-center gap-1 p-1.5 px-2 group hover:bg-[var(--primary-light)] rounded-[var(--radius-md)] transition-all disabled:opacity-50"
                  title="Share"
                >
                  <div className="w-8 h-8 rounded-[var(--radius-md)] bg-surface-dim group-hover:bg-[var(--primary-light)] flex items-center justify-center text-text-muted group-hover:text-[var(--primary)] transition-all shadow-sm group-hover:shadow-md">
                    <Share2 size={14} />
                  </div>
                  <span className="text-[8px] font-semibold text-text-muted group-hover:text-[var(--primary)]">Share</span>
                </button>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <a 
                  href={`mailto:${client.email}`}
                  className="text-sm font-bold text-primary hover:underline flex items-center gap-2"
                >
                  <Mail size={14} className="opacity-60" />
                  {client.email}
                </a>
              </div>
            </div>
          </div>
          <div className={crmRecordChrome.actions}>
            {hasAccess('clients:delete') && (
            <button
              type="button"
              onClick={async () => {
                if (confirm('Delete this client permanently?')) {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${CRM_API_URL}/crm/clients/${recordId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) router.push('/crm/clients');
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--crm-radius-ui)] border border-[var(--error)]/30 px-3 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error-light)]"
            >
              <Trash2 size={14} />
              Delete
            </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className={cn(crmRecordChrome.panel, 'flex min-h-[480px] flex-col')}>
            <div className="px-6 pt-6 border-b border-border flex items-center justify-between gap-4 flex-wrap">
              <div className="flex gap-2 border-b-0">
                {[
                  { id: 'Activity' as const, label: 'Activity', icon: MessageSquare },
                  { id: 'Details' as const, label: 'Details', icon: Info },
                ].map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={cn(
                        'flex items-center gap-2 px-6 py-3.5 text-xs font-semibold transition-all relative',
                        isActive
                          ? 'text-primary border-b-2 border-primary italic'
                          : 'text-text-muted hover:text-text-main border-b-2 border-transparent',
                      )}
                    >
                      <t.icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'Details' && (
                <div className="flex items-center gap-1 pb-3">
                  <button
                    type="button"
                    onClick={() => setShowRecordCustomize(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-xs font-black uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-text-muted transition-all"
                  >
                    <Settings2 size={14} />
                    Record view
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="p-2 hover:bg-surface-dim rounded-[var(--radius-md)] text-text-muted hover:text-primary transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="p-8 flex-1">
              {activeTab === 'Activity' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <CrmRecordActivityComposer
                    activityType={activityType}
                    setActivityType={setActivityType}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    relatedTo={recordId}
                    relatedType="Client"
                    onActivityPosted={(data) => {
                      setActivities([data as any, ...activities]);
                      void fetchEmailTracking();
                    }}
                    onMeetingScheduleClick={() => setIsMeetingModalOpen(true)}
                  />
                  <Timeline
                    activities={activities}
                    filterType={activityType}
                    emailTrackingByEmailId={emailLookups.byEmailId}
                    emailTrackingByToken={emailLookups.byToken}
                    onRefreshNeeded={fetchData}
                    timelineReplyContext={
                      recordId
                        ? { module: 'clients', entityId: String(recordId) }
                        : undefined
                    }
                    onEmailReplySent={() => {
                      void fetchData();
                    }}
                  />
                </div>
              )}

              {activeTab === 'Details' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-xs font-bold text-text-muted flex items-center gap-2 mb-8">
                    <User size={14} />
                    Client core properties
                  </h3>
                  <CRMClientRecordFields client={client} visibleKeys={visibleRecordKeys} customFieldDefs={customFieldDefs} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <EmailEngagementPanel rows={emailTracking} />

          {recordId && (
            <ClientAssociationsPanel
              clientId={recordId}
              client={client}
              onUpdated={() => {
                void fetchData();
              }}
            />
          )}

        </div>
      </div>

      <ClientModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={fetchData}
        client={client}
      />
      
      <SendEmailModal
        isOpen={isSendEmailModalOpen}
        onClose={() => setIsSendEmailModalOpen(false)}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
        module="clients"
        entityId={recordId}
        onSuccess={fetchData}
        suggestedCcEmails={Array.isArray(client?.additionalEmails) ? client.additionalEmails : []}
      />
      
      <ScheduleMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        entityId={recordId}
        module="clients"
        recipientName={recipientName}
        onSuccess={fetchData}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showRecordCustomize}
        onClose={() => setShowRecordCustomize(false)}
        module="clients"
        context="record"
        customFieldKeys={customFieldDefs.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickRecord((t) => t + 1)}
      />
    </div>
  );
}
