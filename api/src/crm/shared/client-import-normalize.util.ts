/**
 * Row checks for client bulk import. Name and phone are required; everything else
 * is checked only when the cell has a value. Spreadsheet junk (placeholders, two
 * numbers in one cell, scientific notation, unknown roles) becomes a row error
 * the importer can fix — rows are never saved as "Unknown" with a blank phone.
 *
 * The portal preview uses the same rules (clientImportValidate.ts). Keep them together.
 */
import { isBlankImportValue, normalizeImportRole } from './lead-import-normalize.util';

export const CLIENT_ROLES = ['USER', 'AGENT', 'OWNER'] as const;
export const CLIENT_STATUSES = ['active', 'inactive', 'prospective'] as const;

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

const STATUS_SYNONYMS: Record<string, (typeof CLIENT_STATUSES)[number]> = {
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
  role?: (typeof CLIENT_ROLES)[number];
  status?: (typeof CLIENT_STATUSES)[number];
}

export interface ClientImportVerdict {
  errors: string[];
  /** Cleaned values. Phone/name stay empty when that cell failed, so the raw text is left for the user to edit. */
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

/** Strip Indian country-code prefixes once the value is digits-only. */
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
  if (raw instanceof Date) {
    return { error: `${label} is not a phone number` };
  }
  const text = cellText(raw);
  if (!text) {
    return required ? { error: `${label} is required` } : {};
  }
  if (/[eE][+]?\d/.test(text)) {
    return {
      error: `${label} looks corrupted (scientific notation). Enter one 10-digit mobile number.`,
    };
  }
  const digitRun = text.replace(/\.0+$/, '').replace(/\D/g, '');
  if (/[,/;|]|\band\b|\bor\b/i.test(text) && digitRun.length > 10) {
    return {
      error: `${label} has more than one number. Keep a single 10-digit mobile number.`,
    };
  }
  const digits = toIndianMobileDigits(digitRun);
  if (digits.length !== 10) {
    return { error: `${label} must be 10 digits` };
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return { error: `${label} must start with 6, 7, 8, or 9` };
  }
  return { formatted: `+91${digits}` };
}

function squashStatus(v: string): string {
  return v.toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

/**
 * Validate one mapped client row. Does not throw — the import loop turns `errors`
 * into a failed row so the rest of the file still imports.
 */
export function validateClientImportMapped(input: Record<string, unknown>): ClientImportVerdict {
  const errors: string[] = [];
  const normalized: ClientImportNormalized = {
    name: '',
    phone: '',
    additionalEmails: [],
  };

  const name = cellText(input.name);
  if (!name || isBlankImportValue(name)) {
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

  if (!isBlankImportValue(input.role)) {
    const role = normalizeImportRole(input.role);
    if (!role) {
      errors.push(`Invalid role "${cellText(input.role)}" (allowed: USER, AGENT, OWNER)`);
    } else {
      normalized.role = role;
    }
  }

  if (!isBlankImportValue(input.status)) {
    const status = STATUS_SYNONYMS[squashStatus(cellText(input.status))];
    if (!status) {
      errors.push(
        `Invalid status "${cellText(input.status)}" (allowed: active, inactive, prospective)`,
      );
    } else {
      normalized.status = status;
    }
  }

  return { errors, normalized };
}
