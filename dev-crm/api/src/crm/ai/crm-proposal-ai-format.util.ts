/**
 * HTML formatting guidance injected into AI proposal prompts.
 * Inline styles survive PDF/DOCX export and rich-text preview.
 */

export const PROPOSAL_HTML_STYLE_RULES = `
HTML formatting rules (apply to every element in bodyHtml):
- Use ONLY these tags: h1, h2, h3, p, br, strong, em, ul, ol, li, table, thead, tbody, tr, th, td.
- h1: style="font-size:24px;font-weight:700;color:#1a1a2e;margin:0 0 20px;line-height:1.25;"
- h2: style="font-size:17px;font-weight:600;color:#0f4c75;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #e8f4f8;"
- h3: style="font-size:14px;font-weight:600;color:#3282b8;margin:18px 0 8px;"
- p: style="margin:0 0 12px;line-height:1.6;color:#333;font-size:14px;"
- ul, ol: style="margin:0 0 14px 0;padding-left:22px;line-height:1.55;color:#333;font-size:14px;"
- li: style="margin-bottom:6px;"
- table: style="width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:13px;"
- th: style="background:#f0f7fb;color:#0f4c75;text-align:left;padding:10px 12px;border:1px solid #d4e8f0;font-weight:600;"
- td: style="padding:10px 12px;border:1px solid #e8eef2;vertical-align:top;"
- strong: use for emphasis and package names; do not use inline color on strong.
- Number section h2 headings to match the section outline (e.g. "1. Introduction").
- Commercials: prefer a pricing table (Package | Description | Amount) when line items exist.
- Keep the document visually professional — whitespace between sections, no raw markdown.
`.trim();

export function buildIssuerProfileBlock(
  issuerProfile: 'agency' | 'freelancer',
  settings: Record<string, unknown>,
): Record<string, string> {
  if (issuerProfile === 'freelancer') {
    return {
      displayName: String(settings.freelancerName || '').trim() || 'Independent consultant',
      introduction: String(settings.freelancerIntro || '').trim(),
      services: String(settings.freelancerServices || '').trim(),
      differentiators: String(settings.freelancerDifferentiators || '').trim(),
      paymentTerms: String(settings.freelancerPaymentTerms || '').trim(),
      techStack: String(settings.freelancerTechStack || '').trim(),
      portfolio: String(settings.freelancerPortfolio || '').trim(),
      voice:
        'Write in first person singular (I / my). Position as a solo consultant or freelancer — hands-on delivery, direct accountability, flexible engagement.',
    };
  }
  return {
    displayName: String(settings.agencyName || '').trim() || 'Our company',
    introduction: String(settings.agencyIntro || '').trim(),
    services: String(settings.agencyServices || '').trim(),
    differentiators: String(settings.agencyDifferentiators || '').trim(),
    paymentTerms: String(settings.agencyPaymentTerms || '').trim(),
    techStack: String(settings.agencyTechStack || '').trim(),
    portfolio: String(settings.agencyPortfolio || '').trim(),
    voice:
      'Write in first person plural (we / our). Position as an agency or company — team depth, process, scalability, and enterprise-ready delivery.',
  };
}
