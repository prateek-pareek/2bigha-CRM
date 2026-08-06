"use client";

import { X } from 'lucide-react';
import {
  CRMFormItem,
  CRM_HS_LABEL_CLASS,
  CRM_HS_SELECT_CLASS,
  CRM_HS_CONTROL_CLASS,
} from '@/components/crm/crm-form-primitives';
import CrmMultiEmailListField from '@/components/crm/CrmMultiEmailListField';

interface CRMClientFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  organizations: { _id: string; name: string }[];
  variant: 'stack' | 'grid';
  isAdmin?: boolean;
  onDeleteCustom?: (id: string, name: string) => void;
  /** Match create-lead panel (HubSpot-style controls). */
  visualVariant?: 'default' | 'hubspot';
}

const HUBSPOT_SECTION_LABEL: Record<string, string> = {
  contact: 'Contact information',
  company: 'Company',
  client: 'Client details',
  custom: 'Additional properties',
};

function hubspotSectionForClientKey(key: string): keyof typeof HUBSPOT_SECTION_LABEL {
  if (key.startsWith('cf:')) return 'custom';
  if (['name', 'email', 'additionalEmails', 'phone'].includes(key)) return 'contact';
  if (key === 'organization') return 'company';
  if (key === 'status') return 'client';
  return 'client';
}

export default function CRMClientFormFields({
  visibleKeys,
  customFields,
  organizations,
  variant,
  isAdmin,
  onDeleteCustom,
  visualVariant = 'default',
}: CRMClientFormFieldsProps) {
  const vv = visualVariant === 'hubspot' ? 'hubspot' : 'default';
  const orgOptions = [
    { label: 'Select Organization...', value: '' },
    ...organizations.map((o) => ({ label: o.name, value: o._id })),
  ];

  const renderCore = (key: string) => {
    switch (key) {
      case 'name':
        return (
          <CRMFormItem key={key} label="Full name" name="name" required placeholder="Jane Smith" visualVariant={vv} />
        );
      case 'email':
        return (
          <CRMFormItem key={key} label="Email" name="email" type="email" required visualVariant={vv} />
        );
      case 'additionalEmails':
        return (
          <div key={key} className={variant === 'grid' ? 'col-span-2' : ''}>
            <CrmMultiEmailListField visualVariant={vv === 'hubspot' ? 'hubspot' : 'default'} />
          </div>
        );
      case 'phone':
        return <CRMFormItem key={key} label="Phone number" name="phone" type="phone" visualVariant={vv} />;
      case 'status':
        return (
          <CRMFormItem
            key={key}
            label="Status"
            name="status"
            type="select"
            options={['active', 'prospective', 'inactive']}
            defaultValue="active"
            visualVariant={vv}
          />
        );
      case 'organization':
        return (
          <CRMFormItem
            key={key}
            label="Organization"
            name="organization"
            type="select"
            options={orgOptions}
            visualVariant={vv}
          />
        );
      default:
        return null;
    }
  };

  const renderCustomFieldRow = (key: string) => {
    if (!key.startsWith('cf:')) return null;
    const fk = key.slice(3);
    const field = customFields.find((f) => f.key === fk);
    if (!field) return null;
    const labelCls = vv === 'hubspot' ? CRM_HS_LABEL_CLASS : 'text-xs font-black text-text-muted ';
    const selectCls =
      vv === 'hubspot' ? `${CRM_HS_SELECT_CLASS} px-4` : 'w-full bg-card border rounded-[3px] py-2.5 px-4 text-sm outline-none';
    const multiWrapCls =
      vv === 'hubspot'
        ? 'rounded-md border border-[var(--border-color)] bg-white p-3 space-y-2 max-h-[180px] overflow-y-auto'
        : 'rounded-[3px] border bg-card p-3 space-y-2 max-h-[180px] overflow-y-auto';
    const multiLabelCls =
      vv === 'hubspot'
        ? 'flex items-center gap-2.5 cursor-pointer text-sm font-normal text-[var(--text-main)]'
        : 'flex items-center gap-2.5 cursor-pointer text-sm';
    const textAreaCls =
      vv === 'hubspot'
        ? `${CRM_HS_CONTROL_CLASS} min-h-[100px] resize-y`
        : 'w-full bg-card border rounded-[3px] py-3 px-4 text-sm min-h-[100px] outline-none';
    const textInputCls =
      vv === 'hubspot'
        ? `block w-full h-10 rounded-md border border-[var(--border-color)] bg-white text-sm font-normal text-[var(--text-main)] px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/35 placeholder:text-[var(--primary-muted)]`
        : 'w-full bg-card border rounded-[3px] py-2.5 px-4 text-sm outline-none';

    return (
      <div key={key} className={variant === 'grid' && field.type === 'textarea' ? 'col-span-2' : ''}>
        <div className={`flex items-center justify-between ${vv === 'hubspot' ? 'px-0.5 mb-1' : 'px-1 mb-1'}`}>
          <label className={labelCls}>
            {field.name}
            {field.required ? (
              <span className={vv === 'hubspot' ? 'text-[#f2545b] ml-0.5' : ''}>{vv === 'hubspot' ? '*' : ' *'}</span>
            ) : null}
          </label>
          {isAdmin && onDeleteCustom && (
            <button type="button" onClick={() => onDeleteCustom(field._id, field.name)} className="text-slate-300 hover:text-rose-500">
              <X size={11} />
            </button>
          )}
        </div>
        {field.type === 'select' ? (
          <select name={`cf_${field.key}`} required={field.required} className={selectCls}>
            <option value="">Select...</option>
            {field.options?.map((o: string) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : field.type === 'multiselect' ? (
          <div className={multiWrapCls}>
            {field.options?.map((o: string) => (
              <label key={o} className={multiLabelCls}>
                <input type="checkbox" name={`cf_${field.key}`} value={o} className="rounded border-slate-300 text-primary" />
                <span>{o}</span>
              </label>
            ))}
          </div>
        ) : field.type === 'textarea' ? (
          <textarea name={`cf_${field.key}`} required={field.required} className={textAreaCls} />
        ) : (
          <input
            name={`cf_${field.key}`}
            type={field.type === 'url' ? 'url' : field.type}
            required={field.required}
            placeholder={field.type === 'url' ? 'https://…' : undefined}
            className={textInputCls}
          />
        )}
      </div>
    );
  };

  const buildHubspotStackNodes = () => {
    const out: React.ReactNode[] = [];
    let prevSection: string | null = null;
    const pushSectionIfNeeded = (key: string) => {
      const sec = hubspotSectionForClientKey(key);
      if (sec === prevSection) return;
      prevSection = sec;
      out.push(
        <div
          key={`hs-cli-${sec}-${key}`}
          className={out.length === 0 ? 'pb-1' : 'pt-6 mt-2 border-t border-[var(--surface-dim)] pb-1'}
        >
          <h3 className="text-sm font-semibold text-[var(--text-main)] tracking-tight">{HUBSPOT_SECTION_LABEL[sec]}</h3>
        </div>,
      );
    };

    for (const key of visibleKeys) {
      if (key.startsWith('cf:')) {
        pushSectionIfNeeded(key);
        const row = renderCustomFieldRow(key);
        if (row) out.push(row);
        continue;
      }
      pushSectionIfNeeded(key);
      const node = renderCore(key);
      if (node) out.push(node);
    }
    return out;
  };

  const wrapClass = variant === 'grid' ? '' : vv === 'hubspot' ? 'space-y-1' : 'space-y-4';
  const gridClass = variant === 'grid' ? 'grid grid-cols-2 gap-x-6 gap-y-4' : '';

  const flatNodes =
    vv === 'hubspot' && variant === 'stack'
      ? buildHubspotStackNodes()
      : visibleKeys.map((key) => {
          const inner = key.startsWith('cf:') ? renderCustomFieldRow(key) : renderCore(key);
          if (!inner) return null;
          if (variant === 'grid' && (key === 'organization' || key === 'phone' || key === 'email' || key === 'additionalEmails')) {
            return (
              <div key={`wrap-${key}`} className="col-span-2">
                {inner}
              </div>
            );
          }
          return inner;
        });

  if (variant === 'grid') {
    return <div className={gridClass}>{flatNodes}</div>;
  }
  return <div className={wrapClass}>{flatNodes}</div>;
}
