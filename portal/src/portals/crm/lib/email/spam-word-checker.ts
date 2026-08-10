import { snippetHtmlToPlainText } from '@/lib/crm/snippet-clipboard';
import {
  SPAM_PHRASE_DATABASE,
  SPAM_SEVERITY_PENALTY,
  type SpamPhraseEntry,
  type SpamWordSeverity,
} from '@/lib/crm/spam-word-database';

export type SpamMatch = {
  phrase: string;
  severity: SpamWordSeverity;
  suggestion?: string;
  /** subject | body */
  location: 'subject' | 'body';
};

export type SpamStructuralFlag = {
  id: string;
  label: string;
  penalty: number;
};

export type EmailSpamCheckResult = {
  score: number;
  matches: SpamMatch[];
  structuralFlags: SpamStructuralFlag[];
  subjectScore: number;
  bodyScore: number;
  totalPenalty: number;
};

const SCORE_WARN = 50;
const SCORE_OK = 80;

export function spamScoreBand(score: number): 'good' | 'warn' | 'bad' {
  if (score >= SCORE_OK) return 'good';
  if (score >= SCORE_WARN) return 'warn';
  return 'bad';
}

export function spamScoreLabel(score: number): string {
  const band = spamScoreBand(score);
  if (band === 'good') return 'Good to send';
  if (band === 'warn') return 'Review before sending';
  return 'High spam risk';
}

function normalizeForScan(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?]{2,}/g, '!')
    .trim();
}

function countUrls(text: string): number {
  const m = text.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
  return m?.length ?? 0;
}

function capsRatio(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]{3,}/.test(w));
  if (!words.length) return 0;
  const caps = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  return caps / words.length;
}

function findPhraseInText(
  text: string,
  entry: SpamPhraseEntry,
  location: 'subject' | 'body',
  matchedPhrases: Set<string>,
): SpamMatch | null {
  const phrase = entry.phrase.toLowerCase().trim();
  if (!phrase || matchedPhrases.has(`${location}:${phrase}`)) return null;
  if (!text.includes(phrase)) return null;
  matchedPhrases.add(`${location}:${phrase}`);
  return {
    phrase: entry.phrase,
    severity: entry.severity,
    suggestion: entry.suggestion,
    location,
  };
}

function scanText(
  raw: string,
  location: 'subject' | 'body',
  matchedPhrases: Set<string>,
): { matches: SpamMatch[]; structural: SpamStructuralFlag[]; penalty: number } {
  const text = normalizeForScan(raw);
  const matches: SpamMatch[] = [];
  let penalty = 0;

  const sorted = [...SPAM_PHRASE_DATABASE].sort(
    (a, b) => b.phrase.length - a.phrase.length,
  );
  for (const entry of sorted) {
    const hit = findPhraseInText(text, entry, location, matchedPhrases);
    if (hit) {
      matches.push(hit);
      penalty += SPAM_SEVERITY_PENALTY[entry.severity];
    }
  }

  const structural: SpamStructuralFlag[] = [];
  if (location === 'subject' && text.length > 8 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    structural.push({
      id: 'subject-all-caps',
      label: 'Subject line is ALL CAPS',
      penalty: 12,
    });
    penalty += 12;
  }

  const ratio = capsRatio(text);
  if (ratio > 0.35 && text.split(/\s+/).length >= 6) {
    structural.push({
      id: 'body-caps',
      label: 'Many words in ALL CAPS',
      penalty: 8,
    });
    penalty += 8;
  }

  const urls = countUrls(raw);
  if (urls > 3) {
    structural.push({
      id: 'many-links',
      label: `${urls} links detected (keep to 1–2 when possible)`,
      penalty: Math.min(15, (urls - 2) * 4),
    });
    penalty += Math.min(15, (urls - 2) * 4);
  }

  if ((text.match(/!/g) || []).length >= 4) {
    structural.push({
      id: 'excess-bang',
      label: 'Excessive exclamation marks',
      penalty: 5,
    });
    penalty += 5;
  }

  return { matches, structural, penalty };
}

/**
 * Analyze subject + HTML/plain body for spam trigger words. Runs client-side only.
 */
export function analyzeEmailSpamContent(
  subject: string,
  bodyHtmlOrText: string,
): EmailSpamCheckResult {
  const bodyPlain = snippetHtmlToPlainText(bodyHtmlOrText || '');
  const matchedPhrases = new Set<string>();

  const subjectScan = scanText(subject || '', 'subject', matchedPhrases);
  const bodyScan = scanText(bodyPlain || '', 'body', matchedPhrases);

  const matches = [...subjectScan.matches, ...bodyScan.matches];
  const structuralFlags = [
    ...subjectScan.structural,
    ...bodyScan.structural,
  ];
  const totalPenalty =
    subjectScan.penalty + bodyScan.penalty;

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const subjectOnlyPenalty = subjectScan.penalty;
  const bodyOnlyPenalty = bodyScan.penalty;

  return {
    score,
    matches,
    structuralFlags,
    subjectScore: Math.max(0, 100 - subjectOnlyPenalty),
    bodyScore: Math.max(0, 100 - bodyOnlyPenalty),
    totalPenalty,
  };
}

export function shouldConfirmSpamSend(result: EmailSpamCheckResult): boolean {
  return result.score < SCORE_WARN;
}

export function buildSpamConfirmMessage(result: EmailSpamCheckResult): string {
  const count = result.matches.length + result.structuralFlags.length;
  return (
    `Spam check score: ${result.score}/100 (${count} issue${count === 1 ? '' : 's'}). ` +
    'Sending may land in junk folders. Send anyway?'
  );
}
