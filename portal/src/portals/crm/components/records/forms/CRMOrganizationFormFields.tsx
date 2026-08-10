"use client";

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  CRMFormItem,
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_LABEL_CLASS,
  CRM_HS_CONTROL_CLASS,
} from '@/components/crm/records/forms/crm-form-primitives';
import { usePermissions } from '@/hooks/usePermissions';

const EMPLOYEE_OPTIONS = ['', '1-10', '11-50', '51-200', '201-500', '500+'];

const SECTION_LABEL: Record<string, string> = {
  basic: 'Basic Info',
  contact: 'Contact Info',
  custom: 'Additional Info',
};

function sectionForKey(key: string): string {
  if (key.startsWith('cf:')) return 'custom';
  if (['name', 'website', 'annualRevenue', 'territory', 'noOfEmployees', 'industry'].includes(key)) return 'basic';
  if (['phone', 'email', 'address'].includes(key)) return 'contact';
  return 'basic';
}

interface CRMOrganizationFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  variant: 'stack' | 'grid';
  visualVariant?: 'default' | 'hubspot';
  isAdmin?: boolean;
  onDeleteCustom?: (id: string, name: string) => void;
}

export default function CRMOrganizationFormFields({
  visibleKeys,
  customFields,
  variant,
  visualVariant = 'default',
  isAdmin,
  onDeleteCustom,
}: CRMOrganizationFormFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');

  const renderCore = (key: string) => {
    switch (key) {
      case 'name':
        return <CRMFormItem key={key} label="Organization name" name="name" required visualVariant={visualVariant} fullWidth />;
      case 'website':
        return <CRMFormItem key={key} label="Website" name="website" placeholder="https://..." type="url" visualVariant={visualVariant} />;
      case 'annualRevenue':
        return <CRMFormItem key={key} label="Annual revenue" name="annualRevenue" type="number" placeholder="0.00" visualVariant={visualVariant} />;
      case 'territory':
        return <CRMFormItem key={key} label="Territory" name="territory" visualVariant={visualVariant} />;
      case 'noOfEmployees':
        return (
          <CRMFormItem key={key} label="No. of employees" name="noOfEmployees" type="select" options={EMPLOYEE_OPTIONS} visualVariant={visualVariant} />
        );
      case 'industry':
        return <CRMFormItem key={key} label="Industry" name="industry" visualVariant={visualVariant} />;
      case 'phone':
        return <CRMFormItem key={key} label="Phone" name="phone" type="phone" visualVariant={visualVariant} />;
      case 'email':
        return <CRMFormItem key={key} label="Email" name="email" type="email" visualVariant={visualVariant} />;
      case 'address':
        return <CRMFormItem key={key} label="Address" name="address" visualVariant={visualVariant} fullWidth />;
      default:
        return null;
    }
  };

  const renderCustom = (key: string) => {
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
          <select
            name={`cf_${field.key}`}
            required={field.required}
            className={`${CRM_HS_CONTROL_CLASS} appearance-none cursor-pointer`}
          >
            <option value="">Select...</option>
            {field.options?.map((o: string) => (
              <option key={o} value={o}>{o}</option>
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
          <textarea
            name={`cf_${field.key}`}
            required={field.required}
            className={`${CRM_HS_CONTROL_CLASS} min-h-[100px] h-auto py-2.5 resize-y`}
          />
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
        {keys.map((key) => {
          const node = key.startsWith('cf:') ? renderCustom(key) : renderCore(key);
          if (!node) return null;
          if (key === 'name' || key === 'address') {
            return (
              <div key={key} className="col-span-2">
                {node}
              </div>
            );
          }
          return node;
        })}
      </div>
    );
  }

  const groups: { section: string; keys: string[] }[] = [];
  for (const key of keys) {
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
              const node: ReactNode = key.startsWith('cf:') ? renderCustom(key) : renderCore(key);
              return node;
            })}
          </CrmFormGrid>
        </CrmFormSection>
      ))}
    </div>
  );
}
