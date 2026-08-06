import { stripCrmEmailTrackingFromHtmlForPreview } from '@/lib/crm/email-preview-iframe';
import { snippetHtmlToPlainText } from '@/lib/crm/snippet-clipboard';

/** Minimal shape for building an inbox-style reply (list item or GET emails/:id). */
export interface InboxEmailLike {
  _id: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  date: string;
  accountId: { _id: string; email: string; displayName?: string; provider: string };
}

/** Plain preview text: strip tags and decode entities (&nbsp; &lt; etc.) so coding chars never show. */
export function emailSnippet(text: string | undefined, max = 140) {
  if (!text) return '';
  const plain = snippetHtmlToPlainText(text).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

/** Full body as readable plain text (no HTML tags or raw entities). */
export function emailBodyPlainText(bodyHtml?: string, body?: string) {
  const raw = (bodyHtml || body || '').trim();
  if (!raw) return '';
  return snippetHtmlToPlainText(raw);
}

export function getInboxReplyTarget(item: InboxEmailLike, accountEmail: string) {
  const acc = (accountEmail || '').toLowerCase().trim();
  const fromAddr = (item.from || '').toLowerCase().trim();
  if (fromAddr === acc) {
    return { email: item.to, name: (item.toName || item.to || '').trim() };
  }
  return { email: item.from, name: (item.fromName || item.from || '').trim() };
}

export function buildReplyPresetFromInboxItem(
  item: InboxEmailLike,
  accountEmail: string,
) {
  const { email: recipientEmail, name: recipientName } = getInboxReplyTarget(
    item,
    accountEmail,
  );
  const subj = item.subject || '';
  const reSub = /^re:\s*/i.test(subj) ? subj : `Re: ${subj}`;
  const rawHtml = (item.bodyHtml || '').trim();
  if (rawHtml) {
    const quotedHtml = stripCrmEmailTrackingFromHtmlForPreview(rawHtml);
    return {
      subject: reSub,
      body: '<p></p>',
      recipientEmail,
      recipientName,
      quotedHtml,
      quotedMeta: {
        fromLabel: (item.fromName || '').trim() || item.from,
        dateLabel: new Date(item.date).toLocaleString(),
      },
    };
  }
  const plain = emailSnippet(item.body, 12000);
  const quoted = `\n\n---------- Original message ----------\nFrom: ${item.fromName || item.from}\nDate: ${new Date(item.date).toLocaleString()}\n\n${plain}`;
  return { subject: reSub, body: quoted, recipientEmail, recipientName };
}

/** Forward: empty To, Fwd: subject, original message quoted (user picks recipients). */
export function buildForwardPresetFromInboxItem(item: InboxEmailLike) {
  const subj = item.subject || '';
  const fwdSub = /^(fwd|fw):\s*/i.test(subj) ? subj : `Fwd: ${subj}`;
  const toLabel = [item.toName, item.to].filter(Boolean).join(' ').trim() || item.to;
  const rawHtml = (item.bodyHtml || '').trim();
  if (rawHtml) {
    const quotedHtml = stripCrmEmailTrackingFromHtmlForPreview(rawHtml);
    return {
      subject: fwdSub,
      body: '<p></p>',
      recipientEmail: '',
      recipientName: '',
      quotedHtml,
      quotedMeta: {
        fromLabel: (item.fromName || '').trim() || item.from,
        dateLabel: new Date(item.date).toLocaleString(),
        title: 'Forwarded message',
        toLabel,
      },
    };
  }
  const plain = emailSnippet(item.body, 12000);
  const quoted = `\n\n---------- Forwarded message ----------\nFrom: ${item.fromName || item.from}\nDate: ${new Date(item.date).toLocaleString()}\nTo: ${toLabel}\nSubject: ${item.subject || '(No Subject)'}\n\n${plain}`;
  return {
    subject: fwdSub,
    body: quoted,
    recipientEmail: '',
    recipientName: '',
  };
}
