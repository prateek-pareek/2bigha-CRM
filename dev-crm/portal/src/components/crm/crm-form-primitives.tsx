"use client";

import type { FocusEvent, ReactNode } from 'react';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import { FormDatePicker } from '@/components/ui/date-picker';

/** HubSpot-style form tokens — shared by ClientModal, CRMClientFormFields, CRMFormItem. */
export const CRM_HS_LABEL_CLASS =
  'text-xs font-semibold text-[#5e6c84] px-0.5';
export const CRM_DEFAULT_LABEL_CLASS =
  'text-xs font-semibold text-[#5e6c84]';
const defaultLabelClass = CRM_DEFAULT_LABEL_CLASS;

/** Jira-aligned select on CRM forms */
export const CRM_DEFAULT_SELECT_CLASS =
  'w-full h-8 rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-normal text-[#172b4d] outline-none focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30 transition-colors appearance-none cursor-pointer';

export const CRM_HS_CONTROL_CLASS =
  'w-full h-8 rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-normal text-[#172b4d] outline-none transition-[border-color,box-shadow] placeholder:text-[#97a0af] focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30';

/** Full-width select matching Jira / lead panel */
export const CRM_HS_SELECT_CLASS =
  'block w-full h-8 rounded-[3px] border border-[#dfe1e6] bg-white text-sm font-normal text-[#172b4d] px-3 outline-none cursor-pointer focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30';

const hubspotLabelClass = CRM_HS_LABEL_CLASS;
const hubspotControlBase = CRM_HS_CONTROL_CLASS;
const defaultInputClass =
  'w-full h-8 rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-normal text-[#172b4d] outline-none transition-[border-color,box-shadow] placeholder:text-[#97a0af] focus-visible:border-[#0c66e4] focus-visible:ring-1 focus-visible:ring-[#0c66e4]/30';

/** Shared CRM form controls (matches QuickAddModal / EditModal styling). */
export function CRMFormItem({
  label,
  name,
  type = 'text',
  options = [],
  placeholder = '',
  required = false,
  className = '',
  defaultValue = '',
  errorBelow = '',
  onBlurField,
  visualVariant = 'default',
  labelAccessory,
}: {
  label: string;
  name: string;
  type?: string;
  options?: any[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string | number;
  /** Inline validation (e.g. duplicate identifier). */
  errorBelow?: string;
  onBlurField?: (ev: FocusEvent<HTMLElement>) => void;
  /** HubSpot-style labels and inputs (lead create panel). */
  visualVariant?: 'default' | 'hubspot';
  /** Rendered on the same row as the label (e.g. admin delete on custom fields). */
  labelAccessory?: ReactNode;
}) {
  const hs = visualVariant === 'hubspot';
  const labelCls = hs ? hubspotLabelClass : defaultLabelClass;
  const selectOptions =
    type === 'select' && options?.length
      ? options.includes(defaultValue) || defaultValue === '' || defaultValue === undefined
        ? options
        : [defaultValue, ...options]
      : options;

  const multiDefault =
    Array.isArray(defaultValue)
      ? defaultValue
      : typeof defaultValue === 'string' && defaultValue
        ? defaultValue.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

  return (
    <div className={`${hs ? 'space-y-1.5' : 'space-y-1'} ${className}`}>
      <label
        className={`${labelCls} ${labelAccessory ? 'flex items-center justify-between gap-2 w-full' : ''}`}
      >
        <span className="flex items-center gap-0.5 min-w-0">
          {label}
          {required ? (
            hs ? (
              <span className="text-[#f2545b] ml-0.5">*</span>
            ) : (
              <span className="text-rose-600 ml-0.5">*</span>
            )
          ) : null}
        </span>
        {labelAccessory ? <span className="shrink-0">{labelAccessory}</span> : null}
      </label>
      {type === 'multiselect' ? (
        <div
          className={
            hs
              ? 'rounded-md border border-[var(--border-color)] bg-white p-3 space-y-2 max-h-[200px] overflow-y-auto'
              : 'rounded-[3px] border border-[#dfe1e6] bg-card p-3 space-y-2 max-h-[200px] overflow-y-auto'
          }
        >
          {(options as string[]).map((opt: string) => (
            <label
              key={opt}
              className={`flex items-center gap-2.5 cursor-pointer ${hs ? 'text-sm font-normal text-[var(--text-main)]' : 'text-sm font-medium text-text-main'}`}
            >
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={multiDefault.includes(opt)}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : type === 'select' ? (
        <select
          name={name}
          required={required}
          defaultValue={defaultValue as string}
          onBlur={onBlurField}
          className={hs ? `${hubspotControlBase} h-10 appearance-none cursor-pointer` : CRM_DEFAULT_SELECT_CLASS}
        >
          {selectOptions.map((opt: any) => {
            const v = typeof opt === 'string' ? opt : opt.value;
            const lab = typeof opt === 'string' ? (opt === '' ? '—' : opt) : opt.label;
            return (
              <option key={String(v) + lab} value={v}>
                {lab}
              </option>
            );
          })}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          name={name}
          required={required}
          defaultValue={defaultValue as string}
          onBlur={onBlurField}
          className={
            hs
              ? `${hubspotControlBase} min-h-[100px] resize-y`
              : 'w-full bg-card border border-[#dfe1e6] rounded-[3px] py-3 px-4 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px]'
          }
          placeholder={placeholder}
        />
      ) : type === 'date' ? (
        <FormDatePicker
          name={name}
          defaultValue={defaultValue as string | number}
          required={required}
          visualVariant={hs ? 'hubspot' : 'default'}
        />
      ) : type === 'phone' ? (
        <div className="flex relative items-center group">
          <select
            name={`${name}_countryCode`}
            defaultValue={getDefaultCountryCodeFromPhone(defaultValue != null ? String(defaultValue) : undefined)}
            onBlur={onBlurField}
            className={
              hs
                ? 'absolute left-0 z-10 w-[7rem] sm:w-[7.5rem] h-10 bg-white text-sm font-normal text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[3px]'
                : 'absolute left-1 z-10 w-[7.25rem] sm:w-[8rem] h-10 bg-transparent text-xs sm:text-sm font-bold text-text-main outline-none cursor-pointer border-r border-[#dfe1e6] pl-1 pr-0.5 appearance-none hover:bg-slate-100 rounded-l-xl transition-colors'
            }
          >
            {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            name={name}
            type="tel"
            pattern="[0-9]*"
            required={required}
            defaultValue={getNationalDigitsFromPhone(defaultValue != null ? String(defaultValue) : undefined)}
            onBlur={onBlurField}
            onInput={(e) => {
              const target = e.target as HTMLInputElement;
              target.value = target.value.replace(/[^0-9]/g, '');
            }}
            className={
              hs
                ? `block w-full rounded-md border border-[var(--border-color)] bg-white text-sm font-normal text-[var(--text-main)] h-10 pl-[7.25rem] sm:pl-[7.75rem] pr-3 transition-all outline-none placeholder:text-[var(--primary-muted)] focus:border-primary focus:ring-1 focus:ring-primary/35`
                : 'block w-full rounded-[3px] border-[#dfe1e6] bg-card text-sm font-medium text-text-main focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-11 border pl-[8.45rem] sm:pl-[8.8rem] pr-4 transition-all outline-none'
            }
            placeholder={placeholder || '9876543210'}
          />
        </div>
      ) : (
        <input
          name={name}
          type={type === 'url' ? 'url' : type}
          required={required}
          defaultValue={defaultValue as string | number}
          onBlur={onBlurField}
          className={hs ? `${hubspotControlBase} h-10` : defaultInputClass}
          placeholder={type === 'url' ? 'https://…' : placeholder}
        />
      )}
      {errorBelow ? (
        <p
          className={
            hs
              ? 'text-sm font-normal text-[#f2545b] pt-0.5 leading-snug'
              : 'text-xs font-semibold text-rose-600 px-1 pt-0.5 leading-snug'
          }
        >
          {errorBelow}
        </p>
      ) : null}
    </div>
  );
}
