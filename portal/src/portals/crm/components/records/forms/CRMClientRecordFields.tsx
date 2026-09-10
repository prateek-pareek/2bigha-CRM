"use client";

import Link from 'next/link';
import { Mail, Phone, Building2, Calendar } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/records/forms/CrmCustomFieldValue';
import { crmRecordChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

/** Fields already shown in the profile card header — skip in the sidebar summary */
const SIDEBAR_SKIP = new Set(['name']);

/** Preferred order for the sidebar summary (mirrors CRMLeadRecordFields) */
const SIDEBAR_ORDER = ['createdAt', 'email', 'additionalEmails', 'phone', 'organization', 'status'];

interface CRMClientRecordFieldsProps {
  client: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
  /** `sidebar` = compact label/value rows for the profile card */
  layout?: 'grid' | 'sidebar';
  /** Hide empty / dash values (recommended for sidebar) */
  hideEmpty?: boolean;
}

function cfGet(obj: Record<string, any>, k: string): unknown {
  const cf = obj.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(k);
  return cf[k];
}

export default function CRMClientRecordFields({
  client,
  visibleKeys,
  customFieldDefs,
  layout = 'grid',
  hideEmpty = false,
}: CRMClientRecordFieldsProps) {
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));

  let keys = visibleKeys;
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
      const val = cfGet(client, key.slice(3));
      if (val == null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }
    switch (key) {
      case 'additionalEmails':
        return Array.isArray(client.additionalEmails) && client.additionalEmails.length > 0;
      case 'createdAt':
        return Boolean(client.createdAt);
      default: {
        const v = client[key];
        if (v == null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        return true;
      }
    }
  };

  if (hideEmpty) {
    keys = keys.filter(hasValue);
  }

  const orgName =
    typeof client.organization === 'object' && client.organization?.name
      ? client.organization.name
      : typeof client.organization === 'string'
        ? client.organization
        : '';

  const renderCore = (key: string): React.ReactNode => {
    switch (key) {
      case 'name':
        return client.name || '—';
      case 'email':
        return client.email ? (
          <a href={`mailto:${client.email}`} className="text-primary font-medium hover:underline flex items-center gap-2 min-w-0">
            <Mail size={16} className="opacity-60 shrink-0" />
            <span className="truncate" title={client.email}>{client.email}</span>
          </a>
        ) : (
          '—'
        );
      case 'additionalEmails':
        return Array.isArray(client.additionalEmails) && client.additionalEmails.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {client.additionalEmails.map((em: string) => (
              <a key={em} href={`mailto:${em}`} className="text-primary font-medium hover:underline">
                {em}
              </a>
            ))}
          </div>
        ) : (
          '—'
        );
      case 'phone':
        return (
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-text-muted shrink-0" />
            {client.phone || '—'}
          </div>
        );
      case 'status':
        return client.status || '—';
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
      case 'createdAt':
        return (
          <div className="flex items-center gap-2 text-text-muted font-medium text-sm">
            <Calendar size={16} className="shrink-0" />
            {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : '—'}
          </div>
        );
      default:
        return client[key] != null && client[key] !== '' ? String(client[key]) : '—';
    }
  };

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      return customLabels[fk] || fieldLabel('clients', key, customLabels);
    }
    const map: Record<string, string> = {
      name: 'Full Name',
      email: 'Email',
      additionalEmails: 'Additional emails',
      phone: 'Phone',
      status: 'Status',
      organization: 'Organization',
      createdAt: 'Created',
    };
    return map[key] || key;
  };

  const rows = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(client, fk);
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
    if (layout === 'sidebar') {
      return (
        <div key={key} className={crmRecordChrome.infoRow}>
          <span className={crmRecordChrome.infoLabel}>{labelFor(key)}</span>
          <div className={crmRecordChrome.infoValue}>{renderCore(key)}</div>
        </div>
      );
    }
    return (
      <div key={key} className="space-y-1">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
        <div className="text-sm text-text-main font-medium break-words">{renderCore(key)}</div>
      </div>
    );
  });

  if (rows.length === 0) {
    return (
      <p className={layout === 'sidebar' ? 'text-sm text-[var(--text-muted)] leading-relaxed' : 'text-sm text-text-muted'}>
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
