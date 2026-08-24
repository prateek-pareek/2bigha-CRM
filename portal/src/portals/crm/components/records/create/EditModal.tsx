"use client";

import { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Settings2, ChevronDown } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';
import { hasPersonContactMethod, hasPersonContactMethodOrPortalListing } from '@/lib/crm/crm-contact-method';
import { toast } from 'sonner';
import { invalidateCrmForEntityType } from '@/lib/crm/shared/invalidate-on-mutation';
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import CrmMultiEmailListField from '@/components/crm/email/engagement/CrmMultiEmailListField';
import { parseAdditionalEmailsFromForm } from '@/lib/crm/crm-additional-emails';
import { FormDatePicker } from '@/components/ui/date-picker';
import { crmModalChrome } from '@/lib/crm/chrome';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_LABEL_CLASS,
  CRM_HS_CONTROL_CLASS,
  CRM_HS_SELECT_CLASS,
} from '@/components/crm/records/forms/crm-form-primitives';
import { CRM_BTN_PRIMARY, CRM_BTN_SECONDARY, CRM_BTN_GHOST } from '@/lib/crm/ui';

function pipelineIdEq(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
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
  type: 'Lead' | 'Org' | 'Contact' | 'Note' | 'Task' | 'Call' | string;
  initialData: any;
  onSuccess?: () => void;
}

export default function EditModal({ isOpen, onClose, type, initialData, onSuccess }: EditModalProps) {
  const { canViewCrmRevenue } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [layoutTickContact, setLayoutTickContact] = useState(0);
  const [layoutTickOrg, setLayoutTickOrg] = useState(0);
  const [layoutTickLead, setLayoutTickLead] = useState(0);
  const [showCustomizeContact, setShowCustomizeContact] = useState(false);
  const [showCustomizeOrg, setShowCustomizeOrg] = useState(false);
  const [showCustomizeLead, setShowCustomizeLead] = useState(false);
  const [crmPortalUsers, setCrmPortalUsers] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]);
  const [leadServiceOfferings, setLeadServiceOfferings] = useState<Array<{ _id: string; name: string }>>([]);

  useEffect(() => {
    if (isOpen && type) {
      fetchCustomFields();
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
    if ((type === 'Lead' || type === 'Contact') && pid) {
      setSelectedPipeline(String(pid));
    } else if ((type === 'Lead' || type === 'Contact') && pipelines.length > 0 && !selectedPipeline) {
      const defaultP = pipelines.find((p: any) => p.isDefault) || pipelines[0];
      if (defaultP) setSelectedPipeline(String(defaultP._id));
    }
  }, [initialData, pipelines, type]);

  useEffect(() => {
    if (isOpen && initialData && (type === 'Lead' || type === 'Contact')) {
      setSelectedStage(initialData.stage || initialData.status || '');
    }
  }, [isOpen, initialData, type]);

  const fetchPipelines = async (pipelineType?: 'leads') => {
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
    const moduleMap: any = { 'Lead': 'leads', 'Org': 'organizations', 'Contact': 'contacts' };
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

  const contactFormKeys = useMemo(() => {
    if (type !== 'Contact' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('contacts', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields, layoutTickContact]);

  const orgFormKeys = useMemo(() => {
    if (type !== 'Org' || !isOpen) return new Set<string>();
    return new Set(getVisibleFieldKeysOrdered('organizations', 'form', customFields.map((f) => f.key)));
  }, [type, isOpen, customFields, layoutTickOrg]);

  const sl = (k: string) => {
    if (type !== 'Lead') return false;
    if (!leadFormKeys.has(k)) return false;
    if (!canViewCrmRevenue && k === 'annualRevenue') return false;
    return true;
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
              opportunityListingUrl: data.opportunityListingUrl,
            });
      if (!idOk) {
        toast.error(
          type === 'Lead'
            ? 'Add at least one of email, phone (mobile or alternate), or a job/freelance listing URL (https).'
            : 'Add at least one of email, phone (mobile or alternate), or LinkedIn URL so we can reach this contact.',
        );
        setLoading(false);
        return;
      }
    }

    const endpoint = type === 'Lead' ? 'leads' :
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
      if (payload.relatedService === '') payload.relatedService = null;
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

  return (
    <div className={`${crmModalChrome.overlay} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-[var(--text-main)]/40" onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-2xl max-h-[min(90vh,56rem)] crm-modal flex flex-col`}>
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
          <form key={initialData?._id} id="edit-form" onSubmit={handleSubmit} className="space-y-3">
            {type === 'Lead' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeLead(true)} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors">
                    <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                  </button>
                </div>
                {(sl('salutation') || sl('firstName') || sl('lastName') || sl('email') || sl('additionalEmails') || sl('mobileNo') || sl('phone') || sl('gender') || sl('twitterHandle')) && (
                  <CrmFormSection title="Contact Information" defaultOpen>
                    <CrmFormGrid>
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
                      {sl('twitterHandle') && (
                        <FormItem
                          label="X (Twitter) handle"
                          name="twitterHandle"
                          defaultValue={initialData.twitterHandle}
                          placeholder="@username"
                        />
                      )}
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
                {(sl('pipeline') || sl('stage') || sl('status') || sl('callStatus') || sl('leadOwner') || sl('relatedService')) && (
                  <CrmFormSection title="Lead Information" defaultOpen={false}>
                    <CrmFormGrid>
                      {sl('relatedService') && (
                        <FormItem
                          label="Related service"
                          name="relatedService"
                          type="select"
                          options={leadServiceSelectOptions}
                          defaultValue={leadRelatedSvcId}
                        />
                      )}
                      {sl('pipeline') && (
                        <div className="space-y-1.5">
                          <label className={CRM_HS_LABEL_CLASS}>Pipeline</label>
                          <div className="relative flex items-center">
                            <select
                              name="pipeline"
                              value={selectedPipeline ? String(selectedPipeline) : ''}
                              onChange={(e) => setSelectedPipeline(e.target.value)}
                              className={`${CRM_HS_SELECT_CLASS} pr-10`}
                            >
                              {pipelines.map((p: any) => (
                                <option key={String(p._id)} value={String(p._id)}>{p.name}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
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
                      {sl('callStatus') && (
                        <FormItem
                          label="Call Status"
                          name="callStatus"
                          type="select"
                          options={['Not Called', 'Completed', 'Missed', 'Busy', 'Failed']}
                          defaultValue={initialData.callStatus || 'Not Called'}
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
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
                {customFields.some((f) => sl(`cf:${f.key}`)) && (
                  <CrmFormSection title="Custom Properties" defaultOpen={false}>
                    <CrmFormGrid>
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
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
              </div>
            )}

            {type === 'Org' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeOrg(true)} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors">
                    <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                  </button>
                </div>
                <CrmFormSection title="Basic Info" defaultOpen>
                  <CrmFormGrid>
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
                  </CrmFormGrid>
                </CrmFormSection>
              </div>
            )}
{type === 'Contact' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCustomizeContact(true)} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium text-[var(--text-main)] hover:bg-[var(--background)] transition-colors">
                    <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                  </button>
                </div>
                {(sc('salutation') || sc('firstName') || sc('lastName') || sc('email') || sc('additionalEmails') || sc('mobileNo') || sc('phone') || sc('gender') || sc('linkedinUrl')) && (
                  <CrmFormSection title="Contact Information" defaultOpen={true}>
                    <CrmFormGrid>
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
                      {sc('linkedinUrl') && <FormItem label="LinkedIn URL" name="linkedinUrl" defaultValue={initialData.linkedinUrl} placeholder="https://linkedin.com/in/username" />}
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
                {(sc('pipeline') || sc('stage') || sc('status') || sc('leadOwner')) && (
                  <CrmFormSection title="Pipeline & ownership" defaultOpen={false}>
                    <CrmFormGrid>
                      {sc('pipeline') && (
                        <div className="space-y-1.5">
                          <label className={CRM_HS_LABEL_CLASS}>Pipeline</label>
                          <select
                            name="pipeline"
                            value={selectedPipeline ? String(selectedPipeline) : ''}
                            onChange={(e) => setSelectedPipeline(e.target.value)}
                            className={CRM_HS_SELECT_CLASS}
                          >
                            {pipelines.map((p: any) => (
                              <option key={String(p._id)} value={String(p._id)}>{p.name}</option>
                            ))}
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
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
                {(sc('telegram') || sc('address')) && (
                  <CrmFormSection title="Other" defaultOpen={false}>
                    <CrmFormGrid>
                      {sc('telegram') && <FormItem label="Telegram" name="telegram" defaultValue={initialData.telegram} placeholder="@username or +1…" />}
                      {sc('address') && <FormItem label="Address" name="address" className="col-span-2" defaultValue={initialData.address} />}
                    </CrmFormGrid>
                  </CrmFormSection>
                )}
                {customFields.some((f) => sc(`cf:${f.key}`)) && (
                  <CrmFormSection title="Custom Properties" defaultOpen={false}>
                    <CrmFormGrid>
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
                    </CrmFormGrid>
                  </CrmFormSection>
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
            className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--error)] hover:bg-[var(--error-light)] disabled:opacity-50"
          >
            <Trash2 size={16} strokeWidth={1.75} />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`${CRM_BTN_SECONDARY} disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-form"
              disabled={loading}
              className={`${CRM_BTN_PRIMARY} disabled:opacity-50`}
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
    <div className={`space-y-0 ${className}`}>
      <label className={CRM_HS_LABEL_CLASS}>
        {label}
        {required ? <span className="text-[var(--primary)] ml-0.5">*</span> : null}
      </label>
      {type === 'multiselect' ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 space-y-2 max-h-[200px] overflow-y-auto shadow-[var(--crm-shadow-input)]">
          {(options as string[]).map((opt: string) => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer text-sm text-[var(--text-main)]">
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={Array.isArray(defaultValue) && defaultValue.includes(opt)}
                className="rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
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
            className={`${CRM_HS_SELECT_CLASS} pr-10`}
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
          <ChevronDown className="absolute right-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
        </div>
      ) : type === 'textarea' ? (
        <textarea
          name={name}
          required={required}
          value={value !== undefined ? value : undefined}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChange={onChange}
          className={`${CRM_HS_CONTROL_CLASS} min-h-[100px] h-auto py-2.5 resize-y`}
          placeholder={placeholder}
        />
      ) : type === 'phone' ? (
        <div className="flex relative items-center group">
          <select
            name={`${name}_countryCode`}
            defaultValue={getDefaultCountryCodeFromPhone(defaultValue ? String(defaultValue) : undefined)}
            className="absolute left-0 z-10 w-[7rem] sm:w-[7.5rem] h-[38px] bg-[var(--card-bg)] text-sm text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[var(--radius-md)]"
          >
            {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            name={name}
            required={required}
            defaultValue={getNationalDigitsFromPhone(defaultValue ? String(defaultValue) : undefined)}
            className={`${CRM_HS_CONTROL_CLASS} pl-[7.25rem] sm:pl-[7.75rem]`}
            placeholder={placeholder || "9876543210"}
          />
        </div>
      ) : type === 'date' ? (
        <FormDatePicker name={name} defaultValue={defaultValue} required={required} visualVariant="hubspot" />
      ) : (
        <input
          name={name}
          type={type === 'url' ? 'url' : type}
          required={required}
          value={value !== undefined ? value : undefined}
          defaultValue={value === undefined ? (defaultValue as string | number) : undefined}
          onChange={onChange}
          className={CRM_HS_CONTROL_CLASS}
          placeholder={type === 'url' ? 'https://…' : placeholder}
          onBlur={onBlurField}
        />
      )}
    </div>
  );
}
