"use client";

import { X } from 'lucide-react';
import { CRMFormItem, CRM_HS_LABEL_CLASS, CRM_HS_CONTROL_CLASS } from '@/components/crm/crm-form-primitives';
import { usePermissions } from '@/hooks/usePermissions';

const EMPLOYEE_OPTIONS = ['', '1-10', '11-50', '51-200', '201-500', '500+'];

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
  const hs = visualVariant === 'hubspot';

  const renderCore = (key: string) => {
    switch (key) {
      case 'name':
        return <CRMFormItem key={key} label="Organization name" name="name" required visualVariant={visualVariant} />;
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
        return <CRMFormItem key={key} label="Address" name="address" visualVariant={visualVariant} />;
      default:
        return null;
    }
  };

  const nodes = keys.map((key) => {
    if (key.startsWith('cf:')) {
      const fk = key.slice(3);
      const field = customFields.find((f) => f.key === fk);
      if (!field) return null;
      return (
        <div key={key} className={variant === 'grid' && field.type === 'textarea' ? 'col-span-2' : ''}>
          <div className="flex items-center justify-between mb-1.5">
            <label className={hs ? CRM_HS_LABEL_CLASS : 'text-xs font-black text-text-muted  px-1'}>
              {field.name}
              {field.required && (hs ? <span className="text-[#f2545b] ml-0.5">*</span> : <span className="text-rose-600 ml-0.5"> *</span>)}
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
              className={hs
                ? `${CRM_HS_CONTROL_CLASS} h-10 appearance-none cursor-pointer`
                : 'w-full bg-card border border-[#dfe1e6] rounded-[3px] py-2.5 px-4 text-sm outline-none'}
            >
              <option value="">Select...</option>
              {field.options?.map((o: string) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : field.type === 'multiselect' ? (
            <div className={hs
              ? 'rounded-md border border-[var(--border-color)] bg-white p-3 space-y-2 max-h-[180px] overflow-y-auto'
              : 'rounded-[3px] border bg-card p-3 space-y-2 max-h-[180px] overflow-y-auto'}
            >
              {field.options?.map((o: string) => (
                <label key={o} className={`flex items-center gap-2.5 cursor-pointer ${hs ? 'text-sm font-normal text-[var(--text-main)]' : 'text-sm'}`}>
                  <input type="checkbox" name={`cf_${field.key}`} value={o} className="rounded border-slate-300 text-primary" />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          ) : field.type === 'textarea' ? (
            <textarea
              name={`cf_${field.key}`}
              required={field.required}
              className={hs
                ? `${CRM_HS_CONTROL_CLASS} min-h-[100px] resize-y`
                : 'w-full bg-card border rounded-[3px] py-3 px-4 text-sm min-h-[100px] outline-none'}
            />
          ) : (
            <input
              name={`cf_${field.key}`}
              type={field.type === 'url' ? 'url' : field.type}
              required={field.required}
              placeholder={field.type === 'url' ? 'https://…' : undefined}
              className={hs
                ? `${CRM_HS_CONTROL_CLASS} h-10`
                : 'w-full bg-card border rounded-[3px] py-2.5 px-4 text-sm outline-none'}
            />
          )}
        </div>
      );
    }
    const node = renderCore(key);
    if (key === 'name' && variant === 'grid') {
      return (
        <div key={key} className="col-span-2">
          {node}
        </div>
      );
    }
    if (key === 'address' && variant === 'grid') {
      return (
        <div key={key} className="col-span-2">
          {node}
        </div>
      );
    }
    return node;
  });

  if (variant === 'grid') {
    return <div className="grid grid-cols-2 gap-x-5 gap-y-4">{nodes}</div>;
  }
  return <div className="space-y-4">{nodes}</div>;
}
