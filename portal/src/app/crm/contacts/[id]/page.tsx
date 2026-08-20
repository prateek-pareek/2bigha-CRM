"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, CalendarClock, ChevronLeft, Edit2, Trash2, Calendar, Share2, Settings2, MessageSquare, Info, Building2, Phone, EyeOff } from 'lucide-react';
import FollowUpSequenceModal from '@/components/crm/automation/playbooks/FollowUpSequenceModal';
import FollowUpSequenceCard from '@/components/crm/automation/playbooks/FollowUpSequenceCard';
import Timeline from '@/components/crm/inbox/Timeline';
import EditModal from '@/components/crm/records/create/EditModal';
import { CRM_API_URL } from '@/lib/crm/config';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from 'sonner';
import CRMContactRecordFields from '@/components/crm/records/forms/CRMContactRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { contactWhatsappUrl, contactTelegramUrl } from '@/lib/crm/crm-messaging-links';
import EmailEngagementPanel from '@/components/crm/email/engagement/EmailEngagementPanel';
import { CRMContactCompanySidebarCard } from '@/components/crm/records/associations/CRMCompanySidebarCard';
import ContactAssociationsPanel from '@/components/crm/records/associations/ContactAssociationsPanel';
import { buildEmailTrackingLookup, fetchCrmEmailTrackingForContact, type CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { useCrmEmailTrackingRealtimeRefresh } from '@/lib/crm/email/useCrmEmailTrackingRealtimeRefresh';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import CrmPlaybookPanel from '@/components/crm/automation/playbooks/CrmPlaybookPanel';
import CrmPlaybookRecommendedBanner from '@/components/crm/automation/playbooks/CrmPlaybookRecommendedBanner';
import CrmRecordQuickActions, { type CrmRecordQuickAction } from '@/components/crm/records/detail/CrmRecordQuickActions';
import CrmRecordSegmentsPanel from '@/components/crm/segments/CrmRecordSegmentsPanel';
import CrmRecordDetailTabs from '@/components/crm/records/detail/CrmRecordDetailTabs';
import CrmRecordOwnerCard from '@/components/crm/records/detail/CrmRecordOwnerCard';
import CrmRecordDetailSkeleton from '@/components/crm/records/detail/CrmRecordDetailSkeleton';
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

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams();
  const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasAccess } = usePermissions();
  const [contact, setContact] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [isFollowUpSeqOpen, setIsFollowUpSeqOpen] = useState(false);
  const [followUpSeqInitialTab, setFollowUpSeqInitialTab] = useState<
    'first-outreach' | 'follow-ups'
  >('first-outreach');
  const [followUpRefreshKey, setFollowUpRefreshKey] = useState(0);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activityType, setActivityType] = useState('Activity');
  const [customFieldDefs, setCustomFieldDefs] = useState<{ key: string; name: string; type?: string; options?: string[] }[]>([]);
  const [showRecordCustomize, setShowRecordCustomize] = useState(false);
  const [layoutTickRecord, setLayoutTickRecord] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [emailTracking, setEmailTracking] = useState<CrmEmailTrackingRow[]>([]);
  const [activeTab, setActiveTab] = useState<'Activity' | 'Details'>('Activity');
  const [recordMetaLoaded, setRecordMetaLoaded] = useState(false);
  const entityId = useMemo(
    () => String((contact?._id ?? recordId) || ''),
    [contact?._id, recordId],
  );

  const emailLookups = useMemo(() => buildEmailTrackingLookup(emailTracking), [emailTracking]);

  const visibleRecordKeys = useMemo(
    () => getVisibleFieldKeysOrdered('contacts', 'record', customFieldDefs.map((f) => f.key)),
    [customFieldDefs, layoutTickRecord]
  );

  const recordFieldKeysForGrid = useMemo(
    () => visibleRecordKeys.filter((k) => k !== 'organization'),
    [visibleRecordKeys]
  );

  const whatsappUrl = useMemo(() => (contact ? contactWhatsappUrl(contact) : null), [contact]);
  const telegramUrl = useMemo(() => (contact ? contactTelegramUrl(contact) : null), [contact]);

  const fetchContact = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/contacts/${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data && data._id) setContact(data);
    } catch (err) { console.error(err); }
  };

  const fetchActivities = async () => {
    const token = localStorage.getItem('token');
    const relatedTo = String(entityId || recordId || '');
    if (!relatedTo) {
      setActivities([]);
      return;
    }
    try {
      const res = await fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(relatedTo)}&relatedType=Contact`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setActivities(data || []);
    } catch (err) { console.error(err); }
  };

  const fetchEmailTracking = useCallback(async (targetEntityId?: string) => {
    const token = localStorage.getItem('token');
    const resolvedEntityId = String(targetEntityId || entityId || '');
    if (!token || !resolvedEntityId) {
      setEmailTracking([]);
      return;
    }
    const data = await fetchCrmEmailTrackingForContact(resolvedEntityId, token);
    setEmailTracking(data);
  }, [entityId]);

  useCrmEmailTrackingRealtimeRefresh(
    () => {
      void fetchEmailTracking();
    },
    entityId,
    { enabled: activeTab === 'Activity' },
  );

  const fetchRecordMetadata = useCallback(async () => {
    if (!recordId || recordMetaLoaded) return;
    const token = localStorage.getItem('token');
    try {
      const cfRes = await fetch(`${CRM_API_URL}/custom-fields?module=contacts`, {
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
    setRecordMetaLoaded(false);
  }, [recordId]);

  useEffect(() => {
    if (!recordId) return;
    const token = localStorage.getItem('token');
    let isCancelled = false;
    setLoading(true);
    (async () => {
      let resolvedEntityId = recordId;
      try {
        const contactRes = await fetch(`${CRM_API_URL}/crm/contacts/${recordId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contactData = await contactRes.json();
        resolvedEntityId = String(contactData?._id || recordId);
        if (!isCancelled) {
          setContact(contactData);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!isCancelled) setLoading(false);
        return;
      }

      Promise.allSettled([
        fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(resolvedEntityId)}&relatedType=Contact`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => res.json()),
        fetch(`${CRM_API_URL}/crm/track/contact/${resolvedEntityId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => (res.ok ? res.json() : [])),
      ]).then((results) => {
        if (isCancelled) return;
        const [activityData, trackData] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
        setActivities((activityData as any[]) || []);
        setEmailTracking(Array.isArray(trackData) ? trackData : []);
      }).catch((err) => console.error(err));
    })();

    return () => {
      isCancelled = true;
    };
  }, [recordId]);

  // Deep-link support: /crm/contacts/:id?edit=1 opens straight into the prefilled Edit form
  // (used by the Contacts list "Edit" action instead of landing on the read-only view first).
  useEffect(() => {
    if (!contact || searchParams.get('edit') !== '1') return;
    setIsEditModalOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('edit');
    const query = params.toString();
    router.replace(`/crm/contacts/${recordId}${query ? `?${query}` : ''}`, { scroll: false });
  }, [contact, searchParams, recordId, router]);

  useEffect(() => {
    if (activeTab !== 'Details') return;
    void fetchRecordMetadata();
  }, [activeTab, fetchRecordMetadata]);

  const applyEmailFromFinder = async (email: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${CRM_API_URL}/crm/contacts/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || 'Failed to save email on contact');
    }
    const updated = await res.json();
    setContact(updated);
    toast.success(`Email saved: ${email}`);
  };

  const handleDeleteContact = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/contacts/${recordId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Contact deleted successfully');
        router.push('/crm/contacts');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete contact');
    }
  };

  if (loading || !contact) return <CrmRecordDetailSkeleton />;

  const hasEmail = Boolean(String(contact.email || '').trim());
  const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Contact';

  const quickActions: CrmRecordQuickAction[] = [
    {
      id: 'email',
      label: 'Email',
      icon: <Mail size={14} />,
      primary: true,
      disabled: !hasEmail,
      title: hasEmail ? 'Send email' : 'Add an email to send from CRM',
      onClick: () => setIsSendEmailModalOpen(true),
    },
    {
      id: 'open-tracking',
      label: 'Open tracking',
      icon: <EyeOff size={14} />,
      disabled: !hasEmail,
      title: 'Schedule if-not-opened alternate outreach',
      onClick: () => {
        setFollowUpSeqInitialTab('first-outreach');
        setIsFollowUpSeqOpen(true);
      },
    },
    {
      id: 'follow-ups',
      label: 'Follow-ups',
      icon: <CalendarClock size={14} />,
      disabled: !hasEmail,
      title: 'Schedule follow-up cadence',
      onClick: () => {
        setFollowUpSeqInitialTab('follow-ups');
        setIsFollowUpSeqOpen(true);
      },
    },
    {
      id: 'meeting',
      label: 'Meeting',
      icon: <Calendar size={14} />,
      title: 'Schedule meeting',
      onClick: () => setIsMeetingModalOpen(true),
    },
  ];

  if (whatsappUrl) {
    quickActions.splice(2, 0, {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppGlyph className="h-3.5 w-3.5" />,
      href: whatsappUrl,
      external: true,
      title: 'Open WhatsApp',
    });
  }

  if (telegramUrl) {
    quickActions.splice(whatsappUrl ? 3 : 2, 0, {
      id: 'telegram',
      label: 'Telegram',
      icon: <TelegramGlyph className="h-3.5 w-3.5" />,
      href: telegramUrl,
      external: true,
      title: 'Open Telegram',
    });
  }

  const secondaryActions: CrmRecordQuickAction[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: <Edit2 size={14} />,
      title: 'Edit contact',
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
          title: `${displayName} - Contact`,
          text: `${displayName}${contact.organization ? ` from ${contact.organization}` : ''}`,
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
    <div className="space-y-6 sm:space-y-8 pb-12 animate-in fade-in duration-300 font-sans max-w-350 mx-auto">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted transition-colors hover:text-primary"
      >
        <ChevronLeft size={14} />
        Back to Contacts
      </button>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-7 shadow-[var(--crm-shadow-card)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-secondary text-xl font-extrabold text-primary shadow-xs sm:h-20 sm:w-20 sm:text-2xl">
              {contact.firstName?.[0]}{contact.lastName?.[0]}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h1 className="text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
                {displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {contact.organization ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-bold text-text-primary">
                    <Building2 size={12} className="text-text-muted" />
                    {contact.organization}
                  </span>
                ) : null}
                {contact.status ? (
                  <span className="inline-flex items-center rounded-md border border-primary/20 bg-secondary px-2.5 py-0.5 text-xs font-extrabold text-primary">
                    {contact.status}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold text-text-muted pt-1">
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline min-w-0"
                  >
                    <Mail size={13} className="shrink-0 opacity-75" />
                    <span className="truncate">{contact.email}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-text-muted">
                    <Mail size={13} className="opacity-50" />
                    No email on file
                  </span>
                )}
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="inline-flex items-center gap-1.5 text-text-primary font-bold hover:text-primary"
                  >
                    <Phone size={13} className="opacity-70" />
                    {contact.phone}
                  </a>
                ) : null}
              </div>
              <CrmRecordQuickActions actions={quickActions} secondaryActions={secondaryActions} />
            </div>
          </div>
          {hasAccess('contacts:delete') ? (
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--crm-shadow-card)] flex min-h-[580px] flex-col">
            <CrmRecordDetailTabs
              tabs={recordTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              detailsToolbar={
                <>
                  <button
                    type="button"
                    onClick={() => setShowRecordCustomize(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                  >
                    <Settings2 size={13} />
                    Layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-primary transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                </>
              }
            />

            <div className="pt-6 flex-1">
              {activeTab === 'Activity' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <CrmRecordActivityComposer
                    activityType={activityType}
                    setActivityType={setActivityType}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    relatedTo={entityId}
                    relatedType="Contact"
                    onActivityPosted={(data) => {
                      setActivities([data as any, ...activities]);
                      fetchEmailTracking();
                    }}
                    onMeetingScheduleClick={() => setIsMeetingModalOpen(true)}
                    lead={contact}
                  />
                  <Timeline
                    activities={activities}
                    filterType={activityType}
                    emailTrackingByEmailId={emailLookups.byEmailId}
                    emailTrackingByToken={emailLookups.byToken}
                    onRefreshNeeded={fetchActivities}
                    timelineReplyContext={
                      entityId
                        ? { module: 'contacts', entityId: entityId }
                        : undefined
                    }
                    onEmailReplySent={() => {
                      void fetchActivities();
                      void fetchEmailTracking();
                    }}
                  />
                </div>
              )}

              {activeTab === 'Details' && (
                <div className="animate-in fade-in duration-300">
                  <h3 className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-muted">
                    <User size={14} className="text-primary" />
                    Contact Properties
                  </h3>
                  <CRMContactRecordFields
                    contact={contact}
                    visibleKeys={recordFieldKeysForGrid}
                    customFieldDefs={customFieldDefs}
                    onApplyEmailFromFinder={applyEmailFromFinder}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-5 lg:min-w-0">
          <FollowUpSequenceCard
            entityType="Contact"
            entityId={entityId}
            hasEmail={hasEmail}
            onScheduleClick={() => {
              setFollowUpSeqInitialTab('follow-ups');
              setIsFollowUpSeqOpen(true);
            }}
            refreshKey={followUpRefreshKey}
            onRetrySuccess={() => {
              void fetchActivities();
              void fetchEmailTracking();
              setFollowUpRefreshKey((k) => k + 1);
            }}
          />
          <EmailEngagementPanel rows={emailTracking} />
          <CrmRecordOwnerCard ownerLabel={contact.leadOwner} />
          <CRMContactCompanySidebarCard
            contact={contact}
            contactId={entityId}
            showPrimaryField={visibleRecordKeys.includes('organization')}
            onUpdated={() => {
              fetchContact();
              fetchEmailTracking();
            }}
          />
          <ContactAssociationsPanel
            contactId={entityId}
            contact={contact}
            hideCompaniesSection
            onUpdated={() => {
              fetchContact();
              fetchEmailTracking();
            }}
          />
          {entityId ? (
            <CrmRecordSegmentsPanel
              module="contacts"
              entityId={entityId}
              recordLabel={displayName}
            />
          ) : null}
          <CrmPlaybookRecommendedBanner relatedTo={entityId} relatedType="Contact" />
          <CrmPlaybookPanel
            relatedTo={entityId}
            relatedType="Contact"
            onApplied={() => {
              void fetchActivities();
              void fetchEmailTracking();
            }}
          />
        </aside>
      </div>

      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        type="Contact"
        initialData={contact}
        onSuccess={() => {
          fetchContact();
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <FollowUpSequenceModal
        open={isFollowUpSeqOpen}
        onClose={() => setIsFollowUpSeqOpen(false)}
        initialTab={followUpSeqInitialTab}
        entityType="Contact"
        entityId={entityId}
        entityLabel={`${contact.firstName} ${contact.lastName}`}
        onStarted={() => {
          setFollowUpRefreshKey((k) => k + 1);
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <SendEmailModal
        isOpen={isSendEmailModalOpen}
        onClose={() => setIsSendEmailModalOpen(false)}
        recipientEmail={contact.email}
        recipientName={`${contact.firstName} ${contact.lastName}`}
        module="contacts"
        entityId={entityId}
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
        suggestedCcEmails={Array.isArray(contact?.additionalEmails) ? contact.additionalEmails : []}
      />
      <ScheduleMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        entityId={entityId}
        module="contacts"
        recipientName={`${contact.firstName} ${contact.lastName}`}
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Contact"
        description={`Are you sure you want to delete ${contact.firstName} ${contact.lastName}? This action cannot be undone.`}
        onConfirm={handleDeleteContact}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showRecordCustomize}
        onClose={() => setShowRecordCustomize(false)}
        module="contacts"
        context="record"
        customFieldKeys={customFieldDefs.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickRecord((t) => t + 1)}
      />
    </div>
  );
}
