"use client";

import { useCallback, useState, type FocusEvent, type ReactNode } from 'react';
import { X, User, Briefcase, FileText, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  combinePhoneFromForm,
  fetchPersonIdentifierConflicts,
  type PersonIdentifierContext,
} from '@/lib/crm/check-person-identifiers';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
} from '@/lib/crm/phone-country-codes';
import OpportunitySourcePlatformField from '@/components/crm/platform/OpportunitySourcePlatformField';
import CrmMultiEmailListField from '@/components/crm/email/engagement/CrmMultiEmailListField';
import { CrmFormSection, CrmFormGrid } from '@/components/crm/records/forms/crm-form-primitives';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_OPTIONS = ['New', 'Qualified', 'Replied', 'Opportunity'];
const CALL_STATUS_OPTIONS = ['Not Called', 'Completed', 'Missed', 'Busy', 'Failed'];
const LEAD_VERTICAL_OPTIONS: Array<{ value: 'property_listing' | 'property_management'; label: string }> = [
  { value: 'property_listing', label: 'Property Listing' },
  { value: 'property_management', label: 'Property Management' },
];

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

const BUY_LAND_OPTIONS = [
  { value: 'just_exploring', label: 'Just Exploring' },
  { value: 'within_1_month', label: 'Within 1 Month' },
  { value: '1–3_months', label: '1–3 Months' },
  { value: '3–6_months', label: '3–6 Months' },
];

/** CRMS section titles (Add Contact / Add Lead offcanvas) */
const SECTION_LABEL: Record<string, string> = {
  contact: 'Client Information',
  company: 'Company & Service Info',
  lead: 'Lead Information',
  custom: 'Additional Information',
  other: 'Other Details',
};

const SECTION_ICON: Record<string, any> = {
  contact: User,
  company: Briefcase,
  lead: FileText,
  custom: FileText,
  other: FileText,
};

function sectionForKey(key: string): string {
  if (key.startsWith('cf:')) return 'custom';
  if (['salutation', 'firstName', 'lastName', 'role', 'leadCategory', 'email', 'additionalEmails', 'gender', 'mobileNo', 'phone', 'whatsappNumber', 'address', 'state', 'pincode', 'twitterHandle'].includes(key)) return 'contact';
  if (['relatedService'].includes(key)) return 'company';
  if (['leadVertical', 'pipeline', 'stage', 'status', 'callStatus', 'leadOwner', 'source', 'planningToBuyLand', 'group', 'notes'].includes(key)) return 'lead';
  return 'other';
}

/** Control tokens with sleek borders and high-visibility error states */
const LBL = 'mb-1.5 flex items-center justify-between text-[13px] font-medium text-[var(--text-main)]';
const REQ = 'text-rose-500 font-bold ml-1';
const INP_BASE =
  'w-full h-[40px] bg-[var(--card-bg)] border rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] transition-all';
const INP = `${INP_BASE} border-[var(--border-color)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20`;
const INP_ERR = `${INP_BASE} border-rose-500 bg-rose-50/10 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20`;

const SEL_BASE =
  'w-full h-[40px] bg-[var(--card-bg)] border rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] transition-all appearance-none pr-8';
const SEL = `${SEL_BASE} border-[var(--border-color)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20`;
const SEL_ERR = `${SEL_BASE} border-rose-500 bg-rose-50/10 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20`;

/** Fields that span both columns in 2-col layout */
const FULL_WIDTH_KEYS = new Set(['additionalEmails', 'twitterHandle', 'relatedService', 'notes', 'address']);

export interface CRMLeadFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  pipelines: any[];
  selectedPipeline: string;
  setSelectedPipeline: (id: string) => void;
  selectedStage: string;
  setSelectedStage: (s: string) => void;
  /** Which vertical (Property Listing vs Property Management) this lead belongs to — scopes the Pipeline dropdown. */
  leadVertical?: 'property_listing' | 'property_management';
  setLeadVertical?: (v: 'property_listing' | 'property_management') => void;
  variant: 'stack' | 'grid';
  isAdmin?: boolean;
  onDeleteCustom?: (id: string, name: string) => void;
  identifierContext?: PersonIdentifierContext;
  visualVariant?: 'default' | 'hubspot';
  services?: Array<{ _id: string; name: string }>;
  /** Options from /crm/lead-picklist-options?listKey=leadCategory (see Settings > Lead Type & Group). */
  leadCategories?: Array<{ _id: string; label: string }>;
  /** Options from /crm/lead-picklist-options?listKey=group. */
  leadGroups?: Array<{ _id: string; label: string }>;
  errors?: Record<string, string>;
  onClearError?: (field: string) => void;
}

export default function CRMLeadFormFields({
  visibleKeys,
  customFields,
  pipelines,
  selectedPipeline,
  setSelectedPipeline,
  selectedStage,
  setSelectedStage,
  leadVertical = 'property_listing',
  setLeadVertical,
  variant,
  isAdmin,
  onDeleteCustom,
  identifierContext,
  services = [],
  leadCategories = [],
  leadGroups = [],
  errors = {},
  onClearError,
}: CRMLeadFormFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');
  const [idWarnings, setIdWarnings] = useState<Record<string, string>>({});
  const [phoneLengths, setPhoneLengths] = useState<Record<string, number>>({});

  const runIdentifierCheck = useCallback(async (form: HTMLFormElement | null) => {
    if (!identifierContext || !form) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    const fd = new FormData(form);
    const conflicts = await fetchPersonIdentifierConflicts(token, {
      ...identifierContext,
      email: String(fd.get('email') ?? '').trim() || undefined,
      mobileNo: combinePhoneFromForm(fd, 'mobileNo') || undefined,
      phone: combinePhoneFromForm(fd, 'phone') || undefined,
    });
    setIdWarnings({
      email: conflicts.email?.message || '',
      mobileNo: conflicts.mobileNo?.message || '',
      phone: conflicts.phone?.message || '',
    });
  }, [identifierContext]);

  const onBlurId = useCallback((e: FocusEvent<HTMLElement>) => {
    void runIdentifierCheck(e.target.closest('form') as HTMLFormElement);
  }, [runIdentifierCheck]);

  // Pipelines filtered by vertical
  const pipelinesForVertical = pipelines.filter((p) =>
    leadVertical === 'property_management'
      ? p.leadVertical === 'property_management'
      : p.leadVertical === 'property_listing' || !p.leadVertical,
  );
  const currentPipeline = pipelines.find((p) => p._id === selectedPipeline);
  const stageOptions = currentPipeline
    ? [...currentPipeline.stages].sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name)
    : ['New'];

  const handlePhoneInput = (e: React.FormEvent<HTMLInputElement>, fieldName: string) => {
    const target = e.currentTarget;
    const digitsOnly = target.value.replace(/\D/g, '').slice(0, 10);
    target.value = digitsOnly;
    setPhoneLengths((prev) => ({ ...prev, [fieldName]: digitsOnly.length }));
    if (onClearError) onClearError(fieldName);
  };

  const phoneField = (name: string, label: string, required: boolean, warn: string) => {
    const errorMsg = errors[name] || warn;
    const currentLen = phoneLengths[name] ?? 0;

    return (
      <div key={name} className="space-y-1">
        <div className={LBL}>
          <span>
            {label}
            {required && <span className={REQ}>*</span>}
          </span>
          <span className={`text-[11px] font-mono ${currentLen === 10 ? 'text-emerald-600 font-semibold' : 'text-[var(--text-muted)]'}`}>
            {currentLen}/10 digits
          </span>
        </div>
        <div className="relative flex items-center">
          <select
            name={`${name}_countryCode`}
            defaultValue={getDefaultCountryCodeFromPhone(undefined)}
            onBlur={identifierContext ? onBlurId : undefined}
            className="absolute left-0 z-10 w-[5rem] h-[38px] bg-[var(--surface-dim)] text-xs font-medium text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 rounded-l-[var(--radius-md)] appearance-none"
          >
            {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label.split(' ')[0]} {o.value}
              </option>
            ))}
          </select>
          <input
            name={name}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={10}
            onInput={(e) => handlePhoneInput(e, name)}
            onBlur={identifierContext ? onBlurId : undefined}
            className={`${errorMsg ? INP_ERR : INP} pl-[5.5rem] font-mono text-[13px] tracking-wide`}
            placeholder="9876543210"
          />
        </div>
        {errorMsg && (
          <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium animate-fadeIn">
            <AlertCircle size={12} /> {errorMsg}
          </p>
        )}
      </div>
    );
  };

  const renderField = (key: string) => {
    const fieldError = errors[key];

    switch (key) {
      case 'salutation':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Salutation</label>
            <div className="relative">
              <select name="salutation" className={SEL}>
                {['', 'Mr', 'Ms', 'Mrs', 'Dr'].map((o) => (
                  <option key={o} value={o}>
                    {o || 'Select Salutation'}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'firstName':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>
              <span>First Name<span className={REQ}>*</span></span>
            </label>
            <input
              name="firstName"
              type="text"
              placeholder="e.g. Ramesh"
              onChange={() => onClearError?.('firstName')}
              className={fieldError ? INP_ERR : INP}
            />
            {fieldError && (
              <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium">
                <AlertCircle size={12} /> {fieldError}
              </p>
            )}
          </div>
        );
      case 'lastName':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Last Name</label>
            <input name="lastName" type="text" placeholder="e.g. Sharma" className={INP} />
          </div>
        );
      case 'email':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="name@example.com"
              onChange={() => onClearError?.('email')}
              onBlur={identifierContext ? onBlurId : undefined}
              className={fieldError || idWarnings.email ? INP_ERR : INP}
            />
            {(fieldError || idWarnings.email) && (
              <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium">
                <AlertCircle size={12} /> {fieldError || idWarnings.email}
              </p>
            )}
          </div>
        );
      case 'additionalEmails':
        return (
          <div key={key} className="sm:col-span-2">
            <CrmMultiEmailListField />
          </div>
        );
      case 'gender':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Gender</label>
            <div className="relative">
              <select name="gender" className={SEL}>
                {['', 'Male', 'Female', 'Other'].map((o) => (
                  <option key={o} value={o}>
                    {o || 'Select Gender'}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'mobileNo':
        return phoneField('mobileNo', 'Phone Number', true, idWarnings.mobileNo);
      case 'whatsappNumber':
        return phoneField('whatsappNumber', 'WhatsApp Number', false, idWarnings.phone || '');
      case 'phone':
        return phoneField('phone', 'Phone (Alternate)', false, idWarnings.phone);
      case 'address':
        return (
          <div key={key} className="sm:col-span-2 space-y-1">
            <label className={LBL}>Address</label>
            <input name="address" type="text" placeholder="Plot / Street / Area / City" className={INP} />
          </div>
        );
      case 'state':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>State</label>
            <div className="relative">
              <select name="state" defaultValue="" className={SEL}>
                <option value="">Select State</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'pincode':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>PinCode</label>
            <input
              name="pincode"
              type="text"
              placeholder="e.g. 110001"
              maxLength={6}
              className={INP}
            />
          </div>
        );
      case 'role':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>
              <span>Role<span className={REQ}>*</span></span>
            </label>
            <div className="relative">
              <select
                name="role"
                defaultValue="USER"
                onChange={() => onClearError?.('role')}
                className={fieldError ? SEL_ERR : SEL}
              >
                <option value="USER">User</option>
                <option value="AGENT">Real Estate Agent</option>
                <option value="OWNER">Property Owner</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
            {fieldError && (
              <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium">
                <AlertCircle size={12} /> {fieldError}
              </p>
            )}
          </div>
        );
      case 'source':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>
              <span>Lead Source<span className={REQ}>*</span></span>
            </label>
            <div className="relative">
              <select
                name="source"
                defaultValue="Website"
                onChange={() => onClearError?.('source')}
                className={fieldError ? SEL_ERR : SEL}
              >
                <option value="Website">Website</option>
                <option value="Google Lead">Google Lead</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="Referral">Referral</option>
                <option value="Walk In">Walk In</option>
                <option value="Direct Call">Direct Call</option>
                <option value="Other">Other</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
            {fieldError && (
              <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium">
                <AlertCircle size={12} /> {fieldError}
              </p>
            )}
          </div>
        );
      case 'planningToBuyLand':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Planning To Buy Land</label>
            <div className="relative">
              <select name="planningToBuyLand" defaultValue="" className={SEL}>
                <option value="">Select Timeframe</option>
                {BUY_LAND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'twitterHandle':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>X (Twitter) handle</label>
            <input name="twitterHandle" type="text" placeholder="@username" className={INP} />
          </div>
        );
      case 'relatedService':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Related service</label>
            <div className="relative">
              <select name="relatedService" className={SEL}>
                <option value="">Select Service</option>
                {services.map((s) => (
                  <option key={s._id} value={String(s._id)}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'leadOwner':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Lead owner</label>
            <input name="leadOwner" type="text" placeholder="Owner name" className={INP} />
          </div>
        );
      case 'leadVertical':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>
              <span>Lead Vertical<span className={REQ}>*</span></span>
            </label>
            <div className="relative">
              <select
                name="leadVertical"
                value={leadVertical}
                onChange={(e) => setLeadVertical?.(e.target.value as 'property_listing' | 'property_management')}
                className={SEL}
              >
                {LEAD_VERTICAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'pipeline':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Pipeline</label>
            <div className="relative">
              <select
                name="pipeline"
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                className={SEL}
              >
                {pipelinesForVertical.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'stage':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Lead stage</label>
            <div className="relative">
              <select
                name="stage"
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className={SEL}
              >
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'status':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Status (legacy)</label>
            <div className="relative">
              <select name="status" defaultValue={selectedStage || 'New'} className={SEL}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'callStatus':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Call status</label>
            <div className="relative">
              <select name="callStatus" defaultValue="Not Called" className={SEL}>
                {CALL_STATUS_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'leadCategory': {
        const rawOptions = leadCategories.length > 0
          ? leadCategories.map((o) => ({
              _id: o._id,
              label: o.label.toLowerCase() === 'buyer lead' ? 'Buyer' : o.label,
            }))
          : [
              { _id: 'lead', label: 'Lead' },
              { _id: 'buyer', label: 'Buyer' },
              { _id: 'seller', label: 'Seller' },
              { _id: 'reference', label: 'Reference' },
              { _id: 'investor', label: 'Investor' },
            ];

        // Ensure Lead, Buyer, Seller are present
        const labelsSet = new Set(rawOptions.map((o) => o.label.toLowerCase()));
        const categoryOptions = [...rawOptions];
        if (!labelsSet.has('lead')) categoryOptions.unshift({ _id: 'lead-opt', label: 'Lead' });
        if (!labelsSet.has('buyer')) categoryOptions.push({ _id: 'buyer-opt', label: 'Buyer' });
        if (!labelsSet.has('seller')) categoryOptions.push({ _id: 'seller-opt', label: 'Seller' });

        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>
              <span>Lead Type<span className={REQ}>*</span></span>
            </label>
            <div className="relative">
              <select
                name="leadCategory"
                defaultValue="Lead"
                onChange={() => onClearError?.('leadCategory')}
                className={fieldError ? SEL_ERR : SEL}
              >
                {categoryOptions.map((o) => (
                  <option key={o._id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
            {fieldError && (
              <p className="flex items-center gap-1 text-xs text-rose-500 mt-1 font-medium">
                <AlertCircle size={12} /> {fieldError}
              </p>
            )}
          </div>
        );
      }
      case 'group':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Group</label>
            <div className="relative">
              <select name="group" defaultValue="" className={SEL}>
                <option value="">Select Group</option>
                {leadGroups.map((o) => (
                  <option key={o._id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>
        );
      case 'notes':
        return (
          <div key={key} className="space-y-1">
            <label className={LBL}>Notes</label>
            <textarea
              name="notes"
              placeholder="Add details, buyer requirements, budget notes..."
              rows={3}
              className={`${INP} h-auto min-h-[85px] py-2 resize-y`}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const renderCustomField = (key: string) => {
    if (!key.startsWith('cf:')) return null;
    const fk = key.slice(3);
    const field = customFields.find((f) => f.key === fk);
    if (!field) return null;
    const required = field.required && field.name.toLowerCase() !== 'department';

    return (
      <div key={key} className="space-y-1">
        <div className="flex items-center justify-between mb-1">
          <label className={LBL + ' mb-0'}>
            {field.name}
            {required && <span className={REQ}>*</span>}
          </label>
          {isAdmin && onDeleteCustom && (
            <button
              type="button"
              onClick={() => onDeleteCustom(field._id, field.name)}
              className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors"
              title={`Delete "${field.name}"`}
            >
              <X size={11} />
            </button>
          )}
        </div>
        {field.type === 'multiselect' ? (
          <div className="rounded-md border border-[var(--border-color)] bg-white px-3 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
            {(field.options as string[]).map((opt: string) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input type="checkbox" name={`cf_${field.key}`} value={opt} className="rounded border-[var(--border-color)] text-[var(--primary)]" />
                {opt}
              </label>
            ))}
          </div>
        ) : field.type === 'select' ? (
          <div className="relative">
            <select name={`cf_${field.key}`} required={required} className={SEL}>
              {['', ...(field.options || [])].map((o: string) => (
                <option key={o} value={o}>
                  {o || 'Select option'}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>
        ) : field.type === 'textarea' ? (
          <textarea name={`cf_${field.key}`} required={required} className={`${INP} h-auto min-h-[85px] py-2 resize-y`} />
        ) : (
          <input name={`cf_${field.key}`} type={field.type === 'url' ? 'url' : field.type || 'text'} required={required} className={INP} />
        )}
      </div>
    );
  };

  // Grid variant
  if (variant === 'grid') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          {keys.map((key) => (key.startsWith('cf:') ? renderCustomField(key) : renderField(key)))}
        </div>
        <div className="pt-3 border-t border-[var(--border-color)]/80 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary-muted)]">
            Job or freelance portal (optional)
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <OpportunitySourcePlatformField label="Platform" labelClassName={LBL} inputClassName={SEL} />
            <div className="col-span-2">
              <label className={LBL}>Listing or project URL</label>
              <input name="opportunityListingUrl" type="url" placeholder="https://…" className={INP} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Stack / offcanvas — grouping with clear card containers
  const fi = visibleKeys.indexOf('firstName');
  const li = visibleKeys.indexOf('lastName');
  const namePair = fi >= 0 && li >= 0;
  const nameLeader = namePair ? (fi < li ? 'firstName' : 'lastName') : null;
  const SECTION_ORDER = ['contact', 'lead', 'company', 'custom', 'other'];
  const groupedKeys: Record<string, string[]> = {};
  for (const key of keys) {
    if (namePair && (key === 'firstName' || key === 'lastName') && key !== nameLeader) continue;
    const sec = sectionForKey(key === nameLeader ? 'firstName' : key);
    if (!groupedKeys[sec]) groupedKeys[sec] = [];
    groupedKeys[sec].push(key);
  }

  const groups = SECTION_ORDER
    .filter((sec) => groupedKeys[sec]?.length)
    .map((sec) => ({ section: sec, keys: groupedKeys[sec] }));

  const wrapField = (key: string, node: ReactNode) => {
    if (!node) return null;
    if (FULL_WIDTH_KEYS.has(key) || key.startsWith('cf:')) {
      return (
        <div key={key} className="sm:col-span-2">
          {node}
        </div>
      );
    }
    return node;
  };

  return (
    <div className="space-y-4">
      {groups.map((group, index) => {
        const Icon = SECTION_ICON[group.section] || FileText;
        return (
          <CrmFormSection
            key={`${group.section}-${index}`}
            title={
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
                <Icon size={15} className="text-[var(--primary)]" />
                {SECTION_LABEL[group.section] || group.section}
              </span>
            }
            collapsible={false}
          >
            <CrmFormGrid>
              {group.keys.map((key) => {
                if (namePair && key === nameLeader) {
                  return (
                    <div key="name-pair" className="contents">
                      {renderField('firstName')}
                      {renderField('lastName')}
                    </div>
                  );
                }
                const node = key.startsWith('cf:') ? renderCustomField(key) : renderField(key);
                return wrapField(key, node);
              })}
            </CrmFormGrid>
          </CrmFormSection>
        );
      })}
    </div>
  );
}
