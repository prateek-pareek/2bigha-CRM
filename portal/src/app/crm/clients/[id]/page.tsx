"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Phone,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import Timeline from '@/components/crm/inbox/Timeline';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import ClientModal from '@/components/crm/records/create/ClientModal';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import { CRM_API_URL } from '@/lib/crm/config';
import CRMClientRecordFields from '@/components/crm/records/forms/CRMClientRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { contactWhatsappWaId } from '@/lib/crm/crm-messaging-links';
import EmailEngagementPanel from '@/components/crm/email/engagement/EmailEngagementPanel';
import ClientAssociationsPanel from '@/components/crm/records/associations/ClientAssociationsPanel';
import TwoBighaClientPlatformPanel from '@/components/crm/platform/TwoBighaClientPlatformPanel';
import TwoBighaVisitTrackingPanel from '@/components/crm/visits/TwoBighaVisitTrackingPanel';
import CrmRecordQuickActions, { type CrmRecordQuickAction } from '@/components/crm/records/detail/CrmRecordQuickActions';
import CrmRecordDetailTabs from '@/components/crm/records/detail/CrmRecordDetailTabs';
import CrmRecordDetailSkeleton from '@/components/crm/records/detail/CrmRecordDetailSkeleton';
import CrmRecordSidebarGroup from '@/components/crm/records/detail/CrmRecordSidebarGroup';
import CrmRecordRemindersPanel from '@/components/crm/records/detail/CrmRecordRemindersPanel';
import { buildEmailTrackingLookup, fetchCrmEmailTrackingForEntity, type CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { useCrmEmailTrackingRealtimeRefresh } from '@/lib/crm/email/useCrmEmailTrackingRealtimeRefresh';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { CrmPageHeader, CrmButton } from '@/components/crm/ui';
import "@/app/crm/crm-hubspot.css";

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

  const whatsappUrl = useMemo(() => {
    if (!client) return null;
    const waId = contactWhatsappWaId(client);
    return waId ? `/crm/whatsapp?wa=${waId}` : null;
  }, [client]);

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
    if (activeTab !== 'Details') return;
    void fetchRecordMetadata();
  }, [activeTab, fetchRecordMetadata]);

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

  if (loading || !client) {
    return <CrmRecordDetailSkeleton />;
  }

  const recipientName = client.name || 'Client';
  const recipientEmail = client.email || '';
  const hasEmail = Boolean(recipientEmail.trim());
  const hasPhone = Boolean(String(client.phone || '').trim());
  const initials = client.name
    ? client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const quickActions: CrmRecordQuickAction[] = [
    {
      id: 'email',
      label: 'Email',
      icon: <Mail size={14} />,
      primary: true,
      disabled: !hasEmail,
      title: hasEmail ? 'Send email' : 'Add an email first',
      onClick: () => setIsSendEmailModalOpen(true),
    },
  ];

  if (whatsappUrl) {
    quickActions.push({
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppGlyph className="h-3.5 w-3.5 text-[#25d366]" />,
      href: whatsappUrl,
      title: 'Open WhatsApp chat',
    });
  }

  if (hasPhone) {
    quickActions.push({
      id: 'call',
      label: 'Call',
      icon: <Phone size={14} />,
      href: `tel:${client.phone}`,
      title: `Call ${client.phone}`,
    });
  }

  quickActions.push({
    id: 'meeting',
    label: 'Meeting',
    icon: <Calendar size={14} />,
    title: 'Schedule meeting',
    onClick: () => setIsMeetingModalOpen(true),
  });

  const secondaryActions: CrmRecordQuickAction[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: <Edit2 size={14} />,
      title: 'Edit client',
      onClick: () => setIsEditModalOpen(true),
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={14} />,
      disabled: isSharing,
      title: 'Share link',
      onClick: async () => {
        const shareData = {
          title: `${client.name} - Client`,
          text: `Client: ${client.name}`,
          url: window.location.href,
        };

        if (navigator.share) {
          setIsSharing(true);
          try {
            await navigator.share(shareData);
          } catch (err: unknown) {
            if ((err as { name?: string })?.name !== 'AbortError') {
              await navigator.clipboard.writeText(window.location.href);
              toast.success('Link copied to clipboard');
            }
          } finally {
            setIsSharing(false);
          }
        } else {
          await navigator.clipboard.writeText(window.location.href);
          toast.success('Link copied to clipboard');
        }
      },
    },
  ];

  const recordTabs = [
    { id: 'Activity' as const, label: 'Activity', icon: MessageSquare },
    { id: 'Details' as const, label: 'Details', icon: Info },
  ];

  return (
    <div className={cn(crmRecordChrome.page, 'animate-in fade-in duration-300')}>
      <CrmPageHeader
        title="Clients"
        bordered={false}
        breadcrumbs={[
          { label: 'Home', href: '/crm/workspace/summary' },
          { label: 'Clients', href: '/crm/clients' },
          { label: client.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => void fetchData()}
              leftIcon={<RefreshCw size={14} />}
              className="!h-9 !px-3 !text-xs"
            >
              Refresh
            </CrmButton>
            {hasAccess('clients:delete') ? (
              <CrmButton
                type="button"
                variant="secondary"
                className="!h-9 !px-3 !text-xs !border-[var(--error)]/30 !text-[var(--error)] hover:!bg-[var(--error-light)]"
                leftIcon={<Trash2 size={14} />}
                onClick={async () => {
                  if (confirm('Delete this client permanently?')) {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${CRM_API_URL}/crm/clients/${recordId}`, {
                      method: 'DELETE',
                      headers: { 'Authorization': `Bearer ${token}` },
                    });
                    if (res.ok) router.push('/crm/clients');
                  }
                }}
              >
                Delete
              </CrmButton>
            ) : null}
          </div>
        }
      />

      <button type="button" onClick={() => router.push('/crm/clients')} className={crmRecordChrome.backLink}>
        <ChevronLeft size={14} />
        Back to Clients
      </button>

      <div className={crmRecordChrome.hero}>
        <div className={crmRecordChrome.heroBody}>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className={crmRecordChrome.avatar}>{initials}</div>
            <div className="min-w-0 flex-1">
              <h1 className={cn(crmRecordChrome.title, 'truncate')}>{client.name}</h1>
              {client.email ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-0.5')}>
                  <Mail size={14} className="shrink-0 opacity-80" />
                  <a href={`mailto:${client.email}`} className="truncate hover:text-[var(--primary)] hover:underline">
                    {client.email}
                  </a>
                </p>
              ) : null}
              {client.phone ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-0.5')}>
                  <Phone size={14} className="shrink-0 opacity-80" />
                  <a href={`tel:${client.phone}`} className="hover:text-[var(--primary)]">
                    {client.phone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          <div className={cn(crmRecordChrome.actions, 'shrink-0 self-start pr-14 sm:pr-20')}>
            <span className={crmRecordChrome.statusPrivate}>
              <Lock size={12} />
              Client
            </span>
            <span
              className={cn(
                'inline-flex h-8 items-center rounded-[var(--crm-radius-ui)] px-2.5 text-xs font-semibold capitalize',
                client.status === 'active'
                  ? 'bg-[var(--success-light)] text-[var(--success)]'
                  : 'bg-[var(--surface-dim)] text-[var(--text-muted)]',
              )}
            >
              {client.status || 'unknown'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRecordCustomize(true)}
          className={crmRecordChrome.gearBtn}
          title="Customize layout"
          aria-label="Customize layout"
        >
          <Settings2 size={16} />
        </button>

        <div className="border-t border-[var(--border-color)] px-4 pb-3 sm:px-5">
          <CrmRecordQuickActions
            actions={quickActions}
            secondaryActions={secondaryActions}
            className="!mt-0 !border-0 !pt-3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className={cn(crmRecordChrome.panel, 'flex min-h-[480px] flex-col')}>
            <CrmRecordDetailTabs
              tabs={recordTabs}
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
                <div className="animate-in fade-in duration-300">
                  <h3 className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <User size={13} />
                    Client properties
                  </h3>
                  <CRMClientRecordFields client={client} visibleKeys={visibleRecordKeys} customFieldDefs={customFieldDefs} />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className={crmRecordChrome.sidebar}>
          <CrmRecordSidebarGroup title="Engagement" defaultOpen>
            <EmailEngagementPanel rows={emailTracking} />
            <CrmRecordRemindersPanel relatedType="Client" relatedTo={recordId} />
          </CrmRecordSidebarGroup>

          <CrmRecordSidebarGroup title="Associations & platform" defaultOpen>
            {recordId ? (
              <ClientAssociationsPanel
                clientId={recordId}
                client={client}
                onUpdated={() => {
                  void fetchData();
                }}
              />
            ) : null}

            {recordId ? (
              <TwoBighaClientPlatformPanel
                clientId={recordId}
                client={client}
                onUpdated={() => {
                  void fetchData();
                }}
              />
            ) : null}

            {recordId ? <TwoBighaVisitTrackingPanel clientId={recordId} /> : null}
          </CrmRecordSidebarGroup>
        </aside>
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
