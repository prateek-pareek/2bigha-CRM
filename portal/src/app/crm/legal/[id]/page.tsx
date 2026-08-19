"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Info, Edit2, ChevronLeft, Trash2, Share2, ExternalLink, FileText, Scale } from 'lucide-react';
import LegalCaseCreatePanel from '@/components/crm/records/create/LegalCaseCreatePanel';
import LegalCaseAssociationsPanel from '@/components/crm/records/associations/LegalCaseAssociationsPanel';
import CrmRecordQuickActions, { type CrmRecordQuickAction } from '@/components/crm/records/detail/CrmRecordQuickActions';
import CrmRecordDetailTabs, { type CrmRecordDetailTabId } from '@/components/crm/records/detail/CrmRecordDetailTabs';
import CrmRecordOwnerCard from '@/components/crm/records/detail/CrmRecordOwnerCard';
import CrmRecordPipelineStatus from '@/components/crm/records/detail/CrmRecordPipelineStatus';
import CrmRecordDetailSkeleton from '@/components/crm/records/detail/CrmRecordDetailSkeleton';
import { CASE_TYPE_OPTIONS } from '@/components/crm/records/forms/CRMLegalCaseFormFields';
import { CRM_API_URL } from '@/lib/crm/config';
import { crmRecordIdFromParams } from '@/lib/crm/crm-route-params';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CrmPageHeader, CrmSoftBadge } from '@/components/crm/ui';
import type { LegalCase } from '@/lib/crm/legal-cases-api';

function caseTypeLabel(value?: string): string {
  return CASE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value || 'Other';
}

function priorityTone(priority?: string): 'danger' | 'warning' | 'secondary' | 'primary' {
  const p = (priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high') return 'danger';
  if (p === 'medium') return 'warning';
  return 'secondary';
}

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value?: number, currency?: string) {
  if (value == null) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  return `${symbol}${Number(value).toLocaleString()}`;
}

export default function LegalCaseDetailPage() {
  const { id } = useParams();
  const recordId = useMemo(() => crmRecordIdFromParams(id as string | string[]), [id]);
  const router = useRouter();
  const { hasAccess } = usePermissions();
  const [legalCase, setLegalCase] = useState<LegalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [activeTab, setActiveTab] = useState<CrmRecordDetailTabId>('Details');

  const fetchCase = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${recordId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push('/auth/login?error=unauthorized');
        return;
      }
      if (!res.ok) {
        setLegalCase(null);
        setLoadError(res.status === 403 ? 'You do not have access to this legal case.' : 'Legal case not found.');
        return;
      }
      const data = await res.json();
      if (!data?._id) {
        setLegalCase(null);
        setLoadError('Legal case not found.');
        return;
      }
      setLegalCase(data);
      setLoadError(null);
    } catch (err) {
      console.error(err);
      setLoadError('Failed to load legal case.');
    }
  };

  useEffect(() => {
    if (!recordId) return;
    let isCancelled = false;
    setLoading(true);
    const token = localStorage.getItem('token');
    (async () => {
      await fetchCase();
      try {
        const pipeRes = await fetch(`${CRM_API_URL}/crm/pipelines?type=legal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!isCancelled && pipeRes.ok) setPipelines(await pipeRes.json());
      } catch (err) {
        console.error(err);
      }
      if (!isCancelled) setLoading(false);
    })();
    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when recordId changes
  }, [recordId]);

  const pipelineId =
    legalCase?.pipeline && typeof legalCase.pipeline === 'object' ? (legalCase.pipeline as any)?._id : legalCase?.pipeline;
  const currentPipeline = pipelines.find((p) => String(p._id) === String(pipelineId || ''));
  const pipelineStages: string[] = (currentPipeline?.stages || [])
    .slice()
    .sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0))
    .map((s: { name: string }) => s.name)
    .filter(Boolean);

  const updateStage = async (newStage: string) => {
    if (!newStage || newStage === legalCase?.stage || !hasAccess('legal:move_pipeline')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${recordId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Stage updated');
      void fetchCase();
    } catch {
      toast.error('Failed to update stage');
    }
  };

  if (loading) return <CrmRecordDetailSkeleton />;

  if (loadError || !legalCase) {
    return (
      <div className="p-8">
        <p className="text-sm text-text-muted">{loadError || 'Legal case not found.'}</p>
        <button type="button" onClick={() => router.push('/crm/legal')} className="text-sm text-primary mt-2 inline-block hover:underline">
          Back to legal cases
        </button>
      </div>
    );
  }

  const quickActions: CrmRecordQuickAction[] = [
    {
      id: 'edit',
      label: 'Edit',
      icon: <Edit2 size={14} />,
      primary: true,
      title: 'Edit legal case',
      onClick: () => setIsEditOpen(true),
    },
  ];

  const secondaryActions: CrmRecordQuickAction[] = [
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={14} />,
      disabled: isSharing,
      title: 'Share link',
      onClick: async () => {
        const shareData = {
          title: `${legalCase.title} - Legal Case`,
          text: legalCase.title,
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

  if (hasAccess('legal:delete')) {
    secondaryActions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      title: 'Delete legal case',
      onClick: async () => {
        if (!confirm('Move this legal case to Trash? Only an admin can restore it.')) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`${CRM_API_URL}/crm/legal-cases/${recordId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) router.push('/crm/legal');
      },
    });
  }

  const documents = legalCase.documents || [];

  return (
    <div className={cn(crmRecordChrome.page, 'animate-in fade-in duration-300')}>
      <CrmPageHeader
        title="Legal"
        bordered={false}
        breadcrumbs={[
          { label: 'Home', href: '/crm' },
          { label: 'Legal', href: '/crm/legal' },
          { label: legalCase.title },
        ]}
      />

      <button type="button" onClick={() => router.push('/crm/legal')} className={crmRecordChrome.backLink}>
        <ChevronLeft size={14} />
        Back to Legal
      </button>

      <div className={crmRecordChrome.hero}>
        <div className={crmRecordChrome.heroBody}>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className={crmRecordChrome.avatar}>
              <Scale size={22} className="opacity-90" />
            </div>
            <div className="min-w-0">
              <h1 className={cn(crmRecordChrome.title, 'inline-flex flex-wrap items-center gap-2')}>
                <span className="truncate">{legalCase.title}</span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <CrmSoftBadge label={caseTypeLabel(legalCase.caseType)} tone="info" />
                <CrmSoftBadge label={legalCase.priority || 'Medium'} tone={priorityTone(legalCase.priority)} />
              </div>
              {legalCase.counterpartyName ? (
                <p className={cn(crmRecordChrome.metaLine, 'mt-1.5')}>{legalCase.counterpartyName}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border-color)] px-4 pb-4 sm:px-5">
          <CrmRecordQuickActions actions={quickActions} secondaryActions={secondaryActions} className="!mt-0 !border-0 !pt-3" />
        </div>
      </div>

      {pipelineStages.length > 0 ? (
        <CrmRecordPipelineStatus
          title="Legal Case Pipeline Status"
          stages={pipelineStages}
          currentStage={legalCase.stage}
          onSelect={hasAccess('legal:move_pipeline') ? updateStage : undefined}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className={cn(crmRecordChrome.panel, 'flex min-h-[420px] flex-col')}>
            <CrmRecordDetailTabs
              tabs={[{ id: 'Details', label: 'Details', icon: Info }]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              detailsToolbar={
                <button
                  type="button"
                  onClick={() => setIsEditOpen(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--crm-radius-ui)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--hs-link)]"
                  title="Edit"
                >
                  <Edit2 size={14} />
                </button>
              }
            />

            <div className={cn(crmRecordChrome.tabBody, 'flex-1')}>
              <div className="animate-in fade-in duration-300 space-y-6">
                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Case properties
                  </h3>
                  <div className="space-y-0">
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Case type</span>
                      <span className={crmRecordChrome.infoValue}>{caseTypeLabel(legalCase.caseType)}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Priority</span>
                      <span className={crmRecordChrome.infoValue}>{legalCase.priority || 'Medium'}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Description</span>
                      <span className={crmRecordChrome.infoValue}>{legalCase.description || '—'}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Counterparty</span>
                      <span className={crmRecordChrome.infoValue}>{legalCase.counterpartyName || '—'}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Contract value</span>
                      <span className={crmRecordChrome.infoValue}>
                        {formatCurrency(legalCase.contractValue, legalCase.currency)}
                      </span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Jurisdiction</span>
                      <span className={crmRecordChrome.infoValue}>{legalCase.jurisdiction || '—'}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Start date</span>
                      <span className={crmRecordChrome.infoValue}>{formatDate(legalCase.startDate)}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Expiry date</span>
                      <span className={crmRecordChrome.infoValue}>{formatDate(legalCase.expiryDate)}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Pipeline</span>
                      <span className={crmRecordChrome.infoValue}>{currentPipeline?.name || '—'}</span>
                    </div>
                    <div className={crmRecordChrome.infoRow}>
                      <span className={crmRecordChrome.infoLabel}>Stage</span>
                      <span className={crmRecordChrome.infoValue}>{legalCase.stage || '—'}</span>
                    </div>
                    {legalCase.recordId ? (
                      <div className={crmRecordChrome.infoRow}>
                        <span className={crmRecordChrome.infoLabel}>Record ID</span>
                        <span className={crmRecordChrome.infoValue}>{legalCase.recordId}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Documents
                  </h3>
                  {documents.length === 0 ? (
                    <p className="text-xs text-text-muted italic">No documents attached.</p>
                  ) : (
                    <ul className="space-y-2">
                      {documents.map((doc, idx) => (
                        <li
                          key={`${doc.url}-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-dim/20 px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText size={15} className="shrink-0 text-text-muted" />
                            <span className="truncate text-sm font-medium text-text-main">{doc.name}</span>
                          </div>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            Open
                            <ExternalLink size={12} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:min-w-0">
          <CrmRecordOwnerCard ownerLabel={legalCase.caseOwner} title="Case Owner" />
          <LegalCaseAssociationsPanel
            caseId={recordId}
            legalCase={legalCase as unknown as Record<string, unknown>}
            onUpdated={() => void fetchCase()}
          />
        </aside>
      </div>

      <LegalCaseCreatePanel
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editingCase={legalCase}
        onSuccess={() => {
          setIsEditOpen(false);
          void fetchCase();
        }}
      />
    </div>
  );
}
