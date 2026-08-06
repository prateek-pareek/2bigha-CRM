"use client";

import { useCallback, useState, type FocusEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  combinePhoneFromForm,
  fetchPersonIdentifierConflicts,
  type PersonIdentifierContext,
} from '@/lib/crm/check-person-identifiers';
import { CRM_API_URL } from '@/lib/crm/config';
import SocialPostPreview from '@/components/crm/sales/SocialPostPreview';
import CrmMultiEmailListField from '@/components/crm/email/engagement/CrmMultiEmailListField';
import { CrmFormSection, CrmFormGrid } from '@/components/crm/records/forms/crm-form-primitives';
import { CRM_PHONE_COUNTRY_OPTIONS } from '@/lib/crm/phone-country-codes';
import { usePermissions } from '@/hooks/usePermissions';

const LBL = 'mb-1.5 block text-[13px] font-medium text-[var(--text-main)]';
const INP =
  'w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all';
const SEL =
  'w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none';
const WARN = 'mt-1 text-xs text-[var(--primary)] font-medium';

const EMPLOYEE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];
const STATUS_OPTIONS = ['New', 'Qualified', 'Replied', 'Opportunity'];

const SECTION_LABEL: Record<string, string> = {
  identity: 'Basic Info',
  contact: 'Contact Details',
  company: 'Company Info',
  pipeline: 'Pipeline',
  other: 'Other Info',
  custom: 'Additional Info',
};

function sectionForKey(key: string): string {
  if (key.startsWith('cf:')) return 'custom';
  if (['salutation', 'firstName', 'lastName', 'gender'].includes(key)) return 'identity';
  if (['email', 'additionalEmails', 'mobileNo', 'phone', 'linkedinUrl', 'twitterHandle', 'telegram'].includes(key)) return 'contact';
  if (['organization', 'jobTitle', 'website', 'source', 'industry', 'annualRevenue', 'noOfEmployees', 'territory', 'address'].includes(key)) return 'company';
  if (['pipeline', 'stage', 'status'].includes(key)) return 'pipeline';
  return 'other';
}

interface CRMContactFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  pipelines: any[];
  selectedPipeline: string;
  setSelectedPipeline: (id: string) => void;
  selectedStage: string;
  setSelectedStage: (s: string) => void;
  variant: 'stack' | 'grid';
  visualVariant?: 'default' | 'hubspot';
  organizations?: { _id: string; name: string }[];
  isAdmin?: boolean;
  onDeleteCustom?: (id: string, name: string) => void;
  identifierContext?: PersonIdentifierContext;
}

export default function CRMContactFormFields({
  visibleKeys,
  customFields,
  pipelines,
  selectedPipeline,
  setSelectedPipeline,
  selectedStage,
  setSelectedStage,
  variant,
  organizations = [],
  isAdmin,
  onDeleteCustom,
  identifierContext,
}: CRMContactFormFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');
  const [idWarnings, setIdWarnings] = useState<Record<string, string>>({});
  const [sourceMetadata, setSourceMetadata] = useState<any>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [mobileCountryCode, setMobileCountryCode] = useState('+91');

  const fetchSourceMetadata = useCallback(async (url: string) => {
    if (!url || !url.startsWith('http')) return;
    setIsFetchingMetadata(true);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/fetch-link-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
      if (res.ok) setSourceMetadata(await res.json());
    } catch (err) {
      console.error('[CRMContactFormFields] Failed to fetch source metadata:', err);
    } finally {
      setIsFetchingMetadata(false);
    }
  }, []);

  const runIdentifierCheck = useCallback(
    async (form: HTMLFormElement | null) => {
      if (!identifierContext || !form) return;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return;
      const fd = new FormData(form);
      const email = String(fd.get('email') ?? '').trim();
      const mobileNo = combinePhoneFromForm(fd, 'mobileNo');
      const phone = combinePhoneFromForm(fd, 'phone');
      const linkedinUrl = String(fd.get('linkedinUrl') ?? '').trim();
      const conflicts = await fetchPersonIdentifierConflicts(token, {
        entityType: identifierContext.entityType,
        excludeLeadId: identifierContext.excludeLeadId,
        excludeContactId: identifierContext.excludeContactId,
        email: email || undefined,
        mobileNo: mobileNo || undefined,
        phone: phone || undefined,
        linkedinUrl: linkedinUrl || undefined,
      });
      setIdWarnings({
        email: conflicts.email?.message || '',
        mobileNo: conflicts.mobileNo?.message || '',
        phone: conflicts.phone?.message || '',
        linkedinUrl: conflicts.linkedinUrl?.message || '',
      });
    },
    [identifierContext],
  );

  const onBlurId = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const form = e.target.closest('form');
      void runIdentifierCheck(form as HTMLFormElement);
    },
    [runIdentifierCheck],
  );

  const currentPipeline = pipelines.find((p) => p._id === selectedPipeline);
  const stageOptions = currentPipeline
    ? [...currentPipeline.stages].sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name)
    : ['New'];

  const renderField = (key: string) => {
    switch (key) {
      case 'salutation':
        return (
          <div key={key}>
            <label className={LBL}>Salutation</label>
            <select name="salutation" className={SEL}>
              {['', 'Mr', 'Ms', 'Mrs', 'Dr'].map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
          </div>
        );
      case 'firstName':
        return (
          <div key={key}>
            <label className={LBL}>First name</label>
            <input name="firstName" type="text" placeholder="Jane" className={INP} />
          </div>
        );
      case 'lastName':
        return (
          <div key={key}>
            <label className={LBL}>Last name</label>
            <input name="lastName" type="text" className={INP} />
          </div>
        );
      case 'gender':
        return (
          <div key={key}>
            <label className={LBL}>Gender</label>
            <select name="gender" className={SEL}>
              {['', 'Male', 'Female', 'Other'].map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
          </div>
        );
      case 'email':
        return (
          <div key={key}>
            <label className={LBL}>Email address</label>
            <input
              name="email"
              type="email"
              className={INP}
              onBlur={identifierContext ? onBlurId : undefined}
            />
            {idWarnings.email && <p className={WARN}>{idWarnings.email}</p>}
          </div>
        );
      case 'additionalEmails':
        return (
          <div key={key} className="col-span-2">
            <CrmMultiEmailListField />
          </div>
        );
      case 'mobileNo':
        return (
          <div key={key}>
            <label className={LBL}>Mobile no</label>
            <div className="relative flex items-center">
              <select
                name="mobileNo_countryCode"
                value={mobileCountryCode}
                onChange={(e) => setMobileCountryCode(e.target.value)}
                className="absolute left-0 z-10 w-[7rem] h-9 bg-white text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[3px]"
              >
                {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                name="mobileNo"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="9876543210"
                className={`${INP} pl-[7.5rem]`}
                onChange={(e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); }}
                onBlur={identifierContext ? onBlurId : undefined}
              />
            </div>
            {idWarnings.mobileNo && <p className={WARN}>{idWarnings.mobileNo}</p>}
          </div>
        );
      case 'phone':
        return (
          <div key={key}>
            <label className={LBL}>Phone (alternate)</label>
            <input
              name="phone"
              type="text"
              placeholder="Landline"
              className={INP}
              onBlur={identifierContext ? onBlurId : undefined}
            />
            {idWarnings.phone && <p className={WARN}>{idWarnings.phone}</p>}
          </div>
        );
      case 'linkedinUrl':
        return (
          <div key={key}>
            <label className={LBL}>LinkedIn URL</label>
            <input
              name="linkedinUrl"
              type="text"
              placeholder="https://linkedin.com/in/username"
              className={INP}
              onBlur={identifierContext ? onBlurId : undefined}
            />
            {idWarnings.linkedinUrl && <p className={WARN}>{idWarnings.linkedinUrl}</p>}
          </div>
        );
      case 'twitterHandle':
        return (
          <div key={key}>
            <label className={LBL}>X (Twitter) handle</label>
            <input name="twitterHandle" type="text" placeholder="@username" className={INP} />
          </div>
        );
      case 'telegram':
        return (
          <div key={key}>
            <label className={LBL}>Telegram</label>
            <input name="telegram" type="text" placeholder="@username or +1… (opens t.me)" className={INP} />
          </div>
        );
      case 'organization':
        if (organizations.length > 0) {
          return (
            <div key={key}>
              <label className={LBL}>Company</label>
              <select name="organization" className={SEL}>
                <option value="">Select organization...</option>
                {organizations.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
            </div>
          );
        }
        return (
          <div key={key}>
            <label className={LBL}>Company name</label>
            <input name="organization" type="text" className={INP} />
          </div>
        );
      case 'jobTitle':
        return (
          <div key={key}>
            <label className={LBL}>Job title</label>
            <input name="jobTitle" type="text" className={INP} />
          </div>
        );
      case 'website':
        return (
          <div key={key}>
            <label className={LBL}>Website</label>
            <input name="website" type="text" placeholder="https://..." className={INP} />
          </div>
        );
      case 'source':
        return (
          <div key={key}>
            <label className={LBL}>Lead source</label>
            <input
              name="source"
              type="text"
              placeholder="Paste LinkedIn post URL here to fetch preview..."
              className={INP}
              onBlur={(e) => {
                const val = e.target.value;
                if (val && (val.includes('linkedin.com') || val.includes('threads.com') || val.includes('threads.net') || val.includes('facebook.com') || val.includes('fb.watch'))) void fetchSourceMetadata(val);
              }}
            />
            {isFetchingMetadata && (
              <div className="mt-1.5 text-xs font-semibold text-[var(--hs-link)] animate-pulse flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Fetching post content...
              </div>
            )}
            {sourceMetadata && <SocialPostPreview metadata={sourceMetadata} />}
            <input type="hidden" name="sourceMetadata" value={sourceMetadata ? JSON.stringify(sourceMetadata) : ''} />
          </div>
        );
      case 'industry':
        return (
          <div key={key}>
            <label className={LBL}>Industry</label>
            <input name="industry" type="text" className={INP} />
          </div>
        );
      case 'annualRevenue':
        return (
          <div key={key}>
            <label className={LBL}>Annual revenue</label>
            <input name="annualRevenue" type="number" placeholder="0" className={INP} />
          </div>
        );
      case 'noOfEmployees':
        return (
          <div key={key}>
            <label className={LBL}>No. of employees</label>
            <select name="noOfEmployees" className={SEL}>
              <option value="">—</option>
              {EMPLOYEE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      case 'territory':
        return (
          <div key={key}>
            <label className={LBL}>Territory</label>
            <input name="territory" type="text" className={INP} />
          </div>
        );
      case 'address':
        return (
          <div key={key}>
            <label className={LBL}>Address</label>
            <input name="address" type="text" className={INP} />
          </div>
        );
      case 'leadOwner':
        return (
          <div key={key}>
            <label className={LBL}>Owner</label>
            <input name="leadOwner" type="text" placeholder="Owner name" className={INP} />
          </div>
        );
      case 'pipeline':
        return (
          <div key={key}>
            <label className={LBL}>Pipeline</label>
            <select
              name="pipeline"
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className={SEL}
            >
              {pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        );
      case 'stage':
        return (
          <div key={key}>
            <label className={LBL}>Stage</label>
            <select
              name="stage"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className={SEL}
            >
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      case 'status':
        return (
          <div key={key}>
            <label className={LBL}>Status (legacy)</label>
            <select name="status" defaultValue={selectedStage || 'New'} className={SEL}>
              <option value="">—</option>
              {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
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

    return (
      <div key={key}>
        <div className="flex items-center justify-between mb-1">
          <label className={LBL} style={{ marginBottom: 0 }}>
            {field.name}
            {field.required && field.name.toLowerCase() !== 'department' && (
              <span className="text-[#f2545b] ml-0.5">*</span>
            )}
          </label>
          {isAdmin && onDeleteCustom && (
            <button
              type="button"
              onClick={() => onDeleteCustom(field._id, field.name)}
              className="text-[var(--primary-muted)] hover:text-[#f2545b] transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {field.type === 'select' ? (
          <select name={`cf_${field.key}`} required={field.required} className={SEL}>
            <option value="">Select...</option>
            {field.options?.map((o: string) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field.type === 'multiselect' ? (
          <div className="rounded-md border border-[var(--border-color)] bg-white px-3 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
            {field.options?.map((o: string) => (
              <label key={o} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input type="checkbox" name={`cf_${field.key}`} value={o} className="rounded border-[var(--border-color)] text-[var(--hs-link)] focus:ring-[var(--hs-link)]/30" />
                {o}
              </label>
            ))}
          </div>
        ) : field.type === 'textarea' ? (
          <textarea name={`cf_${field.key}`} required={field.required} className={`${INP} h-auto min-h-[80px] py-2 resize-y`} />
        ) : (
          <input
            name={`cf_${field.key}`}
            type={field.type === 'url' ? 'url' : field.type || 'text'}
            required={field.required}
            placeholder={field.type === 'url' ? 'https://…' : undefined}
            className={INP}
          />
        )}
      </div>
    );
  };

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {keys.map((key) => key.startsWith('cf:') ? renderCustomField(key) : renderField(key))}
      </div>
    );
  }

  // Stack: group under compact section labels
  const groups: { section: string; keys: string[] }[] = [];
  for (const key of keys) {
    const sec = sectionForKey(key);
    const last = groups[groups.length - 1];
    if (last && last.section === sec) {
      last.keys.push(key);
    } else {
      groups.push({ section: sec, keys: [key] });
    }
  }

  return (
    <div className="space-y-3">
      {groups.map((group, index) => (
        <CrmFormSection
          key={group.section}
          title={SECTION_LABEL[group.section]}
          defaultOpen={index === 0}
        >
          <CrmFormGrid>
            {group.keys.map((key, i) => {
              if (key === 'firstName' && group.keys[i + 1] === 'lastName') {
                return (
                  <div key="name-row" className="contents">
                    {renderField('firstName')}
                    {renderField('lastName')}
                  </div>
                );
              }
              if (key === 'lastName' && group.keys[i - 1] === 'firstName') return null;
              const node = key.startsWith('cf:') ? renderCustomField(key) : renderField(key);
              if (key.startsWith('cf:') || key === 'additionalEmails' || key === 'address' || key === 'linkedinUrl') {
                return (
                  <div key={key} className="sm:col-span-2">
                    {node}
                  </div>
                );
              }
              return node;
            })}
          </CrmFormGrid>
        </CrmFormSection>
      ))}
    </div>
  );
}
