/** Client-side human outreach checks — keep in sync with api-hrms/crm-human-outreach.util.ts */

export type HumanOutreachIssue = {
  id: string;
  label: string;
  message: string;
  severity: 'warn' | 'fail';
};

export type HumanOutreachOptions = {
  enabled?: boolean;
  minBodyWords?: number;
  maxBodyWords?: number;
  maxParagraphs?: number;
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

export function normalizeHumanOutreachOptions(
  raw?: HumanOutreachOptions | null,
): Required<Pick<HumanOutreachOptions, 'enabled' | 'minBodyWords' | 'maxBodyWords' | 'maxParagraphs'>> {
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

export function analyzeHumanOutreachIssues(
  bodyPlain: string,
  bodyHtml: string,
  options?: HumanOutreachOptions,
): HumanOutreachIssue[] {
  const cfg = normalizeHumanOutreachOptions(options);
  if (!cfg.enabled) return [];

  const plain = stripComplianceFooter(bodyPlain.trim());
  const html = bodyHtml || '';
  const wordCount = countWords(plain);
  const paragraphCount = countParagraphs(plain, html);
  const issues: HumanOutreachIssue[] = [];
  const { minBodyWords, maxBodyWords, maxParagraphs } = cfg;

  if (!plain) {
    issues.push({
      id: 'human-body-empty',
      label: 'Empty body',
      message: 'Email body is empty.',
      severity: 'fail',
    });
    return issues;
  }

  if (wordCount > maxBodyWords) {
    issues.push({
      id: 'human-body-too-long',
      label: 'Too long for outreach',
      message: `${wordCount} words — keep under ${maxBodyWords} (target: ${minBodyWords}–${maxBodyWords}).`,
      severity: 'fail',
    });
  } else if (wordCount > Math.round(maxBodyWords * 0.9)) {
    issues.push({
      id: 'human-body-long',
      label: 'Getting long',
      message: `${wordCount} words — aim for ${minBodyWords}–${maxBodyWords} words.`,
      severity: 'warn',
    });
  } else if (wordCount < minBodyWords) {
    issues.push({
      id: 'human-body-too-short',
      label: 'Very short',
      message: `${wordCount} words — minimum target is ${minBodyWords}.`,
      severity: 'warn',
    });
  }

  const lower = plain.toLowerCase();
  const toneHits = AI_TONE_PHRASES.filter(({ phrase }) => lower.includes(phrase));
  if (toneHits.length >= 2) {
    issues.push({
      id: 'human-body-ai-tone',
      label: 'Sounds templated',
      message: `Phrases like "${toneHits[0].label}" feel automated — rewrite in your own voice.`,
      severity: 'fail',
    });
  } else if (toneHits.length === 1) {
    issues.push({
      id: 'human-body-ai-tone',
      label: 'Sounds templated',
      message: `"${toneHits[0].label}" — swap for plain, conversational wording.`,
      severity: 'warn',
    });
  }

  if (hasBulletList(plain, html)) {
    issues.push({
      id: 'human-body-bullets',
      label: 'Bullet list',
      message: 'Bullet points read like marketing — use short paragraphs instead.',
      severity: 'warn',
    });
  }

  if (paragraphCount > maxParagraphs + 1) {
    issues.push({
      id: 'human-body-paragraphs',
      label: 'Too many paragraphs',
      message: `${paragraphCount} paragraphs — limit is ${maxParagraphs}.`,
      severity: 'fail',
    });
  } else if (paragraphCount > maxParagraphs) {
    issues.push({
      id: 'human-body-paragraphs',
      label: 'Many paragraphs',
      message: `${paragraphCount} paragraphs — aim for ${maxParagraphs} or fewer.`,
      severity: 'warn',
    });
  }

  if (plain.length > 500 && paragraphCount <= 1) {
    issues.push({
      id: 'human-body-wall',
      label: 'Wall of text',
      message: `One long block — break into ${Math.min(3, maxParagraphs)} short paragraphs.`,
      severity: 'warn',
    });
  }

  return issues;
}

export function humanOutreachHasHardFail(issues: HumanOutreachIssue[]): boolean {
  return issues.some((i) => i.severity === 'fail');
}
