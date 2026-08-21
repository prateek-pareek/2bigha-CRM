"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DollarSign, Calendar, Building2, ChevronLeft, Edit2, Trash2, Mail, Clock, Plus, CreditCard, Share2, ExternalLink, Settings2, MessageSquare, Info, ListTodo, Loader2, Home } from 'lucide-react';
import Timeline from '@/components/crm/inbox/Timeline';
import EditModal from '@/components/crm/records/create/EditModal';
import ConvertDealModal from '@/components/crm/records/create/ConvertDealModal';
import ConvertDealToLeadModal from '@/components/crm/records/create/ConvertDealToLeadModal';
import PaymentTermsModal from '@/components/crm/records/detail/PaymentTermsModal';
import SendEmailModal from '@/components/crm/email/composer/SendEmailModal';
import ScheduleMeetingModal from '@/components/crm/inbox/ScheduleMeetingModal';
import { CRM_API_URL } from '@/lib/crm/config';
import { PM_API_URL } from '@/lib/api/config';
import CRMDealRecordFields from '@/components/crm/records/forms/CRMDealRecordFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import { dealWhatsappUrl } from '@/lib/crm/crm-messaging-links';
import EmailEngagementPanel from '@/components/crm/email/engagement/EmailEngagementPanel';
import { buildEmailTrackingLookup, fetchCrmEmailTrackingForEntity, type CrmEmailTrackingRow } from '@/lib/crm/crm-email-tracking';
import { useCrmEmailTrackingRealtimeRefresh } from '@/lib/crm/email/useCrmEmailTrackingRealtimeRefresh';
import CrmRecordActivityComposer from '@/components/crm/inbox/CrmRecordActivityComposer';
import SalesAgentRecordPanel from '@/components/crm/sales/SalesAgentRecordPanel';
import DealAssociationsPanel from '@/components/crm/records/associations/DealAssociationsPanel';
import { formatAddress, formatPrice } from '@/lib/crm/property-listings/types';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { CRM_BTN_PRIMARY, CRM_BTN_SECONDARY, CRM_BTN_GHOST } from '@/lib/crm/ui';
import { useRealtime } from '@/hooks/pm/use-realtime';

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'];

export default function DealDetailPage() {
  const { id } = useParams();
  const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
  const router = useRouter();
  const { hasAccess, isAdmin, canViewCrmRevenue } = usePermissions();
  const [deal, setDeal] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [activityType, setActivityType] = useState('Activity');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isConvertToLeadModalOpen, setIsConvertToLeadModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState<{ key: string; name: string; type?: string; options?: string[] }[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [showRecordCustomize, setShowRecordCustomize] = useState(false);
  const [layoutTickRecord, setLayoutTickRecord] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [emailTracking, setEmailTracking] = useState<CrmEmailTrackingRow[]>([]);
  const [activeTab, setActiveTab] = useState<'Activity' | 'Details' | 'Chat'>('Activity');
  const [recordMetaLoaded, setRecordMetaLoaded] = useState(false);
  const [portalNeeds, setPortalNeeds] = useState<any[]>([]);
  const [pmProjects, setPmProjects] = useState<{ _id: string; name: string; key: string }[]>([]);
  const [scopeText, setScopeText] = useState('');
  const [portalPmId, setPortalPmId] = useState('');
  const [portalDomain, setPortalDomain] = useState('');
  const [newNeed, setNewNeed] = useState({ category: 'asset', title: '', description: '' });
  const [savingPortalField, setSavingPortalField] = useState<'scope' | 'pm' | 'domain' | null>(null);
  const [needBusyId, setNeedBusyId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [linkedProperty, setLinkedProperty] = useState<any>(null);

  useEffect(() => {
    const propertyId =
      typeof deal?.propertyListingId === 'object'
        ? deal?.propertyListingId?._id
        : deal?.propertyListingId;
    if (!propertyId) {
      setLinkedProperty(null);
      return;
    }
    const token = localStorage.getItem('token');
    let cancelled = false;
    fetch(`${CRM_API_URL}/crm/property-listings/${propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setLinkedProperty(data);
      })
      .catch(() => {
        if (!cancelled) setLinkedProperty(null);
      });
    return () => {
      cancelled = true;
    };
  }, [deal?.propertyListingId]);

  const socket = useRealtime(recordId ? `deal-chat:${recordId}` : undefined);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (msg: any) => {
      setChatMessages((prev) => {
        if (prev.some((m) => String(m._id || m.id) === String(msg._id || msg.id))) {
          return prev;
        }
        return [...prev, msg];
      });
    };
    socket.on('deal-chat:message', handleNewMessage);
    return () => {
      socket.off('deal-chat:message', handleNewMessage);
    };
  }, [socket]);

  const emailLookups = useMemo(() => buildEmailTrackingLookup(emailTracking), [emailTracking]);

  const visibleRecordKeys = useMemo(() => {
    const keys = getVisibleFieldKeysOrdered('deals', 'record', customFieldDefs.map((f) => f.key));
    if (canViewCrmRevenue) return keys;
    return keys.filter(
      (k) =>
        k !== 'dealValue' &&
        k !== 'expectedDealValue' &&
        k !== 'pricingType' &&
        k !== 'contractMonths' &&
        k !== 'currency' &&
        k !== 'exchangeRate',
    );
  }, [customFieldDefs, layoutTickRecord, canViewCrmRevenue]);

  const pipelineName = useMemo(() => {
    if (!deal?.pipeline) return undefined;
    const pid = typeof deal.pipeline === 'string' ? deal.pipeline : (deal.pipeline as any)?._id;
    return pipelines.find((x) => String(x._id) === String(pid))?.name;
  }, [deal, pipelines]);

  const whatsappUrl = useMemo(() => (deal ? dealWhatsappUrl(deal) : null), [deal]);
  const canManagePortalBoard = isAdmin || hasAccess('deals:write');
  const portalDomainOptions = useMemo(() => {
    const raw = String(process.env.NEXT_PUBLIC_CLIENT_PORTAL_DOMAINS || '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x.startsWith('http://') || x.startsWith('https://') ? x : `https://${x}`));
  }, []);
  const resolvedPortalBaseUrl = useMemo(() => {
    const fromDeal = String(portalDomain || deal?.portalDomain || '').trim();
    if (fromDeal) return fromDeal.replace(/\/+$/, '');
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, [portalDomain, deal?.portalDomain]);

  const fetchDeal = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data && data._id) setDeal(data);
    } catch (err) { console.error(err); }
  };

  const fetchActivities = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Deal`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setActivities(data || []);
    } catch (err) { console.error(err); }
  };

  const fetchEmailTracking = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !recordId) {
      setEmailTracking([]);
      return;
    }
    const data = await fetchCrmEmailTrackingForEntity(recordId, 'deals', token);
    setEmailTracking(data);
  }, [recordId]);

  useCrmEmailTrackingRealtimeRefresh(
    () => {
      void fetchEmailTracking();
    },
    recordId,
    { enabled: activeTab === 'Activity' },
  );

  const fetchRecordMetadata = useCallback(async () => {
    if (!recordId || recordMetaLoaded) return;
    const token = localStorage.getItem('token');
    try {
      const cfRes = await fetch(`${CRM_API_URL}/custom-fields?module=deals`, {
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
    if (!recordId) return;
    const token = localStorage.getItem('token');
    let isCancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [dealRes, pipelinesRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const dealData = await dealRes.json();
        const pipeData = pipelinesRes.ok ? await pipelinesRes.json() : [];
        if (!isCancelled) {
          setDeal(dealData);
          setPipelines(pipeData || []);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!isCancelled) setLoading(false);
        return;
      }

      Promise.allSettled([
        fetch(`${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=Deal`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => res.json()),
        fetch(`${CRM_API_URL}/crm/track/entity/${recordId}?module=deals`, {
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

  useEffect(() => {
    if (activeTab !== 'Details') return;
    void fetchRecordMetadata();
  }, [activeTab, fetchRecordMetadata]);

  useEffect(() => {
    if (deal?.portalScopeSummary !== undefined) {
      setScopeText(deal.portalScopeSummary || '');
    }
    setPortalPmId(deal?.portalPmProjectId ? String(deal.portalPmProjectId) : '');
    setPortalDomain(String(deal?.portalDomain || '').trim());
  }, [deal?._id, deal?.portalScopeSummary, deal?.portalPmProjectId, deal?.portalDomain]);

  useEffect(() => {
    if (!recordId) return;
    const token = localStorage.getItem('token');
    fetch(`${CRM_API_URL}/crm/deals/${recordId}/portal-needs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPortalNeeds(Array.isArray(d) ? d : []))
      .catch(() => setPortalNeeds([]));
  }, [recordId]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${PM_API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPmProjects(Array.isArray(d) ? d : []))
      .catch(() => setPmProjects([]));
  }, []);

  const fetchChatMessages = useCallback(async () => {
    if (!recordId) return;
    const token = localStorage.getItem('token');
    setLoadingChat(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}/portal-messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Error fetching chat messages:', e);
    } finally {
      setLoadingChat(false);
    }
  }, [recordId]);

  useEffect(() => {
    if (activeTab === 'Chat') {
      void fetchChatMessages();
    }
  }, [activeTab, fetchChatMessages]);

  const sendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanText = newChatMessage.trim();
    if (!cleanText || !recordId) return;
    const token = localStorage.getItem('token');
    setSendingChat(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}/portal-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: cleanText }),
      });
      if (res.ok) {
        const saved = await res.json();
        setChatMessages((prev) => [...prev, saved]);
        setNewChatMessage('');
        toast.success('Message sent');
      } else {
        toast.error('Failed to send message');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error');
    } finally {
      setSendingChat(false);
    }
  };

  const savePortalScope = async () => {
    const token = localStorage.getItem('token');
    setSavingPortalField('scope');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ portalScopeSummary: scopeText }),
      });
      if (res.ok) {
        setDeal((prev: any) => ({ ...prev, portalScopeSummary: scopeText }));
        toast.success('Scope saved for client portal');
      } else toast.error('Could not save scope');
    } finally {
      setSavingPortalField(null);
    }
  };

  const savePortalPmProject = async (nextId: string) => {
    const token = localStorage.getItem('token');
    setSavingPortalField('pm');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          portalPmProjectId: nextId || null,
        }),
      });
      if (res.ok) {
        setPortalPmId(nextId);
        setDeal((prev: any) => ({
          ...prev,
          portalPmProjectId: nextId || undefined,
        }));
        toast.success('Delivery board linked to portal');
      } else toast.error('Could not link board');
    } finally {
      setSavingPortalField(null);
    }
  };

  const savePortalDomain = async (nextDomain: string) => {
    const token = localStorage.getItem('token');
    setSavingPortalField('domain');
    try {
      const normalized = nextDomain.trim().replace(/\/+$/, '');
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          portalDomain: normalized || null,
        }),
      });
      if (res.ok) {
        setPortalDomain(normalized);
        setDeal((prev: any) => ({
          ...prev,
          portalDomain: normalized || '',
        }));
        toast.success('Portal domain updated');
      } else toast.error('Could not update portal domain');
    } finally {
      setSavingPortalField(null);
    }
  };

  const addPortalNeed = async () => {
    if (!newNeed.title.trim()) {
      toast.error('Title is required');
      return;
    }
    const token = localStorage.getItem('token');
    setNeedBusyId('new');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}/portal-needs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: newNeed.category,
          title: newNeed.title.trim(),
          description: newNeed.description.trim() || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setPortalNeeds((prev) => [...prev, created]);
        setNewNeed({ category: 'asset', title: '', description: '' });
        toast.success('Request added');
      } else toast.error('Could not add request');
    } finally {
      setNeedBusyId(null);
    }
  };


  const patchPortalNeed = async (id: string, patch: Record<string, unknown>) => {
    const token = localStorage.getItem('token');
    setNeedBusyId(id);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/portal-needs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setPortalNeeds((prev) => prev.map((n) => (n._id === id ? updated : n)));
      } else toast.error('Update failed');
    } finally {
      setNeedBusyId(null);
    }
  };

  const removePortalNeed = async (id: string) => {
    const token = localStorage.getItem('token');
    setNeedBusyId(id);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/portal-needs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPortalNeeds((prev) => prev.filter((n) => n._id !== id));
        toast.success('Removed');
      } else toast.error('Could not remove');
    } finally {
      setNeedBusyId(null);
    }
  };

  const generatePortalToken = async () => {
    const token = localStorage.getItem('token');
    const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ portalToken: newToken })
      });
      if (res.ok) setDeal({ ...deal, portalToken: newToken });
    } catch (e) { console.error(e); }
  };

  if (loading || !deal) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-40 rounded-[var(--radius-md)] bg-[var(--border-color)]" />
        <div className={cn(crmRecordChrome.panel, 'h-48 bg-[var(--surface-dim)]')} />
      </div>
    );
  }

  const orgName = typeof deal.organization === 'string' ? deal.organization : deal.organization?.name || 'Unknown';
  const contactPerson = deal.contactPerson;
  const recipientEmail = (contactPerson && typeof contactPerson === 'object') ? contactPerson?.email : '';
  const recipientName = (contactPerson && typeof contactPerson === 'object') ? `${contactPerson.firstName || ''} ${contactPerson.lastName || ''}`.trim() : orgName;

  return (
    <div className={crmRecordChrome.page}>
      <button type="button" onClick={() => router.back()} className={crmRecordChrome.backLink}>
        <ChevronLeft size={16} />
        Back to Deals
      </button>

      <div className={crmRecordChrome.panel}>
        <div className={crmRecordChrome.header}>
          <div className="flex items-start gap-4">
            <div className={crmRecordChrome.avatar}>
              <DollarSign size={22} className="opacity-90" />
            </div>
            <div className="min-w-0">
              <h1 className={crmRecordChrome.title}>{deal.title || 'Untitled Deal'}</h1>
              <div className={crmRecordChrome.quickActions}>
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={crmRecordChrome.quickAction}
                    title="Open WhatsApp"
                  >
                    <div className={cn(crmRecordChrome.quickActionIcon, 'text-[#25D366]')}>
                      <WhatsAppGlyph className="h-3.5 w-3.5" />
                    </div>
                    <span className={crmRecordChrome.quickActionLabel}>WhatsApp</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setIsSendEmailModalOpen(true)}
                  className={crmRecordChrome.quickAction}
                  title="Send Email"
                >
                  <div className={crmRecordChrome.quickActionIcon}>
                    <Mail size={14} />
                  </div>
                  <span className={crmRecordChrome.quickActionLabel}>Email</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMeetingModalOpen(true)}
                  className={crmRecordChrome.quickAction}
                  title="Schedule Meeting"
                >
                  <div className={crmRecordChrome.quickActionIcon}>
                    <Calendar size={14} />
                  </div>
                  <span className={crmRecordChrome.quickActionLabel}>Meeting</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(true)}
                  className={crmRecordChrome.quickAction}
                  title="Edit"
                >
                  <div className={crmRecordChrome.quickActionIcon}>
                    <Edit2 size={14} />
                  </div>
                  <span className={crmRecordChrome.quickActionLabel}>Edit</span>
                </button>

                <button
                  type="button"
                  disabled={isSharing}
                  onClick={async () => {
                    const shareData = {
                      title: `${deal.title} - Deal`,
                      text: canViewCrmRevenue
                        ? `Deal: ${deal.title} valued at ${deal.dealValue}`
                        : `Deal: ${deal.title}`,
                      url: window.location.href,
                    };

                    if (navigator.share) {
                      setIsSharing(true);
                      try {
                        await navigator.share(shareData);
                      } catch (err: any) {
                        if (err.name !== 'AbortError') {
                          console.error('Share failed:', err);
                          navigator.clipboard.writeText(shareData.url);
                          toast.success('Link copied to clipboard');
                        }
                      } finally {
                        setIsSharing(false);
                      }
                    } else {
                      navigator.clipboard.writeText(shareData.url);
                      toast.success('Link copied to clipboard');
                    }
                  }}
                  className={cn(crmRecordChrome.quickAction, 'disabled:opacity-50')}
                  title="Share"
                >
                  <div className={crmRecordChrome.quickActionIcon}>
                    <Share2 size={14} />
                  </div>
                  <span className={crmRecordChrome.quickActionLabel}>Share</span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {recipientEmail && (
                  <a
                    href={`mailto:${recipientEmail}`}
                    className="flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    <Mail size={14} className="opacity-60" />
                    {recipientEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className={crmRecordChrome.actions}>
            {canViewCrmRevenue && (
              <button type="button" onClick={() => setIsPaymentModalOpen(true)} className={CRM_BTN_SECONDARY}>
                <CreditCard size={16} className="mr-1.5 inline" />
                Payments
              </button>
            )}
            <button type="button" onClick={() => setIsEditModalOpen(true)} className={CRM_BTN_SECONDARY}>
              <Edit2 size={16} className="mr-1.5 inline" />
              Edit
            </button>
            {hasAccess('deals:delete') && (
            <button
              type="button"
              onClick={async () => {
                if (confirm('Move this deal to Trash? Only an admin can restore it.')) {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${CRM_API_URL}/crm/deals/${recordId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) router.push('/crm/deals');
                }
              }}
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[#ff5630]/40 px-3 text-sm font-medium text-[var(--error)] hover:bg-[var(--error-light)]"
            >
              <Trash2 size={16} className="mr-1.5" />
              Delete
            </button>
            )}
            <button
              type="button"
              onClick={() => setIsConvertToLeadModalOpen(true)}
              className={CRM_BTN_SECONDARY}
            >
              Convert to Lead
            </button>
            <button type="button" onClick={() => setIsConvertModalOpen(true)} className={CRM_BTN_PRIMARY}>
              Convert to Client
            </button>
            <button
              type="button"
              onClick={async () => {
                let targetStage = 'Won';
                const currentPid = deal.pipeline?.toString() || (deal.pipeline as any)?._id?.toString();

                const activePipeline = pipelines.find(p => p._id?.toString() === currentPid);
                if (activePipeline?.stages) {
                  const wonStage = activePipeline.stages.find((s: any) =>
                    s.name.toLowerCase().includes('won') ||
                    s.probability === 100
                  );
                  if (wonStage) targetStage = wonStage.name;
                }

                try {
                  const res = await fetch(`${CRM_API_URL}/crm/deals/${deal._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({
                      stage: targetStage,
                      probability: 100
                    })
                  });
                  if (res.ok) {
                    fetchDeal();
                  } else {
                    const err = await res.json();
                    alert(err.message || 'Failed to update deal status');
                  }
                } catch (err) {
                  console.error('Error marking deal as won:', err);
                  alert('Network error while updating deal');
                }
              }}
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[#36b37e] px-3 text-sm font-medium text-white hover:bg-[#2abb7f]"
            >
              Mark as Won
            </button>
          </div>
        </div>
      </div>

      <div className={cn(crmRecordChrome.stageBar, 'flex items-center overflow-x-auto custom-scrollbar')}>
        {STAGES.map((stage, idx) => {
          const currentStage = deal.stage || deal.status;
          const isCompleted = STAGES.indexOf(currentStage) >= idx;
          const isCurrent = currentStage === stage;
          return (
            <div key={stage} className={crmRecordChrome.stageStep}>
              <div
                className={cn(
                  crmRecordChrome.stageDot,
                  isCurrent
                    ? crmRecordChrome.stageDotCurrent
                    : isCompleted
                      ? crmRecordChrome.stageDotComplete
                      : crmRecordChrome.stageDotIdle,
                )}
              >
                {idx + 1}
              </div>
              <span
                className={cn(
                  crmRecordChrome.stageLabel,
                  isCurrent && crmRecordChrome.stageLabelCurrent,
                )}
              >
                {stage}
              </span>
              {idx < STAGES.length - 1 && (
                <div
                  className={cn(
                    'absolute left-1/2 top-4 z-0 h-px w-full -translate-y-1/2',
                    isCompleted ? 'bg-[var(--primary)]/35' : 'bg-[var(--border-color)]',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          <div className={cn(crmRecordChrome.panel, 'flex min-h-[480px] flex-col')}>
            <div className={crmRecordChrome.tabBar}>
              <div className={crmRecordChrome.tabs}>
                {[
                  { id: 'Activity' as const, label: 'Activity', icon: MessageSquare },
                  { id: 'Details' as const, label: 'Details', icon: Info },
                  { id: 'Chat' as const, label: 'Portal Chat', icon: MessageSquare },
                ].map((t) => {
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className={cn(crmRecordChrome.tab, isActive && crmRecordChrome.tabActive)}
                    >
                      <t.icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'Details' && (
                <div className="flex items-center gap-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setShowRecordCustomize(true)}
                    className={CRM_BTN_SECONDARY}
                  >
                    <Settings2 size={14} className="mr-1.5" />
                    Record view
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className={CRM_BTN_GHOST}
                    title="Edit"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className={cn(crmRecordChrome.tabBody, 'flex-1')}>
              {activeTab === 'Activity' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <CrmRecordActivityComposer
                    activityType={activityType}
                    setActivityType={setActivityType}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    relatedTo={recordId}
                    relatedType="Deal"
                    onActivityPosted={(data) => {
                      setActivities([data as any, ...activities]);
                      fetchEmailTracking();
                    }}
                    onMeetingScheduleClick={() => setIsMeetingModalOpen(true)}
                  />
                  <Timeline
                    activities={activities}
                    filterType={activityType}
                    emailTrackingByEmailId={emailLookups.byEmailId}
                    emailTrackingByToken={emailLookups.byToken}
                    onRefreshNeeded={fetchActivities}
                    timelineReplyContext={
                      recordId
                        ? { module: 'deals', entityId: String(recordId) }
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
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <h3 className="text-xs font-bold text-text-muted flex items-center gap-2 mb-8">
                    <DollarSign size={14} />
                    Deal core properties
                  </h3>
                  <CRMDealRecordFields
                    deal={deal}
                    visibleKeys={visibleRecordKeys}
                    customFieldDefs={customFieldDefs}
                    pipelineName={pipelineName}
                  />
                </div>
              )}

              {activeTab === 'Chat' && (
                <div className="flex flex-col h-[500px] border border-border bg-[var(--surface-dim)] rounded-[var(--radius-md)] overflow-hidden shadow-inner">
                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {loadingChat ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider">Loading Chat History...</span>
                      </div>
                    ) : chatMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 text-center p-8">
                        <MessageSquare className="h-10 w-10 opacity-30" />
                        <h4 className="text-sm font-bold text-text-main">No messages yet</h4>
                        <p className="text-xs max-w-xs">Send a message to start a conversation with the client on their portal.</p>
                      </div>
                    ) : (
                      chatMessages.map((msg) => {
                        const isAdminMsg = msg.senderType === 'admin';
                        return (
                          <div
                            key={msg._id || msg.id}
                            className={cn(
                              "flex gap-3 max-w-[85%] animate-in fade-in duration-300",
                              isAdminMsg ? "ml-auto flex-row-reverse" : "mr-auto"
                            )}
                          >
                            <div className={cn(
                              "w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-xs font-black shrink-0 border shadow-sm",
                              isAdminMsg 
                                ? "bg-primary border-primary/10 text-white" 
                                : "bg-emerald-500/10 border-emerald-500/15 text-emerald-600"
                            )}>
                              {isAdminMsg ? 'A' : 'C'}
                            </div>
                            <div className="space-y-1">
                              <div className={cn(
                                "rounded-[var(--radius-md)] p-3.5 text-xs shadow-sm border",
                                isAdminMsg
                                  ? "bg-primary text-white border-primary/20 rounded-tr-none"
                                  : "bg-white text-text-main border-border rounded-tl-none"
                              )}>
                                <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                              </div>
                              <div className={cn(
                                "flex items-center gap-1.5 text-[9px] text-text-muted font-bold tracking-wide uppercase px-1",
                                isAdminMsg ? "justify-end" : "justify-start"
                              )}>
                                <span>{msg.senderName || (isAdminMsg ? 'Admin' : 'Client')}</span>
                                <span>·</span>
                                <span>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Input Form */}
                  <form onSubmit={sendChatMessage} className="p-4 bg-white border-t border-border flex items-center gap-2">
                    <input
                      type="text"
                      value={newChatMessage}
                      onChange={(e) => setNewChatMessage(e.target.value)}
                      placeholder="Type a message to client..."
                      className="flex-1 px-4 py-3 bg-surface-dim border border-border rounded-[var(--radius-md)] text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/15 min-w-0"
                      disabled={sendingChat}
                    />
                    <button
                      type="submit"
                      disabled={sendingChat || !newChatMessage.trim()}
                      className={cn(CRM_BTN_PRIMARY, 'h-10 shrink-0 px-5')}
                    >
                      {sendingChat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <EmailEngagementPanel rows={emailTracking} />
          {recordId ? (
            <SalesAgentRecordPanel recordType="Deal" recordId={String(recordId)} />
          ) : null}
          <div className={crmRecordChrome.sidebarPanel}>
            <h3 className={crmRecordChrome.sectionTitle}>Property Listing</h3>
            {linkedProperty ? (
              <button
                type="button"
                onClick={() => router.push(`/crm/property-listings/${linkedProperty._id}`)}
                className="flex w-full items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-primary/15 bg-primary/10 text-primary">
                  <Home size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-main)]">{linkedProperty.title}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{formatAddress(linkedProperty)}</p>
                  <p className="mt-0.5 text-xs font-medium text-primary">{formatPrice(linkedProperty.price, linkedProperty.currency)}</p>
                </div>
                <ExternalLink size={13} className="mt-1 shrink-0 text-[var(--text-muted)]" />
              </button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                No property linked to this deal yet.{' '}
                <button type="button" onClick={() => setIsEditModalOpen(true)} className="font-semibold text-primary hover:underline">
                  Link one
                </button>
              </p>
            )}
          </div>

          <DealAssociationsPanel
            dealId={recordId}
            deal={deal as Record<string, unknown>}
            onUpdated={() => {
              void fetchDeal();
            }}
          />
          <div className={crmRecordChrome.sidebarPanel}>
            <h3 className={crmRecordChrome.sectionTitle}>Company Profile</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-md)] border border-primary/15 bg-primary/10 flex items-center justify-center font-bold text-primary">
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-main line-clamp-1">{orgName}</p>
                </div>
              </div>
              {deal.organization && typeof deal.organization === 'object' && (
                <div className="space-y-2 pt-2 border-t border-slate-50">
                  {deal.organization.website && (
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                       <ExternalLink size={12} />
                       <a href={deal.organization.website.startsWith('http') ? deal.organization.website : `https://${deal.organization.website}`} target="_blank" className="hover:text-primary transition-colors hover:underline truncate">{deal.organization.website}</a>
                    </div>
                  )}
                  {deal.organization.industry && (
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                       <span className="font-bold">Industry:</span> {deal.organization.industry}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={crmRecordChrome.sidebarPanel}>
            <h3 className={crmRecordChrome.sectionTitle}>Contact Person</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-600">
                  {recipientName[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-text-main line-clamp-1">{recipientName}</p>
                  <p className="text-xs text-text-muted font-mono">{recipientEmail || 'No email provided'}</p>
                </div>
              </div>
              {typeof contactPerson === 'object' && contactPerson?.mobileNo && (
                <div className="pt-2 border-t border-slate-50 flex items-center gap-2 text-xs text-text-muted">
                    <span className="font-bold">Phone:</span> {contactPerson.mobileNo}
                </div>
              )}
            </div>
          </div>

          <div className={crmRecordChrome.sidebarPanel}>
            <h3 className={crmRecordChrome.sectionTitle}>Deal Probability</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-3 bg-surface-dim rounded-full overflow-hidden border border-[var(--border-color)]">
                <div className="h-full bg-primary transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.3)]" style={{ width: `${deal.probability}%` }} />
              </div>
              <span className="font-black text-primary text-xl tracking-tight">{deal.probability}%</span>
            </div>
          </div>

          <div className="hidden bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-8 shadow-sm space-y-6">
            <h3 className={crmRecordChrome.sectionTitle}>Client Portal</h3>
            <p className="text-xs text-text-muted font-medium leading-relaxed">
              Clients open a private link (no login) to see payments, delivery status, what you need from them, and scope.
            </p>

            <div className="space-y-2">
              <label className="text-[9px] font-bold text-text-muted">Scope shown to client</label>
              <textarea
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                rows={4}
                placeholder="e.g. Deliverables, out-of-scope items, assumptions, key dates…"
                className="w-full px-4 py-3 bg-background border border-border rounded-[var(--radius-md)] text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/15 resize-y min-h-[88px]"
                disabled={!canManagePortalBoard}
              />
              {canManagePortalBoard && (
                <button
                  type="button"
                  onClick={savePortalScope}
                  disabled={savingPortalField === 'scope'}
                  className="text-xs font-semibold px-4 py-2 rounded-[var(--radius-md)] bg-surface-dim border border-border hover:border-primary/30 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {savingPortalField === 'scope' ? <Loader2 size={12} className="animate-spin" /> : null}
                  Save scope
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold text-text-muted">Portal domain</label>
              {portalDomainOptions.length > 0 ? (
                <select
                  value={portalDomain}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPortalDomain(v);
                    void savePortalDomain(v);
                  }}
                  disabled={savingPortalField === 'domain' || !canManagePortalBoard}
                  className="w-full px-4 py-3 bg-background border border-border rounded-[var(--radius-md)] text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                >
                  <option value="">Use current app domain</option>
                  {portalDomainOptions.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={portalDomain}
                  onChange={(e) => setPortalDomain(e.target.value)}
                  onBlur={() => void savePortalDomain(portalDomain)}
                  placeholder="https://portal.yourdomain.com"
                  disabled={savingPortalField === 'domain' || !canManagePortalBoard}
                  className="w-full px-4 py-3 bg-background border border-border rounded-[var(--radius-md)] text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                />
              )}
              <p className="text-xs text-text-muted leading-relaxed">
                Choose which domain this client portal link should use.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold text-text-muted">Delivery board (PM)</label>
              <select
                value={portalPmId}
                onChange={(e) => {
                  const v = e.target.value;
                  setPortalPmId(v);
                  void savePortalPmProject(v);
                }}
                disabled={savingPortalField === 'pm' || !canManagePortalBoard}
                className="w-full px-4 py-3 bg-background border border-border rounded-[var(--radius-md)] text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              >
                <option value="">Not linked</option>
                {pmProjects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted leading-relaxed">
                Task counts by column appear on the client portal for this board.
              </p>
            </div>

            <div className="border-t border-border pt-6 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                <ListTodo size={14} />
                Requests from client
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={newNeed.category}
                  onChange={(e) => setNewNeed((n) => ({ ...n, category: e.target.value }))}
                  disabled={!canManagePortalBoard}
                  className="px-3 py-2 rounded-[var(--radius-md)] border border-border bg-background text-xs font-bold shrink-0"
                >
                  <option value="asset">Asset / file</option>
                  <option value="credential">Credential</option>
                  <option value="document">Document</option>
                  <option value="access">Access / env</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={newNeed.title}
                  onChange={(e) => setNewNeed((n) => ({ ...n, title: e.target.value }))}
                  placeholder="Short title"
                  disabled={!canManagePortalBoard}
                  className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-border bg-background text-xs font-medium min-w-0"
                />
                {canManagePortalBoard && (
                  <button
                    type="button"
                    onClick={addPortalNeed}
                    disabled={needBusyId === 'new'}
                    className="px-4 py-2 rounded-[var(--radius-md)] bg-primary text-white text-xs font-semibold shrink-0 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {needBusyId === 'new' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add
                  </button>
                )}
              </div>
              <input
                value={newNeed.description}
                onChange={(e) => setNewNeed((n) => ({ ...n, description: e.target.value }))}
                placeholder="Optional details (no secrets — client-visible)"
                disabled={!canManagePortalBoard}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-border bg-background text-xs font-medium"
              />
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {portalNeeds.map((n) => (
                  <li
                    key={n._id}
                    className="flex flex-wrap items-center gap-2 p-3 rounded-[var(--radius-md)] bg-surface-dim/50 border border-border text-xs"
                  >
                    <span className="font-bold text-text-main flex-1 min-w-[120px]">{n.title}</span>
                    <select
                      value={n.status}
                      onChange={(e) => patchPortalNeed(n._id, { status: e.target.value })}
                      disabled={needBusyId === n._id || !canManagePortalBoard}
                      className="text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-lg border border-border bg-card"
                    >
                      <option value="open">Open</option>
                      <option value="received">Received</option>
                      <option value="not_needed">Not needed</option>
                    </select>
                    {canManagePortalBoard && (
                      <button
                        type="button"
                        onClick={() => removePortalNeed(n._id)}
                        disabled={needBusyId === n._id}
                        className="p-1.5 text-text-muted hover:text-error rounded-lg"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
                {portalNeeds.length === 0 && (
                  <li className="text-xs text-text-muted py-2">No items yet.</li>
                )}
              </ul>
            </div>

            {deal.portalToken ? (
              <div className="space-y-4 border-t border-border pt-6">
                <div className="p-4 bg-surface-dim rounded-[var(--radius-md)] border border-[var(--border-color)] break-all text-xs font-mono text-text-muted/70">
                  {resolvedPortalBaseUrl ? `${resolvedPortalBaseUrl}/portal/${deal.portalToken}` : ''}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={isSharing}
                    onClick={async () => {
                      const url = `${resolvedPortalBaseUrl}/portal/${deal.portalToken}`;
                      if (navigator.share) {
                        setIsSharing(true);
                        try {
                          await navigator.share({
                            title: `Portal: ${deal.organization}`,
                            text: `Access the client portal for ${deal.organization}`,
                            url: url
                          });
                        } catch (err: any) {
                          if (err.name !== 'AbortError') {
                            navigator.clipboard.writeText(url);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        } finally {
                          setIsSharing(false);
                        }
                      } else {
                        navigator.clipboard.writeText(url);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-text-main text-white rounded-[var(--radius-md)] text-xs font-semibold hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Share2 size={14} />
                    {copied ? 'Copied!' : 'Share Link'}
                  </button>
                  <a
                    href={`${resolvedPortalBaseUrl}/portal/${deal.portalToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 bg-card border border-[var(--border-color)] text-text-muted hover:text-primary rounded-[var(--radius-md)] transition-all"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4 border-t border-border pt-6">
                <p className="text-sm text-text-muted font-medium leading-relaxed">Generate a link to share the portal with your client.</p>
                <button
                  onClick={generatePortalToken}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-[var(--radius-md)] text-xs font-black uppercase tracking-[0.2em] hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95 italic"
                >
                  <Plus size={14} />
                  Enable Portal
                </button>
              </div>
            )}
          </div>

          <div className={crmRecordChrome.sidebarPanel}>
            <h3 className={crmRecordChrome.sectionTitle}>Client Portal</h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Client Portal configuration is now managed from Client Portal Console.
            </p>
            <button
              type="button"
              onClick={() => router.push('/client-portals')}
              className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-xs font-semibold text-white"
            >
              Open Client Portal Console
            </button>
          </div>
        </div>
      </div>

      <ConvertDealModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        dealId={recordId}
        dealTitle={deal.title}
        onSuccess={() => {
          fetchDeal();
          router.push('/crm/deals');
        }}
      />
      <ConvertDealToLeadModal
        isOpen={isConvertToLeadModalOpen}
        onClose={() => setIsConvertToLeadModalOpen(false)}
        dealId={recordId}
        dealTitle={deal.title}
        hasSourceLead={!!(deal.lead?._id || deal.lead)}
        onSuccess={() => {
          fetchDeal();
        }}
      />
      {canViewCrmRevenue && (
        <PaymentTermsModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          dealId={recordId}
        />
      )}
      <EditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        type="Deal"
        initialData={deal}
        onSuccess={() => {
          fetchDeal();
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <SendEmailModal
        isOpen={isSendEmailModalOpen}
        onClose={() => setIsSendEmailModalOpen(false)}
        recipientEmail={recipientEmail}
        recipientName={recipientName}
        module="deals"
        entityId={recordId}
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
        suggestedCcEmails={
          Array.isArray(deal?.lead?.additionalEmails) ? deal.lead.additionalEmails : []
        }
      />
      <ScheduleMeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        entityId={recordId}
        module="deals"
        recipientName={recipientName}
        onSuccess={() => {
          fetchActivities();
          fetchEmailTracking();
        }}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showRecordCustomize}
        onClose={() => setShowRecordCustomize(false)}
        module="deals"
        context="record"
        customFieldKeys={customFieldDefs.map((f) => ({ key: f.key, label: f.name }))}
        title="Customize deal record view"
        onSaved={() => setLayoutTickRecord((t) => t + 1)}
      />
    </div>
  );
}
