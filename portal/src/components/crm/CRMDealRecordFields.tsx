"use client";

import { Building2, Calendar, DollarSign, User } from 'lucide-react';
import { fieldLabel } from '@/lib/crm/crm-field-layout';
import { CrmCustomFieldValue, type CrmCustomFieldDefLite } from '@/components/crm/CrmCustomFieldValue';
import { usePermissions } from '@/hooks/usePermissions';

interface CRMDealRecordFieldsProps {
  deal: Record<string, any>;
  visibleKeys: string[];
  customFieldDefs: CrmCustomFieldDefLite[];
  pipelineName?: string;
}

function cfGet(deal: Record<string, any>, k: string): unknown {
  const cf = deal.customFields;
  if (!cf) return undefined;
  if (typeof cf.get === 'function') return cf.get(k);
  return cf[k];
}

function orgLabel(deal: Record<string, any>): string {
  const o = deal.organization;
  if (!o) return '—';
  if (typeof o === 'string') return o;
  return o.name || o._id || '—';
}

function contactLabel(deal: Record<string, any>): string {
  const c = deal.contactPerson;
  if (!c) return '—';
  if (typeof c === 'string') return c;
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return name || c.email || c._id || '—';
}

export default function CRMDealRecordFields({
  deal,
  visibleKeys,
  customFieldDefs,
  pipelineName,
}: CRMDealRecordFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const customLabels = Object.fromEntries(customFieldDefs.map((d) => [d.key, d.name]));

  const stageVal = deal.stage || deal.status || '—';
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter(
        (k) =>
          k !== 'dealValue' &&
          k !== 'expectedDealValue' &&
          k !== 'pricingType' &&
          k !== 'contractMonths' &&
          k !== 'currency' &&
          k !== 'exchangeRate',
      );

  const renderCore = (key: string): React.ReactNode => {
    switch (key) {
      case 'title':
        return <span className="font-medium">{deal.title || '—'}</span>;
      case 'pricingType':
        return String(deal.pricingType || '').toLowerCase() === 'monthly'
          ? 'Monthly payment'
          : 'Fixed price';
      case 'contractMonths':
        return deal.contractMonths != null ? String(deal.contractMonths) : '—';
      case 'dealValue':
        const val = Number(deal.dealValue) || Number(deal.expectedDealValue) || 0;
        if (val === 0) return '—';
        const monthly =
          String(deal.pricingType || '').toLowerCase() === 'monthly';
        return `${val.toLocaleString()}${monthly ? ' /mo' : ''}`;
      case 'pipeline':
        return pipelineName || '—';
      case 'stage':
        return stageVal;
      case 'probability':
        return deal.probability != null ? `${deal.probability}%` : '—';
      case 'organization':
        return (
          <div className="flex items-start gap-2">
            <Building2 size={16} className="text-text-muted shrink-0 mt-0.5" />
            <span>{orgLabel(deal)}</span>
          </div>
        );
      case 'contactPerson':
        return (
          <div className="flex items-start gap-2">
            <User size={16} className="text-text-muted shrink-0 mt-0.5" />
            <span>{contactLabel(deal)}</span>
          </div>
        );
      case 'expectedClosureDate':
        return deal.expectedClosureDate
          ? new Date(deal.expectedClosureDate).toLocaleDateString()
          : '—';
      case 'closedDate':
        return deal.closedDate ? new Date(deal.closedDate).toLocaleDateString() : '—';
      case 'nextStep':
        return deal.nextStep || '—';
      case 'expectedDealValue':
        return deal.expectedDealValue != null && deal.expectedDealValue !== ''
          ? String(deal.expectedDealValue)
          : '—';
      case 'dealOwner':
        return deal.dealOwner || '—';
      case 'currency':
        return deal.currency || '—';
      case 'exchangeRate':
        return deal.exchangeRate != null ? String(deal.exchangeRate) : '—';
      case 'createdAt':
        return (
          <div className="flex items-center gap-2 text-text-muted font-medium text-sm">
            <Calendar size={16} className="shrink-0" />
            {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : '—'}
          </div>
        );
      default:
        return deal[key] != null && deal[key] !== '' ? String(deal[key]) : '—';
    }
  };

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      return customLabels[fk] || fieldLabel('deals', key, customLabels);
    }
    const map: Record<string, string> = {
      title: 'Deal Title',
      pricingType: 'Pricing type',
      dealValue:
        String(deal.pricingType || '').toLowerCase() === 'monthly'
          ? 'Monthly amount'
          : 'Amount',
      contractMonths: 'Contract months',
      pipeline: 'Pipeline',
      stage: 'Stage',
      probability: 'Probability',
      organization: 'Organization',
      contactPerson: 'Contact Person',
      expectedClosureDate: 'Expected Close',
      closedDate: 'Closed Date',
      nextStep: 'Next Step',
      expectedDealValue: 'Expected Deal Value',
      dealOwner: 'Deal Owner',
      currency: 'Currency',
      exchangeRate: 'Exchange Rate',
      createdAt: 'Created',
    };
    return map[key] || key;
  };

  const rows = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const val = cfGet(deal, fk);
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
    const highlight = key === 'dealValue';
    return (
      <div key={key} className={`space-y-1 ${key === 'title' ? 'md:col-span-2' : ''}`}>
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{labelFor(key)}</p>
        <div
          className={`text-sm text-text-main font-medium break-words flex items-start gap-2 ${
            highlight ? 'text-lg font-bold text-primary' : ''
          }`}
        >
          {highlight && <DollarSign size={18} className="shrink-0 opacity-60 mt-0.5" />}
          {renderCore(key)}
        </div>
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
