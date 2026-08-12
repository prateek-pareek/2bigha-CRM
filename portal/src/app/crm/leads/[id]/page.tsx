"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mail, Calendar, CalendarClock, Edit2, ChevronLeft, Trash2, Share2, RefreshCw, User, Settings2, MessageSquare, Info, Target, Building2, Phone, EyeOff, ChevronDown, MapPin, Star, Lock, ThumbsUp, CheckCircle2 } from 'lucide-react';
import FollowUpSequenceModal from '@/components/crm/automation/playbooks/FollowUpSequenceModal';
import FollowUpSequenceCard from '@/components/crm/automation/playbooks/FollowUpSequenceCard';
import Timeline from '@/components/crm/inbox/Timeline';
import EditModal from '@/components/crm/records/create/EditModal';
import ConvertLeadModal from '@/components/crm/records/create/ConvertLeadModal';
import { CRM_API_URL } from '@/lib/crm/config';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import CRMLeadRecordFields from '@/components/crm/records/forms/CRMLeadRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { contactWhatsappUrl, contactLinkedInProfileUrl, contactLinkedInSourceUrl } from '@/lib/crm/crm-messaging-links';
import EmailEngagementPanel from '@/components/crm/email/engagement/EmailEngagementPanel';
import LeadAssociationsPanel from '@/components/crm/records/associations/LeadAssociationsPanel';
import LeadPropertiesPanel from '@/components/crm/records/associations/LeadPropertiesPanel';
import AddPropertyModal from '@/components/crm/records/detail/AddPropertyModal';
import LeadWhatsAppPanel from '@/components/crm/records/associations/LeadWhatsAppPanel';
import LinkWhatsAppModal from '@/components/crm/records/detail/LinkWhatsAppModal';
import { CRMLeadCompanySidebarCard } from '@/components/crm/records/associations/CRMCompanySidebarCard';
import { buildEmailTrackingLookup, fetchCrmEmailTrackingForEntity, type CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { useCrmEmailTrackingRealtimeRefresh } from '@/lib/crm/email/useCrmEmailTrackingRealtimeRefresh';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import CrmPlaybookPanel from '@/components/crm/automation/playbooks/CrmPlaybookPanel';
import SalesAgentRecordPanel from '@/components/crm/sales/SalesAgentRecordPanel';
import CrmPlaybookRecommendedBanner from '@/components/crm/automation/playbooks/CrmPlaybookRecommendedBanner';
import CrmXOutreachPanel from '@/components/crm/sales/CrmXOutreachPanel';
import CrmRecordQuickActions, { type CrmRecordQuickAction } from '@/components/crm/records/detail/CrmRecordQuickActions';
import CallLeadModal from '@/components/crm/records/detail/CallLeadModal';
import CrmRecordSegmentsPanel from '@/components/crm/segments/CrmRecordSegmentsPanel';
import CrmRecordDetailTabs from '@/components/crm/records/detail/CrmRecordDetailTabs';
import CrmRecordOwnerCard from '@/components/crm/records/detail/CrmRecordOwnerCard';
import LeadOnboardingChecklistCard from '@/components/crm/records/detail/LeadOnboardingChecklistCard';
import CrmRecordPipelineStatus from '@/components/crm/records/detail/CrmRecordPipelineStatus';
import CrmRecordDetailSkeleton from '@/components/crm/records/detail/CrmRecordDetailSkeleton';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CrmPageHeader, CrmButton } from '@/components/crm/ui';
import "@/app/crm/crm-hubspot.css";

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
  const router = useRouter();
  const { hasAccess } = usePermissions();
  const [lead, setLead] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [isFollowUpSeqOpen, setIsFollowUpSeqOpen] = useState(false);
  const [followUpSeqInitialTab, setFollowUpSeqInitialTab] = useState<
    'first-outreach' | 'follow-ups'
  >('first-outreach');
  const [followUpRefreshKey, setFollowUpRefreshKey] = useState(0);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
  const [propertiesRefreshKey, setPropertiesRefreshKey] = useState(0);
  const [isLinkWhatsAppModalOpen, setIsLinkWhatsAppModalOpen] = useState(false);
  const [whatsappLinksRefreshKey, setWhatsappLinksRefreshKey] = useState(0);
  const [activityType, setActivityType] = useState('Activity');
  const [customFieldDefs, setCustomFieldDefs] = useState<{ key: string; name: string; type?: string; options?: string[] }[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const stageMenuRef = useRef<HTMLDivElement>(null);
  const [showRecordCustomize, setShowRecordCustomize] = useState(false);
  const [layoutTickRecord, setLayoutTickRecord] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [emailTracking, setEmailTracking] = useState<CrmEmailTrackingRow[]>([]);
  const [activeTab, setActiveTab] = useState<'Activity' | 'Details'>('Activity');
  const [scoreRefreshing, setScoreRefreshing] = useState(false);
  const [recordMetaLoaded, setRecordMetaLoaded] = useState(false);
  const entityId = useMemo(
    () => String((lead?._id ?? recordId) || ''),
    [lead?._id, recordId],
  );

  const emailLookups = useMemo(() => buildEmailTrackingLookup(emailTracking), [emailTracking]);

  const visibleRecordKeys = useMemo(
    () => getVisibleFieldKeysOrdered('leads', 'record', customFieldDefs.map((f) => f.key)),
    [customFieldDefs, layoutTickRecord]
  );

  const recordFieldKeysForGrid = useMemo(
    () => visibleRecordKeys.filter((k) => k !== 'organization'),
    [visibleRecordKeys]
  );

  const pipelineName = useMemo(() => {
    if (!lead?.pipeline) return undefined;
    const pid = typeof lead.pipeline === 'string' ? lead.pipeline : (lead.pipeline as any)?._id;
    const p = pipelines.find((x) => x._id === pid);
    return p?.name;
  }, [lead, pipelines]);

  const whatsappUrl = useMemo(() => (lead ? contactWhatsappUrl(lead) : null), [lead]);
  const linkedInProfileUrl = useMemo(
    () => (lead ? contactLinkedInProfileUrl(lead) : null),
    [lead],
  );
  const linkedInSourceUrl = useMemo(
    () => (lead ? contactLinkedInSourceUrl(lead) : null),
    [lead],
  );

  const fetchLead = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) { router.push('/auth/login?error=unauthorized'); return; }
      const data = await res.json();
      setLead(data);
    } catch (err) { console.error(err); }
  };

  const fetchActivities = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Lead`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setActivities(data || []);
    } catch (err) { console.error(err); }
  };

  const refreshLeadScore = async () => {
    const token = localStorage.getItem('token');
    if (!recordId || !token) return;
    setScoreRefreshing(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/leads/${encodeURIComponent(recordId)}/recalculate-score`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setLead(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScoreRefreshing(false);
    }
  };

  const fetchEmailTracking = useCallback(async (targetEntityId?: string) => {
    const token = localStorage.getItem('token');
    const resolvedEntityId = String(targetEntityId || entityId || '');
    if (!token || !resolvedEntityId) {
      setEmailTracking([]);
      return;
    }
    const data = await fetchCrmEmailTrackingForEntity(resolvedEntityId, 'leads', token);
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
      const [cfRes, pipeRes] = await Promise.all([
        fetch(`${CRM_API_URL}/custom-fields?module=leads`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const cfData = cfRes.ok ? await cfRes.json() : [];
      const pipeData = pipeRes.ok ? await pipeRes.json() : [];
      setCustomFieldDefs(
        (cfData || []).map((f: any) => ({
          key: f.key,
          name: f.name,
          type: f.type,
          options: f.options,
        })),
      );
      setPipelines(pipeData || []);
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
    fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPipelines(data || []))
      .catch(() => setPipelines([]));
  }, [recordId]);

  useEffect(() => {
    if (!recordId) return;
    const token = localStorage.getItem('token');
    let isCancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      let resolvedEntityId = recordId;
      try {
        const leadRes = await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (leadRes.status === 401) {
          router.push('/auth/login?error=unauthorized');
          return;
        }
        if (!leadRes.ok) {
          if (!isCancelled) {
            setLead(null);
            setLoadError(
              leadRes.status === 403
                ? 'You do not have access to this lead.'
                : 'Lead not found.',
            );
            setLoading(false);
          }
          return;
        }
        const leadData = await leadRes.json();
        if (!leadData?._id) {
          if (!isCancelled) {
            setLead(null);
            setLoadError('Lead not found.');
            setLoading(false);
          }
          return;
        }
        resolvedEntityId = String(leadData._id);
        if (!isCancelled) {
          setLead(leadData);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!isCancelled) {
          setLead(null);
          setLoadError('Failed to load lead.');
          setLoading(false);
        }
        return;
      }

      Promise.allSettled([
        fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Lead`, {
          headers: { 'Authorization': `Bearer ${token}` },
          cache: 'no-store',
        }).then((res) => res.json()),
        token
          ? fetchCrmEmailTrackingForEntity(resolvedEntityId, 'leads', token)
          : Promise.resolve([]),
      ]).then((results) => {
        if (isCancelled) return;
        const [activityData, trackData] = results.map((r) =>
          r.status === 'fulfilled' ? r.value : null,
        );
        setActivities((activityData as any[]) || []);
        setEmailTracking(Array.isArray(trackData) ? trackData : []);
      }).catch((err) => console.error(err));
    })();

    return () => {
      isCancelled = true;
    };
  }, [recordId]);

  useEffect(() => {
    if (activeTab !== 'Details') return;
    void fetchRecordMetadata();
  }, [activeTab, fetchRecordMetadata]);

  useEffect(() => {
    if (!stageMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (stageMenuRef.current && !stageMenuRef.current.contains(e.target as Node)) {
        setStageMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [stageMenuOpen]);

  const applyEmailFromFinder = async (email: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.message || 'Failed to save email on lead');
    }
    const updated = await res.json();
    setLead(updated);
    toast.success(`Email saved: ${email}`);
  };

  if (loading) {
    return <CrmRecordDetailSkeleton />;
  }

  if (loadError || !lead) {
    return (
      <div className="p-8">
        <p className="text-sm text-text-muted">{loadError || 'Lead not found.'}</p>
        <button
          type="button"
          onClick={() => router.push('/crm/leads')}
          className="text-sm text-primary mt-2 inline-block hover:underline"
        >
          Back to leads
        </button>
      </div>
    );
  }

  const stage = lead.stage || lead.status;
  const hasEmail = Boolean(String(lead.email || '').trim());
  const hasPhone = Boolean(String(lead.phone || lead.mobile || '').trim());
  const leadPhone = String(lead.phone || lead.mobile || '').trim();
  const leadMobileNo = String(lead.mobileNo || '').trim();
  const displayName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lead';
  const initials = `${(lead.firstName?.[0] || '').toUpperCase()}${(lead.lastName?.[0] || '').toUpperCase()}` || '?';
  const locationLine = [lead.city, lead.state, lead.country, lead.address]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .join(', ');
  const currentPipelineId = typeof lead.pipeline === 'string' ? lead.pipeline : lead.pipeline?._id;
  const currentPipeline = pipelines.find((p) => String(p._id) === String(currentPipelineId || ''));
  const pipelineStages: string[] = (currentPipeline?.stages || [])
    .slice()
    .sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0))
    .map((s: { name: string }) => s.name)
    .filter(Boolean);
  const highScore = lead.leadScore != null && Number(lead.leadScore) >= 70;

  const updateLeadStage = async (newStage: string) => {
    if (!newStage || newStage === stage || !hasAccess('leads:write')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Stage updated');
      void fetchLead();
      void fetchActivities();
    } catch {
      toast.error('Failed to update stage');
    }
  };

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
      id: 'call',
      label: 'Call',
      icon: <Phone size={14} />,
      title: hasPhone
        ? 'Call lead via configured voice provider'
        : 'Call lead (enter phone in the dialog)',
      onClick: () => setIsCallModalOpen(true),
    },
  ];

  if (linkedInSourceUrl && linkedInSourceUrl !== linkedInProfileUrl) {
    quickActions.push({
      id: 'linkedin-source',
      label: 'LI source',
      icon: <LinkedInGlyph className="h-3.5 w-3.5 text-[#0a66c2]" />,
      href: linkedInSourceUrl,
      external: true,
      title: 'Open LinkedIn source post / capture URL',
    });
  }

  if (whatsappUrl) {
    quickActions.push({
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppGlyph className="h-3.5 w-3.5 text-[#25d366]" />,
      href: whatsappUrl,
      external: true,
      title: 'Open WhatsApp chat',
    });
  }

  quickActions.push(
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
    {
      id: 'add-property',
      label: 'Property',
      icon: <Building2 size={14} />,
      title: 'Add a property linked to this lead',
      onClick: () => setIsAddPropertyModalOpen(true),
    },
  );

  const secondaryActions: CrmRecordQuickAction[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: <Edit2 size={14} />,
      title: 'Edit lead',
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
          title: `${displayName} - Lead`,
          text: `${displayName}${lead.organization ? ` from ${lead.organization}` : ''}`,
          url: window.location.href,
        };

        if (navigator.share) {
          setIsSharing(true);
          try {
            await navigator.share(shareData);
          } catch (err: unknown) {
            if ((err as { name?: string })?.name !== 'AbortError') {
              await navigator.clipboard.writeText(window.location.href);
              alert('Link copied to clipboard');
            }
          } finally {
            setIsSharing(false);
          }
        } else {
          await navigator.clipboard.writeText(window.location.href);
          alert('Link copied to clipboard');
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
        title="Leads"
        bordered={false}
        breadcrumbs={[
          { label: 'Home', href: '/crm' },
          { label: 'Leads', href: '/crm/leads' },
          { label: displayName },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => {
                void fetchLead();
                void fetchActivities();
                void fetchEmailTracking();
              }}
              leftIcon={<RefreshCw size={14} />}
              className="!h-9 !px-3 !text-xs"
            >
              Refresh
            </CrmButton>
            {hasAccess('leads:write') ? (
              <CrmButton
                type="button"
                onClick={() => setIsConvertModalOpen(true)}
                leftIcon={<RefreshCw size={14} />}
                className="!h-9 !px-3 !text-xs"
              >
                Convert
              </CrmButton>
            ) : null}
            {hasAccess('leads:delete') ? (
              <CrmButton
                type="button"
                variant="secondary"
                className="!h-9 !px-3 !text-xs !border-[var(--error)]/30 !text-[var(--error)] hover:!bg-[var(--error-light)]"
                leftIcon={<Trash2 size={14} />}
                onClick={async () => {
                  if (confirm('Move this lead to Trash? Only an admin can restore it.')) {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) router.push('/crm/leads');
                  }
                }}
              >
                Delete
              </CrmButton>
            ) : null}
          </div>
        }
      />

      <button type="button" onClick={() => router.push('/crm/leads')} className={crmRecordChrome.backLink}>
        <ChevronLeft size={14} />
        Back to Leads
      </button>

      {/* Profile hero — CRMS contact-head */}
      <div className={crmRecordChrome.hero}>
        <div className={crmRecordChrome.heroBody}>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className={crmRecordChrome.avatar}>{initials}</div>
            <div className="min-w-0">
              <h1 className={cn(crmRecordChrome.title, 'inline-flex flex-wrap items-center gap-2')}>
                <span className="truncate">{displayName}</span>
                {highScore ? (
                  <Star size={16} className="shrink-0 fill-[var(--warning,#ffa201)] text-[var(--warning,#ffa201)]" aria-label="High score lead" />
                ) : null}
              </h1>
              {lead.organization ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-1')}>
                  <Building2 size={14} className="shrink-0 opacity-80" />
                  <span className="truncate">{lead.organization}</span>
                </p>
              ) : null}
              {locationLine ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-0.5')}>
                  <MapPin size={14} className="shrink-0 opacity-80" />
                  <span className="truncate">{locationLine}</span>
                </p>
              ) : lead.email ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-0.5')}>
                  <Mail size={14} className="shrink-0 opacity-80" />
                  <a href={`mailto:${lead.email}`} className="truncate hover:text-[var(--primary)] hover:underline">
                    {lead.email}
                  </a>
                </p>
              ) : null}
              {(lead.phone || lead.mobileNo) ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-0.5')}>
                  <Phone size={14} className="shrink-0 opacity-80" />
                  <a href={`tel:${lead.mobileNo || lead.phone}`} className="hover:text-[var(--primary)]">
                    {lead.mobileNo || lead.phone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>

          <div className={cn(crmRecordChrome.actions, 'shrink-0 self-start pr-14 sm:pr-20 lg:pr-24')}>
            <span className={crmRecordChrome.statusPrivate}>
              <Lock size={12} />
              Lead
            </span>
            {pipelineStages.length > 0 && hasAccess('leads:write') ? (
              <div className="relative inline-flex" ref={stageMenuRef}>
                <button
                  type="button"
                  onClick={() => setStageMenuOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={stageMenuOpen}
                  aria-label="Lead stage"
                  className={cn(crmRecordChrome.statusStage, 'cursor-pointer pl-2.5 pr-2')}
                >
                  <ThumbsUp size={12} className="shrink-0" />
                  <span className="truncate">{stage || 'Select stage'}</span>
                  <ChevronDown
                    size={12}
                    className={cn('shrink-0 transition-transform', stageMenuOpen && 'rotate-180')}
                  />
                </button>
                {stageMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="Lead stage options"
                    className="absolute right-0 top-full z-[300] mt-1.5 min-w-[190px] overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white py-1 shadow-[var(--crm-shadow-card)]"
                  >
                    {pipelineStages.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="option"
                        aria-selected={s === stage}
                        onClick={() => {
                          setStageMenuOpen(false);
                          void updateLeadStage(s);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium transition-colors',
                          s === stage
                            ? 'bg-[var(--primary-light)] text-[var(--primary)]'
                            : 'text-[var(--text-main)] hover:bg-[var(--surface-dim)]',
                        )}
                      >
                        {s}
                        {s === stage && <CheckCircle2 size={14} className="shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : stage ? (
              <span className={crmRecordChrome.statusStage}>
                <ThumbsUp size={12} />
                {stage}
              </span>
            ) : null}
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

        <div className="border-t border-[var(--border-color)] px-4 pb-4 sm:px-5">
          <CrmRecordQuickActions
            actions={quickActions}
            secondaryActions={secondaryActions}
            className="!mt-0 !border-0 !pt-3"
          >
            {hasAccess('leads:write') && (
              <div className="relative inline-flex items-center">
                <select
                  value={lead.pipeline?._id || lead.pipeline || ''}
                  onChange={async (e) => {
                    const newPipelineId = e.target.value;
                    if (!newPipelineId) return;
                    try {
                      const token = localStorage.getItem('token');
                      const pipeRes = await fetch(`${CRM_API_URL}/crm/pipelines/${newPipelineId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const pipeData = await pipeRes.json();
                      const sortedStages = pipeData?.stages
                        ? [...pipeData.stages].sort((a: any, b: any) => a.order - b.order)
                        : [];
                      const defaultStageName =
                        sortedStages.find((s: any) => s.isDefault)?.name || sortedStages[0]?.name || '';

                      await fetch(`${CRM_API_URL}/crm/leads/${recordId}`, {
                        method: 'PATCH',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          pipeline: newPipelineId,
                          stage: defaultStageName || undefined,
                        }),
                      });
                      toast.success('Pipeline updated successfully.');
                      void fetchLead();
                      void fetchActivities();
                    } catch (err) {
                      console.error('Failed to update pipeline:', err);
                      toast.error('Failed to update pipeline.');
                    }
                  }}
                  className="h-8 pl-2.5 pr-7 appearance-none rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white text-[11px] font-semibold hover:bg-[var(--surface-dim)] cursor-pointer outline-none focus:ring-1 focus:ring-primary/30 text-[var(--text-main)] transition-colors shadow-sm"
                >
                  <option value="" disabled>
                    Change Pipeline...
                  </option>
                  {pipelines.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
              </div>
            )}
          </CrmRecordQuickActions>
        </div>
      </div>

      {pipelineStages.length > 0 ? (
        <CrmRecordPipelineStatus
          stages={pipelineStages}
          currentStage={stage}
          onSelect={hasAccess('leads:write') ? updateLeadStage : undefined}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className={cn(crmRecordChrome.panel, 'flex min-h-[520px] flex-col')}>
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--crm-radius-ui)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--hs-link)]"
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
                    relatedTo={entityId}
                    relatedType="Lead"
                    onActivityPosted={(data) => {
                      setActivities([data as any, ...activities]);
                      fetchEmailTracking();
                    }}
                    onMeetingScheduleClick={() => setIsMeetingModalOpen(true)}
                    lead={lead}
                  />
                  <Timeline
                    activities={activities}
                    filterType={activityType}
                    emailTrackingByEmailId={emailLookups.byEmailId}
                    emailTrackingByToken={emailLookups.byToken}
                    onRefreshNeeded={fetchActivities}
                    timelineReplyContext={
                      entityId
                        ? { module: 'leads', entityId: entityId }
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
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <User size={13} />
                      Lead properties
                    </h3>
                    {lead.leadScore != null && !Number.isNaN(Number(lead.leadScore)) ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums',
                            Number(lead.leadScore) >= 70 && 'bg-emerald-50 text-emerald-800 border-emerald-200',
                            Number(lead.leadScore) >= 40 &&
                              Number(lead.leadScore) < 70 &&
                              'bg-amber-50 text-amber-900 border-amber-200',
                            Number(lead.leadScore) < 40 && 'bg-slate-100 text-slate-600 border-[var(--border-color)]',
                          )}
                        >
                          <Target size={11} aria-hidden />
                          {lead.leadScore}/100
                        </span>
                        {hasAccess('leads:write') ? (
                          <button
                            type="button"
                            disabled={scoreRefreshing}
                            onClick={() => void refreshLeadScore()}
                            className="text-[11px] font-semibold text-[var(--hs-link)] hover:underline disabled:opacity-50"
                          >
                            {scoreRefreshing ? 'Updating…' : 'Recalculate'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <CRMLeadRecordFields
                    lead={lead}
                    visibleKeys={recordFieldKeysForGrid}
                    customFieldDefs={customFieldDefs}
                    pipelineName={pipelineName}
                    onApplyEmailFromFinder={applyEmailFromFinder}
                    layout="grid"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:min-w-0">
          {entityId ? (
            <LeadOnboardingChecklistCard
              leadId={entityId}
              progress={lead.checklistProgress}
              onUpdated={() => void fetchLead()}
            />
          ) : null}
          <CrmXOutreachPanel
            entityType="Lead"
            entityId={entityId}
            record={lead}
            onHandleSaved={() => void fetchLead()}
            onDmLogged={() => void fetchActivities()}
          />
          <FollowUpSequenceCard
            entityType="Lead"
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
          <CrmRecordOwnerCard ownerLabel={lead.leadOwner} />
          {entityId ? (
            <LeadAssociationsPanel
              leadId={entityId}
              lead={lead}
              onUpdated={() => {
                void fetchLead();
                void fetchEmailTracking();
              }}
            />
          ) : null}
          {entityId ? (
            <LeadPropertiesPanel
              leadId={entityId}
              refreshKey={propertiesRefreshKey}
              onAddClick={() => setIsAddPropertyModalOpen(true)}
            />
          ) : null}
          {entityId ? (
            <LeadWhatsAppPanel
              leadId={entityId}
              refreshKey={whatsappLinksRefreshKey}
              onAttachClick={() => setIsLinkWhatsAppModalOpen(true)}
            />
          ) : null}
          {entityId ? (
            <CrmRecordSegmentsPanel
              module="leads"
              entityId={entityId}
              recordLabel={displayName}
            />
          ) : null}
          <CRMLeadCompanySidebarCard lead={lead} show={visibleRecordKeys.includes('organization')} />
          {entityId ? (
            <SalesAgentRecordPanel recordType="Lead" recordId={entityId} />
          ) : null}
          <CrmPlaybookRecommendedBanner relatedTo={entityId} relatedType="Lead" />
          <CrmPlaybookPanel
            relatedTo={entityId}
            relatedType="Lead"
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
        type="Lead"
        initialData={lead}
        onSuccess={() => {
          fetchLead();
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <ConvertLeadModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        leadId={entityId}
        lead={lead}
        onSuccess={() => router.push('/crm/leads')}
      />
      <SendEmailModal
        isOpen={isSendEmailModalOpen}
        onClose={() => setIsSendEmailModalOpen(false)}
        recipientEmail={lead.email}
        recipientName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        module="leads"
        entityId={entityId}
        crmInboxMode
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
        suggestedCcEmails={Array.isArray(lead?.additionalEmails) ? lead.additionalEmails : []}
      />
      <CallLeadModal
        open={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        phone={leadPhone}
        leadId={entityId}
        leadName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        relatedType="Lead"
        onSuccess={() => {
          void fetchActivities();
        }}
      />
      <AddPropertyModal
        open={isAddPropertyModalOpen}
        onClose={() => setIsAddPropertyModalOpen(false)}
        leadId={entityId}
        leadName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        onSuccess={() => setPropertiesRefreshKey((k) => k + 1)}
      />
      <LinkWhatsAppModal
        open={isLinkWhatsAppModalOpen}
        onClose={() => setIsLinkWhatsAppModalOpen(false)}
        leadId={entityId}
        leadName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        leadPhone={leadPhone}
        leadMobileNo={leadMobileNo}
        onSuccess={() => setWhatsappLinksRefreshKey((k) => k + 1)}
      />
      <FollowUpSequenceModal
        open={isFollowUpSeqOpen}
        onClose={() => setIsFollowUpSeqOpen(false)}
        initialTab={followUpSeqInitialTab}
        entityType="Lead"
        entityId={entityId}
        entityLabel={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        onStarted={() => {
          setFollowUpRefreshKey((k) => k + 1);
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <ScheduleMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        entityId={entityId}
        module="leads"
        recipientName={`${lead.firstName || ''} ${lead.lastName || ''}`.trim()}
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showRecordCustomize}
        onClose={() => setShowRecordCustomize(false)}
        module="leads"
        context="record"
        customFieldKeys={customFieldDefs.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickRecord((t) => t + 1)}
      />
    </div>
  );
}
