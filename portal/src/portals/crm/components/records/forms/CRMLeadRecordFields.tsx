"use client";

import { Mail, Phone, ExternalLink, MessageCircle, MapPin, Shield, Tag, Compass, Calendar, Layers } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { contactXProfileUrl } from '@/lib/crm/crm-x-messaging';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/records/forms/CrmCustomFieldValue';
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
  'leadOwner', // shown in Owner block below
]);

/** Preferred order for sidebar summary (CRMS Lead Information style) */
const SIDEBAR_ORDER = [
  'createdAt',
  'role',
  'leadCategory',
  'email',
  'additionalEmails',
  'mobileNo',
  'whatsappNumber',
  'phone',
  'address',
  'state',
  'leadVertical',
  'pipeline',
  'stage',
  'status',
  'callStatus',
  'source',
  'group',
  'planningToBuyLand',
  'twitterHandle',
  'relatedService',
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

const BUY_LAND_MAP: Record<string, string> = {
  just_exploring: 'Just Exploring',
  within_1_month: 'Within 1 Month',
  '1–3_months': '1–3 Months',
  '3–6_months': '3–6 Months',
};

const ROLE_MAP: Record<string, string> = {
  USER: 'User',
  AGENT: 'Real Estate Agent',
  OWNER: 'Property Owner',
};

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
      case 'whatsappNumber':
        return Boolean(String(lead.whatsappNumber || '').trim());
      case 'phone':
        return Boolean(String(lead.phone || '').trim());
      case 'twitterHandle':
        return Boolean(String(lead.twitterHandle || '').trim());
      case 'pipeline':
        return Boolean(pipelineName || lead.pipeline);
      case 'createdAt':
        return Boolean(lead.createdAt);
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
      case 'role':
        return lead.role ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            <Shield size={11} /> {ROLE_MAP[lead.role] || lead.role}
          </span>
        ) : '—';
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
          <a href={`tel:${lead.mobileNo}`} className={compact ? 'hover:underline text-[var(--primary)] font-medium' : 'flex items-center gap-2 text-[var(--primary)] font-medium'}>
            {!compact ? <Phone size={16} className="text-text-muted shrink-0" /> : null}
            {lead.mobileNo}
          </a>
        ) : (
          '—'
        );
      case 'whatsappNumber':
        return lead.whatsappNumber ? (
          <a
            href={`https://wa.me/${String(lead.whatsappNumber).replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className={compact ? 'inline-flex items-center gap-1 text-emerald-600 font-medium hover:underline' : 'flex items-center gap-2 text-emerald-600 font-medium hover:underline'}
          >
            <MessageCircle size={15} className="shrink-0" />
            {lead.whatsappNumber}
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
      case 'address':
        return lead.address || '—';
      case 'state':
        return lead.state || '—';
      case 'leadVertical':
        return lead.leadVertical === 'property_management' ? 'Property Management' : 'Property Listing';
      case 'leadCategory':
        return lead.leadCategory ? (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
            <Tag size={11} /> {lead.leadCategory}
          </span>
        ) : '—';
      case 'source':
        return lead.source ? (
          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
            {lead.source}
          </span>
        ) : '—';
      case 'group':
        return lead.group ? (
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {lead.group}
          </span>
        ) : '—';
      case 'planningToBuyLand':
        return lead.planningToBuyLand ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
            <Compass size={11} /> {BUY_LAND_MAP[lead.planningToBuyLand] || lead.planningToBuyLand}
          </span>
        ) : '—';
      case 'firstCallResponse':
        return lead.firstCallResponse || '—';
      case 'currentSubscriptionPlan':
        return lead.currentSubscriptionPlan || '—';
      case 'lastCallAt':
        return lead.lastCallAt
          ? new Date(lead.lastCallAt).toLocaleString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';
      case 'callbackScheduledAt':
        return lead.callbackScheduledAt
          ? new Date(lead.callbackScheduledAt).toLocaleString(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';
      case 'twitterHandle': {
        const x = contactXProfileUrl(lead);
        return x ? (
          <a href={x} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-black hover:underline">
            <ExternalLink size={compact ? 13 : 16} className="opacity-70 shrink-0" />
            @{String(lead.twitterHandle)}
          </a>
        ) : '—';
      }
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
      case 'notes':
        return lead.notes || '—';
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
      role: 'Role',
      email: 'Email',
      additionalEmails: 'Additional emails',
      mobileNo: 'Phone',
      whatsappNumber: 'WhatsApp',
      phone: 'Phone (alternate)',
      address: 'Address',
      state: 'State',
      leadVertical: 'Lead Vertical',
      leadCategory: 'Lead Type',
      source: 'Lead Source',
      group: 'Group',
      planningToBuyLand: 'Planning To Buy Land',
      firstCallResponse: 'First Call Response',
      lastCallAt: 'Last Call Date',
      callbackScheduledAt: 'Callback Schedule Date',
      currentSubscriptionPlan: 'Subscription Plan',
      twitterHandle: 'X (Twitter)',
      relatedService: 'Related service',
      leadOwner: 'Lead Owner',
      pipeline: 'Pipeline',
      stage: 'Stage',
      status: 'Status',
      callStatus: 'Call Status',
      notes: 'Notes',
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
    const span2 = ['twitterHandle', 'address', 'notes'].includes(key) && lead[key];
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
