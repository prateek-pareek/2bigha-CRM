"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ChevronRight, ChevronLeft, 
  Database, Plus, ChevronDown, ChevronUp, Sparkles, GitMerge, RefreshCw, Ban, CopyPlus,
  Trash2, Check, FileSpreadsheet, ShieldCheck, Pencil, ArrowLeft, ArrowRight, Download
} from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { CrmJiraPortal } from '@/components/crm/shell/CrmJiraPortal';
import { crmModalChrome } from '@/lib/crm/chrome';
import { CrmButton } from '@/components/crm/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useCrmImportStore } from '@/stores/crmImportStore';
import type { CrmImportEntityType } from '@/stores/crmImportStore';

interface ImportModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
 type: CrmImportEntityType;
}

/** Extra mapping rows for HubSpot-style exports (companies ↔ contacts). */
const CRM_FIELDS_MAP: Record<string, { label: string; key: string }[]> = {
  leads: [
    { label: 'Salutation', key: 'salutation' },
    { label: 'First Name', key: 'firstName' },
    { label: 'Last Name', key: 'lastName' },
    { label: 'Role', key: 'role' },
    { label: 'Email', key: 'email' },
    { label: 'Additional Emails', key: 'additionalEmails' },
    { label: 'Gender', key: 'gender' },
    { label: 'Contact Number', key: 'mobileNo' },
    { label: 'WhatsApp Number', key: 'whatsappNumber' },
    { label: 'Phone (Alternate)', key: 'phone' },
    { label: 'Lead Vertical', key: 'leadVertical' },
    { label: 'Lead Type', key: 'leadCategory' },
    { label: 'Lead Source', key: 'source' },
    { label: 'Group', key: 'group' },
    { label: 'Planning To Buy Land', key: 'planningToBuyLand' },
    { label: 'City / Address', key: 'address' },
    { label: 'State', key: 'state' },
    { label: 'PinCode', key: 'pincode' },
    { label: 'X (Twitter) handle', key: 'twitterHandle' },
    { label: 'Lead Owner', key: 'leadOwner' },
    { label: 'Stage', key: 'stage' },
    { label: 'Status', key: 'status' },
    { label: 'Call Status', key: 'callStatus' },
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
  { label: 'HubSpot contact ID (stored for linking)', key: 'hubspotContactId' },
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
  if (!out.organization && type === 'contacts')
    out.organization = pick(
      'Company Name',
      'Associated Company',
      'Primary Associated Company ID',
      'Company name',
    );
  if (!out.jobTitle && type !== 'organizations' && type !== 'leads')
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
  if (!out.hubspotCompanyId && type === 'contacts')
    out.hubspotCompanyId = pick(
      'Associated Company IDs',
      'Primary Associated Company ID',
      'Company ID',
      'Associated Company',
    );
  if (!out.hubspotContactId && (type === 'contacts' || type === 'leads'))
    out.hubspotContactId = pick('Record ID', 'Contact ID', 'Contact record ID');
  if (type === 'leads') {
    if (!out.salutation) out.salutation = pick('Salutation', 'Title');
    if (!out.role) out.role = pick('Role', 'User Type');
    if (!out.gender) out.gender = pick('Gender', 'Sex');
    if (!out.whatsappNumber) out.whatsappNumber = pick('WhatsApp Number', 'WhatsApp', 'Whatsapp Number');
    if (!out.phone) out.phone = pick('Phone (Alternate)', 'Alternate Phone', 'Alternate Mobile', 'Work phone');
    if (!out.address) out.address = pick('Address', 'City, State', 'City / Address', 'Street Address');
    if (!out.group) out.group = pick('Group', 'Group Name');
    if (!out.leadCategory) out.leadCategory = pick('Lead Type', 'Lead Category', 'Category');
    if (!out.leadVertical) out.leadVertical = pick('Lead Vertical', 'Vertical');
    if (!out.planningToBuyLand) out.planningToBuyLand = pick('Planning To Buy Land', 'Planning to Buy Land', 'Buy Land', 'Buying Timeline');
    if (!out.twitterHandle) out.twitterHandle = pick('X (Twitter) handle', 'Twitter Handle', 'Twitter', 'X Handle');
    if (!out.leadOwner) out.leadOwner = pick('Lead Owner', 'Owner', 'Assigned To');
    if (!out.stage) out.stage = pick('Stage', 'Lead Stage');
    if (!out.status) out.status = pick('Status', 'Lead Status');
    if (!out.callStatus) out.callStatus = pick('Call Status', 'Call status');
    if (!out.notes) out.notes = pick('Notes', 'Description', 'Remark', 'Remarks');
    if (!out.additionalEmails) out.additionalEmails = pick('Additional Emails', 'Alternate Email', 'Other Email');
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
  salutation: 'Mr',
  firstName: 'Shagun',
  lastName: 'Mishra',
  role: 'OWNER',
  email: 'sapnashagun@example.com',
  additionalEmails: 'shagun.alt@example.com',
  gender: 'Female',
  mobileNo: '+919876543210',
  whatsappNumber: '+919876543210',
  phone: '+919876543211',
  leadVertical: 'Property Listing',
  leadCategory: 'Lead',
  source: 'Google Lead',
  group: 'Seller',
  planningToBuyLand: 'Within 1 Month',
  address: 'Gurugram',
  state: 'Haryana',
  pincode: '122016',
  twitterHandle: '@shagun_m',
  leadOwner: 'Aarav Sharma',
  stage: 'New',
  status: 'New',
  callStatus: 'Not Called',
  notes: 'Interested in agricultural plots.',
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

function downloadClientsCsvTemplate() {
  downloadCsvTemplate(CLIENTS_TEMPLATE_HEADERS, CLIENTS_TEMPLATE_EXAMPLE, 'clients-import-template.csv');
}

export interface ParsedValidationRow {
  index: number;
  original: Record<string, any>;
  mapped: Record<string, any>;
  errors: string[];
  isValid: boolean;
}

export interface ImportSummaryData {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  createdCount: number;
  skippedCount: number;
  mergedCount: number;
  replacedCount: number;
  invalidCount: number;
  failedCount: number;
  failedRows: { rowNumber: number; rowData?: any; reason: string }[];
  skippedRows: { rowNumber: number; rowData?: any; reason: string }[];
  invalidRows: { rowNumber: number; rowData?: any; errors: string[] }[];
  error?: string;
}

export default function ImportModal({ isOpen, onClose, onSuccess, type }: ImportModalProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'validate' | 'summary'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customMappings, setCustomMappings] = useState<{ id: string; label: string; column: string }[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<ImportDuplicateStrategy>('merge');
  const [creatingCustomFields, setCreatingCustomFields] = useState(false);

  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [validationRows, setValidationRows] = useState<ParsedValidationRow[]>([]);
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [showUnmapped, setShowUnmapped] = useState(false);

  const [summaryData, setSummaryData] = useState<ImportSummaryData | null>(null);
  const [summaryFilter, setSummaryFilter] = useState<'all' | 'skipped' | 'invalid' | 'failed'>('all');

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

  const [picklistLeadCategories, setPicklistLeadCategories] = useState<string[]>([]);
  const [picklistLeadGroups, setPicklistLeadGroups] = useState<string[]>([]);

  // Fetch dynamic picklists
  useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    void (async () => {
      try {
        const [catRes, grpRes] = await Promise.all([
          fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=leadCategory`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${CRM_API_URL}/crm/lead-picklist-options?listKey=group`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (catRes.ok) {
          const data = await catRes.json();
          if (Array.isArray(data)) setPicklistLeadCategories(data.map((d: any) => String(d.label || d.name || d)));
        }
        if (grpRes.ok) {
          const data = await grpRes.json();
          if (Array.isArray(data)) setPicklistLeadGroups(data.map((d: any) => String(d.label || d.name || d)));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [isOpen]);

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
      setParsedRows([]);
      setValidationRows([]);
      setValidationFilter('all');
      setShowUnmapped(false);
      setSummaryData(null);
      setSummaryFilter('all');
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
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const headerData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const fileHeaders = (headerData[0] as string[]) || [];

        setHeaders(fileHeaders);
        setParsedRows(jsonData);
        setStep('mapping');

        // Auto-map based on heuristic matches
        const initialMapping: Record<string, string> = {};
        const fields = CRM_FIELDS_MAP[type] || [];
        fields.forEach((f) => {
          const match = fileHeaders.find(
            (h: string) =>
              h.toLowerCase() === f.label.toLowerCase() ||
              h.toLowerCase() === f.key.toLowerCase() ||
              h.toLowerCase().replace(/\s/g, '') === f.key.toLowerCase(),
          );
          if (match) initialMapping[f.key] = match;
        });
        setMapping(applyHubSpotHints(type, fileHeaders, initialMapping));
      } catch (err) {
        setError('Failed to read file. Please ensure it is a valid CSV or Excel file.');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file.');
      setUploading(false);
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const ALLOWED_ROLES = [
    'USER', 'AGENT', 'OWNER', 'BUILDER', 'BUYER', 'TENANT', 'SELLER',
    '2 BIGHA USER', 'REAL ESTATE AGENT', 'PROPERTY OWNER'
  ];

  const ALLOWED_LEAD_SOURCES = [
    'WEBSITE', 'GOOGLE LEAD', 'META ADS', 'REFERRAL', 'WALK IN',
    'DIRECT CALL', 'OTHER', 'ORGANIC SEARCH', 'SOCIAL MEDIA',
    'PAID ADS', 'EMAIL CAMPAIGN', 'OFFLINE'
  ];

  const DEFAULT_LEAD_CATEGORIES = [
    'LEAD', 'BUYER', 'SELLER', 'INVESTOR', 'REFERENCE',
    'PROPERTY LISTING', 'PROPERTY MANAGEMENT', 'GENERAL', 'HOT LEAD',
    'WARM LEAD', 'COLD LEAD'
  ];

  const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
  ];

  const validateDataset = (
    rows: Record<string, any>[],
    currentMapping: Record<string, string>,
    currentCustomMappings: { id: string; label: string; column: string }[],
    categories: string[]
  ): ParsedValidationRow[] => {
    const finalMapping = { ...currentMapping };
    currentCustomMappings.forEach((cm) => {
      if (cm.label && cm.column) {
        finalMapping[`cf_${cm.label.toLowerCase().replace(/[^a-z0-9]/g, '_')}`] = cm.column;
      }
    });

    const validCategories = [
      ...DEFAULT_LEAD_CATEGORIES,
      ...categories.map((c) => c.toUpperCase().trim()),
    ];

    return rows.map((row, idx) => {
      const mapped: Record<string, any> = {};
      Object.entries(finalMapping).forEach(([crmKey, fileCol]) => {
        if (fileCol && row[fileCol] !== undefined) {
          mapped[crmKey] = row[fileCol];
        }
      });

      const errors: string[] = [];

      if (type === 'leads') {
        const firstName = String(mapped.firstName || '').trim();
        const lastName = String(mapped.lastName || '').trim();
        const mobileNo = String(mapped.mobileNo || '').trim();
        const whatsappNumber = String(mapped.whatsappNumber || '').trim();
        const email = String(mapped.email || '').trim();
        const role = String(mapped.role || '').trim();
        const leadCategory = String(mapped.leadCategory || '').trim();
        const source = String(mapped.source || '').trim();
        const pincode = String(mapped.pincode || '').trim();
        const state = String(mapped.state || '').trim();
        const leadVertical = String(mapped.leadVertical || '').trim();
        const planningToBuyLand = String(mapped.planningToBuyLand || '').trim();

        // 1. First Name check (Requirement 6.1 & 6.2)
        if (!firstName) {
          errors.push('First Name is required');
        }

        // 2. Role validation (Requirement 6.3)
        if (!role) {
          errors.push('Role is required');
        } else {
          const normRole = role.toUpperCase().replace(/[\s_-]+/g, ' ').trim();
          if (!ALLOWED_ROLES.includes(normRole)) {
            errors.push(`Invalid role "${role}" (allowed: USER, AGENT, OWNER)`);
          }
        }

        // 3. Contact Number (Requirement 6.4)
        if (!mobileNo && !email) {
          errors.push('Either Contact Number or Email is required');
        } else if (mobileNo) {
          const digits = mobileNo.replace(/\D/g, '');
          if (digits.length !== 10 || !/^[6-9]\d{9}$/.test(digits)) {
            errors.push('Contact number must be a valid 10-digit Indian mobile number');
          }
        }

        // 4. WhatsApp Number (Requirement 6.5)
        if (whatsappNumber) {
          const wDigits = whatsappNumber.replace(/\D/g, '');
          if (wDigits.length !== 10 || !/^[6-9]\d{9}$/.test(wDigits)) {
            errors.push('WhatsApp number must be a valid 10-digit Indian mobile number');
          }
        }

        // 5. Email check
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email format');
        }

        // 6. Lead Type (Requirement 6.6)
        if (leadCategory) {
          const normCategory = leadCategory.toUpperCase().trim();
          if (normCategory === 'BUYER LEAD' || normCategory === 'BUYER_LEAD') {
            mapped.leadCategory = 'Buyer';
          } else if (!validCategories.includes(normCategory)) {
            errors.push(`Invalid Lead Type "${leadCategory}"`);
          }
        } else {
          mapped.leadCategory = 'Lead';
        }

        // 7. Lead Source (Requirement 6.7)
        if (source) {
          const normSource = source.toUpperCase().replace(/[\s_-]+/g, ' ').trim();
          if (!ALLOWED_LEAD_SOURCES.includes(normSource)) {
            errors.push(`Invalid Lead Source "${source}"`);
          }
        }

        // 8. PinCode (Requirement 6.8)
        if (pincode) {
          const pDigits = pincode.replace(/\D/g, '');
          if (pDigits.length !== 6) {
            errors.push('PinCode must be 6 digits');
          }
        }

        // 9. State validation (Requirement 6.8)
        if (state) {
          const normState = state.toUpperCase().trim();
          if (!INDIAN_STATES.map((s) => s.toUpperCase()).includes(normState)) {
            errors.push(`Invalid Indian State "${state}"`);
          }
        }

        // 10. Planning To Buy Land (Requirement 4 & 6.10)
        if (planningToBuyLand) {
          const normPlan = planningToBuyLand.toUpperCase().replace(/[\s_-]+/g, ' ').trim();
          const allowedPlans = [
            'JUST EXPLORING', 'WITHIN 1 MONTH', '1–3 MONTHS', '1-3 MONTHS', '3–6 MONTHS', '3-6 MONTHS',
            'JUST_EXPLORING', 'WITHIN_1_MONTH', '1–3_MONTHS', '1-3_MONTHS', '3–6_MONTHS', '3-6_MONTHS'
          ];
          if (!allowedPlans.includes(normPlan)) {
            errors.push(`Invalid Planning To Buy Land "${planningToBuyLand}"`);
          }
        }

        // 11. Lead Vertical (Requirement 4 & 6.10)
        if (leadVertical) {
          const normVert = leadVertical.toUpperCase().replace(/[\s_-]+/g, ' ').trim();
          if (!['PROPERTY LISTING', 'PROPERTY MANAGEMENT', 'PROPERTY_LISTING', 'PROPERTY_MANAGEMENT'].includes(normVert)) {
            errors.push(`Invalid Lead Vertical "${leadVertical}" (allowed: Property Listing, Property Management)`);
          }
        }
      } else if (type === 'contacts') {
        const firstName = String(mapped.firstName || '').trim();
        const organization = String(mapped.organization || '').trim();
        const email = String(mapped.email || '').trim();
        const mobileNo = String(mapped.mobileNo || mapped.phone || '').trim();
        const whatsappNumber = String(mapped.whatsappNumber || '').trim();

        if (!firstName && !organization) {
          errors.push('First Name or Organization is required');
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email format');
        }
        if (mobileNo) {
          const digits = mobileNo.replace(/\D/g, '');
          if (digits.length !== 10) {
            errors.push('Phone number must be 10 digits');
          }
        }
        if (whatsappNumber) {
          const wDigits = whatsappNumber.replace(/\D/g, '');
          if (wDigits.length !== 10) {
            errors.push('WhatsApp number must be 10 digits');
          }
        }
      } else if (type === 'clients' || type === 'organizations') {
        const name = String(mapped.name || '').trim();
        const phone = String(mapped.phone || '').trim();
        const email = String(mapped.email || '').trim();
        const role = String(mapped.role || '').trim();

        if (!name) {
          errors.push('Name is required');
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Invalid email format');
        }
        if (phone) {
          const digits = phone.replace(/\D/g, '');
          if (digits.length !== 10) {
            errors.push('Phone number must be 10 digits');
          }
        }
        if (role) {
          const normRole = role.toUpperCase().trim();
          if (!['USER', 'AGENT', 'OWNER'].includes(normRole)) {
            errors.push(`Invalid role "${role}" (allowed: USER, AGENT, OWNER)`);
          }
        }
      }

      return {
        index: idx + 1,
        original: row,
        mapped,
        errors,
        isValid: errors.length === 0,
      };
    });
  };

  const runValidation = (): ParsedValidationRow[] => {
    return validateDataset(parsedRows, mapping, customMappings, picklistLeadCategories);
  };

  const handleUpdateRowField = (rowIndex: number, crmKey: string, newValue: any) => {
    const updated = [...parsedRows];
    const fileCol = mapping[crmKey] || customMappings.find(cm => `cf_${cm.label.toLowerCase().replace(/[^a-z0-9]/g, '_')}` === crmKey)?.column;
    const targetKey = fileCol || crmKey;

    updated[rowIndex] = {
      ...updated[rowIndex],
      [targetKey]: newValue,
    };

    setParsedRows(updated);
    const newValidation = validateDataset(updated, mapping, customMappings, picklistLeadCategories);
    setValidationRows(newValidation);
  };

  const handleGoToValidation = () => {
    const results = runValidation();
    setValidationRows(results);
    setValidationFilter('all');
    setEditingRowIndex(null);
    setStep('validate');
  };

  const trackImport = useCrmImportStore((s) => s.trackImport);

  const downloadErrorReport = () => {
    if (!summaryData) return;
    const errorRowsToExport: Record<string, any>[] = [];

    // Add invalid rows
    summaryData.invalidRows.forEach((inv) => {
      errorRowsToExport.push({
        'Excel Row': inv.rowNumber,
        'Issue Type': 'Invalid Record',
        'Reason for Failure / Skip': inv.errors.join('; '),
        ...(inv.rowData || {}),
      });
    });

    // Add skipped rows
    summaryData.skippedRows.forEach((skp) => {
      errorRowsToExport.push({
        'Excel Row': skp.rowNumber,
        'Issue Type': 'Duplicate Skipped',
        'Reason for Failure / Skip': skp.reason,
        ...(skp.rowData || {}),
      });
    });

    // Add failed rows
    summaryData.failedRows.forEach((fld) => {
      errorRowsToExport.push({
        'Excel Row': fld.rowNumber,
        'Issue Type': 'Failed Record',
        'Reason for Failure / Skip': fld.reason,
        ...(fld.rowData || {}),
      });
    });

    if (errorRowsToExport.length === 0) {
      toast.info('No failed or skipped records to export.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(errorRowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failed_Skipped_Records');
    XLSX.writeFile(wb, `${type}_import_issues_summary.xlsx`);
    toast.success('Downloaded import issues report (.xlsx)');
  };

  const handleImport = async (importOnlyValid: boolean = false) => {
    if (!file) return;
    setUploading(true);
    setError(null);

    const token = localStorage.getItem('token');
    const formData = new FormData();

    const invalidRowsList = validationRows
      .filter((r) => !r.isValid)
      .map((r) => ({
        rowNumber: r.index,
        rowData: r.original,
        errors: r.errors,
      }));

    let fileToSend: File = file;
    if (importOnlyValid) {
      const validRawRows = validationRows.filter((r) => r.isValid).map((r) => r.original);
      if (validRawRows.length === 0) {
        setError('No valid rows to import.');
        setUploading(false);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(validRawRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ImportData');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      fileToSend = new File([wbout], file.name.replace(/\.[^/.]+$/, '') + '_valid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      const allRawRows = validationRows.map((r) => r.original);
      const ws = XLSX.utils.json_to_sheet(allRawRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ImportData');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      fileToSend = new File([wbout], file.name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }

    formData.append('file', fileToSend);

    const finalMapping = { ...mapping };
    for (const cm of customMappings) {
      if (cm.label && cm.column) {
        const cleanKey = cm.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const key = `cf_${cleanKey}`;
        finalMapping[key] = cm.column;

        try {
          await fetch(`${CRM_API_URL}/custom-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              name: cm.label,
              key: cleanKey,
              type: 'text',
              module: type,
              required: false,
            }),
          });
        } catch (err) {
          console.error('Failed to auto-create custom field', err);
        }
      }
    }
    formData.append('mapping', JSON.stringify(finalMapping));
    formData.append('duplicateStrategy', duplicateStrategy);

    setStep('summary');
    setSummaryData({
      jobId: '',
      status: 'processing',
      total: validationRows.length,
      processed: 0,
      createdCount: 0,
      skippedCount: 0,
      mergedCount: 0,
      replacedCount: 0,
      invalidCount: importOnlyValid ? invalidRowsList.length : 0,
      failedCount: 0,
      failedRows: [],
      skippedRows: [],
      invalidRows: importOnlyValid ? invalidRowsList : [],
    });

    try {
      const res = await fetch(`${CRM_API_URL}/crm/import/${type}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const jobId = data.jobId;
        trackImport({
          jobId,
          type,
          total: data.total ?? 0,
          onSuccess,
        });

        // Poll job until complete
        const pollInterval = window.setInterval(async () => {
          try {
            const statusRes = await fetch(`${CRM_API_URL}/crm/import/jobs/${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (statusRes.ok) {
              const job = await statusRes.json();
              setSummaryData({
                jobId,
                status: job.status,
                total: validationRows.length,
                processed: job.processed ?? 0,
                createdCount: job.createdCount ?? 0,
                skippedCount: job.skippedCount ?? 0,
                mergedCount: job.mergedCount ?? 0,
                replacedCount: job.replacedCount ?? 0,
                invalidCount: importOnlyValid ? invalidRowsList.length : 0,
                failedCount: job.failedCount ?? 0,
                failedRows: job.failedRows ?? [],
                skippedRows: job.skippedRows ?? [],
                invalidRows: importOnlyValid ? invalidRowsList : [],
                error: job.error,
              });

              if (job.status === 'completed' || job.status === 'failed') {
                window.clearInterval(pollInterval);
                setUploading(false);
                if (job.status === 'completed') {
                  onSuccess?.();
                }
              }
            }
          } catch {
            /* retry */
          }
        }, 1000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Import failed. High volume or invalid data structure.');
        setSummaryData((prev) => prev ? { ...prev, status: 'failed', error: data.message || 'Import failed' } : null);
        setUploading(false);
      }
    } catch (err) {
      setError('An unexpected error occurred during import.');
      setSummaryData((prev) => prev ? { ...prev, status: 'failed', error: 'An unexpected error occurred.' } : null);
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const typeLabel = IMPORT_TYPE_LABEL[type] || type;
  const crmFields = CRM_FIELDS_MAP[type] || [];

  const columnUsage = new Map<string, number>();
  Object.values(mapping).forEach((col) => {
    if (col) columnUsage.set(col, (columnUsage.get(col) || 0) + 1);
  });
  const duplicateMappedColumns = new Set(
    [...columnUsage.entries()].filter(([, n]) => n > 1).map(([col]) => col),
  );
  const hasDuplicateMapping = duplicateMappedColumns.size > 0;

  const validCount = validationRows.filter((r) => r.isValid).length;
  const invalidCount = validationRows.filter((r) => !r.isValid).length;

  const STEPS = [
    { id: 'upload', number: 1, label: 'Upload' },
    { id: 'mapping', number: 2, label: 'Field Mapping' },
    { id: 'validate', number: 3, label: 'Preview & Import' },
    { id: 'summary', number: 4, label: 'Upload Summary' },
  ] as const;

  return (
    <CrmJiraPortal>
      <div className={`${crmModalChrome.overlay} flex items-center justify-center p-3 sm:p-6`}>
        <div className={crmModalChrome.backdrop} onClick={onClose} />
        <div className={`${crmModalChrome.centerShell} max-w-4xl w-full h-[88vh] max-h-[54rem] crm-modal flex flex-col shadow-2xl rounded-2xl overflow-hidden bg-white border border-slate-200/80`}>
          
          {/* Header with Integrated Stepper */}
          <div className="px-6 py-4 border-b border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
                <Upload size={18} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Import {typeLabel}s
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {step === 'upload'
                    ? 'Upload .csv or .xlsx spreadsheets'
                    : step === 'mapping'
                    ? 'Map spreadsheet columns to CRM properties'
                    : step === 'validate'
                    ? 'Validate data and resolve issues before import'
                    : 'Review upload results and download reports'}
                </p>
              </div>
            </div>

            {/* Stepper Indicator */}
            <div className="flex items-center gap-1.5 self-center sm:self-auto bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
              {STEPS.map((s, idx) => {
                const isActive = step === s.id;
                const isCompleted =
                  (step === 'mapping' && s.id === 'upload') ||
                  (step === 'validate' && (s.id === 'upload' || s.id === 'mapping')) ||
                  (step === 'summary' && s.id !== 'summary');
                return (
                  <div key={s.id} className="flex items-center">
                    {idx > 0 && <ChevronRight size={12} className="text-slate-400 mx-0.5" />}
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                        isActive
                          ? "bg-white text-primary shadow-xs font-bold"
                          : isCompleted
                          ? "text-emerald-700 bg-emerald-50 font-medium"
                          : "text-slate-400"
                      )}
                    >
                      {isCompleted ? (
                        <Check size={12} className="text-emerald-600 stroke-[3]" />
                      ) : (
                        <span className={cn(
                          "w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold",
                          isActive ? "bg-primary text-white" : "bg-slate-200 text-slate-600"
                        )}>
                          {s.number}
                        </span>
                      )}
                      <span>{s.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50">
            
            {/* STEP 1: UPLOAD */}
            {step === 'upload' && (
              <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center transition-all cursor-pointer hover:border-primary hover:bg-primary/[0.03] bg-white shadow-xs"
                >
                  <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform mb-4 shadow-inner">
                    <FileSpreadsheet size={32} />
                  </div>
                  <p className="text-base font-bold text-slate-800">Drop your file here or click to browse</p>
                  <p className="text-xs font-medium text-slate-500 mt-1">Supports Excel (.xlsx, .xls) and CSV (.csv) up to 10MB</p>
                </div>

                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (type === 'leads') downloadLeadsCsvTemplate();
                      else if (type === 'clients') downloadClientsCsvTemplate();
                      else downloadContactsCsvTemplate();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs"
                  >
                    <FileText size={14} className="text-primary" /> Download Sample Template (.csv)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-500" />
                      Smart Auto-Mapping
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      Column names in your spreadsheet will automatically match corresponding CRM fields.
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-500" />
                      Phone & Email Deduplication
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">
                      Matches existing records using 10-digit mobile numbers or emails to prevent duplicates.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 flex items-center gap-3 text-rose-700 text-xs font-bold animate-in shake duration-300">
                    <AlertCircle size={18} className="shrink-0 text-rose-600" />
                    <p>{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: FIELD MAPPING */}
            {step === 'mapping' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                
                {/* Meta summary strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <FileSpreadsheet size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800">{file?.name || 'Uploaded File'}</span>
                      <span className="text-xs text-slate-400 font-medium ml-2">({parsedRows.length} rows, {headers.length} columns)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      {Object.values(mapping).filter(Boolean).length} Mapped
                    </span>
                    {unmappedHeaders.length > 0 && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                        {unmappedHeaders.length} Unmapped
                      </span>
                    )}
                  </div>
                </div>

                {/* Collapsible Unmapped Columns Banner */}
                {unmappedHeaders.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 transition-all space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-950">
                            {unmappedHeaders.length} unmapped column{unmappedHeaders.length > 1 ? 's' : ''} in file
                          </p>
                          <p className="text-[11px] text-amber-800 font-medium">
                            Not matched to standard fields. Add them as custom fields or ignore them.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void createAllUnmappedAsCustomFields()}
                          disabled={creatingCustomFields}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-xs"
                        >
                          {creatingCustomFields ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          Add All as Custom Fields
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowUnmapped((prev) => !prev)}
                          className="px-2.5 py-1.5 bg-white border border-amber-200 text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-100/50 flex items-center gap-1 transition-colors"
                        >
                          {showUnmapped ? 'Hide List' : 'View Columns'}
                          {showUnmapped ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {showUnmapped && (
                      <div className="pt-2 border-t border-amber-200/60 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                        {unmappedHeaders.map((header) => (
                          <button
                            key={header}
                            type="button"
                            onClick={() => addUnmappedAsCustomFields([header])}
                            className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-[11px] font-bold text-amber-950 hover:border-amber-400 hover:bg-amber-100/60 transition-all flex items-center gap-1"
                            title={`Add "${header}" as a custom field`}
                          >
                            <Plus size={11} className="text-amber-600" /> {header}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Compact Duplicate Strategy Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Duplicate Handling Strategy</span>
                    <span className="text-[11px] text-slate-400">Matched by phone / email</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {DUPLICATE_STRATEGY_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = duplicateStrategy === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDuplicateStrategy(opt.value)}
                          className={cn(
                            "text-left p-3 rounded-xl border transition-all relative flex flex-col justify-between h-[76px]",
                            isSelected
                              ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30 shadow-xs"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-1.5">
                              <Icon size={14} className={isSelected ? 'text-primary' : 'text-slate-400'} />
                              <span className={cn("text-xs font-bold", isSelected ? 'text-primary' : 'text-slate-700')}>
                                {opt.label}
                              </span>
                            </div>
                            {isSelected && <Check size={12} className="text-primary stroke-[3]" />}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-tight font-medium line-clamp-2">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mapping Table */}
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="px-5 py-3 border-b border-slate-200/80 bg-slate-50/80 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Field Mapping Table</span>
                    <span className="text-xs text-slate-400">{crmFields.length} CRM fields</span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {crmFields.map((field) => {
                      const selectedCol = mapping[field.key] || '';
                      const isDuplicate = !!selectedCol && duplicateMappedColumns.has(selectedCol);
                      const sampleValue = selectedCol && parsedRows[0] ? parsedRows[0][selectedCol] : undefined;
                      const isRequired = field.key === 'firstName' || (type === 'leads' && field.key === 'mobileNo') || (type === 'clients' && field.key === 'name') || (type === 'organizations' && field.key === 'name');

                      return (
                        <div key={field.key} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/60 transition-colors">
                          <div className="sm:w-1/2 flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Database size={13} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800 truncate">{field.label}</span>
                                {isRequired && (
                                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-1.5 py-0.2 rounded">
                                    Required
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">{field.key}</span>
                            </div>
                          </div>

                          <div className="sm:w-1/2 flex flex-col">
                            <select
                              value={selectedCol}
                              onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              className={cn(
                                "w-full border rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 transition-all cursor-pointer appearance-none bg-white",
                                isDuplicate
                                  ? "bg-rose-50 border-rose-300 text-rose-700 focus:ring-rose-200"
                                  : selectedCol
                                  ? "border-primary/40 text-slate-800 focus:ring-primary/20"
                                  : "border-slate-200 text-slate-400 focus:ring-slate-200"
                              )}
                            >
                              <option value="">— Skip / Do Not Import —</option>
                              {headers.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>

                            {/* Sample Preview / Warnings */}
                            {isDuplicate ? (
                              <p className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                                <AlertCircle size={12} /> Also mapped to another field — select a different column.
                              </p>
                            ) : sampleValue !== undefined && sampleValue !== '' ? (
                              <p className="mt-1 text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
                                <span className="text-slate-400">Sample:</span> <span className="font-semibold text-slate-700 font-mono">"{String(sampleValue)}"</span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}

                    {/* Custom Mappings */}
                    {customMappings.map((cm) => {
                      const sampleValue = cm.column && parsedRows[0] ? parsedRows[0][cm.column] : undefined;
                      return (
                        <div key={cm.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-primary/[0.02] border-l-2 border-primary">
                          <div className="sm:w-1/2 flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => setCustomMappings((prev) => prev.filter((item) => item.id !== cm.id))}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                              title="Remove custom field"
                            >
                              <Trash2 size={14} />
                            </button>
                            <input
                              type="text"
                              placeholder="Field Name (e.g. Landmark)"
                              value={cm.label}
                              onChange={(e) =>
                                setCustomMappings((prev) =>
                                  prev.map((item) => (item.id === cm.id ? { ...item, label: e.target.value } : item)),
                                )
                              }
                              className="bg-transparent border-b border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary w-full pb-0.5"
                            />
                          </div>

                          <div className="sm:w-1/2 flex flex-col">
                            <select
                              value={cm.column}
                              onChange={(e) =>
                                setCustomMappings((prev) =>
                                  prev.map((item) => (item.id === cm.id ? { ...item, column: e.target.value } : item)),
                                )
                              }
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 bg-white cursor-pointer"
                            >
                              <option value="">— Select File Column —</option>
                              {headers.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                            {sampleValue !== undefined && sampleValue !== '' && (
                              <p className="mt-1 text-[11px] text-slate-500 font-medium truncate">
                                <span className="text-slate-400">Sample:</span> <span className="font-semibold text-slate-700 font-mono">"{String(sampleValue)}"</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Field Button */}
                  <div className="p-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Need to import non-standard data?</span>
                    <button
                      type="button"
                      onClick={() => setCustomMappings((prev) => [...prev, { id: `cm_${Date.now()}`, label: '', column: '' }])}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-primary text-primary rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Plus size={13} /> Add Custom Field
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* STEP 3: PREVIEW & VALIDATION */}
            {step === 'validate' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Records</p>
                      <p className="text-lg font-extrabold text-slate-900">{validationRows.length}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-emerald-200/80 bg-emerald-50/20 shadow-xs flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Valid Rows</p>
                      <p className="text-lg font-extrabold text-emerald-700">{validCount}</p>
                    </div>
                  </div>

                  <div className={cn(
                    "p-4 bg-white rounded-xl border shadow-xs flex items-center gap-3",
                    invalidCount > 0 ? "border-rose-200/80 bg-rose-50/20" : "border-slate-200/80 opacity-60"
                  )}>
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      invalidCount > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-400"
                    )}>
                      <AlertCircle size={18} />
                    </div>
                    <div>
                      <p className={cn("text-[11px] font-bold uppercase tracking-wider", invalidCount > 0 ? "text-rose-700" : "text-slate-400")}>
                        Issues Detected
                      </p>
                      <p className={cn("text-lg font-extrabold", invalidCount > 0 ? "text-rose-700" : "text-slate-700")}>
                        {invalidCount}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setValidationFilter('all')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      validationFilter === 'all'
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    )}
                  >
                    All Records ({validationRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setValidationFilter('valid')}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      validationFilter === 'valid'
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                    )}
                  >
                    Valid Only ({validCount})
                  </button>
                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setValidationFilter('invalid')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        validationFilter === 'invalid'
                          ? "bg-rose-600 text-white shadow-xs"
                          : "text-slate-500 hover:text-rose-700 hover:bg-rose-50"
                      )}
                    >
                      Issues Only ({invalidCount})
                    </button>
                  )}
                </div>

                {/* Preview Table */}
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/90 border-b border-slate-200 sticky top-0 backdrop-blur-xs z-10">
                        <tr>
                          <th className="px-3 py-3 font-bold text-slate-500 w-10 text-center">#</th>
                          <th className="px-3 py-3 font-bold text-slate-500 w-20">Status</th>
                          {type === 'leads' ? (
                            <>
                              <th className="px-3 py-3 font-bold text-slate-500">Name</th>
                              <th className="px-3 py-3 font-bold text-slate-500">Contact / WhatsApp</th>
                              <th className="px-3 py-3 font-bold text-slate-500">Role / Type</th>
                              <th className="px-3 py-3 font-bold text-slate-500">Source / Location</th>
                              <th className="px-3 py-3 font-bold text-slate-500">Validation</th>
                              <th className="px-3 py-3 font-bold text-slate-500 text-right w-20">Action</th>
                            </>
                          ) : (
                            <>
                              <th className="px-4 py-3 font-bold text-slate-500">Name</th>
                              <th className="px-4 py-3 font-bold text-slate-500">Contact Info</th>
                              <th className="px-4 py-3 font-bold text-slate-500">Validation</th>
                              <th className="px-4 py-3 font-bold text-slate-500 text-right w-20">Action</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validationRows
                          .filter((r) => {
                            if (validationFilter === 'valid') return r.isValid;
                            if (validationFilter === 'invalid') return !r.isValid;
                            return true;
                          })
                          .slice(0, 150)
                          .map((row) => (
                            <tr
                              key={row.index}
                              className={cn(
                                "transition-colors",
                                row.isValid ? "hover:bg-slate-50/70" : "bg-rose-50/30 hover:bg-rose-50/60"
                              )}
                            >
                              <td className="px-3 py-2.5 font-medium text-slate-400 text-center">{row.index}</td>
                              <td className="px-3 py-2.5">
                                {row.isValid ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                                    <Check size={11} className="text-emerald-600 stroke-[3]" /> Valid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200/60 px-2 py-0.5 rounded-full">
                                    <AlertCircle size={11} className="text-rose-600" /> Issue
                                  </span>
                                )}
                              </td>
                              {type === 'leads' ? (
                                <>
                                  <td className="px-3 py-2.5 font-bold text-slate-800">
                                    {row.mapped.firstName || row.mapped.lastName ? (
                                      `${row.mapped.firstName || ''} ${row.mapped.lastName || ''}`.trim()
                                    ) : (
                                      <span className="text-rose-500 font-bold italic flex items-center gap-1">
                                        <AlertCircle size={11} /> Missing Name
                                      </span>
                                    )}
                                    {row.mapped.email && <div className="text-[11px] text-slate-400 font-normal">{row.mapped.email}</div>}
                                  </td>
                                  <td className="px-3 py-2.5 font-medium text-slate-700">
                                    <div>{row.mapped.mobileNo || <span className="text-slate-400 italic">No phone</span>}</div>
                                    {row.mapped.whatsappNumber && (
                                      <div className="text-[11px] text-slate-500">WA: {row.mapped.whatsappNumber}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-700 font-medium">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Role:</span>
                                        {row.errors.some(err => err.toLowerCase().includes('role')) ? (
                                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                            {row.mapped.role || 'Missing'}
                                          </span>
                                        ) : (
                                          <span className="text-xs font-bold text-slate-800">{row.mapped.role || '—'}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Type:</span>
                                        {row.errors.some(err => err.toLowerCase().includes('lead type')) ? (
                                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                            {row.mapped.leadCategory || 'Missing'}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-slate-600 font-semibold">{row.mapped.leadCategory || '—'}</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-600 font-medium">
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Src:</span>
                                        {row.errors.some(err => err.toLowerCase().includes('lead source')) ? (
                                          <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                            {row.mapped.source || 'Missing'}
                                          </span>
                                        ) : (
                                          <span className="text-xs font-bold text-slate-800">{row.mapped.source || '—'}</span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                                        {[row.mapped.address, row.mapped.state, row.mapped.pincode].filter(Boolean).join(', ') || '—'}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {row.isValid ? (
                                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                                        <Check size={12} /> Ready
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {row.errors.map((err, i) => (
                                          <button
                                            key={i}
                                            type="button"
                                            onClick={() => setEditingRowIndex(row.index - 1)}
                                            className="text-[10px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 px-1.5 py-0.5 rounded transition-colors text-left cursor-pointer"
                                            title="Click to fix issue"
                                          >
                                            {err} ✎
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setEditingRowIndex(row.index - 1)}
                                      className={cn(
                                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-xs cursor-pointer",
                                        row.isValid
                                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                          : "bg-rose-600 hover:bg-rose-700 text-white"
                                      )}
                                      title="Edit record details"
                                    >
                                      <Pencil size={11} /> {row.isValid ? 'Edit' : 'Fix'}
                                    </button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-4 py-2.5 font-bold text-slate-800">
                                    {row.mapped.name || row.mapped.firstName || <span className="text-rose-500 italic">Missing</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-700 font-medium">
                                    {row.mapped.email || row.mapped.mobileNo || row.mapped.phone || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {row.isValid ? (
                                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                                        <Check size={12} /> Ready
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1">
                                        {row.errors.map((err, i) => (
                                          <button
                                            key={i}
                                            type="button"
                                            onClick={() => setEditingRowIndex(row.index - 1)}
                                            className="text-[10px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 px-1.5 py-0.5 rounded"
                                          >
                                            {err} ✎
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setEditingRowIndex(row.index - 1)}
                                      className={cn(
                                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-xs cursor-pointer",
                                        row.isValid ? "bg-slate-100 hover:bg-slate-200 text-slate-700" : "bg-rose-600 hover:bg-rose-700 text-white"
                                      )}
                                    >
                                      <Pencil size={11} /> {row.isValid ? 'Edit' : 'Fix'}
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Quick Fix / Edit Record Modal Overlay */}
                {editingRowIndex !== null && validationRows[editingRowIndex] && (() => {
                  const currentRow = validationRows[editingRowIndex];
                  const currentMapped = currentRow.mapped;
                  
                  // Find next/prev issue index
                  const issueIndices = validationRows
                    .map((r, idx) => (!r.isValid ? idx : -1))
                    .filter((idx) => idx !== -1);
                  const currentIssuePos = issueIndices.indexOf(editingRowIndex);
                  const prevIssueIdx = currentIssuePos > 0 ? issueIndices[currentIssuePos - 1] : null;
                  const nextIssueIdx = currentIssuePos !== -1 && currentIssuePos < issueIndices.length - 1 ? issueIndices[currentIssuePos + 1] : null;

                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                        
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                              currentRow.isValid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            )}>
                              #{currentRow.index}
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                Edit & Fix Record #{currentRow.index}
                                {currentRow.isValid ? (
                                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Check size={11} /> Valid
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <AlertCircle size={11} /> {currentRow.errors.length} Issue{currentRow.errors.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs text-slate-500 font-medium">Update invalid fields to make this row ready for import</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {prevIssueIdx !== null && (
                              <button
                                type="button"
                                onClick={() => setEditingRowIndex(prevIssueIdx)}
                                className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1"
                                title="Jump to previous issue"
                              >
                                <ArrowLeft size={12} /> Prev Issue
                              </button>
                            )}
                            {nextIssueIdx !== null && (
                              <button
                                type="button"
                                onClick={() => setEditingRowIndex(nextIssueIdx)}
                                className="px-2 py-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1"
                                title="Jump to next issue"
                              >
                                Next Issue <ArrowRight size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingRowIndex(null)}
                              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 ml-2"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Error Alert Box */}
                        {!currentRow.isValid && (
                          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-800">
                            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Issues detected on this record:</p>
                              <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[11px] font-semibold text-rose-700">
                                {currentRow.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}

                        {currentRow.isValid && (
                          <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200/80 flex items-center gap-2 text-xs font-bold text-emerald-800">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            <span>This record is valid and ready to be imported!</span>
                          </div>
                        )}

                        {/* Form Fields Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                          {type === 'leads' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Salutation</label>
                                <select
                                  value={currentMapped.salutation || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'salutation', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary bg-white cursor-pointer"
                                >
                                  <option value="">— Select Salutation —</option>
                                  {['Mr', 'Ms', 'Mrs', 'Dr'].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  First Name <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={currentMapped.firstName || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'firstName', e.target.value)}
                                  placeholder="e.g. Aarav"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Last Name</label>
                                <input
                                  type="text"
                                  value={currentMapped.lastName || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'lastName', e.target.value)}
                                  placeholder="e.g. Sharma"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              {(() => {
                                const norm = currentMapped.role ? currentMapped.role.toUpperCase().replace(/[\s_-]+/g, ' ').trim() : '';
                                const isAllowed = ['USER', 'AGENT', 'OWNER'].includes(norm) || norm === '2 BIGHA USER';
                                const roleVal = isAllowed ? (norm === '2 BIGHA USER' ? 'USER' : norm) : (currentMapped.role || '');
                                const hasRoleError = currentRow.errors.some((err) => err.toLowerCase().includes('role'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>Role <span className="text-rose-500">*</span></span>
                                      {hasRoleError && <span className="text-[10px] font-bold text-rose-600">Invalid Role</span>}
                                    </label>
                                    <select
                                      value={roleVal}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'role', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasRoleError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && (
                                        <option value={currentMapped.role || ''} disabled className="text-rose-600 font-bold bg-rose-50">
                                          {currentMapped.role ? `⚠️ Invalid: "${currentMapped.role}" (Select valid role)` : '— Select Role —'}
                                        </option>
                                      )}
                                      <option value="USER">User</option>
                                      <option value="AGENT">Real Estate Agent</option>
                                      <option value="OWNER">Property Owner</option>
                                    </select>
                                  </div>
                                );
                              })()}

                              {(() => {
                                const allowedCategories = Array.from(new Set(['Lead', 'Buyer', 'Seller', 'Reference', 'Investor', ...picklistLeadCategories.map(c => c.toLowerCase() === 'buyer lead' ? 'Buyer' : c)]));
                                const normCat = currentMapped.leadCategory ? (currentMapped.leadCategory.toLowerCase() === 'buyer lead' ? 'Buyer' : currentMapped.leadCategory) : 'Lead';
                                const isAllowed = allowedCategories.some(c => c.toLowerCase() === (currentMapped.leadCategory || '').toLowerCase()) || !currentMapped.leadCategory;
                                const hasCatError = currentRow.errors.some((err) => err.toLowerCase().includes('lead type') || err.toLowerCase().includes('category'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>Lead Type / Category <span className="text-slate-400 font-normal">(Default: Lead)</span></span>
                                      {hasCatError && <span className="text-[10px] font-bold text-rose-600">Invalid Type</span>}
                                    </label>
                                    <select
                                      value={isAllowed ? normCat : (currentMapped.leadCategory || '')}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'leadCategory', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasCatError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && currentMapped.leadCategory && (
                                        <option value={currentMapped.leadCategory} disabled className="text-rose-600 font-bold bg-rose-50">
                                          ⚠️ Invalid: "{currentMapped.leadCategory}" (Select valid type)
                                        </option>
                                      )}
                                      {allowedCategories.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()}

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                                <select
                                  value={currentMapped.gender || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'gender', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary bg-white cursor-pointer"
                                >
                                  <option value="">— Select Gender —</option>
                                  {['Male', 'Female', 'Other'].map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Contact Number (10 Digits)
                                </label>
                                <input
                                  type="text"
                                  value={currentMapped.mobileNo || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'mobileNo', e.target.value)}
                                  placeholder="e.g. 9876543210"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  WhatsApp Number (10 Digits)
                                </label>
                                <input
                                  type="text"
                                  value={currentMapped.whatsappNumber || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'whatsappNumber', e.target.value)}
                                  placeholder="e.g. 9876543210"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Phone (Alternate)
                                </label>
                                <input
                                  type="text"
                                  value={currentMapped.phone || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'phone', e.target.value)}
                                  placeholder="e.g. 9876543211"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                                <input
                                  type="email"
                                  value={currentMapped.email || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'email', e.target.value)}
                                  placeholder="e.g. user@example.com"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Emails</label>
                                <input
                                  type="text"
                                  value={Array.isArray(currentMapped.additionalEmails) ? currentMapped.additionalEmails.join(', ') : (currentMapped.additionalEmails || '')}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'additionalEmails', e.target.value)}
                                  placeholder="e.g. user.work@example.com, user.alt@example.com"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              {(() => {
                                const allowedSources = ['Website', 'Google Lead', 'Meta Ads', 'Referral', 'Walk In', 'Direct Call', 'Other', 'Organic Search', 'Social Media', 'Paid Ads', 'Email Campaign', 'Offline'];
                                const matchSource = allowedSources.find(s => s.toLowerCase() === (currentMapped.source || '').toLowerCase());
                                const isAllowed = !currentMapped.source || !!matchSource;
                                const hasSourceError = currentRow.errors.some((err) => err.toLowerCase().includes('lead source') || err.toLowerCase().includes('source'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>Lead Source</span>
                                      {hasSourceError && <span className="text-[10px] font-bold text-rose-600">Invalid Source</span>}
                                    </label>
                                    <select
                                      value={isAllowed ? (matchSource || 'Website') : (currentMapped.source || '')}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'source', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasSourceError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && currentMapped.source && (
                                        <option value={currentMapped.source} disabled className="text-rose-600 font-bold bg-rose-50">
                                          ⚠️ Invalid: "{currentMapped.source}" (Select valid source)
                                        </option>
                                      )}
                                      {allowedSources.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()}

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Group</label>
                                <select
                                  value={currentMapped.group || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'group', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary bg-white cursor-pointer"
                                >
                                  <option value="">— Select Group —</option>
                                  {Array.from(new Set([
                                    'Seller',
                                    'Buyer',
                                    ...picklistLeadGroups,
                                    ...(currentMapped.group ? [currentMapped.group] : [])
                                  ])).map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">City / Address</label>
                                <input
                                  type="text"
                                  value={currentMapped.address || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'address', e.target.value)}
                                  placeholder="e.g. Hyderabad"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              {(() => {
                                const matchState = INDIAN_STATES.find(s => s.toUpperCase() === (currentMapped.state || '').toUpperCase());
                                const isAllowed = !currentMapped.state || !!matchState;
                                const hasStateError = currentRow.errors.some((err) => err.toLowerCase().includes('state'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>State</span>
                                      {hasStateError && <span className="text-[10px] font-bold text-rose-600">Invalid State</span>}
                                    </label>
                                    <select
                                      value={isAllowed ? (matchState || '') : (currentMapped.state || '')}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'state', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasStateError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && currentMapped.state && (
                                        <option value={currentMapped.state} disabled className="text-rose-600 font-bold bg-rose-50">
                                          ⚠️ Invalid: "{currentMapped.state}" (Select valid state)
                                        </option>
                                      )}
                                      <option value="">— Select Valid State —</option>
                                      {INDIAN_STATES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()}

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  PinCode (6 Digits)
                                </label>
                                <input
                                  type="text"
                                  value={currentMapped.pincode || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'pincode', e.target.value)}
                                  placeholder="e.g. 500001"
                                  maxLength={6}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">X (Twitter) handle</label>
                                <input
                                  type="text"
                                  value={currentMapped.twitterHandle || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'twitterHandle', e.target.value)}
                                  placeholder="@username"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              {(() => {
                                const allowedPlans = ['Just Exploring', 'Within 1 Month', '1–3 Months', '3–6 Months'];
                                const normPlan = currentMapped.planningToBuyLand ? currentMapped.planningToBuyLand.toUpperCase().replace(/[\s_-]+/g, ' ').trim() : '';
                                const matchPlan = allowedPlans.find(p => p.toUpperCase().replace(/[\s_-]+/g, ' ').trim() === normPlan);
                                const isAllowed = !currentMapped.planningToBuyLand || !!matchPlan;
                                const hasPlanError = currentRow.errors.some((err) => err.toLowerCase().includes('planning to buy land'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>Planning To Buy Land</span>
                                      {hasPlanError && <span className="text-[10px] font-bold text-rose-600">Invalid Timeline</span>}
                                    </label>
                                    <select
                                      value={isAllowed ? (matchPlan || '') : (currentMapped.planningToBuyLand || '')}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'planningToBuyLand', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasPlanError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && currentMapped.planningToBuyLand && (
                                        <option value={currentMapped.planningToBuyLand} disabled className="text-rose-600 font-bold bg-rose-50">
                                          ⚠️ Invalid: "{currentMapped.planningToBuyLand}" (Select valid timeline)
                                        </option>
                                      )}
                                      <option value="">— Select Timeline —</option>
                                      {allowedPlans.map((p) => (
                                        <option key={p} value={p}>{p}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()}

                              {(() => {
                                const allowedVerticals = ['Property Listing', 'Property Management'];
                                const normVert = currentMapped.leadVertical ? currentMapped.leadVertical.toUpperCase().replace(/[\s_-]+/g, ' ').trim() : '';
                                const matchVert = allowedVerticals.find(v => v.toUpperCase().replace(/[\s_-]+/g, ' ').trim() === normVert);
                                const isAllowed = !currentMapped.leadVertical || !!matchVert;
                                const hasVertError = currentRow.errors.some((err) => err.toLowerCase().includes('lead vertical'));

                                return (
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                                      <span>Lead Vertical</span>
                                      {hasVertError && <span className="text-[10px] font-bold text-rose-600">Invalid Vertical</span>}
                                    </label>
                                    <select
                                      value={isAllowed ? (matchVert || '') : (currentMapped.leadVertical || '')}
                                      onChange={(e) => handleUpdateRowField(editingRowIndex, 'leadVertical', e.target.value)}
                                      className={cn(
                                        "w-full border rounded-lg px-3 py-2 text-xs font-bold focus:outline-none bg-white cursor-pointer transition-colors",
                                        hasVertError
                                          ? "border-rose-300 bg-rose-50/30 text-rose-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-400"
                                          : "border-slate-200 text-slate-800 focus:border-primary"
                                      )}
                                    >
                                      {!isAllowed && currentMapped.leadVertical && (
                                        <option value={currentMapped.leadVertical} disabled className="text-rose-600 font-bold bg-rose-50">
                                          ⚠️ Invalid: "{currentMapped.leadVertical}" (Select valid vertical)
                                        </option>
                                      )}
                                      <option value="">— Select Vertical —</option>
                                      {allowedVerticals.map((v) => (
                                        <option key={v} value={v}>{v}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })()}

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Lead Owner</label>
                                <input
                                  type="text"
                                  value={currentMapped.leadOwner || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'leadOwner', e.target.value)}
                                  placeholder="e.g. Aarav Sharma"
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Status (legacy)</label>
                                <select
                                  value={currentMapped.status || 'New'}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'status', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary bg-white cursor-pointer"
                                >
                                  {['New', 'Qualified', 'Replied', 'Opportunity'].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Call Status</label>
                                <select
                                  value={currentMapped.callStatus || 'Not Called'}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'callStatus', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary bg-white cursor-pointer"
                                >
                                  {['Not Called', 'Completed', 'Missed', 'Busy', 'Failed'].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Description</label>
                                <textarea
                                  value={currentMapped.notes || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'notes', e.target.value)}
                                  placeholder="e.g. Additional remarks, requirements, or notes..."
                                  rows={3}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary resize-none"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Name</label>
                                <input
                                  type="text"
                                  value={currentMapped.name || currentMapped.firstName || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, currentMapped.name !== undefined ? 'name' : 'firstName', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                                <input
                                  type="email"
                                  value={currentMapped.email || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, 'email', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Phone (10 Digits)</label>
                                <input
                                  type="text"
                                  value={currentMapped.mobileNo || currentMapped.phone || ''}
                                  onChange={(e) => handleUpdateRowField(editingRowIndex, currentMapped.mobileNo !== undefined ? 'mobileNo' : 'phone', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-primary font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                          <span className="text-xs text-slate-500 font-medium">
                            {currentRow.isValid ? '✓ Changes saved automatically' : '⚠️ Correct errors to enable import for this row'}
                          </span>
                          <div className="flex items-center gap-2">
                            {nextIssueIdx !== null ? (
                              <button
                                type="button"
                                onClick={() => setEditingRowIndex(nextIssueIdx)}
                                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                              >
                                Next Issue <ArrowRight size={13} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingRowIndex(null)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
                              >
                                Done
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}

                {error && (
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <AlertCircle size={16} className="shrink-0 text-rose-600" />
                    <p>{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: SUMMARY */}
            {step === 'summary' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {summaryData?.status === 'processing' ? (
                  <div className="p-10 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                      <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800">Importing {typeLabel}s…</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Processing and verifying records. Please keep this window open.
                      </p>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200 mt-2">
                      <div
                        className="bg-primary h-full transition-all duration-300 rounded-full"
                        style={{
                          width: `${
                            summaryData.total > 0
                              ? Math.min(100, Math.round((summaryData.processed / summaryData.total) * 100))
                              : 10
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600 font-mono">
                      {summaryData.processed} / {summaryData.total} Records Processed
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Completion Status Banner */}
                    <div className={cn(
                      "p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs",
                      (summaryData?.failedCount ?? 0) > 0
                        ? "bg-rose-50/70 border-rose-200/80 text-rose-900"
                        : (summaryData?.skippedCount ?? 0) > 0 || (summaryData?.invalidCount ?? 0) > 0
                        ? "bg-amber-50/70 border-amber-200/80 text-amber-900"
                        : "bg-emerald-50/70 border-emerald-200/80 text-emerald-900"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
                          (summaryData?.failedCount ?? 0) > 0
                            ? "bg-rose-600 text-white"
                            : (summaryData?.skippedCount ?? 0) > 0 || (summaryData?.invalidCount ?? 0) > 0
                            ? "bg-amber-500 text-white"
                            : "bg-emerald-600 text-white"
                        )}>
                          {(summaryData?.failedCount ?? 0) > 0 ? (
                            <AlertCircle size={20} strokeWidth={2.5} />
                          ) : (
                            <CheckCircle2 size={20} strokeWidth={2.5} />
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold tracking-tight">
                            {(summaryData?.failedCount ?? 0) > 0
                              ? "Import Finished with Errors"
                              : (summaryData?.skippedCount ?? 0) > 0 || (summaryData?.invalidCount ?? 0) > 0
                              ? "Import Completed with Warnings"
                              : "Upload & Import Successful!"}
                          </h3>
                          <p className="text-xs opacity-80 mt-0.5">
                            {(summaryData?.createdCount ?? 0)} new {typeLabel.toLowerCase()}s created successfully.
                            {summaryData?.error && ` (${summaryData.error})`}
                          </p>
                        </div>
                      </div>

                      {((summaryData?.skippedRows?.length ?? 0) > 0 ||
                        (summaryData?.invalidRows?.length ?? 0) > 0 ||
                        (summaryData?.failedRows?.length ?? 0) > 0) && (
                        <button
                          type="button"
                          onClick={downloadErrorReport}
                          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-2 transition-all shadow-xs shrink-0 self-end sm:self-auto"
                        >
                          <Download size={14} className="text-primary" /> Download Issues Report (.xlsx)
                        </button>
                      )}
                    </div>

                    {/* Result Count Metric Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-xs text-center">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Total Records
                        </span>
                        <span className="text-2xl font-black text-slate-800 font-mono">
                          {summaryData?.total ?? 0}
                        </span>
                      </div>

                      <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200/60 shadow-xs text-center">
                        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
                          New Leads Created
                        </span>
                        <span className="text-2xl font-black text-emerald-600 font-mono">
                          {summaryData?.createdCount ?? 0}
                        </span>
                      </div>

                      <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200/60 shadow-xs text-center">
                        <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                          Duplicates Skipped
                        </span>
                        <span className="text-2xl font-black text-amber-600 font-mono">
                          {summaryData?.skippedCount ?? 0}
                        </span>
                      </div>

                      <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/60 shadow-xs text-center">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                          Invalid Records
                        </span>
                        <span className="text-2xl font-black text-slate-700 font-mono">
                          {summaryData?.invalidCount ?? 0}
                        </span>
                      </div>

                      <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200/60 shadow-xs text-center col-span-2 sm:col-span-1">
                        <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block mb-1">
                          Failed Records
                        </span>
                        <span className="text-2xl font-black text-rose-600 font-mono">
                          {summaryData?.failedCount ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Issues Table Section */}
                    {(() => {
                      const allIssuesList: {
                        rowNumber: number;
                        type: 'invalid' | 'skipped' | 'failed';
                        label: string;
                        name: string;
                        contact: string;
                        reason: string;
                      }[] = [];

                      (summaryData?.invalidRows || []).forEach((inv) => {
                        const raw = inv.rowData || {};
                        allIssuesList.push({
                          rowNumber: inv.rowNumber,
                          type: 'invalid',
                          label: 'Invalid Record',
                          name: raw['First Name'] || raw['Name'] || raw['First name'] || raw.firstName || '—',
                          contact: raw['Contact Number'] || raw['Mobile No'] || raw['Phone Number'] || raw['Email'] || raw.mobileNo || raw.email || '—',
                          reason: inv.errors.join('; '),
                        });
                      });

                      (summaryData?.skippedRows || []).forEach((skp) => {
                        const raw = skp.rowData || {};
                        allIssuesList.push({
                          rowNumber: skp.rowNumber,
                          type: 'skipped',
                          label: 'Duplicate Skipped',
                          name: raw['First Name'] || raw['Name'] || raw['First name'] || raw.firstName || '—',
                          contact: raw['Contact Number'] || raw['Mobile No'] || raw['Phone Number'] || raw['Email'] || raw.mobileNo || raw.email || '—',
                          reason: skp.reason || 'Duplicate phone or email',
                        });
                      });

                      (summaryData?.failedRows || []).forEach((fld) => {
                        const raw = fld.rowData || {};
                        allIssuesList.push({
                          rowNumber: fld.rowNumber,
                          type: 'failed',
                          label: 'Failed Record',
                          name: raw['First Name'] || raw['Name'] || raw['First name'] || raw.firstName || '—',
                          contact: raw['Contact Number'] || raw['Mobile No'] || raw['Phone Number'] || raw['Email'] || raw.mobileNo || raw.email || '—',
                          reason: fld.reason || 'Processing failed',
                        });
                      });

                      allIssuesList.sort((a, b) => a.rowNumber - b.rowNumber);

                      const displayed = summaryFilter === 'all'
                        ? allIssuesList
                        : allIssuesList.filter((i) => i.type === summaryFilter);

                      if (allIssuesList.length === 0) {
                        return (
                          <div className="p-8 bg-emerald-50/40 rounded-2xl border border-emerald-200/60 text-center flex flex-col items-center justify-center space-y-2">
                            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                              <CheckCircle2 size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-emerald-900">Zero Issues Encountered</h4>
                            <p className="text-xs text-emerald-700 max-w-sm">
                              All records were processed cleanly without any duplicates skipped, validation errors, or failures.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Issues & Skips Breakdown ({allIssuesList.length})
                            </h4>

                            {/* Filter Chips */}
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
                              <button
                                type="button"
                                onClick={() => setSummaryFilter('all')}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                  summaryFilter === 'all' ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-800"
                                )}
                              >
                                All ({allIssuesList.length})
                              </button>
                              {(summaryData?.invalidRows?.length ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSummaryFilter('invalid')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                    summaryFilter === 'invalid' ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-800"
                                  )}
                                >
                                  Invalid ({summaryData?.invalidRows?.length})
                                </button>
                              )}
                              {(summaryData?.skippedRows?.length ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSummaryFilter('skipped')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                    summaryFilter === 'skipped' ? "bg-amber-600 text-white" : "text-amber-700 hover:text-amber-900"
                                  )}
                                >
                                  Skipped ({summaryData?.skippedRows?.length})
                                </button>
                              )}
                              {(summaryData?.failedRows?.length ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSummaryFilter('failed')}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                                    summaryFilter === 'failed' ? "bg-rose-600 text-white" : "text-rose-700 hover:text-rose-900"
                                  )}
                                >
                                  Failed ({summaryData?.failedRows?.length})
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs max-h-72 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                                <tr>
                                  <th className="p-3 font-bold text-slate-600 w-20">Row</th>
                                  <th className="p-3 font-bold text-slate-600 w-36">Status</th>
                                  <th className="p-3 font-bold text-slate-600 w-44">Name / Contact</th>
                                  <th className="p-3 font-bold text-slate-600">Reason for Failure / Skip</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {displayed.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="p-3 font-mono font-bold text-slate-500">
                                      #{item.rowNumber}
                                    </td>
                                    <td className="p-3">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1",
                                        item.type === 'skipped'
                                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                                          : item.type === 'invalid'
                                          ? "bg-slate-100 text-slate-700 border border-slate-200"
                                          : "bg-rose-50 text-rose-700 border border-rose-200"
                                      )}>
                                        {item.label}
                                      </span>
                                    </td>
                                    <td className="p-3">
                                      <div className="font-bold text-slate-800">{item.name}</div>
                                      <div className="text-[11px] text-slate-400 font-mono">{item.contact}</div>
                                    </td>
                                    <td className="p-3 font-medium text-slate-700 leading-relaxed">
                                      {item.reason}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200/80 bg-white flex items-center justify-between gap-3 shrink-0">
            {step === 'upload' && (
              <div className="flex items-center justify-between w-full">
                <CrmButton variant="secondary" onClick={onClose}>
                  Cancel
                </CrmButton>
                <span className="text-xs text-slate-400 font-medium">Step 1 of 4</span>
              </div>
            )}

            {step === 'mapping' && (
              <>
                <CrmButton
                  variant="secondary"
                  onClick={() => setStep('upload')}
                  leftIcon={<ChevronLeft size={16} strokeWidth={2} />}
                >
                  Back
                </CrmButton>
                <div className="flex items-center gap-2">
                  <CrmButton
                    onClick={handleGoToValidation}
                    disabled={hasDuplicateMapping || Object.values(mapping).filter(Boolean).length === 0}
                    rightIcon={<ChevronRight size={16} strokeWidth={2} />}
                  >
                    {hasDuplicateMapping ? 'Fix Duplicate Mappings' : 'Review & Validate Data'}
                  </CrmButton>
                </div>
              </>
            )}

            {step === 'validate' && (
              <>
                <CrmButton
                  variant="secondary"
                  onClick={() => setStep('mapping')}
                  leftIcon={<ChevronLeft size={16} strokeWidth={2} />}
                >
                  Back to Mapping
                </CrmButton>

                <div className="flex items-center gap-2">
                  {invalidCount > 0 ? (
                    <>
                      <CrmButton
                        variant="secondary"
                        onClick={() => handleImport(false)}
                        disabled={uploading}
                        loading={uploading}
                      >
                        Import All ({validationRows.length})
                      </CrmButton>
                      <CrmButton
                        onClick={() => handleImport(true)}
                        disabled={uploading || validCount === 0}
                        loading={uploading}
                        leftIcon={<CheckCircle2 size={16} strokeWidth={2} />}
                      >
                        Import Valid Only ({validCount})
                      </CrmButton>
                    </>
                  ) : (
                    <CrmButton
                      onClick={() => handleImport(false)}
                      disabled={uploading || validationRows.length === 0}
                      loading={uploading}
                      rightIcon={!uploading ? <ChevronRight size={16} strokeWidth={2} /> : undefined}
                    >
                      {uploading ? 'Importing…' : `Start Import (${validationRows.length} Records)`}
                    </CrmButton>
                  )}
                </div>
              </>
            )}

            {step === 'summary' && (
              <div className="flex items-center justify-between w-full">
                <div>
                  {((summaryData?.skippedRows?.length ?? 0) > 0 ||
                    (summaryData?.invalidRows?.length ?? 0) > 0 ||
                    (summaryData?.failedRows?.length ?? 0) > 0) && (
                    <CrmButton
                      variant="secondary"
                      onClick={downloadErrorReport}
                      leftIcon={<Download size={15} />}
                    >
                      Download Issues Report (.xlsx)
                    </CrmButton>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <CrmButton
                    variant="secondary"
                    onClick={() => {
                      setFile(null);
                      setHeaders([]);
                      setMapping({});
                      setValidationRows([]);
                      setParsedRows([]);
                      setSummaryData(null);
                      setStep('upload');
                    }}
                  >
                    Import Another File
                  </CrmButton>
                  <CrmButton
                    onClick={() => {
                      onSuccess?.();
                      onClose();
                    }}
                    leftIcon={<CheckCircle2 size={16} strokeWidth={2} />}
                  >
                    Done & View {typeLabel}s
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
