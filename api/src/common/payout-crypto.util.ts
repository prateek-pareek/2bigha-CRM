import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ENC_PREFIX = 'enc:v1';

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function effectiveSecret(): string {
  return (
    process.env.PAYOUT_ENCRYPTION_KEY ||
    process.env.VAULT_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'mathionix-payout-local-dev-key'
  );
}

export function encryptPayoutValue(raw: unknown): string | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (value.startsWith(`${ENC_PREFIX}:`)) return value;

  const key = keyFromSecret(effectiveSecret());
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptPayoutValue(raw: unknown): string {
  const value = String(raw ?? '');
  if (!value) return '';
  if (!value.startsWith(`${ENC_PREFIX}:`)) return value;

  const [, , ivB64, tagB64, cipherB64] = value.split(':');
  if (!ivB64 || !tagB64 || !cipherB64) return value;
  try {
    const key = keyFromSecret(effectiveSecret());
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return value;
  }
}

export const PAYOUT_SENSITIVE_FIELDS = [
  'bankName',
  'accountNumber',
  'ifscCode',
  'pan',
  'pfNumber',
  'uan',
  'aadhar',
] as const;
