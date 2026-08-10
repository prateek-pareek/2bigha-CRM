"use client";

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  CRMFormItem,
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_LABEL_CLASS,
  CRM_HS_SELECT_CLASS,
  CRM_HS_CONTROL_CLASS,
} from '@/components/crm/records/forms/crm-form-primitives';
import CrmMultiEmailListField from '@/components/crm/email/engagement/CrmMultiEmailListField';

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

const SECTION_LABEL: Record<string, string> = {
  contact: 'Basic Info',
  company: 'Company',
  client: 'Client Details',
  custom: 'Additional Info',
};

function sectionForKey(key: string): string {
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
          <div key={key} className="sm:col-span-2">
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

    return (
      <div key={key} className={field.type === 'textarea' || field.type === 'multiselect' ? 'sm:col-span-2' : undefined}>
        <div className="flex items-center justify-between mb-1.5">
          <label className={CRM_HS_LABEL_CLASS}>
            {field.name}
            {field.required ? <span className="text-[var(--primary)] ml-0.5">*</span> : null}
          </label>
          {isAdmin && onDeleteCustom && (
            <button type="button" onClick={() => onDeleteCustom(field._id, field.name)} className="text-slate-300 hover:text-rose-500">
              <X size={11} />
            </button>
          )}
        </div>
        {field.type === 'select' ? (
          <select name={`cf_${field.key}`} required={field.required} className={CRM_HS_SELECT_CLASS}>
            <option value="">Select...</option>
            {field.options?.map((o: string) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : field.type === 'multiselect' ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 space-y-2 max-h-[180px] overflow-y-auto">
            {field.options?.map((o: string) => (
              <label key={o} className="flex items-center gap-2.5 cursor-pointer text-sm font-normal text-[var(--text-main)]">
                <input type="checkbox" name={`cf_${field.key}`} value={o} className="rounded border-[var(--border-color)] text-[var(--primary)]" />
                <span>{o}</span>
              </label>
            ))}
          </div>
        ) : field.type === 'textarea' ? (
          <textarea name={`cf_${field.key}`} required={field.required} className={`${CRM_HS_CONTROL_CLASS} min-h-[100px] h-auto py-2.5 resize-y`} />
        ) : (
          <input
            name={`cf_${field.key}`}
            type={field.type === 'url' ? 'url' : field.type}
            required={field.required}
            placeholder={field.type === 'url' ? 'https://…' : undefined}
            className={CRM_HS_CONTROL_CLASS}
          />
        )}
      </div>
    );
  };

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {visibleKeys.map((key) => {
          const inner = key.startsWith('cf:') ? renderCustomFieldRow(key) : renderCore(key);
          if (!inner) return null;
          if (key === 'organization' || key === 'phone' || key === 'email' || key === 'additionalEmails' || key === 'name') {
            return (
              <div key={`wrap-${key}`} className="col-span-2">
                {inner}
              </div>
            );
          }
          return inner;
        })}
      </div>
    );
  }

  const groups: { section: string; keys: string[] }[] = [];
  for (const key of visibleKeys) {
    const sec = sectionForKey(key);
    const last = groups[groups.length - 1];
    if (last && last.section === sec) last.keys.push(key);
    else groups.push({ section: sec, keys: [key] });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, index) => (
        <CrmFormSection
          key={`${group.section}-${index}`}
          title={SECTION_LABEL[group.section] || group.section}
          defaultOpen={index === 0}
        >
          <CrmFormGrid>
            {group.keys.map((key) => {
              const node: ReactNode = key.startsWith('cf:') ? renderCustomFieldRow(key) : renderCore(key);
              return node;
            })}
          </CrmFormGrid>
        </CrmFormSection>
      ))}
    </div>
  );
}
