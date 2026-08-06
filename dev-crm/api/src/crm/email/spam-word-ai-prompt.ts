import {
  CRITICAL_SPAM_WORDS_CSV,
  HIGH_SPAM_WORDS_CSV,
  MEDIUM_SPAM_WORDS_CSV,
  parseSpamWordsCsv,
} from './spam-word-database';

let cachedSection: string | null = null;

/** Prompt block injected into Claude outreach/reply draft requests. */
export function buildSpamAvoidancePromptSection(): string {
  if (cachedSection) return cachedSection;

  const critical = parseSpamWordsCsv(CRITICAL_SPAM_WORDS_CSV);
  const high = parseSpamWordsCsv(HIGH_SPAM_WORDS_CSV);
  const medium = parseSpamWordsCsv(MEDIUM_SPAM_WORDS_CSV);

  cachedSection = [
    'EMAIL DELIVERABILITY — spam trigger avoidance (mandatory):',
    '- Write like a credible B2B professional, not a marketing blast or newsletter.',
    '- Subject line: under 60 characters when possible; sentence case only (never ALL CAPS).',
    '- No fake urgency, prizes, giveaways, or "act now" style pressure.',
    '- At most one exclamation mark in the entire email.',
    '- Use at most 1–2 links; never URL shorteners (bit.ly, etc.).',
    '- Do not use exact phrases or close paraphrases from the CRITICAL, HIGH, or MEDIUM lists below.',
    '- Prefer specific, calm language: "schedule a call", "share a brief overview", "explore fit".',
    '',
    `CRITICAL triggers (never use): ${critical.join(', ')}.`,
    '',
    `HIGH triggers (never use): ${high.join(', ')}.`,
    '',
    `MEDIUM triggers (avoid when possible): ${medium.join(', ')}.`,
  ].join('\n');

  return cachedSection;
}
