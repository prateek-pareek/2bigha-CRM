"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { crmModalChrome } from '@/lib/crm/chrome';
import { X, User, Building2, Handshake, FileText, CheckCircle, PhoneCall, UserCheck, ShieldAlert, Settings2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { CRM_API_URL } from '@/lib/crm/config';
import { getVisibleFieldKeysOrdered } from '@/lib/crm/crm-field-layout';
import CRMLeadFormFields from '@/components/crm/records/forms/CRMLeadFormFields';
import CRMDealFormFields from '@/components/crm/records/forms/CRMDealFormFields';
import CRMContactFormFields from '@/components/crm/records/forms/CRMContactFormFields';
import CRMOrganizationFormFields from '@/components/crm/records/forms/CRMOrganizationFormFields';
import CRMClientFormFields from '@/components/crm/records/forms/CRMClientFormFields';
import CRMFieldLayoutCustomizer from '@/components/crm/records/forms/CRMFieldLayoutCustomizer';
import { hasPersonContactMethod } from '@/lib/crm/crm-contact-method';
import { parseAdditionalEmailsFromForm } from '@/lib/crm/crm-additional-emails';
import { toast } from 'sonner';
import { invalidateCrmForEntityType } from '@/lib/crm/shared/invalidate-on-mutation';
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from '@/lib/crm/phone-country-codes';
import { FormDatePicker } from '@/components/ui/date-picker';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTab?: 'Lead' | 'Deal' | 'Org' | 'Contact' | 'Note' | 'Task' | 'Call' | 'Client';
  initialPipelineId?: string;
  initialStage?: string;
  initialSource?: string;
}

export default function QuickAddModal({ isOpen, onClose, onSuccess, initialTab = 'Deal', initialPipelineId = '', initialStage = '', initialSource = '' }: QuickAddModalProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [leadSelectedStage, setLeadSelectedStage] = useState('');
  const [contactSelectedStage, setContactSelectedStage] = useState('');
  const [layoutTickLead, setLayoutTickLead] = useState(0);
  const [layoutTickDeal, setLayoutTickDeal] = useState(0);
  const [layoutTickContact, setLayoutTickContact] = useState(0);
  const [layoutTickOrg, setLayoutTickOrg] = useState(0);
  const [layoutTickClient, setLayoutTickClient] = useState(0);
  const [serviceOfferings, setServiceOfferings] = useState<Array<{ _id: string; name: string }>>([]);
  const [showCustomizeLead, setShowCustomizeLead] = useState(false);
  const [showCustomizeDeal, setShowCustomizeDeal] = useState(false);
  const [showCustomizeContact, setShowCustomizeContact] = useState(false);
  const [showCustomizeOrg, setShowCustomizeOrg] = useState(false);
  const [showCustomizeClient, setShowCustomizeClient] = useState(false);
  const { hasAccess, user } = usePermissions();
  const defaultDealOwner = useMemo(() => {
    const n = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return n || String(user?.email || "").trim();
  }, [user?.firstName, user?.lastName, user?.email]);

  const visibleLeadKeys = useMemo(() => {
    if (activeTab !== 'Lead') return [];
    return getVisibleFieldKeysOrdered('leads', 'form', customFields.map((f) => f.key));
  }, [customFields, layoutTickLead, activeTab]);

  const visibleDealKeys = useMemo(() => {
    if (activeTab !== 'Deal') return [];
    return getVisibleFieldKeysOrdered('deals', 'form', customFields.map((f) => f.key));
  }, [customFields, layoutTickDeal, activeTab]);

  const visibleContactKeys = useMemo(() => {
    if (activeTab !== 'Contact') return [];
    return getVisibleFieldKeysOrdered('contacts', 'form', customFields.map((f) => f.key));
  }, [customFields, layoutTickContact, activeTab]);

  const visibleOrgKeys = useMemo(() => {
    if (activeTab !== 'Org') return [];
    return getVisibleFieldKeysOrdered('organizations', 'form', customFields.map((f) => f.key));
  }, [customFields, layoutTickOrg, activeTab]);

  const visibleClientKeys = useMemo(() => {
    if (activeTab !== 'Client') return [];
    return getVisibleFieldKeysOrdered('clients', 'form', customFields.map((f) => f.key));
  }, [customFields, layoutTickClient, activeTab]);

  // Sync activeTab with initialTab when modal opens or initialTab changes
  useEffect(() => {
    if (isOpen) {
      let startingTab = initialTab;

      // Validate if user has permission for the requested initialTab
      const tabPerm: any = { 'Lead': 'leads:write', 'Deal': 'deals:write', 'Org': 'organizations:write', 'Contact': 'contacts:write', 'Client': 'clients:write', 'Note': 'activities:write', 'Task': 'activities:write', 'Call': 'activities:write' };
      if (tabPerm[startingTab] && !hasAccess(tabPerm[startingTab])) {
        const availableTabs = [
          { name: 'Lead', permission: 'leads:write' },
          { name: 'Deal', permission: 'deals:write' },
          { name: 'Org', permission: 'organizations:write' },
          { name: 'Contact', permission: 'contacts:write' },
          { name: 'Client', permission: 'clients:write' },
          { name: 'Note', permission: 'activities:write' },
          { name: 'Task', permission: 'activities:write' },
          { name: 'Call', permission: 'activities:write' }
        ].filter(t => hasAccess(t.permission));

        if (availableTabs.length > 0) {
          startingTab = availableTabs[0].name as any;
        }
      }

      setActiveTab(startingTab);
      fetchCustomFields(startingTab);
      fetchOrganizations();
      fetchContacts();
      void fetchServiceOfferings();
    }
  }, [isOpen, initialTab, hasAccess]);

  useEffect(() => {
    if (isOpen && initialPipelineId && pipelines.some((p: any) => p._id === initialPipelineId)) {
      setSelectedPipeline(initialPipelineId);
    }
  }, [isOpen, initialPipelineId, pipelines]);

  useEffect(() => {
    fetchCustomFields(activeTab);
    if (activeTab === 'Deal') {
      fetchPipelines('deals');
      fetchOrganizations();
      fetchContacts();
    }
    if (activeTab === 'Lead' || activeTab === 'Contact') {
      fetchPipelines('leads');
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'Lead') return;
    const currentLeadPipeline = pipelines.find((p) => p._id === selectedPipeline);
    if (!currentLeadPipeline?.stages?.length) return;
    const sorted = [...currentLeadPipeline.stages].sort((a: any, b: any) => a.order - b.order);
    const names = sorted.map((s: any) => s.name);
    setLeadSelectedStage((prev) => (prev && names.includes(prev) ? prev : names[0] || 'New'));
  }, [activeTab, selectedPipeline, pipelines]);

  useEffect(() => {
    if (activeTab !== 'Contact') return;
    const current = pipelines.find((p) => p._id === selectedPipeline);
    if (!current?.stages?.length) return;
    const sorted = [...current.stages].sort((a: any, b: any) => a.order - b.order);
    const names = sorted.map((s: any) => s.name);
    setContactSelectedStage((prev) => (prev && names.includes(prev) ? prev : names[0] || 'New'));
  }, [activeTab, selectedPipeline, pipelines]);

  useEffect(() => {
    if (isOpen && initialStage && activeTab === 'Lead') setLeadSelectedStage(initialStage);
  }, [isOpen, initialStage, activeTab]);

  const fetchOrganizations = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/organizations/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setOrganizations(await res.json());
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  };

  const fetchServiceOfferings = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/service-offerings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : [];
      setServiceOfferings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch service offerings:', err);
      setServiceOfferings([]);
    }
  };

  const fetchContacts = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/contacts/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setContacts(await res.json());
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  const fetchPipelines = async (type?: 'deals' | 'leads') => {
    const token = localStorage.getItem('token');
    const url = type ? `${CRM_API_URL}/crm/pipelines?type=${type}` : `${CRM_API_URL}/crm/pipelines`;
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
        if (data.length > 0) {
          const assignedId =
            type === 'leads'
              ? (user as any)?.assignedLeadsPipeline
              : (user as any)?.assignedDealsPipeline;

          if (assignedId && data.some((p: any) => p._id === assignedId)) {
            setSelectedPipeline(assignedId);
          } else {
            const saved = localStorage.getItem(`crm_active_pipeline_${type}`);
            if (saved && data.some((p: any) => p._id === saved)) {
              setSelectedPipeline(saved);
            } else {
              const defaultP = data.find((p: any) => p.isDefault) || data[0];
              setSelectedPipeline(defaultP._id);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    }
  };

  const fetchCustomFields = async (tab: string) => {
    const moduleMap: any = {
      Lead: 'leads',
      Deal: 'deals',
      Org: 'organizations',
      Contact: 'contacts',
      Client: 'clients',
    };
    const moduleName = moduleMap[tab];
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
        if (res.status === 401) {
          window.location.href = '/auth/login';
        }
        if (res.status !== 403) {
          console.error('Failed to fetch custom fields:', res.status, res.statusText);
        }
        setCustomFields([]);
      }
    } catch (err) {
      console.error('Failed to fetch custom fields:', err);
      setCustomFields([]);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries()) as Record<string, string>;

    // Auto-combine phone country codes
    if (data.phone_countryCode && data.phone) {
      data.phone = `${data.phone_countryCode} ${data.phone}`.trim();
      delete data.phone_countryCode;
    }
    if (data.mobileNo_countryCode && data.mobileNo) {
      data.mobileNo = `${data.mobileNo_countryCode} ${data.mobileNo}`.trim();
      delete data.mobileNo_countryCode;
    }

    if (activeTab === 'Lead' || activeTab === 'Contact') {
      if (
        !hasPersonContactMethod({
          email: data.email,
          mobileNo: data.mobileNo,
          phone: data.phone,
          linkedinUrl: data.linkedinUrl,
          twitterHandle: data.twitterHandle,
        })
      ) {
        toast.error(
          activeTab === 'Lead'
            ? 'Add at least one of email or phone (mobile or alternate) so we can reach this lead.'
            : 'Add at least one of email, phone (mobile or alternate), or LinkedIn URL so we can reach this contact.'
        );
        return;
      }
    }
    setLoading(true);

    const endpoint = activeTab === 'Lead' ? 'leads' :
      activeTab === 'Deal' ? 'deals' :
        activeTab === 'Org' ? 'organizations' :
          activeTab === 'Client' ? 'clients' :
            activeTab === 'Contact' ? 'contacts' : 'activities';

    // Extract custom fields
    const customFieldsData: any = {};
    customFields.forEach(field => {
      const fieldName = `cf_${field.key}`;
      if (field.type === 'multiselect') {
        const vals = formData.getAll(fieldName).filter((v) => v != null && String(v).trim() !== '');
        if (vals.length) {
          customFieldsData[field.key] = vals;
          delete data[fieldName];
        }
      } else if (data[fieldName]) {
        customFieldsData[field.key] = data[fieldName];
        delete data[fieldName];
      }
    });

    let payload: any = { ...data };

    if (activeTab === 'Lead' || activeTab === 'Contact' || activeTab === 'Client') {
      const addl = parseAdditionalEmailsFromForm(formData, data.email);
      payload.additionalEmails = addl.length ? addl : undefined;
    }

    // Parse sourceMetadata if present
    if (payload.sourceMetadata) {
      try {
        payload.sourceMetadata = JSON.parse(payload.sourceMetadata);
      } catch (e) {
        console.error('Failed to parse sourceMetadata', e);
        delete payload.sourceMetadata;
      }
    }
    if (
      payload.organization === '' ||
      payload.organization === 'Select Organization...' ||
      payload.organization === 'Select organization...'
    ) {
      payload.organization = null;
    }
    if (Object.keys(customFieldsData).length > 0) {
      payload.customFields = customFieldsData;
    }

    if (activeTab === 'Deal' && selectedPipeline) {
      payload.pipeline = selectedPipeline;
    }
    if (activeTab === 'Deal') {
      if (payload.expectedClosureDate === '') delete payload.expectedClosureDate;
      if (payload.closedDate === '') delete payload.closedDate;
      if (payload.dealValue !== undefined && payload.dealValue !== '') payload.dealValue = Number(payload.dealValue);
      if (payload.expectedDealValue !== undefined && payload.expectedDealValue !== '')
        payload.expectedDealValue = Number(payload.expectedDealValue);
      if (payload.exchangeRate !== undefined && payload.exchangeRate !== '') payload.exchangeRate = Number(payload.exchangeRate);
      payload.pricingType =
        String(payload.pricingType || '').toLowerCase() === 'monthly' ? 'monthly' : 'fixed';
      if (payload.pricingType === 'monthly') {
        const months = Number(payload.contractMonths);
        payload.contractMonths =
          Number.isFinite(months) && months > 0 ? Math.min(60, Math.round(months)) : 12;
      } else {
        delete payload.contractMonths;
      }

      // Stage owns win probability — never ask for it on create.
      const dealPipeline = pipelines.find((p: any) => String(p._id) === String(selectedPipeline));
      const sortedStages = [...(dealPipeline?.stages || [])].sort(
        (a: any, b: any) => a.order - b.order,
      );
      const firstStage =
        sortedStages.find((s: any) => s.isDefault)?.name ||
        sortedStages[0]?.name ||
        'Qualification';
      const stage = (payload.stage as string) || firstStage;
      payload.stage = stage;
      payload.status = (payload.status as string) || stage;
      const stageProb = sortedStages.find((s: any) => s.name === stage)?.probability;
      if (typeof stageProb === 'number') {
        payload.probability = stageProb;
      } else {
        delete payload.probability;
      }
    }
    if (activeTab === 'Lead') {
      if (selectedPipeline) payload.pipeline = selectedPipeline;
      const firstStage =
        pipelines
          .find((p: any) => p._id === selectedPipeline)
          ?.stages?.sort((a: any, b: any) => a.order - b.order)[0]?.name || 'New';
      const stage = leadSelectedStage || (payload.stage as string) || firstStage;
      payload.stage = stage;
      payload.status = (payload.status as string) || stage;
      if (payload.annualRevenue !== undefined && payload.annualRevenue !== '')
        payload.annualRevenue = Number(payload.annualRevenue);
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '') delete payload[k];
      });
    }

    if (activeTab === 'Contact') {
      if (selectedPipeline) payload.pipeline = selectedPipeline;
      const firstStage =
        pipelines
          .find((p: any) => p._id === selectedPipeline)
          ?.stages?.sort((a: any, b: any) => a.order - b.order)[0]?.name || 'New';
      const stage = contactSelectedStage || (payload.stage as string) || firstStage;
      payload.stage = stage;
      payload.status = (payload.status as string) || stage;
      if (initialSource && !payload.source) payload.source = initialSource;
      if (payload.annualRevenue !== undefined && payload.annualRevenue !== '')
        payload.annualRevenue = Number(payload.annualRevenue);
      Object.keys(payload).forEach((k) => {
        if (payload[k] === '') delete payload[k];
      });
    }

    if (['Note', 'Task', 'Call'].includes(activeTab)) {
      payload = {
        type: activeTab,
        title: data.title || `${activeTab} ${new Date().toLocaleDateString()}`,
        content: data.content || data.description || '',
        meta: data
      };
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        invalidateCrmForEntityType(activeTab);
        if ((activeTab === 'Lead' || activeTab === 'Contact') && payload.pipeline)
          localStorage.setItem('crm_active_pipeline_leads', payload.pipeline);
        if (activeTab === 'Deal' && payload.pipeline) localStorage.setItem('crm_active_pipeline_deals', payload.pipeline);
        if (saveAndAddAnother) {
          // Reset form fields but keep modal open
          formRef.current?.reset();
          toast.success(`${activeTab} created! Fill in another.`);
          if (onSuccess) onSuccess();
        } else {
          onClose();
          if (onSuccess) onSuccess();
          else window.location.reload();
        }
      } else {
        let message = res.statusText;
        try {
          const errorData = await res.json();
          message =
            typeof errorData?.message === 'string'
              ? errorData.message
              : Array.isArray(errorData?.message)
                ? errorData.message.join(', ')
                : errorData?.message?.message || res.statusText;
        } catch {
          /* ignore */
        }
        console.error('Failed to create record:', res.status, message);
        toast.error(message || 'Failed to create record');
      }
    } catch (err) {
      console.error('Failed to create record', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { name: 'Lead', icon: User, color: 'text-primary', permission: 'leads:write' },
    { name: 'Deal', icon: Handshake, color: 'text-amber-600', permission: 'deals:write' },
    { name: 'Org', icon: Building2, color: 'text-purple-600', permission: 'organizations:write' },
    { name: 'Contact', icon: User, color: 'text-emerald-600', permission: 'contacts:write' },
    { name: 'Client', icon: UserCheck, color: 'text-text-main', permission: 'clients:write' },
    { name: 'Note', icon: FileText, color: 'text-text-main', permission: 'activities:write' },
    { name: 'Task', icon: CheckCircle, color: 'text-indigo-600', permission: 'activities:write' },
    { name: 'Call', icon: PhoneCall, color: 'text-rose-600', permission: 'activities:write' },
  ].filter(t => hasAccess(t.permission));

  const modalContent = (
    <div className={crmModalChrome.overlay} style={{ isolation: 'isolate' }}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.slidePanel} max-w-xl`}>
        {/* Header (sticky) */}
        <div className={`${crmModalChrome.slideHeader} flex-col items-stretch gap-4 sm:flex-row sm:items-start`}>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={crmModalChrome.slideTitle}>Quick add</h2>
              <p className={crmModalChrome.slideSubtitle}>Create a new CRM record or log an activity</p>
            </div>
            <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>

          <div className={crmModalChrome.tabBar}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.name;
              return (
                <button
                  key={tab.name}
                  type="button"
                  onClick={() => setActiveTab(tab.name as any)}
                  className={`${crmModalChrome.tabBtn} ${
                    isActive ? crmModalChrome.tabBtnActive : crmModalChrome.tabBtnInactive
                  }`}
                >
                  <Icon size={12} />
                  {tab.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className={`${crmModalChrome.slideBody} px-5 py-5`}>
          {tabs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <ShieldAlert size={40} className="mb-4 opacity-50 text-rose-500" />
              <h3 className="text-xl font-bold text-slate-800 mb-1">Creation disabled</h3>
              <p className="text-sm">You do not have write access to any modules.</p>
            </div>
          ) : (
            <form id="quick-add-form" ref={formRef} onSubmit={handleSubmit} className="space-y-5 pb-4">

              {activeTab === 'Lead' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      Add at least one of email or phone.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCustomizeLead(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors shrink-0"
                    >
                      <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                    </button>
                  </div>
                  <CRMLeadFormFields
                    visibleKeys={visibleLeadKeys}
                    customFields={customFields}
                    pipelines={pipelines}
                    selectedPipeline={selectedPipeline}
                    setSelectedPipeline={setSelectedPipeline}
                    selectedStage={leadSelectedStage}
                    setSelectedStage={setLeadSelectedStage}
                    variant="stack"
                    visualVariant="hubspot"
                    identifierContext={{ entityType: 'lead' }}
                    services={serviceOfferings}
                  />
                </div>
              )}

              {activeTab === 'Deal' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCustomizeDeal(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors shrink-0"
                    >
                      <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                    </button>
                  </div>
                  <CRMDealFormFields
                    visibleKeys={visibleDealKeys}
                    customFields={customFields}
                    pipelines={pipelines}
                    selectedPipeline={selectedPipeline}
                    setSelectedPipeline={setSelectedPipeline}
                    organizations={organizations}
                    contacts={contacts}
                    userAssignedPipeline={(user as any)?.assignedDealsPipeline}
                    defaultDealOwner={defaultDealOwner}
                    variant="stack"
                    visualVariant="hubspot"
                  />
                </div>
              )}

              {activeTab === 'Org' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      Fill in company details. Organization name is required.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCustomizeOrg(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors shrink-0"
                    >
                      <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                    </button>
                  </div>
                  <CRMOrganizationFormFields
                    visibleKeys={visibleOrgKeys}
                    customFields={customFields}
                    variant="stack"
                    visualVariant="hubspot"
                  />
                </div>
              )}

              {activeTab === 'Contact' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                      Add at least one of email, phone, or LinkedIn.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCustomizeContact(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors shrink-0"
                    >
                      <Settings2 size={13} className="text-[var(--text-muted)]" /> Fields
                    </button>
                  </div>
                  <CRMContactFormFields
                    visibleKeys={visibleContactKeys}
                    customFields={customFields}
                    visualVariant="hubspot"
                    pipelines={pipelines}
                    selectedPipeline={selectedPipeline}
                    setSelectedPipeline={setSelectedPipeline}
                    selectedStage={contactSelectedStage}
                    setSelectedStage={setContactSelectedStage}
                    variant="stack"
                    organizations={organizations}
                    identifierContext={{ entityType: 'contact' }}
                  />
                </div>
              )}

              {activeTab === 'Client' && (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCustomizeClient(true)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-semibold text-[var(--hs-link)] hover:bg-[#e6f4f7] transition-colors"
                    >
                      <Settings2 size={15} /> Fields
                    </button>
                  </div>
                  <p className="text-sm text-[var(--primary-muted)] font-normal leading-snug">
                    Name and email are required. Phone and organization are optional.
                  </p>
                  <CRMClientFormFields
                    visibleKeys={visibleClientKeys}
                    customFields={customFields}
                    organizations={organizations}
                    variant="stack"
                    visualVariant="hubspot"
                  />
                </div>
              )}

              {activeTab === 'Note' && (
                <div className="space-y-4">
                  <FormItem label="Title (required)" name="title" required placeholder="Call with John Doe" />
                  <FormItem label="Content" name="content" type="textarea" placeholder="Detailed notes about the meeting..." />
                </div>
              )}

              {activeTab === 'Task' && (
                <div className="space-y-5">
                  <FormItem label="Title" name="title" required placeholder="What needs to be done?" className="w-full" />
                  <FormItem label="Description" name="description" type="textarea" placeholder="Optional details…" className="w-full" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Status" name="status" type="select" options={['Backlog', 'Open', 'In Progress', 'Completed']} defaultValue="Backlog" />
                    <FormItem label="Priority" name="priority" type="select" options={['Low', 'Medium', 'High']} defaultValue="Low" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormItem label="Due date" name="dueDate" type="date" />
                    <FormItem label="Owner" name="owner" defaultValue="Administrator" />
                  </div>
                </div>
              )}

              {activeTab === 'Call' && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <FormItem label="Type" name="type" type="select" options={['Inbound', 'Outbound']} />
                  <FormItem label="From" name="from" placeholder="Administrator" />
                  <FormItem label="To" name="to" placeholder="Contact Name" />
                  <FormItem label="Duration" name="duration" type="number" placeholder="Seconds" />
                  <FormItem label="Status" name="status" type="select" options={['Completed', 'Missed', 'Busy', 'Failed']} defaultValue="Completed" />
                </div>
              )}

            </form>
          )}
        </div>

        {/* Sticky CTA Footer */}
        {tabs.length > 0 && (() => {
          const activePermission = activeTab === 'Lead' ? 'leads:write' : activeTab === 'Deal' ? 'deals:write' : activeTab === 'Org' ? 'organizations:write' : activeTab === 'Contact' ? 'contacts:write' : activeTab === 'Client' ? 'clients:write' : 'activities:write';
          const hasWriteAccess = hasAccess(activePermission);
          const isDisabled = loading || !hasWriteAccess;
          const showAddAnother = ['Lead', 'Deal', 'Client'].includes(activeTab) && hasWriteAccess;
          return (
            <div className="p-6 bg-surface-dim/30 border-t border-[var(--border-color)] shrink-0">
              <div className={`flex gap-2 ${showAddAnother ? 'flex-col sm:flex-row' : ''}`}>
                {showAddAnother && (
                  <button
                    form="quick-add-form"
                    type="submit"
                    disabled={isDisabled}
                    onClick={() => setSaveAndAddAnother(true)}
                    className={`flex-1 py-3 rounded-md font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 border ${
                      isDisabled
                        ? 'bg-slate-100 text-slate-400 border-[var(--border-color)] cursor-not-allowed'
                        : 'bg-white text-[var(--text-main)] border-[var(--border-color)] hover:bg-[var(--background)] hover:border-[#99acc2]'
                    }`}
                  >
                    {loading && saveAndAddAnother ? 'Saving...' : `Create & Add Another`}
                  </button>
                )}
                <button
                  form="quick-add-form"
                  type="submit"
                  disabled={isDisabled}
                  onClick={() => setSaveAndAddAnother(false)}
                  className={`flex-1 py-3 rounded-md font-semibold text-sm text-white shadow-sm transition-colors flex items-center justify-center gap-2 ${
                    isDisabled
                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)]'
                  }`}
                >
                  {isDisabled
                    ? (loading ? 'Processing...' : 'Access Denied')
                    : activeTab === 'Call' ? 'Log Call' : `Create ${activeTab}`}
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeLead}
        onClose={() => setShowCustomizeLead(false)}
        module="leads"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickLead((t) => t + 1)}
      />
      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeDeal}
        onClose={() => setShowCustomizeDeal(false)}
        module="deals"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickDeal((t) => t + 1)}
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
      <CRMFieldLayoutCustomizer
        isOpen={showCustomizeClient}
        onClose={() => setShowCustomizeClient(false)}
        module="clients"
        context="form"
        customFieldKeys={customFields.map((f) => ({ key: f.key, label: f.name }))}
        onSaved={() => setLayoutTickClient((t) => t + 1)}
      />
    </div>
  );

  return <CrmJiraPortal>{modalContent}</CrmJiraPortal>;
}

function FormItem({ label, name, type = 'text', options = [], placeholder = '', required = false, className = '', defaultValue = '' }: any) {
  const inputCls = 'w-full h-10 bg-white border border-[var(--border-color)] rounded-md py-2 px-3 text-sm font-normal text-[var(--text-main)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--primary-muted)] focus:border-primary focus:ring-1 focus:ring-primary/35';
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-sm font-semibold text-[var(--text-main)] px-0.5">
        {label}{required && <span className="text-[#f2545b] ml-0.5">*</span>}
      </label>
      {type === 'select' ? (
        <select name={name} required={required} defaultValue={defaultValue} className={`${inputCls} appearance-none cursor-pointer`}>
          {options.map((opt: any) => (
            <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
              {typeof opt === 'string' ? opt : opt.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea name={name} required={required} defaultValue={defaultValue} className={`${inputCls} h-auto min-h-[100px] resize-y py-2.5`} placeholder={placeholder} />
      ) : type === 'date' ? (
        <FormDatePicker name={name} defaultValue={defaultValue} required={required} visualVariant="hubspot" />
      ) : (
        <input name={name} type={type} required={required} defaultValue={defaultValue} className={inputCls} placeholder={placeholder} />
      )}
    </div>
  );
}
