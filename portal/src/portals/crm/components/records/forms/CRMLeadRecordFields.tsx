"use client";

import Link from 'next/link';
import { Mail, Phone, Building2, ExternalLink, UserPlus } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { contactXProfileUrl } from '@/lib/crm/crm-x-messaging';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/records/forms/CrmCustomFieldValue';
import EmailFinderFromLinkedIn from '@/components/crm/email/tools/EmailFinderFromLinkedIn';
import EmailExtractorFromWebsite from '@/components/crm/email/tools/EmailExtractorFromWebsite';
import EmailVerifierButton from '@/components/crm/email/tools/EmailVerifierButton';
import { usePermissions } from '@/hooks/usePermissions';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

/** Fields already shown in the profile hero — skip in Lead Information sidebar */
const SIDEBAR_SKIP = new Set([
  'salutation',
  'firstName',
  'lastName',
  'gender',
  'organization',
  'leadOwner', // shown in Owner block below
]);

/** Preferred order for sidebar summary (CRMS Lead Information style) */
const SIDEBAR_ORDER = [
  'createdAt',
  'email',
  'additionalEmails',
  'mobileNo',
  'phone',
  'jobTitle',
  'source',
  'stage',
  'status',
  'callStatus',
  'pipeline',
  'industry',
  'website',
  'linkedinUrl',
  'twitterHandle',
  'annualRevenue',
  'noOfEmployees',
  'territory',
  'relatedService',
  'leadScore',
];

interface CRMLeadRecordFieldsProps {
  lead: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
  pipelineName?: string;
  onApplyEmailFromFinder?: (email: string) => void | Promise<void>;
  /** `sidebar` = CRMS Lead Information label | value rows */
  layout?: 'grid' | 'sidebar';
  /** Hide empty / dash values (recommended for sidebar) */
  hideEmpty?: boolean;
}

function cfGet(lead: Record<string, any>, k: string): unknown {
  const cf = lead.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(k);
  return cf[k];
}

export default function CRMLeadRecordFields({
  lead,
  visibleKeys,
  customFieldDefs,
  pipelineName,
  onApplyEmailFromFinder,
  layout = 'grid',
  hideEmpty = false,
}: CRMLeadRecordFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));
  let keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');

  if (layout === 'sidebar') {
    keys = keys.filter((k) => !SIDEBAR_SKIP.has(k));
    const rank = (k: string) => {
      const i = SIDEBAR_ORDER.indexOf(k);
      return i === -1 ? 1000 : i;
    };
    keys = [...keys].sort((a, b) => rank(a) - rank(b));
  }

  const hasValue = (key: string): boolean => {
    if (key.startsWith('cf:')) {
      const val = cfGet(lead, key.slice(3));
      if (val == null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }
    switch (key) {
      case 'email':
        return Boolean(String(lead.email || '').trim());
      case 'additionalEmails':
        return Array.isArray(lead.additionalEmails) && lead.additionalEmails.length > 0;
      case 'mobileNo':
        return Boolean(String(lead.mobileNo || '').trim());
      case 'phone':
        return Boolean(String(lead.phone || '').trim());
      case 'website':
        return Boolean(String(lead.website || '').trim());
      case 'linkedinUrl':
        return Boolean(String(lead.linkedinUrl || '').trim());
      case 'twitterHandle':
        return Boolean(String(lead.twitterHandle || '').trim());
      case 'pipeline':
        return Boolean(pipelineName || lead.pipeline);
      case 'createdAt':
        return Boolean(lead.createdAt);
      case 'leadScore':
        return lead.leadScore != null && !Number.isNaN(Number(lead.leadScore));
      case 'relatedService': {
        const rs = lead.relatedService;
        if (rs && typeof rs === 'object' && rs !== null && 'name' in rs) return Boolean((rs as { name: string }).name);
        if (rs != null && rs !== '') return true;
        const legacy = cfGet(lead, 'RELATED_SERVICE') ?? cfGet(lead, 'related_service');
        return legacy != null && legacy !== '';
      }
      default: {
        const v = lead[key];
        if (v == null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      }
    }
  };

  if (hideEmpty) {
    keys = keys.filter(hasValue);
  }

  const renderCore = (key: string, compact = false): React.ReactNode => {
    switch (key) {
      case 'salutation':
        return lead.salutation || '—';
      case 'gender':
        return lead.gender || '—';
      case 'firstName':
        return lead.firstName || '—';
      case 'lastName':
        return lead.lastName || '—';
      case 'email':
        if (!lead.email) return '—';
        if (compact) {
          return (
            <a
              href={`mailto:${lead.email}`}
              className="block truncate text-[var(--primary)] hover:underline"
              title={lead.email}
            >
              {lead.email}
            </a>
          );
        }
        return (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <a href={`mailto:${lead.email}`} className="text-primary font-medium hover:underline flex items-center gap-2 min-w-0">
              <Mail size={16} className="opacity-60 shrink-0" />
              <span className="truncate" title={lead.email}>{lead.email}</span>
            </a>
            <EmailVerifierButton email={lead.email} />
          </div>
        );
      case 'additionalEmails':
        return Array.isArray(lead.additionalEmails) && lead.additionalEmails.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {lead.additionalEmails.map((em: string) => (
              <a key={em} href={`mailto:${em}`} className="text-primary font-medium hover:underline truncate max-w-full">
                {em}
              </a>
            ))}
          </div>
        ) : (
          '—'
        );
      case 'mobileNo':
        return lead.mobileNo ? (
          <a href={`tel:${lead.mobileNo}`} className={compact ? 'hover:underline' : 'flex items-center gap-2'}>
            {!compact ? <Phone size={16} className="text-text-muted shrink-0" /> : null}
            {lead.mobileNo}
          </a>
        ) : (
          '—'
        );
      case 'phone':
        return lead.phone ? (
          <a href={`tel:${lead.phone}`} className={compact ? 'hover:underline' : 'flex items-center gap-2'}>
            {!compact ? <Phone size={16} className="text-text-muted shrink-0" /> : null}
            {lead.phone}
          </a>
        ) : (
          '—'
        );
      case 'organization':
        return lead.organization ? (
          <Link
            href={`/crm/organizations?search=${encodeURIComponent(lead.organization)}`}
            className="text-primary hover:underline font-medium break-words"
          >
            {!compact ? <Building2 size={16} className="text-text-muted shrink-0 inline mr-1.5 align-text-bottom" /> : null}
            {lead.organization}
          </Link>
        ) : (
          '—'
        );
      case 'jobTitle':
        return lead.jobTitle || '—';
      case 'website':
        if (!lead.website) return '—';
        if (compact) {
          return (
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-[var(--primary)] hover:underline"
              title={lead.website}
            >
              {lead.website.replace(/^https?:\/\//, '')}
            </a>
          );
        }
        return (
          <div className="flex flex-wrap gap-2 items-center">
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {lead.website}
            </a>
            <EmailExtractorFromWebsite
              websiteUrl={lead.website}
              existingEmail={lead.email}
              onEmailFound={onApplyEmailFromFinder}
            />
          </div>
        );
      case 'linkedinUrl':
        if (!lead.linkedinUrl) return '—';
        if (compact) {
          return (
            <a
              href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#0A66C2] hover:underline text-sm font-medium"
            >
              <ExternalLink size={13} />
              LinkedIn profile
            </a>
          );
        }
        return (
          <div className="flex flex-wrap gap-2 items-center">
            <a
              href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2]/10 text-[#0A66C2] rounded-[var(--radius-md)] text-sm font-bold hover:bg-[#0A66C2]/20 transition-colors"
            >
              <ExternalLink size={16} />
              Open Profile
            </a>
            <a
              href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-[var(--radius-md)] text-sm font-bold hover:bg-[#004182] transition-colors"
            >
              <UserPlus size={16} />
              Connect
            </a>
            <EmailFinderFromLinkedIn
              linkedinUrl={lead.linkedinUrl}
              existingEmail={lead.email}
              onEmailFound={onApplyEmailFromFinder}
            />
          </div>
        );
      case 'twitterHandle': {
        const x = contactXProfileUrl(lead);
        return x ? (
          <a href={x} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-black hover:underline">
            <ExternalLink size={compact ? 13 : 16} className="opacity-70 shrink-0" />
            @{String(lead.twitterHandle)}
          </a>
        ) : '—';
      }
      case 'source':
        return <div className="break-words">{lead.source || '—'}</div>;
      case 'industry':
        return lead.industry || '—';
      case 'annualRevenue':
        return lead.annualRevenue !== undefined && lead.annualRevenue !== null && lead.annualRevenue !== ''
          ? String(lead.annualRevenue)
          : '—';
      case 'noOfEmployees':
        return lead.noOfEmployees || '—';
      case 'territory':
        return lead.territory || '—';
      case 'relatedService': {
        const rs = lead.relatedService;
        if (rs && typeof rs === 'object' && rs !== null && 'name' in rs) return (rs as { name: string }).name;
        if (rs != null && rs !== '') return String(rs);
        const legacy = cfGet(lead, 'RELATED_SERVICE') ?? cfGet(lead, 'related_service');
        return legacy != null && legacy !== '' ? String(legacy) : '—';
      }
      case 'leadOwner':
        return lead.leadOwner || '—';
      case 'pipeline':
        return pipelineName || '—';
      case 'stage':
        return lead.stage || '—';
      case 'status':
        return lead.status || '—';
      case 'callStatus':
        return lead.callStatus || '—';
      case 'createdAt':
        return lead.createdAt
          ? new Date(lead.createdAt).toLocaleString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';
      case 'leadScore': {
        const s = lead.leadScore;
        if (s == null || Number.isNaN(Number(s))) return '—';
        const n = Number(s);
        if (compact) return <span className="tabular-nums font-semibold">{n}/100</span>;
        const tier =
          n >= 70 ? 'text-emerald-700' : n >= 40 ? 'text-amber-800' : 'text-slate-600';
        const bd = lead.leadScoreBreakdown as Record<string, number> | undefined;
        const parts =
          bd && typeof bd === 'object'
            ? ['completeness', 'firmographic', 'stageFit', 'engagement']
                .filter((k) => typeof bd[k] === 'number')
                .map((k) => `${k} ${bd[k]}`)
                .join(' · ')
            : '';
        return (
          <div className="space-y-1">
            <span className={`text-lg font-bold tabular-nums ${tier}`}>{n}</span>
            <span className="text-text-muted text-xs block">out of 100 (heuristic)</span>
            {parts ? (
              <p className="text-xs text-text-muted leading-snug" title={parts}>
                {parts}
              </p>
            ) : null}
          </div>
        );
      }
      default:
        return lead[key] != null && lead[key] !== '' ? String(lead[key]) : '—';
    }
  };

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      return customLabels[fk] || fieldLabel('leads', key, customLabels);
    }
    const map: Record<string, string> = {
      salutation: 'Salutation',
      gender: 'Gender',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      additionalEmails: 'Additional emails',
      mobileNo: 'Mobile',
      phone: 'Phone (alternate)',
      organization: 'Company',
      jobTitle: 'Job Title',
      website: 'Website',
      linkedinUrl: 'LinkedIn',
      twitterHandle: 'X (Twitter)',
      source: 'Lead Source',
      industry: 'Industry',
      annualRevenue: 'Annual Revenue',
      noOfEmployees: 'No. of Employees',
      territory: 'Territory',
      relatedService: 'Related service',
      leadOwner: 'Lead Owner',
      pipeline: 'Pipeline',
      stage: 'Stage',
      status: 'Status',
      leadScore: 'Lead score',
      createdAt: 'Created',
    };
    return map[key] || key;
  };

  const rows = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(lead, fk);
      const def = customFieldDefs.find((d) => d.key === fk);
      if (layout === 'sidebar') {
        return (
          <div key={key} className={crmRecordChrome.infoRow}>
            <span className={crmRecordChrome.infoLabel}>{labelFor(key)}</span>
            <div className={crmRecordChrome.infoValue}>
              <CrmCustomFieldValue value={val} type={def?.type} />
            </div>
          </div>
        );
      }
      return (
        <div key={key} className="space-y-1">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
          <div className="text-sm text-text-main font-medium min-w-0">
            <CrmCustomFieldValue value={val} type={def?.type} />
          </div>
        </div>
      );
    }
    const span2 = (key === 'linkedinUrl' && lead.linkedinUrl) || (key === 'twitterHandle' && lead.twitterHandle);
    if (layout === 'sidebar') {
      return (
        <div key={key} className={crmRecordChrome.infoRow}>
          <span className={crmRecordChrome.infoLabel}>{labelFor(key)}</span>
          <div className={crmRecordChrome.infoValue}>{renderCore(key, true)}</div>
        </div>
      );
    }
    return (
      <div key={key} className={`space-y-1 ${span2 ? 'md:col-span-2' : ''}`}>
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
        <div className="text-sm text-text-main font-medium break-words">{renderCore(key)}</div>
      </div>
    );
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        {layout === 'sidebar'
          ? 'No details filled yet. Use Edit or the Details tab to add properties.'
          : 'No properties to display. Use Record view to choose visible fields.'}
      </p>
    );
  }

  if (layout === 'sidebar') {
    return <div className={cn('flex flex-col')}>{rows}</div>;
  }

  return <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{rows}</div>;
}
