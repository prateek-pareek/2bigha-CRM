"use client";

import { useId, useState, type FocusEvent, type ReactNode } from 'react';
import { CrmIcon } from '@/lib/crm/shared/icons';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import { FormDatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

/**
 * CRMS form tokens — Dreams CRMS / Figma Admin Panel kit
 * Labels above fields · 8px radius · red focus · 2-col grids in sections
 * Collapsible accordion sections (offcanvas company form reference)
 */

export const CRM_HS_LABEL_CLASS =
  'mb-1.5 block text-[13px] font-medium text-[var(--text-main)]';
export const CRM_DEFAULT_LABEL_CLASS = CRM_HS_LABEL_CLASS;

/** CRMS form-control height ~38px */
export const CRM_DEFAULT_SELECT_CLASS =
  'w-full h-[38px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-normal text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none transition-[border-color,box-shadow] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/20 appearance-none cursor-pointer';

export const CRM_HS_CONTROL_CLASS =
  'w-full h-[38px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-normal text-[var(--text-main)] shadow-[var(--crm-shadow-input)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/20';

export const CRM_HS_SELECT_CLASS = CRM_DEFAULT_SELECT_CLASS;

const hubspotLabelClass = CRM_HS_LABEL_CLASS;
const hubspotControlBase = CRM_HS_CONTROL_CLASS;
const defaultLabelClass = CRM_DEFAULT_LABEL_CLASS;
const defaultInputClass = CRM_HS_CONTROL_CLASS;

/** CRMS accordion section — collapsible like Dreams offcanvas (Basic Info / Address / …) */
export function CrmFormSection({
  title,
  children,
  className,
  description,
  defaultOpen = true,
  collapsible = true,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  description?: string;
  /** Start expanded (reference opens the first section). */
  defaultOpen?: boolean;
  /** When false, renders a static section header (no toggle). */
  collapsible?: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className={cn('space-y-3', className)}>
        <div className="border-b border-[var(--border-color)] pb-2">
          <div className="flex items-center gap-2.5">
            <span className="h-3.5 w-1 shrink-0 rounded-sm bg-[var(--warning,#ff9f43)]" aria-hidden />
            <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
          </div>
          {description ? (
            <p className="mt-0.5 pl-3.5 text-xs text-[var(--text-muted)] leading-relaxed">{description}</p>
          ) : null}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section
      className={cn(
        'rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden',
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
          'hover:bg-[var(--background)]',
          open && 'bg-[var(--background)]/60',
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--warning-light,#fff0e1)]"
          aria-hidden
        >
          <span className="h-3.5 w-1 rounded-sm bg-[var(--warning,#ff9f43)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--text-main)]">{title}</span>
          {description && open ? (
            <span className="mt-0.5 block text-xs text-[var(--text-muted)] leading-relaxed">{description}</span>
          ) : null}
        </span>
        <CrmIcon.ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-[var(--text-muted)] transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={title}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--border-color)] px-3 py-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Two-column field grid used inside CRMS form sections */
export function CrmFormGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2', className)}>
      {children}
    </div>
  );
}

/** Shared CRM form controls (CRMS offcanvas / create panels). */
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
  fullWidth = false,
}: {
  label: string;
  name: string;
  type?: string;
  options?: any[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string | number;
  errorBelow?: string;
  onBlurField?: (ev: FocusEvent<HTMLElement>) => void;
  /** @deprecated Both variants now use CRMS tokens */
  visualVariant?: 'default' | 'hubspot';
  labelAccessory?: ReactNode;
  /** Span both columns in a CrmFormGrid */
  fullWidth?: boolean;
}) {
  const labelCls = hubspotLabelClass;
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
    <div className={cn('space-y-0', fullWidth && 'sm:col-span-2', className)}>
      <label
        className={`${labelCls} ${labelAccessory ? 'flex items-center justify-between gap-2 w-full' : ''}`}
      >
        <span className="flex items-center gap-0.5 min-w-0">
          {label}
          {required ? <span className="text-[var(--primary)] ml-0.5">*</span> : null}
        </span>
        {labelAccessory ? <span className="shrink-0">{labelAccessory}</span> : null}
      </label>
      {type === 'multiselect' ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 space-y-2 max-h-[200px] overflow-y-auto">
          {(options as string[]).map((opt: string) => (
            <label
              key={opt}
              className="flex items-center gap-2.5 cursor-pointer text-sm font-normal text-[var(--text-main)]"
            >
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={multiDefault.includes(opt)}
                className="rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
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
          className={`${hubspotControlBase} appearance-none cursor-pointer`}
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
          className={`${hubspotControlBase} min-h-[100px] h-auto py-2.5 resize-y`}
          placeholder={placeholder}
        />
      ) : type === 'date' ? (
        <FormDatePicker
          name={name}
          defaultValue={defaultValue as string | number}
          required={required}
          visualVariant="hubspot"
        />
      ) : type === 'phone' ? (
        <div className="flex relative items-center group">
          <select
            name={`${name}_countryCode`}
            defaultValue={getDefaultCountryCodeFromPhone(defaultValue != null ? String(defaultValue) : undefined)}
            onBlur={onBlurField}
            className="absolute left-0 z-10 w-[7rem] sm:w-[7.5rem] h-[38px] bg-[var(--card-bg)] text-sm font-normal text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[var(--radius-md)]"
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
            className="block w-full h-[38px] rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] text-sm font-normal text-[var(--text-main)] pl-[7.25rem] sm:pl-[7.75rem] pr-3 transition-all outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25"
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
          className={hubspotControlBase}
          placeholder={type === 'url' ? 'https://…' : placeholder}
        />
      )}
      {errorBelow ? (
        <p className="text-xs font-medium text-[var(--primary)] pt-1 leading-snug">{errorBelow}</p>
      ) : null}
    </div>
  );
}
