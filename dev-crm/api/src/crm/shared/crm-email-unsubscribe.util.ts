import { createHmac, timingSafeEqual } from 'crypto';
import { getTrackingPublicBase } from './crm-deliverability.util';

const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export type UnsubscribeTokenPayload = {
  e: string;
  exp: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function createUnsubscribeToken(
  recipientEmail: string,
  secret: string,
): string | null {
  const email = String(recipientEmail || '').trim().toLowerCase();
  if (!email.includes('@') || !secret) return null;
  const payload: UnsubscribeTokenPayload = {
    e: email,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = createHmac('sha256', secret).update(body).digest();
  return `${body}.${base64UrlEncode(sig)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): UnsubscribeTokenPayload | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !secret) return null;
  const [body, sigPart] = parts;
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = base64UrlDecode(sigPart);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      base64UrlDecode(body).toString('utf8'),
    ) as UnsubscribeTokenPayload;
    if (!payload?.e?.includes('@')) return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildOneClickUnsubscribeUrl(token: string): string {
  return `${getTrackingPublicBase()}/api/crm/unsubscribe?token=${encodeURIComponent(token)}`;
}
