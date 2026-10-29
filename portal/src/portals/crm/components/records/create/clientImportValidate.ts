/**
 * Client import row checks used by the preview step.
 * Mirrors api/src/crm/shared/client-import-normalize.util.ts — keep the rules the same.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLACEHOLDER_NAMES = new Set([
  'unknown',
  'n/a',
  'na',
  'n.a',
  'n.a.',
  'null',
  'none',
  'nil',
  'undefined',
  '-',
  '--',
  '---',
  '.',
  'name',
  'client',
  'client name',
  'full name',
  'not available',
  'not provided',
  'tbd',
  'todo',
  'xxx',
]);

const ROLE_SYNONYMS: Record<string, 'USER' | 'AGENT' | 'OWNER'> = {
  user: 'USER',
  '2 bigha user': 'USER',
  '2bigha user': 'USER',
  buyer: 'USER',
  tenant: 'USER',
  agent: 'AGENT',
  'real estate agent': 'AGENT',
  broker: 'AGENT',
  builder: 'AGENT',
  owner: 'OWNER',
  'property owner': 'OWNER',
  seller: 'OWNER',
  landlord: 'OWNER',
};

const STATUS_SYNONYMS: Record<string, 'active' | 'inactive' | 'prospective'> = {
  active: 'active',
  enabled: 'active',
  live: 'active',
  inactive: 'inactive',
  'in active': 'inactive',
  'in-active': 'inactive',
  disabled: 'inactive',
  prospective: 'prospective',
  prospect: 'prospective',
};

export interface ClientImportNormalized {
  name: string;
  phone: string;
  email?: string;
  additionalEmails: string[];
  whatsappNumber?: string;
  address?: string;
  role?: 'USER' | 'AGENT' | 'OWNER';
  status?: 'active' | 'inactive' | 'prospective';
}

export interface ClientImportVerdict {
  errors: string[];
  normalized: ClientImportNormalized;
}

function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v).replace(/\.0+$/, '');
  }
  if (v instanceof Date) return '';
  return String(v).replace(/^\uFEFF/, '').trim().replace(/^'+/, '').trim();
}

function toIndianMobileDigits(rawDigits: string): string {
  let digits = rawDigits;
  if (digits.length > 10) {
    if (digits.startsWith('0091') && digits.length === 14) digits = digits.slice(4);
    else if (digits.startsWith('091') && digits.length === 13) digits = digits.slice(3);
    else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
    else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
    else if (digits.startsWith('91')) {
      const stripped = digits.slice(2);
      if (stripped.length === 10) digits = stripped;
    } else if (digits.startsWith('0')) {
      const stripped = digits.replace(/^0+/, '');
      if (stripped.length === 10) digits = stripped;
    }
  }
  return digits;
}

function phoneProblem(
  raw: unknown,
  label: string,
  required: boolean,
): { error?: string; formatted?: string } {
  if (raw instanceof Date) return { error: `${label} is not a phone number` };
  const text = cellText(raw);
  if (!text) return required ? { error: `${label} is required` } : {};
  if (/[eE][+]?\d/.test(text)) {
    return {
      error: `${label} looks corrupted (scientific notation). Enter one 10-digit mobile number.`,
    };
  }
  const digitRun = text.replace(/\.0+$/, '').replace(/\D/g, '');
  if (/[,/;|]|\band\b|\bor\b/i.test(text) && digitRun.length > 10) {
    return { error: `${label} has more than one number. Keep a single 10-digit mobile number.` };
  }
  const digits = toIndianMobileDigits(digitRun);
  if (digits.length !== 10) return { error: `${label} must be 10 digits` };
  if (!/^[6-9]\d{9}$/.test(digits)) return { error: `${label} must start with 6, 7, 8, or 9` };
  return { formatted: `+91${digits}` };
}

export function validateClientImportMapped(input: Record<string, unknown>): ClientImportVerdict {
  const errors: string[] = [];
  const normalized: ClientImportNormalized = { name: '', phone: '', additionalEmails: [] };

  const name = cellText(input.name);
  if (!name) {
    errors.push('Name is required');
  } else if (PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    errors.push('Name is missing or not a real name');
  } else if (name.length > 200) {
    errors.push('Name is too long');
  } else if (EMAIL.test(name)) {
    errors.push('Name looks like an email. Enter the client name, and put the address in Email.');
  } else if (/^\+?\d[\d\s().-]{8,}$/.test(name) && name.replace(/\D/g, '').length >= 10) {
    errors.push('Name looks like a phone number. Enter the client name.');
  } else if (name.replace(/[^\p{L}]/gu, '').length < 2) {
    errors.push('Name is too short');
  } else {
    normalized.name = name;
  }

  const phone = phoneProblem(input.phone, 'Phone number', true);
  if (phone.error) errors.push(phone.error);
  else if (phone.formatted) normalized.phone = phone.formatted;

  const emailText = cellText(input.email);
  if (emailText) {
    if (/[,;]/.test(emailText)) {
      errors.push(
        'Email has more than one address. Keep one email here and put the others in Additional Emails.',
      );
    } else if (!EMAIL.test(emailText)) {
      errors.push('Invalid email format');
    } else {
      normalized.email = emailText;
    }
  }

  const extraRaw = input.additionalEmails;
  const tokens = Array.isArray(extraRaw)
    ? extraRaw.flatMap((v) => cellText(v).split(/[,;]/))
    : cellText(extraRaw)
      ? cellText(extraRaw).split(/[,;]/)
      : [];
  const seen = new Set<string>();
  const primary = (normalized.email || emailText).trim().toLowerCase();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (!EMAIL.test(trimmed)) {
      errors.push(`Invalid additional email "${trimmed}"`);
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (lower === primary || seen.has(lower)) continue;
    seen.add(lower);
    normalized.additionalEmails.push(trimmed);
  }

  const whatsapp = phoneProblem(input.whatsappNumber, 'WhatsApp number', false);
  if (whatsapp.error) errors.push(whatsapp.error);
  else if (whatsapp.formatted) normalized.whatsappNumber = whatsapp.formatted;

  const address = cellText(input.address);
  if (address) {
    if (address.length > 500) errors.push('Address is too long');
    else normalized.address = address;
  }

  if (cellText(input.role)) {
    const role = ROLE_SYNONYMS[cellText(input.role).toLowerCase().replace(/[\s_\-./]+/g, ' ').trim()];
    if (!role) errors.push(`Invalid role "${cellText(input.role)}" (allowed: USER, AGENT, OWNER)`);
    else normalized.role = role;
  }

  if (cellText(input.status)) {
    const status = STATUS_SYNONYMS[cellText(input.status).toLowerCase().replace(/[\s_]+/g, ' ').trim()];
    if (!status) {
      errors.push(`Invalid status "${cellText(input.status)}" (allowed: active, inactive, prospective)`);
    } else {
      normalized.status = status;
    }
  }

  return { errors, normalized };
}

/** How an in-file duplicate will be treated, matching the strategy chosen on the mapping step. */
export function clientDuplicateWarning(strategy: string, kind: 'phone' | 'email', firstRow: number): string {
  const what = kind === 'phone' ? 'phone' : 'email';
  const action =
    strategy === 'skip'
      ? 'Skip duplicates will keep the earlier row and skip this one.'
      : strategy === 'replace'
        ? 'Replace existing will overwrite the earlier row with this one.'
        : strategy === 'create'
          ? 'Always create new will import this row as another client.'
          : 'Merge with existing will combine them into one client.';
  return `Same ${what} as row ${firstRow}. ${action}`;
}
