/**
 * Visible opt-out footer + List-Unsubscribe mailbox resolution for CRM outbound mail.
 * Improves deliverability (Gmail/Outlook favor List-Unsubscribe + clear user-facing opt-out).
 */

import {
  buildOneClickUnsubscribeUrl,
  createUnsubscribeToken,
} from './crm-email-unsubscribe.util';

const FOOTER_ATTR = 'data-crm-compliance-footer';
const ADDRESS_ATTR = 'data-crm-mailing-address';

export type OptOutFooterStyle = 'natural' | 'formal';

export function resolveCrmListUnsubscribeMailbox(
  envUnsub: string | undefined,
  senderEmail: string | undefined,
): string | null {
  const u = (envUnsub || '').trim();
  if (u && u.includes('@')) return u;
  const s = (senderEmail || '').trim();
  if (s && s.includes('@')) return s;
  return null;
}

/** Skip if we already appended (e.g. template included the block). */
export function htmlToPlainTextBasic(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export type ListUnsubscribeHeaders = {
  listUnsubscribe: string;
  listUnsubscribePost?: string;
  oneClickUrl?: string;
};

/** RFC 8058 one-click + mailto List-Unsubscribe headers. */
export function buildListUnsubscribeHeaders(
  mailbox: string,
  recipientEmail: string,
  jwtSecret: string,
): ListUnsubscribeHeaders | null {
  const safe = mailbox.replace(/</g, '').replace(/>/g, '').trim();
  if (!safe) return null;
  const mailto = `<mailto:${safe}?subject=${encodeURIComponent('Unsubscribe')}>`;
  const token = createUnsubscribeToken(recipientEmail, jwtSecret);
  if (!token) {
    return { listUnsubscribe: mailto };
  }
  const oneClickUrl = buildOneClickUnsubscribeUrl(token);
  return {
    listUnsubscribe: `<${oneClickUrl}>, ${mailto}`,
    listUnsubscribePost: 'List-Unsubscribe=One-Click',
    oneClickUrl,
  };
}

export function appendCommercialMailingAddressBlock(
  html: string,
  address: string,
): string {
  if (!html || typeof html !== 'string') return html;
  const addr = String(address || '').trim();
  if (!addr || html.includes(ADDRESS_ATTR)) return html;
  const block = `<div ${ADDRESS_ATTR}="1" style="margin-top:12px;font-size:11px;line-height:1.5;color:#7c98b6;">${addr.replace(/</g, '&lt;')}</div>`;
  if (html.includes(FOOTER_ATTR)) {
    return html.replace(
      new RegExp(`(<div[^>]*${FOOTER_ATTR}[^>]*>)`, 'i'),
      `${block}$1`,
    );
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${block}</body>`);
  }
  return `${html}${block}`;
}

export function appendCrmEmailComplianceFooter(
  html: string,
  mailbox: string,
  options?: {
    oneClickUrl?: string;
    commercialMailingAddress?: string;
    footerStyle?: OptOutFooterStyle;
  },
): string {
  if (!html || typeof html !== 'string') return html;
  let out = html;
  if (options?.commercialMailingAddress) {
    out = appendCommercialMailingAddressBlock(
      out,
      options.commercialMailingAddress,
    );
  }
  if (out.includes(FOOTER_ATTR)) return out;

  const safe = mailbox.replace(/</g, '').replace(/>/g, '').trim();
  if (!safe) return out;

  const style = options?.footerStyle === 'formal' ? 'formal' : 'natural';
  const mailtoHref = `mailto:${safe}?subject=${encodeURIComponent('Unsubscribe')}`;
  const footer =
    style === 'formal'
      ? buildFormalOptOutFooterHtml(mailtoHref, options?.oneClickUrl)
      : buildNaturalOptOutFooterHtml(mailtoHref, options?.oneClickUrl);

  if (out.includes('</body>')) {
    return out.replace('</body>', `${footer}</body>`);
  }
  return `${out}${footer}`;
}

function buildNaturalOptOutFooterHtml(
  mailtoHref: string,
  oneClickUrl?: string,
): string {
  const softLink =
    'color:#94a3b8;text-decoration:underline;text-underline-offset:2px;';
  const optOutLink = oneClickUrl
    ? `<a href="${oneClickUrl}" style="${softLink}">let me know here</a>`
    : `<a href="${mailtoHref}" style="${softLink}">let me know here</a>`;
  return `<div ${FOOTER_ATTR}="1" style="margin-top:24px;font-family:inherit;font-size:13px;line-height:1.65;color:#94a3b8;">P.S. If this isn't relevant or the timing's off, just reply — no hard feelings. You can also ${optOutLink} and I won't follow up again.</div>`;
}

function buildFormalOptOutFooterHtml(
  mailtoHref: string,
  oneClickUrl?: string,
): string {
  const oneClick = oneClickUrl
    ? ` <a href="${oneClickUrl}" style="color:#0091ae;font-weight:600;">unsubscribe instantly</a> or`
    : '';
  return `<div ${FOOTER_ATTR}="1" style="margin-top:28px;padding-top:18px;border-top:1px solid #cbd6e2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#516f90;">This email was sent in a professional context. If you no longer wish to receive messages like this,${oneClick} <a href="${mailtoHref}" style="color:#0091ae;font-weight:600;">email to unsubscribe</a> or reply with &quot;unsubscribe&quot;.</div>`;
}

export function appendCrmEmailComplianceTextPlain(
  plain: string,
  mailbox: string,
  options?: {
    oneClickUrl?: string;
    commercialMailingAddress?: string;
    footerStyle?: OptOutFooterStyle;
  },
): string {
  const safe = mailbox.replace(/\n/g, ' ').trim();
  const lines: string[] = [];
  const addr = String(options?.commercialMailingAddress || '').trim();
  if (addr) lines.push(addr);
  const style = options?.footerStyle === 'formal' ? 'formal' : 'natural';
  if (safe) {
    if (style === 'formal') {
      const instant = options?.oneClickUrl
        ? ` Unsubscribe instantly: ${options.oneClickUrl}`
        : '';
      lines.push(
        `If you no longer wish to receive messages like this, contact ${safe} with subject "Unsubscribe", reply with "unsubscribe",${instant}`,
      );
    } else {
      const hint = options?.oneClickUrl
        ? ` Or: ${options.oneClickUrl}`
        : ` Or email ${safe} if you'd prefer no more notes.`;
      lines.push(
        `P.S. If this isn't relevant, just reply and I won't follow up again.${hint}`,
      );
    }
  }
  if (!lines.length) return plain;
  const base = (plain || '').trimEnd();
  return base ? `${base}\n\n${lines.join('\n')}` : lines.join('\n');
}
