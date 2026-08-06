"use client";

import Link from 'next/link';
import { Mail, Phone, Building2, Calendar } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/CrmCustomFieldValue';

interface CRMClientRecordFieldsProps {
  client: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
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
}: CRMClientRecordFieldsProps) {
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));

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

  const rows = visibleKeys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(client, fk);
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
    return (
      <div key={key} className="space-y-1">
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
