"use client";

import { Mail, Phone, Globe, MapPin, Calendar, Briefcase } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/records/forms/CrmCustomFieldValue';
import { usePermissions } from '@/hooks/usePermissions';

interface CRMOrganizationRecordFieldsProps {
  org: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
}

function cfGet(obj: Record<string, any>, k: string): unknown {
  const cf = obj.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(k);
  return cf[k];
}

export default function CRMOrganizationRecordFields({
  org,
  visibleKeys,
  customFieldDefs,
}: CRMOrganizationRecordFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');

  const renderCore = (key: string): React.ReactNode => {
    switch (key) {
      case 'name':
        return org.name || '—';
      case 'website':
        return org.website ? (
          <a
            href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-2 font-medium"
          >
            <Globe size={16} className="text-text-muted shrink-0" />
            {org.website}
          </a>
        ) : (
          '—'
        );
      case 'annualRevenue':
        return org.annualRevenue !== undefined && org.annualRevenue !== null && org.annualRevenue !== ''
          ? String(org.annualRevenue)
          : '—';
      case 'territory':
        return org.territory ? (
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-text-muted shrink-0" />
            {org.territory}
          </div>
        ) : (
          '—'
        );
      case 'noOfEmployees':
        return org.noOfEmployees ? (
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-text-muted shrink-0" />
            {org.noOfEmployees}
          </div>
        ) : (
          '—'
        );
      case 'industry':
        return org.industry || '—';
      case 'phone':
        return (
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-text-muted shrink-0" />
            {org.phone || '—'}
          </div>
        );
      case 'email':
        return org.email ? (
          <a href={`mailto:${org.email}`} className="text-primary font-medium hover:underline flex items-center gap-2">
            <Mail size={16} className="opacity-60 shrink-0" />
            {org.email}
          </a>
        ) : (
          '—'
        );
      case 'address':
        return org.address || '—';
      case 'createdAt':
        return (
          <div className="flex items-center gap-2 text-text-muted font-medium text-sm">
            <Calendar size={16} className="shrink-0" />
            {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}
          </div>
        );
      default:
        return org[key] != null && org[key] !== '' ? String(org[key]) : '—';
    }
  };

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      return customLabels[fk] || fieldLabel('organizations', key, customLabels);
    }
    const map: Record<string, string> = {
      name: 'Organization Name',
      website: 'Website',
      annualRevenue: 'Annual Revenue',
      territory: 'Territory',
      noOfEmployees: 'No. of Employees',
      industry: 'Industry',
      phone: 'Phone',
      email: 'Email',
      address: 'Address',
      createdAt: 'Created',
    };
    return map[key] || key;
  };

  const rows = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(org, fk);
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
    const span2 = key === 'address' && org.address;
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
