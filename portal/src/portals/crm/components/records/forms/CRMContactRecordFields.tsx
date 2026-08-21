"use client";

import Link from 'next/link';
import { Mail, Phone, Building2, Calendar, ExternalLink, UserPlus } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { contactTelegramUrl } from '@/lib/crm/crm-messaging-links';
import { contactXProfileUrl } from '@/lib/crm/crm-x-messaging';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/records/forms/CrmCustomFieldValue';
import EmailFinderFromLinkedIn from '@/components/crm/email/tools/EmailFinderFromLinkedIn';
import EmailExtractorFromWebsite from '@/components/crm/email/tools/EmailExtractorFromWebsite';
import EmailVerifierButton from '@/components/crm/email/tools/EmailVerifierButton';
import { usePermissions } from '@/hooks/usePermissions';
import { filterOutCrmRevenueKeys } from '@/lib/crm/crm-revenue-fields';

interface CRMContactRecordFieldsProps {
  contact: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
  onApplyEmailFromFinder?: (email: string) => void | Promise<void>;
}

function cfGet(obj: Record<string, any>, k: string): unknown {
  const cf = obj.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(k);
  return cf[k];
}

export default function CRMContactRecordFields({
  contact,
  visibleKeys,
  customFieldDefs,
  onApplyEmailFromFinder,
}: CRMContactRecordFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const keys = filterOutCrmRevenueKeys(visibleKeys, canViewCrmRevenue);
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));

  const orgName =
    typeof contact.organization === 'object' && contact.organization?.name
      ? contact.organization.name
      : typeof contact.organization === 'string'
        ? contact.organization
        : '';

  const renderCore = (key: string): React.ReactNode => {
    switch (key) {
      case 'salutation':
        return contact.salutation || '—';
      case 'firstName':
        return contact.firstName || '—';
      case 'lastName':
        return contact.lastName || '—';
      case 'email':
        return contact.email ? (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <a href={`mailto:${contact.email}`} className="text-primary font-medium hover:underline flex items-center gap-2 min-w-0">
              <Mail size={16} className="opacity-60 shrink-0" />
              <span className="truncate" title={contact.email}>{contact.email}</span>
            </a>
            <EmailVerifierButton email={contact.email} />
          </div>
        ) : (
          '—'
        );
      case 'additionalEmails':
        return Array.isArray(contact.additionalEmails) && contact.additionalEmails.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {contact.additionalEmails.map((em: string) => (
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
            {contact.mobileNo || '—'}
          </div>
        );
      case 'phone':
        return (
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-text-muted shrink-0" />
            {contact.phone || '—'}
          </div>
        );
      case 'gender':
        return contact.gender || '—';
      case 'organization':
        return orgName ? (
          <Link
            href={`/crm/organizations?search=${encodeURIComponent(orgName)}`}
            className="text-primary hover:underline flex items-center gap-2 font-medium"
          >
            <Building2 size={16} className="text-text-muted shrink-0" />
            {orgName}
          </Link>
        ) : (
          '—'
        );
      case 'jobTitle':
        return contact.jobTitle || '—';
      case 'source':
        return <div className="break-all">{contact.source || '—'}</div>;
      case 'industry':
        return contact.industry || '—';
      case 'annualRevenue':
        return contact.annualRevenue != null && contact.annualRevenue !== ''
          ? Number(contact.annualRevenue).toLocaleString()
          : '—';
      case 'noOfEmployees':
        return contact.noOfEmployees || '—';
      case 'territory':
        return contact.territory || '—';
      case 'website':
        return contact.website ? (
          <div className="flex flex-wrap gap-2 items-center">
            <a
              href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              {contact.website}
              <ExternalLink size={14} className="opacity-60" />
            </a>
            <EmailExtractorFromWebsite
              websiteUrl={contact.website}
              existingEmail={contact.email}
              onEmailFound={onApplyEmailFromFinder}
            />
          </div>
        ) : (
          '—'
        );
      case 'leadOwner':
        return contact.leadOwner || '—';
      case 'pipeline': {
        const p = contact.pipeline;
        if (p && typeof p === 'object' && p !== null && 'name' in p) {
          return String((p as { name?: string }).name || '—');
        }
        return '—';
      }
      case 'stage':
        return contact.stage || '—';
      case 'status':
        return contact.status || '—';
      case 'converted':
        return contact.converted ? 'Yes' : 'No';
      case 'image':
        return contact.image ? (
          <a
            href={contact.image.startsWith('http') ? contact.image : `https://${contact.image}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm break-all hover:underline"
          >
            {contact.image}
          </a>
        ) : (
          '—'
        );
      case 'linkedinUrl':
        return contact.linkedinUrl ? (
          <div className="flex flex-wrap gap-2 items-center">
            <a
              href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2]/10 text-[#0A66C2] rounded-[var(--radius-md)] text-sm font-bold hover:bg-[#0A66C2]/20 transition-colors"
            >
              <ExternalLink size={16} />
              Open Profile
            </a>
            <a
              href={contact.linkedinUrl.startsWith('http') ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-[var(--radius-md)] text-sm font-bold hover:bg-[#004182] transition-colors"
            >
              <UserPlus size={16} />
              Connect
            </a>
            <EmailFinderFromLinkedIn
              linkedinUrl={contact.linkedinUrl}
              existingEmail={contact.email}
              onEmailFound={onApplyEmailFromFinder}
            />
          </div>
        ) : (
          '—'
        );
      case 'twitterHandle': {
        const x = contactXProfileUrl(contact);
        return x ? (
          <a href={x} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-black hover:underline">
            <ExternalLink size={16} className="opacity-70 shrink-0" />
            @{String(contact.twitterHandle)}
          </a>
        ) : '—';
      }
      case 'telegram': {
        const tg = contactTelegramUrl(contact);
        return tg ? (
          <a
            href={tg}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#229ED9] font-medium hover:underline"
          >
            <ExternalLink size={16} className="opacity-70 shrink-0" />
            Open Telegram
          </a>
        ) : (
          '—'
        );
      }
      case 'address':
        return contact.address || '—';
      case 'createdAt':
        return (
          <div className="flex items-center gap-2 text-text-muted font-medium text-sm">
            <Calendar size={16} className="shrink-0" />
            {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '—'}
          </div>
        );
      default:
        return contact[key] != null && contact[key] !== '' ? String(contact[key]) : '—';
    }
  };

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      return customLabels[fk] || fieldLabel('contacts', key, customLabels);
    }
    const map: Record<string, string> = {
      salutation: 'Salutation',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      additionalEmails: 'Additional emails',
      mobileNo: 'Mobile',
      phone: 'Phone',
      gender: 'Gender',
      organization: 'Company',
      jobTitle: 'Job Title',
      source: 'Lead Source',
      industry: 'Industry',
      annualRevenue: 'Annual Revenue',
      noOfEmployees: 'No. of Employees',
      territory: 'Territory',
      website: 'Website',
      leadOwner: 'Owner',
      pipeline: 'Pipeline',
      stage: 'Stage',
      status: 'Status',
      converted: 'Converted',
      image: 'Image',
      linkedinUrl: 'LinkedIn',
      twitterHandle: 'X (Twitter)',
      telegram: 'Telegram',
      address: 'Address',
      createdAt: 'Created',
    };
    return map[key] || key;
  };

  const rows = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(contact, fk);
      const def = customFieldDefs.find((d) => d.key === fk);
      return (
        <div key={key} className="space-y-1">
          <p className="text-xs font-extrabold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
          <div className="text-sm font-bold text-text-primary min-w-0">
            <CrmCustomFieldValue value={val} type={def?.type} />
          </div>
        </div>
      );
    }
    const span2 = (key === 'linkedinUrl' && contact.linkedinUrl) || (key === 'twitterHandle' && contact.twitterHandle) || (key === 'telegram' && contactTelegramUrl(contact));
    return (
      <div key={key} className={`space-y-1 ${span2 ? 'md:col-span-2' : ''}`}>
        <p className="text-xs font-extrabold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
        <div className="text-sm font-bold text-text-primary break-words">{renderCore(key)}</div>
      </div>
    );
  });

  if (rows.length === 0) {
    return (
      <p className="text-xs font-medium text-text-muted">No properties to display. Use Record view to choose visible fields.</p>
    );
  }

  return <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface-raised p-6 rounded-xl border border-border">{rows}</div>;
}
