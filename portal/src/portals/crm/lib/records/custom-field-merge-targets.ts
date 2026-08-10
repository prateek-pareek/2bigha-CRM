import { type CrmModuleKey, getFieldDefsForModule } from '@/lib/crm/crm-field-layout';

/**
 * Keys allowed as merge targets for custom field deletion (standard fields).
 * Keep keys aligned with api-hrms `custom-field-merge.constants.ts`.
 */
const MERGEABLE_CORE_KEYS: Partial<Record<CrmModuleKey, string[]>> = {
  leads: [
    'salutation',
    'firstName',
    'middleName',
    'lastName',
    'email',
    'mobileNo',
    'phone',
    'organization',
    'jobTitle',
    'website',
    'linkedinUrl',
    'source',
    'industry',
    'noOfEmployees',
    'territory',
    'leadOwner',
    'stage',
    'status',
    'callStatus',
  ],
  contacts: [
    'salutation',
    'firstName',
    'middleName',
    'lastName',
    'email',
    'mobileNo',
    'phone',
    'organization',
    'jobTitle',
    'website',
    'linkedinUrl',
    'source',
    'industry',
    'noOfEmployees',
    'territory',
    'leadOwner',
    'stage',
    'status',
    'telegram',
    'address',
    'gender',
  ],
  deals: ['title', 'stage', 'organization', 'dealOwner', 'nextStep', 'currency'],
  organizations: ['name', 'website', 'territory', 'industry', 'noOfEmployees', 'phone', 'email', 'address'],
  clients: ['name', 'email', 'phone', 'status'],
};

export function getCoreMergeTargetOptions(module: CrmModuleKey): { key: string; label: string }[] {
  const keys = MERGEABLE_CORE_KEYS[module];
  if (!keys?.length) return [];
  const defs = getFieldDefsForModule(module);
  return keys.map((key) => ({
    key,
    label: defs.find((d) => d.key === key)?.label ?? key,
  }));
}
