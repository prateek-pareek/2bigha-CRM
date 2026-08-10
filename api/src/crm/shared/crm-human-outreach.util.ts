import { htmlToPlainTextBasic } from './crm-email-compliance.util';

export type HumanOutreachIssue = {
  id: string;
  label: string;
  message: string;
  severity: 'warn' | 'fail';
};

export type HumanOutreachAnalysis = {
  wordCount: number;
  paragraphCount: number;
  passed: boolean;
  issues: HumanOutreachIssue[];
  summary: string;
};

export type HumanOutreachConfig = {
  enabled?: boolean;
  minBodyWords?: number;
  maxBodyWords?: number;
  maxParagraphs?: number;
  blockOnFail?: boolean;
};

export const DEFAULT_MIN_OUTREACH_BODY_WORDS = 50;
export const DEFAULT_MAX_OUTREACH_BODY_WORDS = 90;
export const DEFAULT_MAX_OUTREACH_PARAGRAPHS = 3;

const AI_TONE_PHRASES: { phrase: string; label: string }[] = [
  { phrase: 'i hope this email finds you well', label: 'Generic opener' },
  { phrase: 'i hope this message finds you well', label: 'Generic opener' },
  { phrase: 'i wanted to reach out', label: 'Salesy opener' },
  { phrase: 'i am writing to', label: 'Formal opener' },
  { phrase: 'please do not hesitate', label: 'Template phrasing' },
  { phrase: 'at your earliest convenience', label: 'Template phrasing' },
  { phrase: 'looking forward to hearing from you', label: 'Overused sign-off line' },
  { phrase: 'furthermore', label: 'Formal transition' },
  { phrase: 'additionally', label: 'Formal transition' },
  { phrase: 'in conclusion', label: 'Essay-style closing' },
  { phrase: 'leverage', label: 'Buzzword' },
  { phrase: 'synergy', label: 'Buzzword' },
  { phrase: 'streamline', label: 'Buzzword' },
  { phrase: 'robust solution', label: 'Marketing speak' },
  { phrase: 'cutting-edge', label: 'Marketing speak' },
  { phrase: 'game-changer', label: 'Marketing speak' },
  { phrase: 'delve into', label: 'AI-style wording' },
  { phrase: 'touch base', label: 'Corporate cliché' },
  { phrase: 'circle back', label: 'Corporate cliché' },
  { phrase: 'as per our', label: 'Template phrasing' },
  { phrase: 'dear valued', label: 'Mass-mail greeting' },
  { phrase: 'dear sir', label: 'Mass-mail greeting' },
  { phrase: 'dear madam', label: 'Mass-mail greeting' },
];

export function normalizeHumanOutreachConfig(
  raw?: Partial<HumanOutreachConfig> | null,
): Required<
  Pick<HumanOutreachConfig, 'enabled' | 'minBodyWords' | 'maxBodyWords' | 'maxParagraphs' | 'blockOnFail'>
> {
  const minBodyWords = Math.max(
    20,
    Math.floor(Number(raw?.minBodyWords ?? DEFAULT_MIN_OUTREACH_BODY_WORDS)),
  );
  const maxBodyWords = Math.max(
    minBodyWords + 10,
    Math.floor(Number(raw?.maxBodyWords ?? DEFAULT_MAX_OUTREACH_BODY_WORDS)),
  );
  const maxParagraphs = Math.max(
    1,
    Math.floor(Number(raw?.maxParagraphs ?? DEFAULT_MAX_OUTREACH_PARAGRAPHS)),
  );
  return {
    enabled: raw?.enabled !== false,
    minBodyWords,
    maxBodyWords,
    maxParagraphs,
    blockOnFail: raw?.blockOnFail === true,
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countParagraphs(plain: string, html: string): number {
  const fromHtml = (html.match(/<p[\s>]/gi) || []).length;
  if (fromHtml >= 2) return fromHtml;
  const blocks = plain
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return Math.max(1, blocks.length);
}

function stripComplianceFooter(plain: string): string {
  const idx = plain.search(/\bP\.S\.\s/i);
  if (idx > 40) return plain.slice(0, idx).trim();
  const formal = plain.search(/If you no longer wish to receive/i);
  if (formal > 40) return plain.slice(0, formal).trim();
  return plain;
}

function hasBulletList(plain: string, html: string): boolean {
  if (/<ul[\s>]/i.test(html) || /<ol[\s>]/i.test(html)) return true;
  return /^[\s]*[-•*]\s+\S/m.test(plain) || /^[\s]*\d+[.)]\s+\S/m.test(plain);
}

export function analyzeHumanOutreachEmail(
  bodyHtmlOrText: string,
  config?: HumanOutreachConfig,
): HumanOutreachAnalysis {
  const cfg = normalizeHumanOutreachConfig(config);
  const html = bodyHtmlOrText || '';
  const plainRaw = htmlToPlainTextBasic(html);
  const plain = stripComplianceFooter(plainRaw.trim());
  const wordCount = countWords(plain);
  const paragraphCount = countParagraphs(plain, html);
  const issues: HumanOutreachIssue[] = [];

  if (!cfg.enabled) {
    return {
      wordCount,
      paragraphCount,
      passed: true,
      issues: [],
      summary: 'Human outreach checks disabled.',
    };
  }

  const { minBodyWords, maxBodyWords, maxParagraphs } = cfg;

  if (!plain) {
    issues.push({
      id: 'body-empty',
      label: 'Empty body',
      message: 'Email body is empty.',
      severity: 'fail',
    });
  } else if (wordCount > maxBodyWords) {
    issues.push({
      id: 'body-too-long',
      label: 'Too long',
      message: `${wordCount} words — keep outreach under ${maxBodyWords} words (${minBodyWords}–${maxBodyWords} is your configured target).`,
      severity: 'fail',
    });
  } else if (wordCount > Math.round(maxBodyWords * 0.9)) {
    issues.push({
      id: 'body-long',
      label: 'Getting long',
      message: `${wordCount} words — aim for ${minBodyWords}–${maxBodyWords} words so it reads like a quick personal note.`,
      severity: 'warn',
    });
  } else if (wordCount < minBodyWords) {
    issues.push({
      id: 'body-too-short',
      label: 'Very short',
      message: `${wordCount} words — your target minimum is ${minBodyWords}. Add one line of context if this is cold outreach.`,
      severity: 'warn',
    });
  }

  const lower = plain.toLowerCase();
  const toneHits = AI_TONE_PHRASES.filter(({ phrase }) => lower.includes(phrase));
  if (toneHits.length >= 2) {
    issues.push({
      id: 'body-ai-tone',
      label: 'Sounds templated',
      message: `Phrases like "${toneHits[0].label}" and "${toneHits[1]?.label || toneHits[0].label}" feel automated — rewrite in your own voice.`,
      severity: 'fail',
    });
  } else if (toneHits.length === 1) {
    issues.push({
      id: 'body-ai-tone',
      label: 'Sounds templated',
      message: `"${toneHits[0].label}" detected — swap for plain, conversational wording.`,
      severity: 'warn',
    });
  }

  if (hasBulletList(plain, html)) {
    issues.push({
      id: 'body-bullet-list',
      label: 'Bullet list',
      message: 'Bullet points feel like marketing mail — use short paragraphs instead.',
      severity: 'warn',
    });
  }

  if (paragraphCount > maxParagraphs + 1) {
    issues.push({
      id: 'body-many-paragraphs',
      label: 'Too many paragraphs',
      message: `${paragraphCount} paragraphs — your limit is ${maxParagraphs} for first-touch mail.`,
      severity: 'fail',
    });
  } else if (paragraphCount > maxParagraphs) {
    issues.push({
      id: 'body-many-paragraphs',
      label: 'Many paragraphs',
      message: `${paragraphCount} paragraphs — aim for ${maxParagraphs} or fewer short blocks.`,
      severity: 'warn',
    });
  }

  if (plain.length > 500 && paragraphCount <= 1) {
    issues.push({
      id: 'body-wall-of-text',
      label: 'Wall of text',
      message: `One long block is hard to read — break into ${Math.min(3, maxParagraphs)} short paragraphs.`,
      severity: 'warn',
    });
  }

  const hasFail = issues.some((i) => i.severity === 'fail');
  const passed = !hasFail;

  return {
    wordCount,
    paragraphCount,
    passed,
    issues,
    summary: passed
      ? issues.length
        ? `${issues.length} suggestion${issues.length === 1 ? '' : 's'} — OK to send.`
        : `Reads like a concise note (${minBodyWords}–${maxBodyWords} words, ≤${maxParagraphs} paragraphs).`
      : `Rewrite to match your outreach targets (${minBodyWords}–${maxBodyWords} words) before sending.`,
  };
}

export function validateHumanOutreachForSend(
  bodyHtmlOrText: string,
  config?: HumanOutreachConfig,
): { ok: boolean; error?: string; analysis: HumanOutreachAnalysis } {
  const cfg = normalizeHumanOutreachConfig(config);
  const analysis = analyzeHumanOutreachEmail(bodyHtmlOrText, cfg);
  if (!cfg.enabled) {
    return { ok: true, analysis };
  }
  if (cfg.blockOnFail && !analysis.passed) {
    const top = analysis.issues.find((i) => i.severity === 'fail') || analysis.issues[0];
    return {
      ok: false,
      error: top?.message || 'Email does not pass human outreach checks.',
      analysis,
    };
  }
  return { ok: true, analysis };
}
