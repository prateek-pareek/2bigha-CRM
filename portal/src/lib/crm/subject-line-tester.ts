import { snippetHtmlToPlainText } from '@/lib/crm/snippet-clipboard';
import {
  SPAM_PHRASE_DATABASE,
  SPAM_SEVERITY_PENALTY,
  type SpamWordSeverity,
} from '@/lib/crm/spam-word-database';
import { spamScoreBand, type EmailSpamCheckResult } from '@/lib/crm/spam-word-checker';
import { analyzeHumanOutreachIssues } from '@/lib/crm/human-outreach-checker';

export type DeliverabilityCheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export type DeliverabilityCheckItem = {
  id: string;
  label: string;
  message: string;
  status: DeliverabilityCheckStatus;
  scope: 'subject' | 'body';
  penalty: number;
};

export type EmailDeliverabilityAnalysis = {
  /** Weighted blend: subject 55%, body 45% */
  overallScore: number;
  subjectScore: number;
  bodyScore: number;
  subjectChecks: DeliverabilityCheckItem[];
  bodyChecks: DeliverabilityCheckItem[];
  allChecks: DeliverabilityCheckItem[];
  subjectCharCount: number;
  subjectWordCount: number;
  /** Spam scan (subject + body) for combined send guard */
  spam: EmailSpamCheckResult;
};

export type EmailDeliverabilityOptions = {
  commercialMailingAddress?: string;
  /** Files attached in the composer (first-touch guidance). */
  attachmentCount?: number;
  /** No prior tracked CRM outbound to this recipient (cold first email). */
  isFirstEmailToRecipient?: boolean;
  /** Fingerprints of recently sent subject+body pairs (duplicate detection). */
  recentContentFingerprints?: string[];
  /** Human-style outreach validation (length, tone). Skipped for thread replies in composer. */
  enforceHumanOutreachChecks?: boolean;
  minOutreachBodyWords?: number;
  maxOutreachBodyWords?: number;
  maxOutreachParagraphs?: number;
  isConversationReply?: boolean;
};

const EMAIL_FINGERPRINT_STORAGE_KEY = 'crm-recent-email-fingerprints';
const MAX_STORED_FINGERPRINTS = 40;

const SCORE_OK = 80;
const SCORE_WARN = 50;
const IDEAL_SUBJECT_CHARS = 60;
const WARN_SUBJECT_CHARS = 70;

const PERSONALIZATION_RE =
  /\{\{\s*[\w.]+\s*\}\}|%\s*[\w.]+\s*%|\[first[\s_]?name\]/i;

const DECEPTIVE_SUBJECT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /^re:\s/i, label: 'Fake reply prefix (Re:)' },
  { re: /^fwd:\s/i, label: 'Fake forward prefix (Fwd:)' },
  { re: /^fw:\s/i, label: 'Fake forward prefix (Fw:)' },
  { re: /^automatic reply/i, label: 'Looks like auto-reply' },
];

const URL_SHORTENER_RE =
  /\b(bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|buff\.ly|is\.gd|rebrand\.ly|shorturl\.at|bl\.ink|cutt\.ly|rb\.gy)\b/i;

const GENERIC_COLD_SUBJECTS = [
  'quick question',
  'following up',
  'checking in',
  'touching base',
  'hello there',
  'hi there',
  'just reaching out',
  'wanted to connect',
];

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function countEmoji(text: string): number {
  const m = text.match(/\p{Extended_Pictographic}/gu);
  return m?.length ?? 0;
}

function normalizeScan(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Stable hash for duplicate-send detection (subject + plain body). */
export function emailContentFingerprint(
  subject: string,
  bodyHtmlOrText: string,
): string {
  const plain = snippetHtmlToPlainText(bodyHtmlOrText || '');
  const norm = `${normalizeScan(subject)}||${normalizeScan(plain).slice(0, 4000)}`;
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h) ^ norm.charCodeAt(i);
  }
  return String(h >>> 0);
}

export function getRecentEmailContentFingerprints(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EMAIL_FINGERPRINT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function recordEmailContentFingerprint(
  subject: string,
  bodyHtmlOrText: string,
): void {
  if (typeof window === 'undefined') return;
  const fp = emailContentFingerprint(subject, bodyHtmlOrText);
  const next = [
    fp,
    ...getRecentEmailContentFingerprints().filter((x) => x !== fp),
  ].slice(0, MAX_STORED_FINGERPRINTS);
  try {
    localStorage.setItem(EMAIL_FINGERPRINT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function countEmailLinks(bodyPlain: string, bodyHtml: string): number {
  const plainUrls = new Set(
    (bodyPlain.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) || []).map((u) =>
      u.toLowerCase(),
    ),
  );
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(bodyHtml || ''))) {
    const u = m[1].trim().toLowerCase();
    if (u.startsWith('http') || u.startsWith('www.') || u.startsWith('mailto:')) {
      if (!u.startsWith('mailto:')) plainUrls.add(u);
    }
  }
  return plainUrls.size;
}

function analyzeHtmlDeliverabilitySignals(bodyHtml: string): {
  imgCount: number;
  tableCount: number;
  styleBlockCount: number;
  inlineStyleCount: number;
  hasPromotionalColors: boolean;
  hasBannerLayout: boolean;
  htmlLength: number;
} {
  const html = bodyHtml || '';
  const imgCount = (html.match(/<img\b/gi) || []).length;
  const tableCount = (html.match(/<table\b/gi) || []).length;
  const styleBlockCount = (html.match(/<style\b/gi) || []).length;
  const inlineStyleCount = (html.match(/\bstyle\s*=/gi) || []).length;

  let hasPromotionalColors = /<font[^>]+color\s*=/i.test(html);
  if (!hasPromotionalColors) {
    const colorRe =
      /(?:^|[;\s])(?:color|background(?:-color)?)\s*:\s*([^;"'<>]+)/gi;
    let cm: RegExpExecArray | null;
    while ((cm = colorRe.exec(html))) {
      const v = cm[1].trim().toLowerCase();
      if (!v || v === 'inherit' || v === 'transparent' || v === 'currentcolor') {
        continue;
      }
      if (
        /^(?:#(?:fff(?:fff)?|000(?:000)?|333(?:333)?|666(?:666)?|999(?:999)?)|rgb\(\s*0\s*,\s*0\s*,\s*0|rgb\(\s*255\s*,\s*255\s*,\s*255|black|white|gray|grey|slate|zinc|neutral|stone)/.test(
          v,
        )
      ) {
        continue;
      }
      hasPromotionalColors = true;
      break;
    }
  }

  const hasBannerLayout =
    /<table[^>]*(width\s*=\s*["']?100%|background|bgcolor)/i.test(html) &&
    /<(td|tr|th|div)[^>]*(bgcolor|background-color|background-image)/i.test(html);

  return {
    imgCount,
    tableCount,
    styleBlockCount,
    inlineStyleCount,
    hasPromotionalColors,
    hasBannerLayout,
    htmlLength: html.length,
  };
}

function findSpamPhrasesInText(text: string): { phrase: string; severity: SpamWordSeverity }[] {
  const norm = normalizeScan(text);
  const hits: { phrase: string; severity: SpamWordSeverity }[] = [];
  const seen = new Set<string>();
  const sorted = [...SPAM_PHRASE_DATABASE].sort((a, b) => b.phrase.length - a.phrase.length);
  for (const entry of sorted) {
    const p = entry.phrase.toLowerCase().trim();
    if (!p || seen.has(p) || !norm.includes(p)) continue;
    seen.add(p);
    hits.push({ phrase: entry.phrase, severity: entry.severity });
  }
  return hits;
}

function spamPenaltyForHits(hits: { severity: SpamWordSeverity }[]): number {
  return hits.reduce((sum, h) => sum + SPAM_SEVERITY_PENALTY[h.severity], 0);
}

function pushCheck(
  list: DeliverabilityCheckItem[],
  item: Omit<DeliverabilityCheckItem, 'penalty'> & { penalty?: number },
): void {
  const penalty =
    item.penalty ??
    (item.status === 'fail' ? 15 : item.status === 'warn' ? 8 : 0);
  list.push({ ...item, penalty });
}

function scoreFromChecks(checks: DeliverabilityCheckItem[]): number {
  const penalty = checks
    .filter((c) => c.status !== 'skip' && c.status !== 'pass')
    .reduce((s, c) => s + c.penalty, 0);
  return clampScore(100 - penalty);
}

function analyzeSubjectLine(subject: string): {
  checks: DeliverabilityCheckItem[];
  charCount: number;
  wordCount: number;
} {
  const checks: DeliverabilityCheckItem[] = [];
  const raw = subject || '';
  const trimmed = raw.trim();
  const charCount = raw.length;
  const wordCount = countWords(trimmed);
  const norm = normalizeScan(trimmed);

  if (!trimmed) {
    pushCheck(checks, {
      id: 'subject-empty',
      label: 'Subject line present',
      message: 'Add a subject — empty subjects hurt deliverability and opens.',
      status: 'fail',
      scope: 'subject',
      penalty: 25,
    });
    return { checks, charCount, wordCount };
  }

  pushCheck(checks, {
    id: 'subject-empty',
    label: 'Subject line present',
    message: 'Subject is set.',
    status: 'pass',
    scope: 'subject',
    penalty: 0,
  });

  if (charCount <= IDEAL_SUBJECT_CHARS) {
    pushCheck(checks, {
      id: 'subject-length',
      label: 'Length (mobile-safe)',
      message: `${charCount}/${IDEAL_SUBJECT_CHARS} characters — unlikely to truncate on mobile.`,
      status: 'pass',
      scope: 'subject',
    });
  } else if (charCount <= WARN_SUBJECT_CHARS) {
    pushCheck(checks, {
      id: 'subject-length',
      label: 'Length (mobile-safe)',
      message: `${charCount} characters — may truncate on some clients (aim for ≤${IDEAL_SUBJECT_CHARS}).`,
      status: 'warn',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-length',
      label: 'Length (mobile-safe)',
      message: `${charCount} characters — too long; front-load key words (≤${IDEAL_SUBJECT_CHARS} ideal).`,
      status: 'fail',
      scope: 'subject',
      penalty: 12,
    });
  }

  if (wordCount >= 3 && wordCount <= 15) {
    pushCheck(checks, {
      id: 'subject-words',
      label: 'Word count',
      message: `${wordCount} words — in the 3–15 word sweet spot.`,
      status: 'pass',
      scope: 'subject',
    });
  } else if (wordCount < 3) {
    pushCheck(checks, {
      id: 'subject-words',
      label: 'Word count',
      message: `${wordCount} word${wordCount === 1 ? '' : 's'} — very short; add context (3–15 words ideal).`,
      status: 'warn',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-words',
      label: 'Word count',
      message: `${wordCount} words — long for a subject; shorten for clarity.`,
      status: 'warn',
      scope: 'subject',
    });
  }

  const subjectSpam = findSpamPhrasesInText(trimmed);
  if (subjectSpam.length === 0) {
    pushCheck(checks, {
      id: 'subject-spam-words',
      label: 'Spam trigger words',
      message: 'No common spam phrases in the subject.',
      status: 'pass',
      scope: 'subject',
    });
  } else {
    const top = subjectSpam.slice(0, 3).map((h) => `"${h.phrase}"`).join(', ');
    pushCheck(checks, {
      id: 'subject-spam-words',
      label: 'Spam trigger words',
      message: `Found ${subjectSpam.length} in subject: ${top}${subjectSpam.length > 3 ? '…' : ''}`,
      status: subjectSpam.some((h) => h.severity === 'critical' || h.severity === 'high')
        ? 'fail'
        : 'warn',
      scope: 'subject',
      penalty: Math.min(20, spamPenaltyForHits(subjectSpam)),
    });
  }

  if (trimmed.length > 8 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    pushCheck(checks, {
      id: 'subject-caps',
      label: 'ALL CAPS',
      message: 'Subject is all caps — strong spam signal.',
      status: 'fail',
      scope: 'subject',
      penalty: 15,
    });
  } else {
    pushCheck(checks, {
      id: 'subject-caps',
      label: 'ALL CAPS',
      message: 'Normal capitalization.',
      status: 'pass',
      scope: 'subject',
    });
  }

  const bangs = (trimmed.match(/!/g) || []).length;
  const qs = (trimmed.match(/\?/g) || []).length;
  if (bangs >= 2 || qs >= 2 || (bangs >= 1 && qs >= 1)) {
    pushCheck(checks, {
      id: 'subject-punctuation',
      label: 'Punctuation',
      message: 'Too many ! or ? in the subject — looks promotional or spammy.',
      status: 'fail',
      scope: 'subject',
      penalty: 10,
    });
  } else if (bangs === 1 || qs === 1) {
    pushCheck(checks, {
      id: 'subject-punctuation',
      label: 'Punctuation',
      message: 'One emphasis mark is OK; avoid stacking ! and ?.',
      status: 'warn',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-punctuation',
      label: 'Punctuation',
      message: 'No excessive punctuation.',
      status: 'pass',
      scope: 'subject',
    });
  }

  if (/https?:\/\/|www\./i.test(trimmed)) {
    pushCheck(checks, {
      id: 'subject-url',
      label: 'URLs in subject',
      message: 'Remove links from the subject line — put them in the body.',
      status: 'fail',
      scope: 'subject',
      penalty: 12,
    });
  } else {
    pushCheck(checks, {
      id: 'subject-url',
      label: 'URLs in subject',
      message: 'No URLs in subject.',
      status: 'pass',
      scope: 'subject',
    });
  }

  if (/\$\$\$|€{2,}|£{2,}|(?:\$\s*){3,}/.test(trimmed) || (trimmed.match(/\$/g) || []).length >= 3) {
    pushCheck(checks, {
      id: 'subject-currency',
      label: 'Currency symbols',
      message: 'Heavy use of $ or currency symbols — common spam pattern.',
      status: 'fail',
      scope: 'subject',
      penalty: 10,
    });
  } else if (/\$|€|£/.test(trimmed)) {
    pushCheck(checks, {
      id: 'subject-currency',
      label: 'Currency symbols',
      message: 'Currency symbol present — use sparingly.',
      status: 'warn',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-currency',
      label: 'Currency symbols',
      message: 'No heavy currency formatting.',
      status: 'pass',
      scope: 'subject',
    });
  }

  if (PERSONALIZATION_RE.test(trimmed)) {
    pushCheck(checks, {
      id: 'subject-personalization',
      label: 'Personalization',
      message: 'Merge token detected (e.g. {{firstName}}) — good for targeted sends.',
      status: 'pass',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-personalization',
      label: 'Personalization',
      message: 'No {{field}} tokens — consider {{firstName}} or {{companyName}} for cold outreach.',
      status: 'warn',
      scope: 'subject',
    });
  }

  const deceptive = DECEPTIVE_SUBJECT_PATTERNS.find((p) => p.re.test(trimmed));
  if (deceptive) {
    pushCheck(checks, {
      id: 'subject-deceptive',
      label: 'Deceptive prefix',
      message: deceptive.label,
      status: 'warn',
      scope: 'subject',
    });
  } else if (GENERIC_COLD_SUBJECTS.some((g) => norm === g || norm.startsWith(`${g} `))) {
    pushCheck(checks, {
      id: 'subject-deceptive',
      label: 'Generic / bait subject',
      message: 'Very generic subject — be specific about value to the recipient.',
      status: 'warn',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-deceptive',
      label: 'Honest subject',
      message: 'No common deceptive or bait patterns.',
      status: 'pass',
      scope: 'subject',
    });
  }

  const emojis = countEmoji(trimmed);
  if (emojis === 0) {
    pushCheck(checks, {
      id: 'subject-emoji',
      label: 'Emoji',
      message: 'No emoji (optional — one can help stands out).',
      status: 'pass',
      scope: 'subject',
    });
  } else if (emojis === 1) {
    pushCheck(checks, {
      id: 'subject-emoji',
      label: 'Emoji',
      message: 'One emoji — OK if the line still reads well without it.',
      status: 'pass',
      scope: 'subject',
    });
  } else {
    pushCheck(checks, {
      id: 'subject-emoji',
      label: 'Emoji',
      message: `${emojis} emoji — more than one can trigger filters.`,
      status: 'warn',
      scope: 'subject',
    });
  }

  const bangsTotal = (trimmed.match(/!/g) || []).length;
  const simpleSubject =
    charCount <= IDEAL_SUBJECT_CHARS &&
    wordCount >= 2 &&
    wordCount <= 12 &&
    emojis <= 1 &&
    bangsTotal <= 1 &&
    trimmed !== trimmed.toUpperCase() &&
    !/https?:\/\/|www\./i.test(trimmed);
  if (simpleSubject) {
    pushCheck(checks, {
      id: 'subject-simple',
      label: 'Simple subject line',
      message: 'Short, clear subject — good for deliverability and mobile preview.',
      status: 'pass',
      scope: 'subject',
    });
  } else if (charCount > WARN_SUBJECT_CHARS || wordCount > 15 || emojis > 1) {
    pushCheck(checks, {
      id: 'subject-simple',
      label: 'Simple subject line',
      message:
        'Keep the subject simple — aim for ≤60 characters, few words, no hype or links.',
      status: 'fail',
      scope: 'subject',
      penalty: 10,
    });
  } else {
    pushCheck(checks, {
      id: 'subject-simple',
      label: 'Simple subject line',
      message:
        'Simplify the subject — specific value in plain language beats promotional wording.',
      status: 'warn',
      scope: 'subject',
    });
  }

  return { checks, charCount, wordCount };
}

function analyzeEmailBody(
  subject: string,
  bodyPlain: string,
  bodyHtml?: string,
  options?: EmailDeliverabilityOptions,
): DeliverabilityCheckItem[] {
  const checks: DeliverabilityCheckItem[] = [];
  const trimmed = bodyPlain.trim();
  const wordCount = countWords(trimmed);

  if (!trimmed) {
    pushCheck(checks, {
      id: 'body-empty',
      label: 'Body content',
      message: 'Body is empty.',
      status: 'fail',
      scope: 'body',
      penalty: 20,
    });
    return checks;
  }

  pushCheck(checks, {
    id: 'body-empty',
    label: 'Body content',
    message: `${wordCount} words in body.`,
    status: 'pass',
    scope: 'body',
  });

  if (wordCount >= 25) {
    pushCheck(checks, {
      id: 'body-length',
      label: 'Body length',
      message: 'Enough text for filters (short one-liners can look bulk).',
      status: 'pass',
      scope: 'body',
    });
  } else if (wordCount >= 12) {
    pushCheck(checks, {
      id: 'body-length',
      label: 'Body length',
      message: 'Short body — add a line of context if this is cold outreach.',
      status: 'warn',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-length',
      label: 'Body length',
      message: 'Very short body — may look like bulk or tracking pixel mail.',
      status: 'warn',
      scope: 'body',
    });
  }

  const bodySpam = findSpamPhrasesInText(trimmed);
  if (bodySpam.length === 0) {
    pushCheck(checks, {
      id: 'body-spam-words',
      label: 'Spam trigger words',
      message: 'No common spam phrases in the body.',
      status: 'pass',
      scope: 'body',
    });
  } else {
    const top = bodySpam.slice(0, 3).map((h) => `"${h.phrase}"`).join(', ');
    pushCheck(checks, {
      id: 'body-spam-words',
      label: 'Spam trigger words',
      message: `${bodySpam.length} in body: ${top}${bodySpam.length > 3 ? '…' : ''}`,
      status: bodySpam.length >= 4 ? 'fail' : 'warn',
      scope: 'body',
      penalty: Math.min(25, spamPenaltyForHits(bodySpam)),
    });
  }

  const html = bodyHtml || '';
  const urls = countEmailLinks(trimmed, html);
  if (urls === 0) {
    pushCheck(checks, {
      id: 'body-links',
      label: 'Link count (≤2 ideal)',
      message: 'No links — fine for plain follow-ups.',
      status: 'pass',
      scope: 'body',
    });
  } else if (urls <= 2) {
    pushCheck(checks, {
      id: 'body-links',
      label: 'Link count (≤2 ideal)',
      message: `${urls} link${urls === 1 ? '' : 's'} — within the 1–2 link guideline.`,
      status: 'pass',
      scope: 'body',
    });
  } else if (urls <= 4) {
    pushCheck(checks, {
      id: 'body-links',
      label: 'Link count (≤2 ideal)',
      message: `${urls} links — avoid more than 1–2 links in cold outreach.`,
      status: 'warn',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-links',
      label: 'Link count (≤2 ideal)',
      message: `${urls} links — reduce to 1–2 when possible.`,
      status: 'fail',
      scope: 'body',
      penalty: 12,
    });
  }

  const attachmentCount = Math.max(0, options?.attachmentCount ?? 0);
  if (attachmentCount === 0) {
    pushCheck(checks, {
      id: 'body-attachments',
      label: 'Attachments (first email)',
      message: 'No attachments — good for first-touch deliverability.',
      status: 'pass',
      scope: 'body',
    });
  } else if (options?.isFirstEmailToRecipient) {
    pushCheck(checks, {
      id: 'body-attachments',
      label: 'Attachments (first email)',
      message: `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} — avoid files in the first email to a new contact.`,
      status: 'fail',
      scope: 'body',
      penalty: 14,
    });
  } else {
    pushCheck(checks, {
      id: 'body-attachments',
      label: 'Attachments (first email)',
      message: `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} — OK for follow-ups; skip on first cold mail when possible.`,
      status: 'warn',
      scope: 'body',
    });
  }

  const htmlSignals = analyzeHtmlDeliverabilitySignals(html);
  const heavyHtml =
    htmlSignals.tableCount >= 4 ||
    htmlSignals.styleBlockCount >= 2 ||
    htmlSignals.inlineStyleCount >= 35 ||
    (htmlSignals.htmlLength > 18_000 && htmlSignals.inlineStyleCount >= 12);
  const moderateHtml =
    htmlSignals.tableCount >= 2 ||
    htmlSignals.styleBlockCount >= 1 ||
    htmlSignals.inlineStyleCount >= 18 ||
    htmlSignals.htmlLength > 10_000;
  if (!html.trim() || (!moderateHtml && !heavyHtml)) {
    pushCheck(checks, {
      id: 'body-html-weight',
      label: 'HTML template weight',
      message: 'Light HTML — not a heavy marketing template.',
      status: 'pass',
      scope: 'body',
    });
  } else if (heavyHtml) {
    pushCheck(checks, {
      id: 'body-html-weight',
      label: 'HTML template weight',
      message:
        'Heavy HTML (nested tables / many inline styles) — use a simple plain-style layout.',
      status: 'fail',
      scope: 'body',
      penalty: 12,
    });
  } else {
    pushCheck(checks, {
      id: 'body-html-weight',
      label: 'HTML template weight',
      message:
        'Moderately complex HTML — simplify tables and inline styles for better inbox placement.',
      status: 'warn',
      scope: 'body',
    });
  }

  const { imgCount } = htmlSignals;
  if (imgCount === 0) {
    pushCheck(checks, {
      id: 'body-image-count',
      label: 'Image count',
      message: 'No images — text-focused email.',
      status: 'pass',
      scope: 'body',
    });
  } else if (imgCount <= 2) {
    pushCheck(checks, {
      id: 'body-image-count',
      label: 'Image count',
      message: `${imgCount} image${imgCount === 1 ? '' : 's'} — within a safe range.`,
      status: 'pass',
      scope: 'body',
    });
  } else if (imgCount <= 4) {
    pushCheck(checks, {
      id: 'body-image-count',
      label: 'Image count',
      message: `${imgCount} images — avoid too many images in cold outreach.`,
      status: 'warn',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-image-count',
      label: 'Image count',
      message: `${imgCount} images — reduce images; filters favor text-heavy mail.`,
      status: 'fail',
      scope: 'body',
      penalty: 10,
    });
  }

  if (!htmlSignals.hasPromotionalColors && !htmlSignals.hasBannerLayout) {
    pushCheck(checks, {
      id: 'body-colors-banners',
      label: 'Colored fonts & banners',
      message: 'No promotional colors or full-width banner blocks detected.',
      status: 'pass',
      scope: 'body',
    });
  } else if (htmlSignals.hasBannerLayout && htmlSignals.hasPromotionalColors) {
    pushCheck(checks, {
      id: 'body-colors-banners',
      label: 'Colored fonts & banners',
      message:
        'Colored text and banner-style blocks detected — use simple black/gray text instead.',
      status: 'fail',
      scope: 'body',
      penalty: 10,
    });
  } else {
    pushCheck(checks, {
      id: 'body-colors-banners',
      label: 'Colored fonts & banners',
      message: htmlSignals.hasBannerLayout
        ? 'Banner-style layout detected — plain paragraphs perform better.'
        : 'Non-default font colors detected — stick to simple formatting.',
      status: 'warn',
      scope: 'body',
    });
  }

  const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z]{3,}/.test(w));
  const capsWords = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  const capsRatio = words.length ? capsWords / words.length : 0;
  if (capsRatio > 0.35 && words.length >= 6) {
    pushCheck(checks, {
      id: 'body-caps',
      label: 'ALL CAPS words',
      message: 'Many words in ALL CAPS — tone down emphasis.',
      status: 'warn',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-caps',
      label: 'ALL CAPS words',
      message: 'Normal capitalization in body.',
      status: 'pass',
      scope: 'body',
    });
  }

  if (PERSONALIZATION_RE.test(trimmed)) {
    pushCheck(checks, {
      id: 'body-personalization',
      label: 'Personalization',
      message: 'Merge tokens in body — signals targeted email.',
      status: 'pass',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-personalization',
      label: 'Personalization',
      message: 'Consider {{firstName}} or record-specific details in the opening.',
      status: 'warn',
      scope: 'body',
    });
  }

  if ((trimmed.match(/!/g) || []).length >= 4) {
    pushCheck(checks, {
      id: 'body-punctuation',
      label: 'Exclamation marks',
      message: 'Too many ! in the body.',
      status: 'warn',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'body-punctuation',
      label: 'Exclamation marks',
      message: 'Reasonable punctuation.',
      status: 'pass',
      scope: 'body',
    });
  }

  if (URL_SHORTENER_RE.test(trimmed) || URL_SHORTENER_RE.test(bodyHtml || '')) {
    pushCheck(checks, {
      id: 'no-shorteners',
      label: 'URL shorteners',
      message: 'Public short links (bit.ly, t.co, etc.) hurt deliverability — use full branded URLs.',
      status: 'fail',
      scope: 'body',
      penalty: 10,
    });
  } else {
    pushCheck(checks, {
      id: 'no-shorteners',
      label: 'URL shorteners',
      message: 'No public URL shorteners detected.',
      status: 'pass',
      scope: 'body',
    });
  }

  const recent = options?.recentContentFingerprints ?? [];
  const currentFp = emailContentFingerprint(subject, html || bodyPlain);
  if (recent.length === 0) {
    pushCheck(checks, {
      id: 'body-duplicate-content',
      label: 'Identical repeat sends',
      message: 'No recent duplicate of this exact email in this browser session.',
      status: 'pass',
      scope: 'body',
    });
  } else if (recent.includes(currentFp)) {
    pushCheck(checks, {
      id: 'body-duplicate-content',
      label: 'Identical repeat sends',
      message:
        'This subject and body match a message you sent recently — vary copy before sending again.',
      status: 'fail',
      scope: 'body',
      penalty: 15,
    });
  } else {
    pushCheck(checks, {
      id: 'body-duplicate-content',
      label: 'Identical repeat sends',
      message: 'Content differs from your last few sends in this browser.',
      status: 'pass',
      scope: 'body',
    });
  }

  const imgCountLegacy = htmlSignals.imgCount;
  const textLen = trimmed.length;
  const ratio = textLen / (textLen + imgCountLegacy * 500);
  if (imgCountLegacy === 0 || ratio >= 0.6) {
    pushCheck(checks, {
      id: 'text-image-ratio',
      label: 'Text vs images',
      message:
        imgCountLegacy === 0
          ? 'Text-heavy body — good for filters.'
          : 'Healthy text-to-image balance.',
      status: 'pass',
      scope: 'body',
    });
  } else {
    pushCheck(checks, {
      id: 'text-image-ratio',
      label: 'Text vs images',
      message: `${imgCountLegacy} image(s) with limited text — add copy (aim for >60% text).`,
      status: 'warn',
      scope: 'body',
    });
  }

  const addr = String(options?.commercialMailingAddress || '').trim();
  if (addr) {
    const hasAddr =
      trimmed.toLowerCase().includes(addr.toLowerCase()) ||
      (bodyHtml || '').includes('data-crm-mailing-address');
    pushCheck(checks, {
      id: 'can-spam-address',
      label: 'CAN-SPAM address',
      message: hasAddr
        ? 'Physical mailing address present in footer.'
        : 'Add your organization mailing address (configured in deliverability settings).',
      status: hasAddr ? 'pass' : 'fail',
      scope: 'body',
      penalty: hasAddr ? 0 : 8,
    });
  }

  if (!options?.isConversationReply && options?.enforceHumanOutreachChecks !== false) {
    const humanIssues = analyzeHumanOutreachIssues(trimmed, html, {
      enabled: true,
      minBodyWords: options?.minOutreachBodyWords,
      maxBodyWords: options?.maxOutreachBodyWords,
      maxParagraphs: options?.maxOutreachParagraphs,
    });
    for (const issue of humanIssues) {
      pushCheck(checks, {
        id: issue.id,
        label: issue.label,
        message: issue.message,
        status: issue.severity === 'fail' ? 'fail' : 'warn',
        scope: 'body',
        penalty: issue.severity === 'fail' ? 18 : 6,
      });
    }
    if (humanIssues.length === 0) {
      pushCheck(checks, {
        id: 'human-outreach-tone',
        label: 'Human outreach style',
        message: 'Length and tone look like a personal note.',
        status: 'pass',
        scope: 'body',
      });
    }
  }

  return checks;
}

export function deliverabilityScoreLabel(score: number): string {
  const band = spamScoreBand(score);
  if (band === 'good') return 'Good to send';
  if (band === 'warn') return 'Review before sending';
  return 'High risk';
}

/**
 * Subject-line tester + body deliverability checks (client-side only).
 * Spam phrase scan is included for both subject and body.
 */
export function analyzeEmailDeliverability(
  subject: string,
  bodyHtmlOrText: string,
  spamResult: EmailSpamCheckResult,
  options?: EmailDeliverabilityOptions,
): EmailDeliverabilityAnalysis {
  const bodyHtml = bodyHtmlOrText || '';
  const bodyPlain = snippetHtmlToPlainText(bodyHtml);
  const { checks: subjectChecks, charCount, wordCount } = analyzeSubjectLine(subject);
  const bodyChecks = analyzeEmailBody(subject, bodyPlain, bodyHtml, options);

  const subjectScore = scoreFromChecks(subjectChecks);
  const bodyScore = scoreFromChecks(bodyChecks);
  const overallScore = clampScore(subjectScore * 0.55 + bodyScore * 0.45);

  return {
    overallScore,
    subjectScore,
    bodyScore,
    subjectChecks,
    bodyChecks,
    allChecks: [...subjectChecks, ...bodyChecks],
    subjectCharCount: charCount,
    subjectWordCount: wordCount,
    spam: spamResult,
  };
}

export function shouldConfirmDeliverabilitySend(
  analysis: EmailDeliverabilityAnalysis,
): boolean {
  return (
    analysis.overallScore < SCORE_WARN ||
    analysis.subjectScore < SCORE_WARN ||
    analysis.spam.score < SCORE_WARN
  );
}

export function buildDeliverabilityConfirmMessage(
  analysis: EmailDeliverabilityAnalysis,
): string {
  const failed = analysis.allChecks.filter((c) => c.status === 'fail').length;
  const warn = analysis.allChecks.filter((c) => c.status === 'warn').length;
  return (
    `Deliverability score: ${analysis.overallScore}/100 (subject ${analysis.subjectScore}, body ${analysis.bodyScore}). ` +
    `Spam scan: ${analysis.spam.score}/100. ` +
    `${failed} failed and ${warn} warning check${warn === 1 ? '' : 's'}. ` +
    'Sending may land in junk folders. Send anyway?'
  );
}

export { SCORE_OK, SCORE_WARN, IDEAL_SUBJECT_CHARS };
