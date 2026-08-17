"use client";

import { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Settings2, ChevronDown } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { getCrmAuthToken } from '@/lib/crm/api';
import { hasPersonContactMethod, hasPersonContactMethodOrPortalListing } from '@/lib/crm/crm-contact-method';
import { useOpportunitySourcePlatforms } from '@/hooks/useOpportunitySourcePlatforms';
import { toast } from 'sonner';
import { invalidateCrmForEntityType } from '@/lib/crm/invalidate-on-mutation';
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import CRMFieldLayoutCustomizer from '@/components/crm/CRMFieldLayoutCustomizer';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import SocialPostPreview from '@/components/crm/SocialPostPreview';
import CrmMultiEmailListField from '@/components/crm/CrmMultiEmailListField';
import { parseAdditionalEmailsFromForm } from '@/lib/crm/crm-additional-emails';
import { Loader2 } from 'lucide-react';
import { FormDatePicker } from '@/components/ui/date-picker';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { usePermissions } from '@/hooks/usePermissions';

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

/** Formats an ISO date string/Date for a native `<input type="datetime-local">`'s `defaultValue` (local time, no seconds/timezone). */
function toLocalDatetimeInputValue(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ensures edit forms can show a selected value before org/contact lists finish loading or for legacy rows. */
function crmSelectOptionsWithLegacyValue(
  base: { label: string; value: string }[],
  currentValue: string,
): { label: string; value: string }[] {
  if (!currentValue) return base;
  if (base.some((x) => String(x.value) === currentValue)) return base;
  return [{ label: `${currentValue} (current)`, value: currentValue }, ...base];
}

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'Lead' | 'Deal' | 'Org' | 'Contact' | 'Note' | 'Task' | 'Call' | string;
  initialData: any;
  onSuccess?: () => void;
}

export default function EditModal({ isOpen, onClose, type, initialData, onSuccess }: EditModalProps) {
  const { canViewCrmRevenue } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [sourceMetadata, setSourceMetadata] = useState<any>(initialData?.sourceMetadata || null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedProbability, setSelectedProbability] = useState<number | ''>('');
  const [dealPricingType, setDealPricingType] = useState<'fixed' | 'monthly'>('fixed');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [layoutTickContact, setLayoutTickContact] = useState(0);
  const [layoutTickOrg, setLayoutTickOrg] = useState(0);
  const [layoutTickLead, setLayoutTickLead] = useState(0);
  const [showCustomizeContact, setShowCustomizeContact] = useState(false);
  const [showCustomizeOrg, setShowCustomizeOrg] = useState(false);
  const [showCustomizeLead, setShowCustomizeLead] = useState(false);
  const [crmPortalUsers, setCrmPortalUsers] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]);
  const [leadServiceOfferings, setLeadServiceOfferings] = useState<Array<{ _id: string; name: string }>>([]);

  const legacyPlatform = String(initialData?.opportunitySourcePlatform ?? '').trim();
  const { options: platformOptionsList } = useOpportunitySourcePlatforms(
    legacyPlatform ? [legacyPlatform] : [],
  );
  const leadPlatformSelectOptions = useMemo(
    () =>
      crmSelectOptionsWithLegacyValue(
        ['', ...platformOptionsList].map((value) => ({ value, label: value || '—' })),
        legacyPlatform,
      ),
    [legacyPlatform, platformOptionsList],
  );

  useEffect(() => {
    if (isOpen && type) {
      fetchCustomFields();
      if (type === 'Deal') fetchPipelines('deals');
      if (type === 'Lead' || type === 'Contact') fetchPipelines('leads');
    }
  }, [isOpen, type]);

  useEffect(() => {
    if (!isOpen || type !== 'Lead') return;
    const token = getCrmAuthToken();
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setCrmPortalUsers(data);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isOpen, type]);

  useEffect(() => {
    if (!isOpen || type !== 'Lead') return;
    const token = localStorage.getItem('token');
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${CRM_API_URL}/crm/service-offerings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : [];
        setLeadServiceOfferings(Array.isArray(data) ? data : []);
      } catch {
        setLeadServiceOfferings([]);
      }
    })();
  }, [isOpen, type]);

  useEffect(() => {
    const pid =
      initialData?.pipeline && typeof initialData.pipeline === 'object'
        ? (initialData.pipeline as any)._id
        : initialData?.pipeline;
    if ((type === 'Deal' || type === 'Lead' || type === 'Contact') && pid) {
      setSelectedPipeline(String(pid));
    } else if ((type === 'Deal' || type === 'Lead' || type === 'Contact') && pipelines.length > 0 && !selectedPipeline) {
      const defaultP = pipelines.find((p: any) => p.isDefault) || pipelines[0];
      if (defaultP) setSelectedPipeline(String(defaultP._id));
    }
  }, [initialData, pipelines, type]);

  useEffect(() => {
    if (isOpen && initialData && (type === 'Deal' || type === 'Lead' || type === 'Contact')) {
      setSelectedStage(initialData.stage || initialData.status || '');
      if (type === 'Deal') {
        const p = Number(initialData.probability);
        setSelectedProbability(Number.isFinite(p) ? p : '');
        setDealPricingType(
          String(initialData.pricingType || '').toLowerCase() === 'monthly'
            ? 'monthly'
            : 'fixed',
        );
      }
    }
  }, [isOpen, initialData, type]);

  // Keep deal probability aligned with the selected pipeline stage (CRM-standard).
  useEffect(() => {
    if (type !== 'Deal' || !selectedPipeline || !selectedStage || pipelines.length === 0) return;
    const pipe = pipelines.find((p: any) => pipelineIdEq(p._id, selectedPipeline));
    const stage = (pipe?.stages || []).find(
      (s: any) => String(s.name) === String(selectedStage),
    );
    if (stage && typeof stage.probability === 'number') {
      setSelectedProbability(stage.probability);
    }
  }, [type, selectedPipeline, selectedStage, pipelines]);

  // Auto-fetch social metadata if source is a social URL but metadata wasn't saved yet
  useEffect(() => {
    if (!isOpen || type !== 'Lead') return;
    if (initialData?.sourceMetadata) {
      setSourceMetadata(initialData.sourceMetadata);
      return;
    }
    const rawSrc = initialData?.source || '';
    // Extract iframe src if full embed code was stored
    const iframeSrc = rawSrc.match(/src=["']([^"']+)["']/);
    const src = iframeSrc ? iframeSrc[1] : rawSrc;
    if (
      src.includes('linkedin.com') ||
      src.includes('threads.com') ||
      src.includes('threads.net') ||
      src.includes('facebook.com') ||
      src.includes('fb.watch')
    ) {
      void fetchSourceMetadata(src);
    }
  }, [isOpen, type, initialData?.source, initialData?.sourceMetadata]);

  const fetchPipelines = async (pipelineType?: 'deals' | 'leads') => {
    const token = localStorage.getItem('token');
    const url = pipelineType ? `${CRM_API_URL}/crm/pipelines?type=${pipelineType}` : `${CRM_API_URL}/crm/pipelines`;
    try {
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
      }
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    }
  };

  const fetchCustomFields = async () => {
    const moduleMap: any = { 'Lead': 'leads', 'Deal': 'deals', 'Org': 'organizations', 'Contact': 'contacts' };
    const moduleName = moduleMap[type];
    if (!moduleName) {
      setCustomFields([]);
      return;
    }

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=${moduleName}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomFields(data);
      } else {
        setCustomFields([]);
      }
    } catch (err) {
      console.error('Failed to fetch custom fields:', err);
      setCustomFields([]);
    }
  };

  const leadFormKeys = useMemo(() => {
    if (type !== 'Lead' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('leads', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields, layoutTickLead]);

  const dealFormKeys = useMemo(() => {
    if (type !== 'Deal' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('deals', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields]);

  const contactFormKeys = useMemo(() => {
    if (type !== 'Contact' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('contacts', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields, layoutTickContact]);

  const orgFormKeys = useMemo(() => {
    if (type !== 'Org' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('organizations', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields, layoutTickOrg]);

  const sl = (k: string) => {
    if (type !== 'Lead' || !leadFormKeys.has(k)) return false;
    if (!canViewCrmRevenue && k === 'annualRevenue') return false;
    return true;
  };
  const sd = (k: string) => {
    if (type !== 'Deal') return false;
    if (
      !canViewCrmRevenue &&
      (k === 'pricingType' ||
        k === 'contractMonths' ||
        k === 'dealValue' ||
        k === 'expectedDealValue' ||
        k === 'currency' ||
        k === 'exchangeRate')
    ) {
      return false;
    }
    // Always collect pricing model on deal forms (even if older layouts omit keys).
    if (k === 'pricingType' || k === 'contractMonths' || k === 'dealValue') return true;
    return dealFormKeys.has(k);
  };
  const sc = (k: string) => {
    if (type !== 'Contact' || !contactFormKeys.has(k)) return false;
    if (!canViewCrmRevenue && k === 'annualRevenue') return false;
    return true;
  };
  const so = (k: string) => {
    if (type !== 'Org' || !orgFormKeys.has(k)) return false;
    if (!canViewCrmRevenue && k === 'annualRevenue') return false;
    return true;
  };

  const leadOwnerSelectOptions = useMemo(() => {
    const labels = crmPortalUsers.map((u) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()).filter(Boolean);
    const current = typeof initialData?.leadOwner === 'string' ? initialData.leadOwner.trim() : '';
    const set = new Set(labels);
    if (current) set.add(current);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [crmPortalUsers, initialData?.leadOwner]);

  const leadRelatedSvcId = useMemo(() => {
    if (type !== 'Lead') return '';
    const rs = initialData?.relatedService;
    if (rs && typeof rs === 'object' && rs !== null && '_id' in rs) return String((rs as { _id: string })._id);
    return rs != null && rs !== '' ? String(rs) : '';
  }, [type, initialData]);

  const leadServiceSelectOptions = useMemo(
    () =>
      crmSelectOptionsWithLegacyValue(
        [
          { label: '—', value: '' },
          ...leadServiceOfferings.map((s) => ({ label: s.name, value: String(s._id) })),
        ],
        leadRelatedSvcId,
      ),
    [leadServiceOfferings, leadRelatedSvcId],
  );

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [dealContactsList, setDealContactsList] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || (type !== 'Deal' && type !== 'Contact')) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    void (async () => {
      try {
        const orgRes = await fetch(`${CRM_API_URL}/crm/organizations/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (orgRes.ok) setOrganizations(await orgRes.json());
        if (type === 'Deal') {
          const cRes = await fetch(`${CRM_API_URL}/crm/contacts/list`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cRes.ok) setDealContactsList(await cRes.json());
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isOpen, type]);

  const dealOrgIdDefault = useMemo(() => {
    if (type !== 'Deal') return '';
    const o = initialData?.organization;
    if (o && typeof o === 'object' && o !== null && '_id' in o) return String((o as { _id: string })._id);
    return o != null && o !== '' ? String(o) : '';
  }, [type, initialData]);

  const dealContactIdDefault = useMemo(() => {
    if (type !== 'Deal') return '';
    const c = initialData?.contactPerson;
    if (c && typeof c === 'object' && c !== null && '_id' in c) return String((c as { _id: string })._id);
    return c != null && c !== '' ? String(c) : '';
  }, [type, initialData]);

  const contactOrgIdDefault = useMemo(() => {
    if (type !== 'Contact') return '';
    const o = initialData?.organization;
    if (o && typeof o === 'object' && o !== null && '_id' in o) return String((o as { _id: string })._id);
    return o != null && o !== '' ? String(o) : '';
  }, [type, initialData]);

  const dealOrgSelectOptions = useMemo(
    () =>
      crmSelectOptionsWithLegacyValue(
        [
          { label: 'Select organization...', value: '' },
          ...organizations.map((o: any) => ({ label: o.name, value: String(o._id) })),
        ],
        dealOrgIdDefault,
      ),
    [organizations, dealOrgIdDefault],
  );

  const dealContactSelectOptions = useMemo(
    () =>
      crmSelectOptionsWithLegacyValue(
        [
          { label: '—', value: '' },
          ...dealContactsList.map((c: any) => ({
            label: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Contact',
            value: String(c._id),
          })),
        ],
        dealContactIdDefault,
      ),
    [dealContactsList, dealContactIdDefault],
  );

  const contactOrgSelectOptions = useMemo(
    () =>
      crmSelectOptionsWithLegacyValue(
        [
          { label: 'Select organization...', value: '' },
          ...organizations.map((o: any) => ({ label: o.name, value: String(o._id) })),
        ],
        contactOrgIdDefault,
      ),
    [organizations, contactOrgIdDefault],
  );

  const fetchSourceMetadata = async (url: string) => {
    if (!url || !url.startsWith('http')) return;
    setIsFetchingMetadata(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/fetch-link-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        setSourceMetadata(data);
      }
    } catch (err) {
      console.error('[EditModal] Failed to fetch source metadata:', err);
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries()) as Record<string, any>;

    if (type === 'Lead' && leadFormKeys.has('additionalEmails')) {
      data.additionalEmails = parseAdditionalEmailsFromForm(formData, data.email);
    }
    if (type === 'Contact' && contactFormKeys.has('additionalEmails')) {
      data.additionalEmails = parseAdditionalEmailsFromForm(formData, data.email);
    }

    if (data.mobileNo_countryCode && data.mobileNo) {
      data.mobileNo = `${data.mobileNo_countryCode} ${data.mobileNo}`.trim();
      delete data.mobileNo_countryCode;
    }
    if (data.phone_countryCode && data.phone) {
      data.phone = `${data.phone_countryCode} ${data.phone}`.trim();
      delete data.phone_countryCode;
    }

    if (type === 'Lead' || type === 'Contact') {
      const idOk =
        type === 'Contact'
          ? hasPersonContactMethod({
              email: data.email,
              mobileNo: data.mobileNo,
              phone: data.phone,
              linkedinUrl: data.linkedinUrl,
            })
          : hasPersonContactMethodOrPortalListing({
              email: data.email,
              mobileNo: data.mobileNo,
              phone: data.phone,
              linkedinUrl: data.linkedinUrl,
              opportunityListingUrl: data.opportunityListingUrl,
            });
      if (!idOk) {
        toast.error(
          type === 'Lead'
            ? 'Add at least one of email, phone (mobile or alternate), LinkedIn URL, or a job/freelance listing URL (https).'
            : 'Add at least one of email, phone (mobile or alternate), or LinkedIn URL so we can reach this contact.',
        );
        setLoading(false);
        return;
      }
    }

    const endpoint = type === 'Lead' ? 'leads' :
      type === 'Deal' ? 'deals' :
        type === 'Org' ? 'organizations' :
          type === 'Contact' ? 'contacts' : 'activities'; // Basic mapping

    const prevCf =
      initialData.customFields && typeof initialData.customFields.get === 'function'
        ? Object.fromEntries(initialData.customFields as any)
        : { ...(initialData.customFields || {}) };

    const customFieldsData: any = {};
    customFields.forEach((field) => {
      const fieldName = `cf_${field.key}`;
      if (field.type === 'multiselect') {
        const vals = formData.getAll(fieldName).filter((v) => v != null && String(v).trim() !== '') as string[];
        customFieldsData[field.key] = vals;
      } else {
        const submitted = data[fieldName];
        if (submitted !== undefined && submitted !== '') {
          customFieldsData[field.key] = submitted;
        } else if (prevCf[field.key] !== undefined && prevCf[field.key] !== '') {
          customFieldsData[field.key] = prevCf[field.key];
        }
      }
      delete data[fieldName];
    });

    let payload: any = { ...data };
    if (Object.keys(customFieldsData).length > 0) {
      payload.customFields = customFieldsData;
    }

    if (type === 'Deal') {
      if (!payload.stage && selectedStage) {
        payload.stage = selectedStage;
      } else if (!payload.stage && (initialData.stage || initialData.status)) {
        payload.stage = initialData.stage || initialData.status;
      }
      if (selectedPipeline) {
        payload.pipeline = selectedPipeline;
      } else if (!payload.pipeline && initialData.pipeline) {
        const p = initialData.pipeline;
        payload.pipeline = typeof p === 'object' && p && '_id' in p ? (p as any)._id : p;
      }
      // Stage owns win probability — do not collect it on the form.
      const dealPipe = pipelines.find((p: any) => pipelineIdEq(p._id, payload.pipeline || selectedPipeline));
      const stageName = payload.stage || selectedStage;
      const stageProb = (dealPipe?.stages || []).find(
        (s: any) => String(s.name) === String(stageName),
      )?.probability;
      if (typeof stageProb === 'number') {
        payload.probability = stageProb;
      } else if (selectedProbability !== '' && Number.isFinite(Number(selectedProbability))) {
        payload.probability = Number(selectedProbability);
      } else {
        delete payload.probability;
      }
      payload.pricingType = dealPricingType;
      if (dealPricingType === 'monthly') {
        const months = Number(payload.contractMonths);
        payload.contractMonths =
          Number.isFinite(months) && months > 0 ? Math.min(60, Math.round(months)) : 12;
      } else {
        payload.contractMonths = null;
      }
      if (payload.organization === '' || payload.organization === 'Select organization...') {
        payload.organization = null;
      }
      if (payload.contactPerson === '') {
        payload.contactPerson = null;
      }
    }

    if (type === 'Lead') {
      if (!payload.stage && (initialData.stage || initialData.status)) {
        payload.stage = initialData.stage || initialData.status;
      }
      if (!payload.status && (initialData.status || payload.stage)) {
        payload.status = initialData.status || initialData.stage;
      }
      if (!payload.pipeline && initialData.pipeline) {
        const p = initialData.pipeline;
        payload.pipeline = typeof p === 'object' && p && '_id' in p ? (p as any)._id : p;
      }
      if (sourceMetadata) {
        payload.sourceMetadata = sourceMetadata;
      }
      if (payload.relatedService === '') payload.relatedService = null;
      if (payload.nextFollowUpAt) {
        // Input value is a bare "YYYY-MM-DDTHH:mm" (browser-local, no timezone) —
        // resolve it in the browser's local time before sending as UTC ISO.
        const parsed = new Date(payload.nextFollowUpAt);
        payload.nextFollowUpAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      } else if (payload.nextFollowUpAt === '') {
        payload.nextFollowUpAt = null;
      }
    }

    if (type === 'Contact') {
      if (!payload.stage && (initialData.stage || initialData.status)) {
        payload.stage = initialData.stage || initialData.status;
      }
      if (!payload.status && (initialData.status || payload.stage)) {
        payload.status = initialData.status || initialData.stage;
      }
      if (!payload.pipeline && initialData.pipeline) {
        const p = initialData.pipeline;
        payload.pipeline = typeof p === 'object' && p && '_id' in p ? (p as any)._id : p;
      }
      if (payload.annualRevenue !== undefined && payload.annualRevenue !== '') {
        payload.annualRevenue = Number(payload.annualRevenue);
      }
      if (sourceMetadata) {
        payload.sourceMetadata = sourceMetadata;
      }
      if (payload.organization === '' || payload.organization === 'Select organization...') {
        payload.organization = null;
      }
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/${endpoint}/${initialData._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        invalidateCrmForEntityType(type);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        let msg = res.statusText;
        try {
          const errorData = await res.json();
          msg =
            typeof errorData?.message === 'string'
              ? errorData.message
              : Array.isArray(errorData?.message)
                ? errorData.message.join(', ')
                : errorData?.message?.message || res.statusText;
        } catch {
          /* ignore */
        }
        toast.error(msg || 'Failed to update');
      }
    } catch (err) {
      console.error('Update failed', err);
      alert('Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const endpoint = type === 'Lead' ? 'leads' :
      type === 'Deal' ? 'deals' :
        type === 'Org' ? 'organizations' :
          type === 'Contact' ? 'contacts' : 'activities';

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/${endpoint}/${initialData._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        invalidateCrmForEntityType(type);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert('Failed to delete');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentPipeline = pipelines.find((p) => pipelineIdEq(p._id, selectedPipeline));
  const stageOptions = currentPipeline ? currentPipeline.stages.sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name) : [];

  return (
    <div className={`${crmModalChrome.overlay} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-[#091e42]/40" onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-2xl max-h-[min(90vh,56rem)] crm-jira-modal flex flex-col`}>
        <div className={crmModalChrome.centerHeader}>
          <div className="min-w-0 flex-1">
            <h2 className={crmModalChrome.centerTitle}>Edit {type}</h2>
            <p className={crmModalChrome.centerLead}>Update record details</p>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className={`${crmModalChrome.centerBody} custom-scrollbar`}>
          <form key={initialData?._id} id="edit-form" onSubmit={handleSubmit} className="space-y-5">
            {type === 'Lead' && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeLead(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-[3px] text-xs font-black uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-text-muted transition-all">
                    <Settings2 size={14} /> Lead fields
                  </button>
                </div>
                {(sl('salutation') || sl('firstName') || sl('lastName') || sl('email') || sl('additionalEmails') || sl('mobileNo') || sl('phone') || sl('gender')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Contact Information</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sl('salutation') && <FormItem label="Salutation" name="salutation" type="select" options={['Mr', 'Ms', 'Mrs', 'Dr']} defaultValue={initialData.salutation} />}
                      {sl('firstName') && <FormItem label="First Name" name="firstName" defaultValue={initialData.firstName} />}
                      {sl('lastName') && <FormItem label="Last Name" name="lastName" defaultValue={initialData.lastName} />}
                      {sl('email') && <FormItem label="Email" name="email" type="email" defaultValue={initialData.email} />}
                      {sl('additionalEmails') && (
                        <div className="col-span-2">
                          <CrmMultiEmailListField
                            initialEmails={Array.isArray(initialData.additionalEmails) ? initialData.additionalEmails : []}
                            visualVariant="default"
                          />
                        </div>
                      )}
                      {sl('mobileNo') && <FormItem label="Mobile No" name="mobileNo" type="phone" defaultValue={initialData.mobileNo} />}
                      {sl('phone') && <FormItem label="Phone (alternate)" name="phone" defaultValue={initialData.phone} />}
                      {sl('gender') && <FormItem label="Gender" name="gender" type="select" options={['Male', 'Female', 'Other']} defaultValue={initialData.gender} />}
                    </div>
                  </div>
                )}
                {(sl('organization') || sl('jobTitle') || sl('industry') || sl('website') || sl('noOfEmployees') || sl('annualRevenue') || sl('territory') || sl('linkedinUrl') || sl('twitterHandle') || sl('relatedService')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Company Information</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sl('organization') && <FormItem label="Organization" name="organization" defaultValue={initialData.organization} />}
                      {sl('jobTitle') && <FormItem label="Job Title" name="jobTitle" defaultValue={initialData.jobTitle} />}
                      {sl('industry') && <FormItem label="Industry" name="industry" defaultValue={initialData.industry} />}
                      {sl('website') && <FormItem label="Website" name="website" defaultValue={initialData.website} />}
                      {sl('noOfEmployees') && <FormItem label="No. of Employees" name="noOfEmployees" type="select" options={['1-10', '11-50', '51-200', '201-500', '500+']} defaultValue={initialData.noOfEmployees} />}
                      {sl('annualRevenue') && <FormItem label="Annual Revenue" name="annualRevenue" type="number" defaultValue={initialData.annualRevenue} />}
                      {sl('territory') && <FormItem label="Territory" name="territory" defaultValue={initialData.territory} />}
                      {sl('linkedinUrl') && <FormItem label="LinkedIn URL" name="linkedinUrl" defaultValue={initialData.linkedinUrl} placeholder="https://linkedin.com/in/username" />}
                      {sl('twitterHandle') && <FormItem label="X (Twitter) handle" name="twitterHandle" defaultValue={initialData.twitterHandle} placeholder="@username" />}
                      {sl('relatedService') && (
                        <FormItem
                          label="Related service"
                          name="relatedService"
                          type="select"
                          options={leadServiceSelectOptions}
                          defaultValue={leadRelatedSvcId}
                        />
                      )}
                    </div>
                  </div>
                )}
                {(sl('pipeline') || sl('stage') || sl('status') || sl('leadOwner') || sl('source') || sl('nextFollowUpAt')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Lead Information</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sl('pipeline') && (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#5e6c84] px-1">Pipeline</label>
                          <div className="relative flex items-center">
                            <select name="pipeline" value={selectedPipeline ? String(selectedPipeline) : ''} onChange={(e) => setSelectedPipeline(e.target.value)} className="w-full bg-card border border-border rounded-[3px] py-2.5 pl-4 pr-10 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer">
                              {pipelines.map((p: any) => <option key={String(p._id)} value={String(p._id)}>{p.name}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3.5 h-4 w-4 text-[var(--primary-muted)] pointer-events-none" />
                          </div>
                        </div>
                      )}
                      {sl('stage') && (
                        <FormItem
                          label="Stage"
                          name="stage"
                          type="select"
                          options={(pipelines.find((p: any) => pipelineIdEq(p._id, selectedPipeline))?.stages || []).sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name) || ['New']}
                          value={selectedStage}
                          onChange={(e: any) => setSelectedStage(e.target.value)}
                        />
                      )}
                                           {sl('status') && (
                        <FormItem
                          label="Status"
                          name="status"
                          type="select"
                          options={['New', 'Qualified', 'Replied', 'Opportunity']}
                          value={selectedStage}
                          onChange={(e: any) => setSelectedStage(e.target.value)}
                        />
                      )}
                      {sl('leadOwner') &&
                        (leadOwnerSelectOptions.length > 0 ? (
                          <FormItem
                            label="Lead Owner"
                            name="leadOwner"
                            type="select"
                            options={leadOwnerSelectOptions}
                            defaultValue={initialData.leadOwner || ''}
                          />
                        ) : (
                          <FormItem label="Lead Owner" name="leadOwner" defaultValue={initialData.leadOwner} placeholder="First Last" />
                        ))}
                      {sl('nextFollowUpAt') && (
                        <FormItem
                          label="Next Follow-up Date & Time"
                          name="nextFollowUpAt"
                          type="datetime-local"
                          defaultValue={toLocalDatetimeInputValue(initialData.nextFollowUpAt)}
                        />
                      )}
                      {sl('source') && (
                        <div className="col-span-2 space-y-1">
                          <FormItem
                            label="Lead Source"
                            name="source"
                            defaultValue={initialData.source}
                            onBlurField={(e: any) => {
                              let val = (e.target.value || '').trim();
                              const iframeSrc = val.match(/src=["']([^"']+)["']/);
                              if (iframeSrc) { val = iframeSrc[1]; e.target.value = val; }
                              if (val && (val.includes('linkedin.com') || val.includes('threads.com') || val.includes('threads.net') || val.includes('facebook.com') || val.includes('fb.watch'))) {
                                void fetchSourceMetadata(val);
                              }
                            }}
                          />
                          {isFetchingMetadata && (
                            <div className="mt-2 text-xs font-bold text-primary animate-pulse flex items-center gap-2 px-1">
                              <Loader2 size={12} className="animate-spin" />
                              Fetching post content...
                            </div>
                          )}
                          {sourceMetadata && <SocialPostPreview metadata={sourceMetadata} />}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {type === 'Lead' && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">
                      Job or freelance portal (optional)
                    </h4>
                    <p className="text-xs text-text-muted mb-4 leading-relaxed">
                      Use when outreach started on a marketplace or job board and you only have the public listing link so far.
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      <FormItem
                        label="Platform"
                        name="opportunitySourcePlatform"
                        type="select"
                        options={leadPlatformSelectOptions.map((o) => o.value)}
                        defaultValue={initialData.opportunitySourcePlatform || ''}
                      />
                      <div className="col-span-2">
                        <FormItem
                          label="Listing or project URL"
                          name="opportunityListingUrl"
                          type="url"
                          placeholder="https://…"
                          defaultValue={initialData.opportunityListingUrl || ''}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {customFields.some((f) => sl(`cf:${f.key}`)) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Custom Properties</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {customFields.filter((field) => sl(`cf:${field.key}`)).map((field) => (
                        <FormItem
                          key={field._id}
                          label={field.name}
                          name={`cf_${field.key}`}
                          type={field.type}
                          options={field.options}
                          required={field.required}
                          defaultValue={initialData.customFields?.[field.key]}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {type === 'Deal' && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {sd('title') && <FormItem label="Deal Title" name="title" required defaultValue={initialData.title} />}
                {sd('pricingType') && (
                  <FormItem
                    label="Pricing type"
                    name="pricingType"
                    type="select"
                    options={[
                      { label: 'Fixed price project', value: 'fixed' },
                      { label: 'Monthly payment', value: 'monthly' },
                    ]}
                    value={dealPricingType}
                    onChange={(e: any) => setDealPricingType(e.target.value === 'monthly' ? 'monthly' : 'fixed')}
                  />
                )}
                {sd('dealValue') && (
                  <FormItem
                    label={dealPricingType === 'monthly' ? 'Monthly amount' : 'Amount'}
                    name="dealValue"
                    type="number"
                    required
                    defaultValue={initialData.dealValue}
                  />
                )}
                {sd('contractMonths') && dealPricingType === 'monthly' && (
                  <FormItem
                    label="Contract months"
                    name="contractMonths"
                    type="number"
                    defaultValue={initialData.contractMonths || 12}
                  />
                )}
                {sd('contractMonths') && dealPricingType !== 'monthly' && (
                  <input type="hidden" name="contractMonths" value="" />
                )}

                 {sd('pipeline') && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#5e6c84] px-1">Pipeline</label>
                    <div className="relative flex items-center">
                      <select
                        name="pipeline"
                        value={selectedPipeline ? String(selectedPipeline) : ''}
                        onChange={(e) => setSelectedPipeline(e.target.value)}
                        className="w-full bg-surface-dim border-none rounded-[3px] py-2.5 pl-4 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer text-text-main"
                      >
                        {pipelines.map((p) => <option key={String(p._id)} value={String(p._id)}>{p.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3.5 h-4 w-4 text-[var(--primary-muted)] pointer-events-none" />
                    </div>
                  </div>
                )}
                {sd('stage') && (
                  <FormItem
                    label="Stage"
                    name="stage"
                    type="select"
                    options={stageOptions}
                    value={selectedStage}
                    onChange={(e: any) => setSelectedStage(e.target.value)}
                  />
                )}

                {sd('probability') && (
                  <FormItem
                    label="Probability (%)"
                    name="probability"
                    type="number"
                    value={selectedProbability === '' ? '' : String(selectedProbability)}
                    onChange={(e: any) => {
                      const n = e.target.value === '' ? '' : Number(e.target.value);
                      setSelectedProbability(n === '' || Number.isFinite(n) ? n : '');
                    }}
                  />
                )}
                {sd('organization') && (
                  <FormItem
                    label="Organization"
                    name="organization"
                    type="select"
                    options={dealOrgSelectOptions}
                    defaultValue={dealOrgIdDefault}
                  />
                )}
                {sd('contactPerson') && (
                  <FormItem
                    label="Contact"
                    name="contactPerson"
                    type="select"
                    options={dealContactSelectOptions}
                    defaultValue={dealContactIdDefault}
                  />
                )}
                {sd('expectedClosureDate') && <FormItem label="Expected Close Date" name="expectedClosureDate" type="date" defaultValue={initialData.expectedClosureDate?.split('T')[0]} />}
                {sd('closedDate') && (
                  <FormItem
                    label="Closed Date"
                    name="closedDate"
                    type="date"
                    defaultValue={initialData.closedDate ? new Date(initialData.closedDate).toISOString().split('T')[0] : ''}
                  />
                )}
                {sd('nextStep') && <FormItem label="Next Step" name="nextStep" defaultValue={initialData.nextStep} />}
                {sd('expectedDealValue') && <FormItem label="Expected Deal Value" name="expectedDealValue" type="number" defaultValue={initialData.expectedDealValue} />}
                {sd('dealOwner') && <FormItem label="Deal Owner" name="dealOwner" defaultValue={initialData.dealOwner} />}
                {sd('currency') && <FormItem label="Currency" name="currency" type="select" options={[{ label: 'USD — US Dollar ($)', value: 'USD' }, { label: 'INR — Indian Rupee (₹)', value: 'INR' }]} defaultValue={initialData.currency || 'USD'} />}
                {sd('exchangeRate') && <FormItem label="Exchange Rate" name="exchangeRate" type="number" defaultValue={initialData.exchangeRate} />}
                {customFields.filter((field) => sd(`cf:${field.key}`)).map((field) => (
                  <FormItem
                    key={field._id}
                    label={field.name}
                    name={`cf_${field.key}`}
                    type={field.type}
                    options={field.options}
                    required={field.required}
                    defaultValue={initialData.customFields?.[field.key]}
                  />
                ))}
              </div>
            )}

            {type === 'Org' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeOrg(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-[3px] text-xs font-black uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-text-muted transition-all">
                    <Settings2 size={14} /> Organization fields
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {so('name') && <FormItem label="Organization name" name="name" required className="col-span-2" defaultValue={initialData.name} />}
                  {so('website') && <FormItem label="Website" name="website" defaultValue={initialData.website} />}
                  {so('annualRevenue') && <FormItem label="Annual revenue" name="annualRevenue" type="number" defaultValue={initialData.annualRevenue} />}
                  {so('territory') && <FormItem label="Territory" name="territory" defaultValue={initialData.territory} />}
                  {so('noOfEmployees') && <FormItem label="No. of employees" name="noOfEmployees" type="select" options={['1-10', '11-50', '51-200', '201-500', '500+']} defaultValue={initialData.noOfEmployees} />}
                  {so('industry') && <FormItem label="Industry" name="industry" defaultValue={initialData.industry} />}
                  {so('phone') && <FormItem label="Phone" name="phone" defaultValue={initialData.phone} />}
                  {so('email') && <FormItem label="Email" name="email" type="email" defaultValue={initialData.email} />}
                  {so('address') && <FormItem label="Address" name="address" className="col-span-2" defaultValue={initialData.address} />}
                  {customFields.filter((field) => so(`cf:${field.key}`)).map((field) => (
                    <FormItem
                      key={field._id}
                      label={field.name}
                      name={`cf_${field.key}`}
                      type={field.type}
                      options={field.options}
                      required={field.required}
                      defaultValue={initialData.customFields?.[field.key]}
                      className={field.type === 'textarea' ? 'col-span-2' : ''}
                    />
                  ))}
                </div>
              </div>
            )}

            {type === 'Contact' && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeContact(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-[3px] text-xs font-black uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-text-muted transition-all">
                    <Settings2 size={14} /> Contact fields
                  </button>
                </div>
                {(sc('salutation') || sc('firstName') || sc('lastName') || sc('email') || sc('additionalEmails') || sc('mobileNo') || sc('phone') || sc('gender')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Contact Information</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sc('salutation') && <FormItem label="Salutation" name="salutation" type="select" options={['Mr', 'Ms', 'Mrs', 'Dr']} defaultValue={initialData.salutation} />}
                      {sc('firstName') && <FormItem label="First Name" name="firstName" required defaultValue={initialData.firstName} />}
                      {sc('lastName') && <FormItem label="Last Name" name="lastName" defaultValue={initialData.lastName} />}
                      {sc('email') && <FormItem label="Email Address" name="email" type="email" required defaultValue={initialData.email} />}
                      {sc('additionalEmails') && (
                        <div className="col-span-2">
                          <CrmMultiEmailListField
                            initialEmails={Array.isArray(initialData.additionalEmails) ? initialData.additionalEmails : []}
                            visualVariant="default"
                          />
                        </div>
                      )}
                      {sc('mobileNo') && <FormItem label="Mobile No" name="mobileNo" type="phone" defaultValue={initialData.mobileNo} />}
                      {sc('phone') && <FormItem label="Phone (alternate)" name="phone" type="phone" defaultValue={initialData.phone} />}
                      {sc('gender') && <FormItem label="Gender" name="gender" type="select" options={['Male', 'Female', 'Other']} defaultValue={initialData.gender} />}
                    </div>
                  </div>
                )}
                {(sc('organization') || sc('jobTitle') || sc('industry') || sc('website') || sc('noOfEmployees') || sc('annualRevenue') || sc('territory') || sc('linkedinUrl') || sc('twitterHandle') || sc('source')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Company Information</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sc('organization') && (
                        <FormItem
                          label="Company"
                          name="organization"
                          type="select"
                          options={contactOrgSelectOptions}
                          defaultValue={contactOrgIdDefault}
                        />
                      )}
                      {sc('jobTitle') && <FormItem label="Job Title" name="jobTitle" defaultValue={initialData.jobTitle} />}
                      {sc('industry') && <FormItem label="Industry" name="industry" defaultValue={initialData.industry} />}
                      {sc('website') && <FormItem label="Website" name="website" defaultValue={initialData.website} />}
                      {sc('noOfEmployees') && <FormItem label="No. of Employees" name="noOfEmployees" type="select" options={['1-10', '11-50', '51-200', '201-500', '500+']} defaultValue={initialData.noOfEmployees} />}
                      {sc('annualRevenue') && <FormItem label="Annual Revenue" name="annualRevenue" type="number" defaultValue={initialData.annualRevenue} />}
                      {sc('territory') && <FormItem label="Territory" name="territory" defaultValue={initialData.territory} />}
                      {sc('linkedinUrl') && <FormItem label="LinkedIn URL" name="linkedinUrl" defaultValue={initialData.linkedinUrl} placeholder="https://linkedin.com/in/username" />}
                      {sc('twitterHandle') && <FormItem label="X (Twitter) handle" name="twitterHandle" defaultValue={initialData.twitterHandle} placeholder="@username" />}
                      {sc('source') && (
                        <div className="col-span-2 space-y-1">
                          <FormItem
                            label="Lead Source"
                            name="source"
                            defaultValue={initialData.source}
                            onBlurField={(e: any) => {
                              let val = (e.target.value || '').trim();
                              const iframeSrc = val.match(/src=["']([^"']+)["']/);
                              if (iframeSrc) { val = iframeSrc[1]; e.target.value = val; }
                              if (val && (val.includes('linkedin.com') || val.includes('threads.com') || val.includes('threads.net') || val.includes('facebook.com') || val.includes('fb.watch'))) {
                                void fetchSourceMetadata(val);
                              }
                            }}
                          />
                          {isFetchingMetadata && (
                            <div className="mt-2 text-xs font-bold text-primary animate-pulse flex items-center gap-2 px-1">
                              <Loader2 size={12} className="animate-spin" />
                              Fetching post content...
                            </div>
                          )}
                          {sourceMetadata && <SocialPostPreview metadata={sourceMetadata} />}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(sc('pipeline') || sc('stage') || sc('status') || sc('leadOwner')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Pipeline & ownership</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sc('pipeline') && (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-[#5e6c84] px-1">Pipeline</label>
                          <select name="pipeline" value={selectedPipeline ? String(selectedPipeline) : ''} onChange={(e) => setSelectedPipeline(e.target.value)} className="w-full bg-card border border-border rounded-[3px] py-2.5 px-4 text-sm font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer">
                            {pipelines.map((p: any) => <option key={String(p._id)} value={String(p._id)}>{p.name}</option>)}
                          </select>
                        </div>
                      )}
                                           {sc('stage') && (
                        <FormItem
                          label="Stage"
                          name="stage"
                          type="select"
                          options={(pipelines.find((p: any) => pipelineIdEq(p._id, selectedPipeline))?.stages || []).sort((a: any, b: any) => a.order - b.order).map((s: any) => s.name) || ['New']}
                          value={selectedStage}
                          onChange={(e: any) => setSelectedStage(e.target.value)}
                        />
                      )}
                                           {sc('status') && (
                        <FormItem
                          label="Status"
                          name="status"
                          type="select"
                          options={['New', 'Qualified', 'Replied', 'Opportunity']}
                          value={selectedStage}
                          onChange={(e: any) => setSelectedStage(e.target.value)}
                        />
                      )}
                      {sc('leadOwner') && <FormItem label="Owner" name="leadOwner" defaultValue={initialData.leadOwner} />}
                    </div>
                  </div>
                )}
                {(sc('telegram') || sc('address')) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Other</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {sc('telegram') && <FormItem label="Telegram" name="telegram" defaultValue={initialData.telegram} placeholder="@username or +1…" />}
                      {sc('address') && <FormItem label="Address" name="address" className="col-span-2" defaultValue={initialData.address} />}
                    </div>
                  </div>
                )}
                {customFields.some((f) => sc(`cf:${f.key}`)) && (
                  <div className="bg-[#fafbfc] rounded-[3px] p-4 border border-[#dfe1e6]">
                    <h4 className="text-xs font-semibold text-[#5e6c84] mb-4">Custom Properties</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      {customFields.filter((field) => sc(`cf:${field.key}`)).map((field) => (
                        <FormItem
                          key={field._id}
                          label={field.name}
                          name={`cf_${field.key}`}
                          type={field.type}
                          options={field.options}
                          required={field.required}
                          defaultValue={initialData.customFields?.[field.key]}
                          className={field.type === 'textarea' ? 'col-span-2' : ''}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className={`${crmModalChrome.centerFooter} justify-between`}>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="inline-flex h-8 items-center gap-2 rounded-[3px] px-3 text-sm font-medium text-[#de350b] hover:bg-[#ffebe6] disabled:opacity-50"
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex h-8 items-center rounded-[3px] border border-[#dfe1e6] bg-white px-4 text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-form"
              disabled={loading}
              className="inline-flex h-8 items-center gap-2 rounded-[3px] bg-[#0c66e4] px-4 text-sm font-medium text-white hover:bg-[#0055cc] disabled:opacity-50"
            >
              {loading ? 'Saving...' : (
                <>
                  <Save size={16} strokeWidth={1.75} />
                  Save changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Record"
        description="Move this record to Trash? Only a CRM admin can restore or permanently delete it."
        onConfirm={handleDelete}
      />

      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeLead}
        onClose={() => setShowCustomizeLead(false)}
        module="leads"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickLead((t) => t + 1)}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeContact}
        onClose={() => setShowCustomizeContact(false)}
        module="contacts"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickContact((t) => t + 1)}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeOrg}
        onClose={() => setShowCustomizeOrg(false)}
        module="organizations"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickOrg((t) => t + 1)}
      />
    </div>
  );
}

function FormItem({ label, name, type = 'text', options = [], placeholder = '', required = false, className = '', defaultValue = '', value, onChange, onBlurField }: any) {
  const strOpts = options.map((o: any) => (typeof o === 'object' ? String(o.value) : String(o)));
  let selectList = options;
  const dvOrVal = String(value !== undefined ? value : (defaultValue || ''));
  if (dvOrVal && !strOpts.includes(dvOrVal)) {
    selectList = [dvOrVal, ...options];
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs font-semibold text-[#5e6c84] px-1">{label}</label>
      {type === 'multiselect' ? (
        <div className="rounded-[3px] border border-[#dfe1e6] bg-card p-3 space-y-2 max-h-[200px] overflow-y-auto">
          {(options as string[]).map((opt: string) => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-text-main">
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={Array.isArray(defaultValue) && defaultValue.includes(opt)}
                className="rounded border-slate-300 text-primary focus:ring-primary/30"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ) : type === 'select' ? (
        <div className="relative flex items-center">
          <select
            name={name}
            required={required}
            value={value !== undefined ? value : undefined}
            defaultValue={value === undefined ? defaultValue : undefined}
            onChange={onChange}
            className="w-full bg-card border border-[#dfe1e6] rounded-[3px] py-2.5 pl-4 pr-10 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer text-text-main"
          >
            {selectList.map((opt: any) => {
              const label = typeof opt === 'object' ? opt.label : opt;
              const v = typeof opt === 'object' ? opt.value : opt;
              return (
                <option key={String(v)} value={String(v)}>
                  {label === '' ? '—' : label}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute right-3.5 h-4 w-4 text-[var(--primary-muted)] pointer-events-none" />
        </div>
      ) : type === 'textarea' ? (
        <textarea
          name={name}
          required={required}
          value={value !== undefined ? value : undefined}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={onChange}
          className="w-full bg-card border border-[#dfe1e6] rounded-[3px] py-3 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px]"
          placeholder={placeholder}
        />
      ) : type === 'phone' ? (
        <div className="flex relative items-center group">
          <select
            name={`${name}_countryCode`}
            defaultValue={getDefaultCountryCodeFromPhone(defaultValue ? String(defaultValue) : undefined)}
            className="absolute left-1 z-10 w-[7.25rem] sm:w-[8rem] h-[42px] bg-transparent text-xs sm:text-sm font-bold text-text-main outline-none cursor-pointer border-r border-[#dfe1e6] pl-1 pr-0.5 appearance-none hover:bg-slate-100 rounded-l-[14px] transition-colors"
          >
            {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            name={name}
            required={required}
            defaultValue={getNationalDigitsFromPhone(defaultValue ? String(defaultValue) : undefined)}
            className="block w-full bg-card border border-[#dfe1e6] rounded-[3px] py-2.5 pl-[8.25rem] sm:pl-[9rem] pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            placeholder={placeholder || "00000 00000"}
          />
        </div>
      ) : type === 'date' ? (
        <FormDatePicker name={name} defaultValue={defaultValue} required={required} />
      ) : (
        <input
          name={name}
          type={type === 'url' ? 'url' : type}
          required={required}
          value={value !== undefined ? value : undefined}
          defaultValue={value === undefined ? (defaultValue as string | number) : undefined}
          onChange={onChange}
          className="w-full bg-card border border-[#dfe1e6] rounded-[3px] py-2.5 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          placeholder={type === 'url' ? 'https://…' : placeholder}
          onBlur={onBlurField}
        />
      )}
    </div>
  );
}
