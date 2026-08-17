"use client";

import Link from 'next/link';
import { Mail, Phone, Building2, Calendar, ExternalLink, UserPlus } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { contactXProfileUrl } from '@/lib/crm/crm-x-messaging';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/CrmCustomFieldValue';
import EmailFinderFromLinkedIn from '@/components/crm/EmailFinderFromLinkedIn';
import EmailExtractorFromWebsite from '@/components/crm/EmailExtractorFromWebsite';
import EmailVerifierButton from '@/components/crm/EmailVerifierButton';
import { usePermissions } from '@/hooks/usePermissions';

interface CRMLeadRecordFieldsProps {
  lead: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
  pipelineName?: string;
  onApplyEmailFromFinder?: (email: string) => void | Promise<void>;
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
}: CRMLeadRecordFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');

  const renderCore = (key: string): React.ReactNode => {
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
        return lead.email ? (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <a href={`mailto:${lead.email}`} className="text-primary font-medium hover:underline flex items-center gap-2 min-w-0">
              <Mail size={16} className="opacity-60 shrink-0" />
              <span className="truncate" title={lead.email}>{lead.email}</span>
            </a>
            <EmailVerifierButton email={lead.email} />
          </div>
        ) : (
          '—'
        );
      case 'additionalEmails':
        return Array.isArray(lead.additionalEmails) && lead.additionalEmails.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {lead.additionalEmails.map((em: string) => (
              <a key={em} href={`mailto:${em}`} className="text-primary font-medium hover:underline">
                {em}
              </a>
            ))}
          </div>
        ) : (
          '—'
        );
      case 'mobileNo':
        return (
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-text-muted shrink-0" />
            {lead.mobileNo || '—'}
          </div>
        );
      case 'phone':
        return (
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-text-muted shrink-0" />
            {lead.phone || '—'}
          </div>
        );
      case 'organization':
        return lead.organization ? (
          <Link
            href={`/crm/organizations?search=${encodeURIComponent(lead.organization)}`}
            className="text-primary hover:underline flex items-center gap-2 font-medium"
          >
            <Building2 size={16} className="text-text-muted shrink-0" />
            {lead.organization}
          </Link>
        ) : (
          '—'
        );
      case 'jobTitle':
        return lead.jobTitle || '—';
      case 'website':
        return lead.website ? (
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
        ) : (
          '—'
        );
      case 'linkedinUrl':
        return lead.linkedinUrl ? (
          <div className="flex flex-wrap gap-2 items-center">
            <a
              href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2]/10 text-[#0A66C2] rounded-[3px] text-sm font-bold hover:bg-[#0A66C2]/20 transition-colors"
            >
              <ExternalLink size={16} />
              Open Profile
            </a>
            <a
              href={lead.linkedinUrl.startsWith('http') ? lead.linkedinUrl : `https://${lead.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-[3px] text-sm font-bold hover:bg-[#004182] transition-colors"
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
        ) : (
          '—'
        );
      case 'twitterHandle': {
        const x = contactXProfileUrl(lead);
        return x ? (
          <a href={x} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-black hover:underline">
            <ExternalLink size={16} className="opacity-70 shrink-0" />
            @{String(lead.twitterHandle)}
          </a>
        ) : '—';
      }
      case 'source':
        return <div className="break-all">{lead.source || '—'}</div>;
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
      case 'nextFollowUpAt': {
        if (!lead.nextFollowUpAt) return '—';
        const due = new Date(lead.nextFollowUpAt);
        const overdue = due.getTime() < Date.now();
        return (
          <div className={`flex items-center gap-2 ${overdue ? 'text-red-600' : ''}`}>
            <Calendar size={16} className="shrink-0" />
            {due.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {overdue ? <span className="text-xs font-bold uppercase">Overdue</span> : null}
          </div>
        );
      }
      case 'createdAt':
        return (
          <div className="flex items-center gap-2 text-text-muted font-medium text-sm">
            <Calendar size={16} className="shrink-0" />
            {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
          </div>
        );
      case 'leadScore': {
        const s = lead.leadScore;
        if (s == null || Number.isNaN(Number(s))) return '—';
        const n = Number(s);
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
      nextFollowUpAt: 'Next Follow-up',
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
    return (
      <div key={key} className={`space-y-1 ${span2 ? 'md:col-span-2' : ''}`}>
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
        <div className="text-sm text-text-main font-medium break-words">{renderCore(key)}</div>
      </div>
    );
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-muted">No properties to display. Use Record view to choose visible fields.</p>
    );
  }

  return <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{rows}</div>;
}
