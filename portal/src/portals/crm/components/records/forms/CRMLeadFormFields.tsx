"use client";

import { useCallback, useState, type FocusEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  combinePhoneFromForm,
  fetchPersonIdentifierConflicts,
  type PersonIdentifierContext,
} from '@/lib/crm/check-person-identifiers';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import { CRM_API_URL } from '@/lib/crm/config';
import OpportunitySourcePlatformField from '@/components/crm/platform/OpportunitySourcePlatformField';
import SocialPostPreview from '@/components/crm/sales/SocialPostPreview';
import CrmMultiEmailListField from '@/components/crm/email/engagement/CrmMultiEmailListField';
import { CrmFormSection, CrmFormGrid } from '@/components/crm/records/forms/crm-form-primitives';
import { usePermissions } from '@/hooks/usePermissions';

const EMPLOYEE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];
const STATUS_OPTIONS = ['New', 'Qualified', 'Replied', 'Opportunity'];
const CALL_STATUS_OPTIONS = ['Not Called', 'Completed', 'Missed', 'Busy', 'Failed'];

/** CRMS section titles (Add Contact / Add Lead offcanvas) */
const SECTION_LABEL: Record<string, string> = {
  contact: 'Basic Info',
  company: 'Company Info',
  lead: 'Lead Info',
  custom: 'Additional Info',
  other: 'Other Info',
};

function sectionForKey(key: string): string {
  if (key.startsWith('cf:')) return 'custom';
  if (['salutation', 'firstName', 'lastName', 'email', 'additionalEmails', 'gender', 'mobileNo', 'phone', 'linkedinUrl', 'twitterHandle'].includes(key)) return 'contact';
  if (['organization', 'jobTitle', 'website', 'industry', 'annualRevenue', 'noOfEmployees', 'territory', 'relatedService'].includes(key)) return 'company';
  if (['source', 'pipeline', 'stage', 'status', 'callStatus', 'leadOwner', 'leadCategory', 'group', 'notes'].includes(key)) return 'lead';
  return 'other';
}

/** CRMS offcanvas control tokens — labels above, 38px controls, red focus */
const LBL = 'mb-1.5 block text-[13px] font-medium text-[var(--text-main)]';
const REQ = 'text-[var(--primary)]';
const INP =
  'w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all';
const SEL =
  'w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none';

/** Fields that span both columns in CRMS 2-col layout */
const FULL_WIDTH_KEYS = new Set(['additionalEmails', 'linkedinUrl', 'twitterHandle', 'website', 'relatedService', 'notes']);

interface CRMLeadFormFieldsProps {
  visibleKeys: string[];
  customFields: any[];
  pipelines: any[];
  selectedPipeline: string;
  setSelectedPipeline: (id: string) => void;
  selectedStage: string;
  setSelectedStage: (s: string) => void;
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
}

export default function CRMLeadFormFields({
  visibleKeys,
  customFields,
  pipelines,
  selectedPipeline,
  setSelectedPipeline,
  selectedStage,
  setSelectedStage,
  variant,
  isAdmin,
  onDeleteCustom,
  identifierContext,
  services = [],
  leadCategories = [],
  leadGroups = [],
}: CRMLeadFormFieldsProps) {
  const { canViewCrmRevenue } = usePermissions();
  const keys = canViewCrmRevenue
    ? visibleKeys
    : visibleKeys.filter((k) => k !== 'annualRevenue');
  const [idWarnings, setIdWarnings] = useState<Record<string, string>>({});
  const [sourceMetadata, setSourceMetadata] = useState<any>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

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
      console.error('[CRMLeadFormFields] fetch-link-metadata failed:', err);
    } finally {
      setIsFetchingMetadata(false);
    }
  }, []);

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
      linkedinUrl: String(fd.get('linkedinUrl') ?? '').trim() || undefined,
    });
    setIdWarnings({
      email: conflicts.email?.message || '',
      mobileNo: conflicts.mobileNo?.message || '',
      phone: conflicts.phone?.message || '',
      linkedinUrl: conflicts.linkedinUrl?.message || '',
    });
  }, [identifierContext]);

  const onBlurId = useCallback((e: FocusEvent<HTMLElement>) => {
    void runIdentifierCheck(e.target.closest('form') as HTMLFormElement);
  }, [runIdentifierCheck]);

  const currentPipeline = pipelines.find((p) => p._id === selectedPipeline);
  const stageOptions = currentPipeline
    ? [...currentPipeline.stages].sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name)
    : ['New'];

  const phoneField = (name: string, label: string, warn: string) => (
    <div key={name}>
      <label className={LBL}>{label}</label>
      <div className="relative flex items-center">
        <select
          name={`${name}_countryCode`}
          defaultValue={getDefaultCountryCodeFromPhone(undefined)}
          onBlur={identifierContext ? onBlurId : undefined}
          className="absolute left-0 z-10 w-[7rem] h-9 bg-white text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[3px]"
        >
          {CRM_PHONE_COUNTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          name={name}
          type="tel"
          pattern="[0-9]*"
          onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''); }}
          onBlur={identifierContext ? onBlurId : undefined}
          className={`${INP} pl-[7.5rem]`}
          placeholder="9876543210"
        />
      </div>
      {warn && <p className="text-xs text-[#f2545b] mt-0.5">{warn}</p>}
    </div>
  );

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
            <label className={LBL}>First name<span className={REQ}>*</span></label>
            <input name="firstName" type="text" required placeholder="Jane" className={INP} />
          </div>
        );
      case 'lastName':
        return (
          <div key={key}>
            <label className={LBL}>Last name</label>
            <input name="lastName" type="text" placeholder="Doe" className={INP} />
          </div>
        );
      case 'email':
        return (
          <div key={key}>
            <label className={LBL}>Email</label>
            <input name="email" type="email" placeholder="email@example.com" onBlur={identifierContext ? onBlurId : undefined} className={INP} />
            {idWarnings.email && <p className="text-xs text-[#f2545b] mt-0.5">{idWarnings.email}</p>}
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
          <div key={key}>
            <label className={LBL}>Gender</label>
            <select name="gender" className={SEL}>
              {['', 'Male', 'Female', 'Other'].map((o) => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
          </div>
        );
      case 'mobileNo':
        return phoneField('mobileNo', 'Phone number', idWarnings.mobileNo);
      case 'phone':
        return phoneField('phone', 'Phone number (alternate)', idWarnings.phone);
      case 'organization':
        return (
          <div key={key}>
            <label className={LBL}>Company name</label>
            <input name="organization" type="text" placeholder="Acme Inc." className={INP} />
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
            <label className={LBL}>Website URL</label>
            <input name="website" type="url" placeholder="https://..." className={INP} />
          </div>
        );
      case 'linkedinUrl':
        return (
          <div key={key}>
            <label className={LBL}>LinkedIn profile</label>
            <input name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/..." onBlur={identifierContext ? onBlurId : undefined} className={INP} />
            {idWarnings.linkedinUrl && <p className="text-xs text-[#f2545b] mt-0.5">{idWarnings.linkedinUrl}</p>}
          </div>
        );
      case 'twitterHandle':
        return (
          <div key={key}>
            <label className={LBL}>X (Twitter) handle</label>
            <input name="twitterHandle" type="text" placeholder="@username" className={INP} />
          </div>
        );
      case 'source':
        return (
          <div key={key}>
            <label className={LBL}>Lead source</label>
            <input
              name="source"
              type="text"
              placeholder="Paste LinkedIn, Threads or Facebook post URL..."
              className={INP}
              onBlur={(e) => {
                let val = e.target.value.trim();
                // If user pasted a full <iframe ...> embed code, extract the src URL
                const iframeSrc = val.match(/src=["']([^"']+)["']/);
                if (iframeSrc) {
                  val = iframeSrc[1];
                  e.target.value = val;
                }
                if (
                  val.includes('linkedin.com') ||
                  val.includes('threads.com') ||
                  val.includes('threads.net') ||
                  val.includes('facebook.com') ||
                  val.includes('fb.watch')
                ) void fetchSourceMetadata(val);
              }}
            />
            {isFetchingMetadata && (
              <div className="mt-1 text-xs font-bold text-primary animate-pulse flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary" /> Fetching post preview...
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
            <label className={LBL}>Number of employees</label>
            <select name="noOfEmployees" className={SEL}>
              {['', ...EMPLOYEE_OPTIONS].map((o) => <option key={o} value={o}>{o || '—'}</option>)}
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
      case 'relatedService':
        return (
          <div key={key}>
            <label className={LBL}>Related service</label>
            <select name="relatedService" className={SEL}>
              <option value="">—</option>
              {services.map((s) => <option key={s._id} value={String(s._id)}>{s.name}</option>)}
            </select>
          </div>
        );
      case 'leadOwner':
        return (
          <div key={key}>
            <label className={LBL}>Lead owner</label>
            <input name="leadOwner" type="text" placeholder="Owner name" className={INP} />
          </div>
        );
      case 'pipeline':
        return (
          <div key={key}>
            <label className={LBL}>Pipeline</label>
            <select name="pipeline" value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)} className={SEL}>
              {pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        );
      case 'stage':
        return (
          <div key={key}>
            <label className={LBL}>Lead stage</label>
            <select name="stage" value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className={SEL}>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        );
      case 'status':
        return (
          <div key={key}>
            <label className={LBL}>Status (legacy)</label>
            <select name="status" defaultValue={selectedStage || 'New'} className={SEL}>
              {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      case 'callStatus':
        return (
          <div key={key}>
            <label className={LBL}>Call status</label>
            <select name="callStatus" defaultValue="Not Called" className={SEL}>
              {CALL_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
      case 'leadCategory':
        return (
          <div key={key}>
            <label className={LBL}>Lead Type</label>
            <select name="leadCategory" defaultValue="" className={SEL}>
              <option value="">Select Type</option>
              {leadCategories.map((o) => <option key={o._id} value={o.label}>{o.label}</option>)}
            </select>
          </div>
        );
      case 'group':
        return (
          <div key={key}>
            <label className={LBL}>Group</label>
            <select name="group" defaultValue="" className={SEL}>
              <option value="">Select Group</option>
              {leadGroups.map((o) => <option key={o._id} value={o.label}>{o.label}</option>)}
            </select>
          </div>
        );
      case 'notes':
        return (
          <div key={key}>
            <label className={LBL}>Note</label>
            <textarea name="notes" placeholder="Add a new note..." rows={3} className={`${INP} h-auto min-h-[80px] py-2 resize-y`} />
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
      <div key={key}>
        <div className="flex items-center justify-between mb-1">
          <label className={LBL + ' mb-0'}>
            {field.name}{required && <span className={`${REQ} ml-0.5`}>*</span>}
          </label>
          {isAdmin && onDeleteCustom && (
            <button type="button" onClick={() => onDeleteCustom(field._id, field.name)} className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-colors" title={`Delete "${field.name}"`}>
              <X size={11} />
            </button>
          )}
        </div>
        {field.type === 'multiselect' ? (
          <div className="rounded-md border border-[var(--border-color)] bg-white px-3 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
            {(field.options as string[]).map((opt: string) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                <input type="checkbox" name={`cf_${field.key}`} value={opt} className="rounded border-[var(--border-color)]" />
                {opt}
              </label>
            ))}
          </div>
        ) : field.type === 'select' ? (
          <select name={`cf_${field.key}`} required={required} className={SEL}>
            {['', ...(field.options || [])].map((o: string) => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea name={`cf_${field.key}`} required={required} className={`${INP} h-auto min-h-[80px] py-2 resize-y`} />
        ) : (
          <input name={`cf_${field.key}`} type={field.type === 'url' ? 'url' : field.type || 'text'} required={required} className={INP} />
        )}
      </div>
    );
  };

  // Grid variant
  if (variant === 'grid') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {keys.map((key) => (key.startsWith('cf:') ? renderCustomField(key) : renderField(key)))}
        </div>
        <div className="pt-2 border-t border-[var(--border-color)]/80 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary-muted)]">
            Job or freelance portal (optional)
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <OpportunitySourcePlatformField
              label="Platform"
              labelClassName={LBL}
              inputClassName={SEL}
            />
            <div className="col-span-2">
              <label className={LBL}>Listing or project URL</label>
              <input
                name="opportunityListingUrl"
                type="url"
                placeholder="https://…"
                className={INP}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Stack / CRMS offcanvas — section headers + 2-column field grid (same fields as before)
  const fi = visibleKeys.indexOf('firstName');
  const li = visibleKeys.indexOf('lastName');
  const namePair = fi >= 0 && li >= 0;
  const nameLeader = namePair ? (fi < li ? 'firstName' : 'lastName') : null;

  const groups: { section: string; keys: string[] }[] = [];
  for (const key of keys) {
    if (namePair && (key === 'firstName' || key === 'lastName') && key !== nameLeader) continue;
    const sec = sectionForKey(key === nameLeader ? 'firstName' : key);
    const last = groups[groups.length - 1];
    if (last && last.section === sec) last.keys.push(key);
    else groups.push({ section: sec, keys: [key] });
  }

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
    <div className="space-y-3">
      {groups.map((group, index) => (
        <CrmFormSection
          key={`${group.section}-${index}`}
          title={SECTION_LABEL[group.section]}
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
      ))}
      <CrmFormSection
        title="Portal listing (optional)"
        description="For outreach via Upwork, Naukri, Indeed, etc. when you do not have an email or phone yet."
        defaultOpen={false}
      >
        <CrmFormGrid>
          <OpportunitySourcePlatformField
            label="Platform"
            labelClassName={LBL}
            inputClassName={SEL}
          />
          <div className="sm:col-span-2">
            <label className={LBL}>Listing or project URL</label>
            <input
              name="opportunityListingUrl"
              type="url"
              inputMode="url"
              placeholder="https://www.upwork.com/jobs/…"
              className={INP}
            />
          </div>
        </CrmFormGrid>
      </CrmFormSection>
    </div>
  );
}
