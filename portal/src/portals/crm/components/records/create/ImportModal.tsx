"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ChevronRight, ChevronLeft, Database, Plus, ChevronDown, Sparkles, GitMerge, RefreshCw, Ban, CopyPlus } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { crmModalChrome } from '@/lib/crm/chrome';
import { CrmButton } from '@/components/crm/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCrmImportStore } from '@/stores/crmImportStore';
import type { CrmImportEntityType } from '@/stores/crmImportStore';

interface ImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 type: CrmImportEntityType;
}

/** Extra mapping rows for HubSpot-style exports (companies ↔ contacts ↔ deals). */
const CRM_FIELDS_MAP: Record<string, { label: string; key: string }[]> = {
 leads: [
  { label: 'Salutation', key: 'salutation' },
  { label: 'First Name', key: 'firstName' },
  { label: 'Last Name', key: 'lastName' },
  { label: 'Role (OWNER/AGENT/USER — creates/links a Client)', key: 'role' },
  { label: 'Email', key: 'email' },
  { label: 'Additional Emails (comma or semicolon-separated)', key: 'additionalEmails' },
  { label: 'Gender', key: 'gender' },
  { label: 'Mobile No', key: 'mobileNo' },
  { label: 'Phone', key: 'phone' },
  { label: 'WhatsApp Number (on the linked Client)', key: 'whatsappNumber' },
  { label: 'Address (on the linked Client)', key: 'address' },
  { label: 'Organization / Company name', key: 'organization' },
  { label: 'HubSpot company ID (match imported company)', key: 'hubspotCompanyId' },
  { label: 'HubSpot contact ID (optional, for linking)', key: 'hubspotContactId' },
  { label: 'MongoDB organization ID (advanced)', key: 'organizationId' },
  { label: 'Job Title', key: 'jobTitle' },
  { label: 'Website', key: 'website' },
  { label: 'LinkedIn URL', key: 'linkedinUrl' },
  { label: 'Annual Revenue', key: 'annualRevenue' },
  { label: 'Industry', key: 'industry' },
  { label: 'No. of Employees', key: 'noOfEmployees' },
  { label: 'Territory', key: 'territory' },
  { label: 'Status', key: 'status' },
  { label: 'Call Status', key: 'callStatus' },
  { label: 'Group (Seller/Buyer — see Settings)', key: 'group' },
  { label: 'Lead Type (Reference/Investor/Lead/Buyer lead — see Settings)', key: 'leadCategory' },
  { label: 'Lead Source', key: 'source' },
  { label: 'Notes', key: 'notes' },
 ],
 contacts: [
  { label: 'Salutation', key: 'salutation' },
  { label: 'First Name', key: 'firstName' },
  { label: 'Last Name', key: 'lastName' },
  { label: 'Email', key: 'email' },
  { label: 'Additional Emails (comma or semicolon-separated)', key: 'additionalEmails' },
  { label: 'Gender', key: 'gender' },
  { label: 'Mobile No', key: 'mobileNo' },
  { label: 'Phone', key: 'phone' },
  { label: 'Job Title', key: 'jobTitle' },
  { label: 'Organization / Company name', key: 'organization' },
  { label: 'HubSpot company ID (match imported company)', key: 'hubspotCompanyId' },
  { label: 'HubSpot contact ID (stored for deal linking)', key: 'hubspotContactId' },
  { label: 'MongoDB organization ID (advanced)', key: 'organizationId' },
  { label: 'Lead Source', key: 'source' },
  { label: 'Industry', key: 'industry' },
  { label: 'Annual Revenue', key: 'annualRevenue' },
  { label: 'No. of Employees', key: 'noOfEmployees' },
  { label: 'Website', key: 'website' },
  { label: 'LinkedIn URL', key: 'linkedinUrl' },
  { label: 'Territory', key: 'territory' },
  { label: 'Telegram', key: 'telegram' },
  { label: 'Address', key: 'address' },
  { label: 'Owner', key: 'leadOwner' },
  { label: 'Status', key: 'status' },
  { label: 'Stage', key: 'stage' },
 ],
 deals: [
  { label: 'Deal Title', key: 'title' },
  { label: 'Value', key: 'dealValue' },
  { label: 'Pricing Type (fixed/monthly)', key: 'pricingType' },
  { label: 'Contract Months', key: 'contractMonths' },
  { label: 'Expected Deal Value', key: 'expectedDealValue' },
  { label: 'Currency', key: 'currency' },
  { label: 'Exchange Rate', key: 'exchangeRate' },
  { label: 'Stage', key: 'stage' },
  { label: 'Probability', key: 'probability' },
  { label: 'Company / Organization name', key: 'organization' },
  { label: 'Contact email (link to contact)', key: 'contactEmail' },
  { label: 'HubSpot contact ID (link to contact)', key: 'hubspotContactId' },
  { label: 'MongoDB contact ID (advanced)', key: 'contactPerson' },
  { label: 'Deal Owner', key: 'dealOwner' },
  { label: 'Expected Closure Date', key: 'expectedClosureDate' },
  { label: 'Closed Date', key: 'closedDate' },
  { label: 'Next Step', key: 'nextStep' },
 ],
 clients: [
  { label: 'Client Name', key: 'name' },
  { label: 'Email', key: 'email' },
  { label: 'Additional Emails (comma or semicolon-separated)', key: 'additionalEmails' },
  { label: 'Phone', key: 'phone' },
  { label: 'WhatsApp Number', key: 'whatsappNumber' },
  { label: 'Address', key: 'address' },
  { label: 'Role (OWNER/AGENT/USER)', key: 'role' },
  { label: 'Status', key: 'status' },
 ],
 organizations: [
  { label: 'Company name', key: 'name' },
  { label: 'Company record ID (2Bigha / HubSpot-style)', key: 'recordId' },
  { label: 'HubSpot company ID (Record ID)', key: 'hubspotCompanyId' },
  { label: 'Website', key: 'website' },
  { label: 'Phone', key: 'phone' },
  { label: 'Email', key: 'email' },
  { label: 'Industry', key: 'industry' },
  { label: 'Territory', key: 'territory' },
  { label: 'No. of Employees', key: 'noOfEmployees' },
  { label: 'Annual Revenue', key: 'annualRevenue' },
  { label: 'Address', key: 'address' },
 ],
};

export type ImportDuplicateStrategy = 'merge' | 'replace' | 'skip' | 'create';

const DUPLICATE_STRATEGY_OPTIONS: {
  value: ImportDuplicateStrategy;
  label: string;
  description: string;
  icon: typeof GitMerge;
}[] = [
  {
    value: 'merge',
    label: 'Merge with existing',
    description: 'Fill empty fields on matching records; keep existing values when set.',
    icon: GitMerge,
  },
  {
    value: 'replace',
    label: 'Replace existing',
    description: 'Overwrite matching records with values from the file.',
    icon: RefreshCw,
  },
  {
    value: 'skip',
    label: 'Skip duplicates',
    description: 'Do not change records that already exist (matched by email or HubSpot ID).',
    icon: Ban,
  },
  {
    value: 'create',
    label: 'Always create new',
    description: 'Import every row as a new record, even when a match exists.',
    icon: CopyPlus,
  },
];

const IMPORT_TYPE_LABEL: Record<ImportModalProps['type'], string> = {
  leads: 'Lead',
  contacts: 'Contact',
  deals: 'Deal',
  clients: 'Client',
  organizations: 'Company',
};

function normHeader(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Suggest column mappings for HubSpot CSV/XLSX export headers. */
function applyHubSpotHints(
  type: ImportModalProps['type'],
  headers: string[],
  mapping: Record<string, string>,
): Record<string, string> {
  const out = { ...mapping };
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const pick = (...candidates: string[]) => {
    for (const c of candidates) {
      const hit = byNorm.get(normHeader(c));
      if (hit) return hit;
    }
    return '';
  };
  if (!out.firstName) out.firstName = pick('First Name', 'First name');
  if (!out.lastName) out.lastName = pick('Last Name', 'Last name');
  if (!out.email) out.email = pick('Email', 'Work Email', 'Email Address');
  if (!out.phone && (type === 'contacts' || type === 'leads'))
    out.phone = pick('Phone Number', 'Phone', 'Work phone');
  if (!out.mobileNo) out.mobileNo = pick('Mobile Phone', 'Mobile phone', 'Contact Number', 'Phone');
  if (!out.organization && (type === 'contacts' || type === 'leads'))
    out.organization = pick(
      'Company Name',
      'Associated Company',
      'Primary Associated Company ID',
      'Company name',
    );
  if (!out.jobTitle && type !== 'organizations')
    out.jobTitle = pick('Job Title', 'Job title');
  if (!out.name && type === 'organizations')
    out.name = pick('Name', 'Company name', 'Company Name', 'Company');
  if (!out.hubspotCompanyId && type === 'organizations')
    out.hubspotCompanyId = pick(
      'Record ID',
      'Company ID',
      'Company record ID',
      'HubSpot Company ID',
    );
  if (!out.hubspotCompanyId && (type === 'contacts' || type === 'leads'))
    out.hubspotCompanyId = pick(
      'Associated Company IDs',
      'Primary Associated Company ID',
      'Company ID',
      'Associated Company',
    );
  if (!out.hubspotContactId && (type === 'contacts' || type === 'leads'))
    out.hubspotContactId = pick('Record ID', 'Contact ID', 'Contact record ID');
  if (!out.title && type === 'deals') out.title = pick('Deal Name', 'Deal name', 'Name');
  if (!out.dealValue && type === 'deals')
    out.dealValue = pick('Amount', 'Deal amount', 'Value');
  if (!out.stage && type === 'deals') out.stage = pick('Deal Stage', 'Stage');
  if (!out.contactEmail && type === 'deals')
    out.contactEmail = pick('Associated Contact', 'Contact Email', 'Primary Contact Email');
  if (!out.hubspotContactId && type === 'deals')
    out.hubspotContactId = pick('Associated Contact IDs', 'Contact ID');
  if (type === 'leads') {
    if (!out.role) out.role = pick('Role', 'User Type');
    if (!out.whatsappNumber) out.whatsappNumber = pick('WhatsApp Number', 'WhatsApp', 'Whatsapp Number');
    if (!out.address) out.address = pick('Address', 'City, State');
    if (!out.group) out.group = pick('Group', 'Group Name');
    if (!out.leadCategory) out.leadCategory = pick('Lead Type', 'Lead Category');
    if (!out.source) out.source = pick('Lead Source', 'Source');
  }
  return out;
}

/**
 * CSV column headers + one example row — one column per property in CRM_FIELDS_MAP.leads,
 * with header text matching each field's `label` exactly so re-uploading this template
 * auto-maps every column (see the `data.headers.find(...)` heuristic in handleFileChange).
 */
const LEADS_TEMPLATE_HEADERS = CRM_FIELDS_MAP.leads.map((f) => f.label);
const LEADS_TEMPLATE_EXAMPLE_BY_KEY: Record<string, string> = {
  salutation: 'Ms',
  firstName: 'Shagun',
  lastName: 'Mishra',
  role: 'OWNER/AGENT/USER',
  email: 'sapnashagun@example.com',
  additionalEmails: 'shagun.personal@example.com; shagun.work@example.com',
  gender: 'Female',
  mobileNo: '+919876543210',
  phone: '+911123456789',
  whatsappNumber: '+919876543210',
  address: '123 Street, Gurgaon, Haryana, India 122017',
  organization: 'Example Realty Pvt Ltd',
  hubspotCompanyId: '',
  hubspotContactId: '',
  organizationId: '',
  jobTitle: 'Marketing Manager',
  website: 'https://example.com',
  linkedinUrl: 'https://linkedin.com/in/shagunmishra',
  annualRevenue: '500000',
  industry: 'Real Estate',
  noOfEmployees: '11-50',
  territory: 'North Zone',
  status: 'New',
  callStatus: 'Not Called',
  group: 'Seller',
  leadCategory: 'Lead',
  source: 'Email',
  notes: 'Interested in 3BHK, follow up next week',
};
const LEADS_TEMPLATE_EXAMPLE = CRM_FIELDS_MAP.leads.map(
  (f) => LEADS_TEMPLATE_EXAMPLE_BY_KEY[f.key] ?? '',
);

/**
 * CSV column headers + one example row — one column per property in CRM_FIELDS_MAP.contacts,
 * with header text matching each field's `label` exactly so re-uploading this template
 * auto-maps every column (see the `data.headers.find(...)` heuristic in handleFileChange).
 */
const CONTACTS_TEMPLATE_HEADERS = CRM_FIELDS_MAP.contacts.map((f) => f.label);
const CONTACTS_TEMPLATE_EXAMPLE_BY_KEY: Record<string, string> = {
  salutation: 'Ms',
  firstName: 'Riya',
  lastName: 'Kapoor',
  email: 'riya.kapoor@example.com',
  additionalEmails: 'riya.k.personal@example.com; riya.work@example.com',
  gender: 'Female',
  mobileNo: '+919876543210',
  phone: '+911123456789',
  jobTitle: 'Marketing Manager',
  organization: 'Example Realty Pvt Ltd',
  hubspotCompanyId: '',
  hubspotContactId: '',
  organizationId: '',
  source: 'Referral',
  industry: 'Real Estate',
  annualRevenue: '500000',
  noOfEmployees: '11-50',
  website: 'https://example.com',
  linkedinUrl: 'https://linkedin.com/in/riyakapoor',
  territory: 'North Zone',
  telegram: '@riyakapoor',
  address: '123 MG Road, Bengaluru, Karnataka',
  leadOwner: '',
  status: 'New',
  stage: 'New',
};
const CONTACTS_TEMPLATE_EXAMPLE = CRM_FIELDS_MAP.contacts.map(
  (f) => CONTACTS_TEMPLATE_EXAMPLE_BY_KEY[f.key] ?? '',
);

/**
 * CSV column headers + one example row — one column per property in CRM_FIELDS_MAP.deals,
 * with header text matching each field's `label` exactly so re-uploading this template
 * auto-maps every column.
 */
const DEALS_TEMPLATE_HEADERS = CRM_FIELDS_MAP.deals.map((f) => f.label);
const DEALS_TEMPLATE_EXAMPLE_BY_KEY: Record<string, string> = {
  title: 'Example Realty — 3BHK Sale',
  dealValue: '2500000',
  pricingType: 'fixed',
  contractMonths: '',
  expectedDealValue: '2500000',
  currency: 'INR',
  exchangeRate: '1',
  stage: 'Qualification',
  probability: '20',
  organization: 'Example Realty Pvt Ltd',
  contactEmail: 'riya.kapoor@example.com',
  hubspotContactId: '',
  contactPerson: '',
  dealOwner: '',
  expectedClosureDate: '2026-09-30',
  closedDate: '',
  nextStep: 'Schedule site visit',
};
const DEALS_TEMPLATE_EXAMPLE = CRM_FIELDS_MAP.deals.map(
  (f) => DEALS_TEMPLATE_EXAMPLE_BY_KEY[f.key] ?? '',
);

/**
 * CSV column headers + one example row — one column per property in CRM_FIELDS_MAP.clients,
 * with header text matching each field's `label` exactly so re-uploading this template
 * auto-maps every column.
 */
const CLIENTS_TEMPLATE_HEADERS = CRM_FIELDS_MAP.clients.map((f) => f.label);
const CLIENTS_TEMPLATE_EXAMPLE_BY_KEY: Record<string, string> = {
  name: 'Amit Kumar',
  email: 'amit.kumar@example.com',
  additionalEmails: 'amit.personal@example.com; amit.work@example.com',
  phone: '+919876543210',
  whatsappNumber: '+919876543210',
  address: '123 Street, Gurgaon, Haryana, India 122017',
  role: 'USER',
  status: 'active',
};
const CLIENTS_TEMPLATE_EXAMPLE = CRM_FIELDS_MAP.clients.map(
  (f) => CLIENTS_TEMPLATE_EXAMPLE_BY_KEY[f.key] ?? '',
);

function downloadCsvTemplate(headers: string[], example: string[], filename: string) {
  const csv = [headers, example]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadLeadsCsvTemplate() {
  downloadCsvTemplate(LEADS_TEMPLATE_HEADERS, LEADS_TEMPLATE_EXAMPLE, 'leads-import-template.csv');
}

function downloadContactsCsvTemplate() {
  downloadCsvTemplate(CONTACTS_TEMPLATE_HEADERS, CONTACTS_TEMPLATE_EXAMPLE, 'contacts-import-template.csv');
}

function downloadDealsCsvTemplate() {
  downloadCsvTemplate(DEALS_TEMPLATE_HEADERS, DEALS_TEMPLATE_EXAMPLE, 'deals-import-template.csv');
}

function downloadClientsCsvTemplate() {
  downloadCsvTemplate(CLIENTS_TEMPLATE_HEADERS, CLIENTS_TEMPLATE_EXAMPLE, 'clients-import-template.csv');
}

export default function ImportModal({ isOpen, onClose, onSuccess, type }: ImportModalProps) {
 const [step, setStep] = useState<'upload' | 'mapping'>('upload');
 const [file, setFile] = useState<File | null>(null);
 const [headers, setHeaders] = useState<string[]>([]);
 const [mapping, setMapping] = useState<Record<string, string>>({});
 const [uploading, setUploading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);

  const [customMappings, setCustomMappings] = useState<{ id: string; label: string; column: string }[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<ImportDuplicateStrategy>('merge');
  const [creatingCustomFields, setCreatingCustomFields] = useState(false);

  const mappedColumns = useMemo(() => {
    const used = new Set<string>();
    Object.values(mapping).forEach((col) => {
      if (col) used.add(col);
    });
    customMappings.forEach((cm) => {
      if (cm.column) used.add(cm.column);
    });
    return used;
  }, [mapping, customMappings]);

  const unmappedHeaders = useMemo(
    () => headers.filter((h) => !mappedColumns.has(h)),
    [headers, mappedColumns],
  );

  const addUnmappedAsCustomFields = (columns: string[]) => {
    setCustomMappings((prev) => {
      const usedCols = new Set(prev.map((p) => p.column));
      const additions = columns
        .filter((col) => col && !usedCols.has(col))
        .map((col) => ({
          id: `cm_auto_${col.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
          label: col,
          column: col,
        }));
      return [...prev, ...additions];
    });
  };

  const createAllUnmappedAsCustomFields = async () => {
    if (unmappedHeaders.length === 0) return;
    setCreatingCustomFields(true);
    addUnmappedAsCustomFields(unmappedHeaders);
    const token = localStorage.getItem('token');
    for (const header of unmappedHeaders) {
      const cleanKey = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
      try {
        await fetch(`${CRM_API_URL}/custom-fields`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: header,
            key: cleanKey,
            type: 'text',
            module: type,
            required: false,
          }),
        });
      } catch {
        /* field may already exist */
      }
    }
    toast.success(`Mapped ${unmappedHeaders.length} column(s) as custom fields.`);
    setCreatingCustomFields(false);
  };

  // Reset when closed
  useEffect(() => {
   if (!isOpen) {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setMapping({});
    setCustomMappings([]);
    setDuplicateStrategy('merge');
    setError(null);
   }
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
   if (e.target.files && e.target.files[0]) {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError(null);
    fetchPreview(selectedFile);
   }
  };

  const fetchPreview = async (selectedFile: File) => {
   setUploading(true);
   const formData = new FormData();
   formData.append('file', selectedFile);
   const token = localStorage.getItem('token');

   try {
    const res = await fetch(`${CRM_API_URL}/crm/import/preview`, {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${token}` },
     body: formData
    });
    if (res.ok) {
     const data = await res.json();
     setHeaders(data.headers || []);
     setStep('mapping');
     // Auto-map based on heuristic matches
     const initialMapping: Record<string, string> = {};
     const fields = CRM_FIELDS_MAP[type] || [];
     fields.forEach(f => {
      const match = data.headers.find((h: string) => 
       h.toLowerCase() === f.label.toLowerCase() || 
       h.toLowerCase() === f.key.toLowerCase() ||
       h.toLowerCase().replace(/\s/g, '') === f.key.toLowerCase()
      );
      if (match) initialMapping[f.key] = match;
     });
     setMapping(applyHubSpotHints(type, data.headers || [], initialMapping));
    } else {
     setError('Failed to read file headers. Please ensure it is a valid CSV or Excel file.');
    }
   } catch (err) {
    setError('Error connecting to server.');
   } finally {
    setUploading(false);
   }
  };

  const trackImport = useCrmImportStore((s) => s.trackImport);

  const handleImport = async () => {
   if (!file) return;
   setUploading(true);
   setError(null);

   const token = localStorage.getItem('token');
   const formData = new FormData();
   formData.append('file', file);

   const finalMapping = { ...mapping };
   for (const cm of customMappings) {
    if (cm.label && cm.column) {
     const cleanKey = cm.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
     const key = `cf_${cleanKey}`;
     finalMapping[key] = cm.column;

     try {
       await fetch(`${CRM_API_URL}/custom-fields`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
         body: JSON.stringify({
           name: cm.label,
           key: cleanKey,
           type: 'text',
           module: type,
           required: false
         })
       });
     } catch (err) {
       console.error('Failed to auto-create custom field', err);
     }
    }
   }
   formData.append('mapping', JSON.stringify(finalMapping));
   formData.append('duplicateStrategy', duplicateStrategy);

   try {
    const res = await fetch(`${CRM_API_URL}/crm/import/${type}`, {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${token}` },
     body: formData
    });

    if (res.ok) {
     const data = await res.json();
     trackImport({
      jobId: data.jobId,
      type,
      total: data.total ?? 0,
      onSuccess,
     });
     toast.info(
      `Importing ${data.total ?? 0} ${(IMPORT_TYPE_LABEL[type] || type).toLowerCase()}s in the background. You can keep working.`,
     );
     onClose();
    } else {
     const data = await res.json().catch(() => ({}));
     setError(data.message || 'Import failed. High volume or invalid data structure.');
    }
   } catch (err) {
    setError('An unexpected error occurred during import.');
   } finally {
    setUploading(false);
   }
  };

  if (!isOpen) return null;

  const typeLabel = IMPORT_TYPE_LABEL[type] || type;
  const crmFields = CRM_FIELDS_MAP[type] || [];

  // Flag when the same source column has been mapped to more than one CRM property
  // (e.g. Last Name accidentally pointed at the same column as First Name).
  const columnUsage = new Map<string, number>();
  Object.values(mapping).forEach((col) => {
    if (col) columnUsage.set(col, (columnUsage.get(col) || 0) + 1);
  });
  const duplicateMappedColumns = new Set(
    [...columnUsage.entries()].filter(([, n]) => n > 1).map(([col]) => col),
  );
  const hasDuplicateMapping = duplicateMappedColumns.size > 0;

  return (
   <CrmJiraPortal>
   <div className={`${crmModalChrome.overlay} flex items-center justify-center p-4`}>
    <div className={crmModalChrome.backdrop} onClick={onClose} />
    <div className={`${crmModalChrome.centerShell} max-w-3xl max-h-[min(90vh,56rem)] crm-modal flex flex-col`}>
     <div className={crmModalChrome.centerHeader}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
       <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white">
        <Upload size={18} strokeWidth={1.75} />
       </div>
       <div className="min-w-0">
        <h2 className={crmModalChrome.centerTitle}>Import {typeLabel}s</h2>
        <p className={crmModalChrome.centerLead}>
         {step === 'upload' ? 'Upload data source' : 'Map fields'}
        </p>
       </div>
      </div>
      <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
       <X size={16} strokeWidth={1.75} />
      </button>
     </div>

     <div className={`${crmModalChrome.centerBody} flex flex-col justify-center`}>
      {step === 'upload' && (
       <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500 w-full">
        <div
         onClick={() => fileInputRef.current?.click()}
         className="group border-2 border-dashed border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-16 flex flex-col items-center justify-center transition-all cursor-pointer hover:border-primary hover:bg-primary/5 active:scale-[0.99]"
        >
         <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
         <div className="w-20 h-20 rounded-[var(--radius-md)] bg-surface-dim flex items-center justify-center text-text-muted group-hover:bg-primary group-hover:text-white transition-all shadow-sm mb-6">
          <Upload size={32} />
         </div>
         <p className="text-lg font-black text-text-main tracking-tight">Drop your file here or browse</p>
         <p className="text-sm font-medium text-text-muted mt-2">Support .xlsx, .csv (Max 10MB)</p>
        </div>

        {(type === 'leads' || type === 'contacts' || type === 'deals' || type === 'clients') && (
         <div className="flex items-center justify-center">
          <button
           type="button"
           onClick={(e) => {
            e.stopPropagation();
            if (type === 'leads') downloadLeadsCsvTemplate();
            else if (type === 'deals') downloadDealsCsvTemplate();
            else if (type === 'clients') downloadClientsCsvTemplate();
            else downloadContactsCsvTemplate();
           }}
           className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
          >
           <FileText size={14} className="text-primary/70" /> Download CSV Template
          </button>
         </div>
        )}

        <div className="grid grid-cols-2 gap-4">
         <div className="p-5 bg-surface-dim rounded-[var(--radius-md)] border border-[var(--border-color)]">
          <h4 className="text-xs font-black text-text-muted mb-3 flex items-center gap-2">
           <FileText size={14} className="text-primary/70" />
           Mapping Requirements
          </h4>
          <p className="text-xs text-text-main font-bold leading-relaxed">Auto-detects HubSpot-style columns (Record ID, Company name, etc.). Map extra properties as custom fields. Import companies first when using HubSpot company IDs on contacts.</p>
         </div>
         <div className="p-5 bg-surface-dim rounded-[var(--radius-md)] border border-[var(--border-color)]">
          <h4 className="text-xs font-black text-text-muted mb-3 flex items-center gap-2">
           <CheckCircle2 size={14} className="text-emerald-500/70" />
           Data Integrity
          </h4>
          <p className="text-xs text-text-main font-bold leading-relaxed">Duplicates are matched by email or HubSpot ID. Choose merge, replace, skip, or always create new on the next step.</p>
         </div>
        </div>

        {error && (
         <div className="p-4 bg-rose-50 rounded-[var(--radius-md)] border border-rose-100 flex items-center gap-3 text-rose-600 animate-in shake duration-500">
          <AlertCircle size={20} className="shrink-0" />
          <p className="text-sm font-black">{error}</p>
         </div>
        )}
       </div>
      )}

      {step === 'mapping' && (
       <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
        <div className="flex items-center justify-between mb-4">
         <div>
          <h3 className="text-lg font-black text-text-main tracking-tight">Configure Field Mapping</h3>
          <p className="text-sm font-medium text-text-muted">Connect your file columns to CRM system properties.</p>
         </div>
         <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-[var(--radius-md)] text-xs font-semibold border border-emerald-100">
          {headers.length} Columns Found
         </div>
        </div>

        {unmappedHeaders.length > 0 && (
         <div className="p-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/80 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
           <div>
            <p className="text-xs font-black text-amber-900 flex items-center gap-2">
             <Sparkles size={14} />
             Unmapped columns ({unmappedHeaders.length})
            </p>
            <p className="text-xs font-medium text-amber-900/80 mt-1 max-w-md">
             These file columns are not linked to a CRM property yet. Create them as custom fields to import their data.
            </p>
           </div>
           <button
            type="button"
            onClick={() => void createAllUnmappedAsCustomFields()}
            disabled={creatingCustomFields}
            className="shrink-0 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-[var(--radius-md)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
           >
            {creatingCustomFields ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create all as custom fields
           </button>
          </div>
          <div className="flex flex-wrap gap-2">
           {unmappedHeaders.map((header) => (
            <button
             key={header}
             type="button"
             onClick={() => addUnmappedAsCustomFields([header])}
             className="px-3 py-1.5 rounded-[var(--radius-md)] bg-white border border-amber-200 text-xs font-bold text-amber-950 hover:border-amber-400 hover:bg-amber-100/50 transition-all"
            >
             + {header}
            </button>
           ))}
          </div>
         </div>
        )}

        <div className="space-y-3">
         <p className="text-xs font-black text-text-muted">When a duplicate is found</p>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DUPLICATE_STRATEGY_OPTIONS.map((opt) => {
           const Icon = opt.icon;
           const selected = duplicateStrategy === opt.value;
           return (
            <button
             key={opt.value}
             type="button"
             onClick={() => setDuplicateStrategy(opt.value)}
             className={`text-left p-4 rounded-[var(--radius-md)] border transition-all ${
              selected
               ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
               : 'border-[var(--border-color)] bg-white hover:border-slate-300'
             }`}
            >
             <div className="flex items-center gap-2 mb-1.5">
              <Icon size={16} className={selected ? 'text-primary' : 'text-text-muted'} />
              <span className="text-sm font-black text-text-main">{opt.label}</span>
             </div>
             <p className="text-xs font-medium text-text-muted leading-relaxed">{opt.description}</p>
            </button>
           );
          })}
         </div>
        </div>

        <div className="bg-surface-dim rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] overflow-hidden shadow-inner max-h-[400px] overflow-y-auto custom-scrollbar">
         <table className="w-full text-left">
          <thead className="bg-white/50 border-b border-[var(--border-color)]">
           <tr>
            <th className="px-6 py-4 text-xs font-black text-text-muted">CRM Property</th>
            <th className="px-6 py-4 text-xs font-black text-text-muted w-10 text-center"></th>
            <th className="px-6 py-4 text-xs font-black text-text-muted">Source Column</th>
          </tr>
         </thead>
         <tbody className="divide-y divide-slate-50">
           {crmFields.map(field => {
            const isDuplicate = !!mapping[field.key] && duplicateMappedColumns.has(mapping[field.key]);
            return (
            <tr key={field.key} className="group hover:bg-white transition-all">
             <td className="px-6 py-4">
              <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--primary-light)] text-primary flex items-center justify-center">
                <Database size={14} />
               </div>
               <span className="text-sm font-black text-text-main">{field.label}</span>
              </div>
             </td>
             <td className="px-6 py-4">
              <ChevronRight size={14} className="text-slate-300" />
             </td>
             <td className="px-6 py-4">
              <select
               value={mapping[field.key] || ''}
               onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
               className={`w-full border rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 transition-all appearance-none cursor-pointer ${
                isDuplicate
                 ? 'bg-red-50 border-red-300 text-red-700 focus:ring-red-200'
                 : 'bg-white border-[var(--border-color)] text-text-main focus:ring-primary/20'
               }`}
              >
               <option value="">— Skip Field —</option>
               {headers.map(h => (
                <option key={h} value={h}>{h}</option>
               ))}
              </select>
              {isDuplicate && (
               <p className="mt-1 text-xs font-semibold text-red-600">
                Also mapped to another property — pick a different column.
               </p>
              )}
             </td>
            </tr>
            );
           })}
           {/* Custom Fields section */}
           <tr className="bg-primary/[0.02]">
            <td colSpan={3} className="px-6 py-4">
             <div className="flex items-center justify-between">
               <span className="text-xs font-black text-primary">Map Additional Columns as Custom Fields</span>
               <button 
                 onClick={() => {
                   setCustomMappings(prev => [...prev, { id: `cm_${Date.now()}`, label: '', column: '' }]);
                 }}
                 className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all flex items-center gap-1.5 px-3"
               >
                 <Plus size={14} /> <span className="text-xs font-black uppercase">Add Custom Match</span>
               </button>
             </div>
            </td>
           </tr>
           {customMappings.map(cm => (
            <tr key={cm.id} className="group hover:bg-white transition-all border-l-2 border-primary/20">
             <td className="px-6 py-4">
              <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
               <input 
                type="text" 
                placeholder="Field Label (e.g. Birthday)"
                value={cm.label}
                onChange={(e) => setCustomMappings(prev => prev.map(item => item.id === cm.id ? { ...item, label: e.target.value } : item))}
                className="bg-transparent border-none text-sm font-black text-text-main focus:ring-0 w-full p-0 h-6"
               />
              </div>
             </td>
             <td className="px-6 py-4 text-center">
              <ChevronRight size={14} className="text-slate-300" />
             </td>
             <td className="px-6 py-4">
              <div className="relative">
               <select
                value={cm.column}
                onChange={(e) => setCustomMappings(prev => prev.map(item => item.id === cm.id ? { ...item, column: e.target.value } : item))}
                className="w-full bg-white border border-[var(--border-color)] rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-bold text-text-main outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
               >
                <option value="">— Map Column —</option>
                {headers.map(h => (
                <option key={h} value={h}>{h}</option>
                ))}
               </select>
               <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown size={14} />
               </div>
              </div>
             </td>
            </tr>
           ))}
         </tbody>
        </table>
       </div>

       <div className={cn(crmModalChrome.centerFooter, 'gap-2')}>
        <CrmButton
         variant="secondary"
         className="flex-1"
         onClick={() => setStep('upload')}
         leftIcon={<ChevronLeft size={16} strokeWidth={1.75} />}
        >
         Back
        </CrmButton>
        <CrmButton
         className="flex-[2]"
         onClick={handleImport}
         disabled={uploading || hasDuplicateMapping}
         loading={uploading}
         rightIcon={!uploading ? <ChevronRight size={16} strokeWidth={1.75} /> : undefined}
        >
         {uploading ? 'Importing…' : hasDuplicateMapping ? 'Fix duplicate mappings to continue' : 'Start import'}
        </CrmButton>
       </div>
      </div>
     )}

    </div>
   </div>
  </div>
   </CrmJiraPortal>
 );
}
