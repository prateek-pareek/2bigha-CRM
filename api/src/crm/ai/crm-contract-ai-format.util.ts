/**
 * HTML formatting for AI-generated service agreements / contracts.
 */

export const CONTRACT_HTML_STYLE_RULES = `
HTML formatting rules (apply to every element in bodyHtml):
- Use ONLY: h1, h2, h3, p, br, strong, em, ul, ol, li, table, thead, tbody, tr, th, td.
- h1: style="font-size:22px;font-weight:700;color:#1a1a2e;margin:0 0 24px;text-align:center;"
- h2: style="font-size:15px;font-weight:700;color:#1a1a2e;margin:26px 0 10px;text-transform:uppercase;letter-spacing:0.04em;"
- h3: style="font-size:14px;font-weight:600;color:#333;margin:16px 0 8px;"
- p: style="margin:0 0 10px;line-height:1.65;color:#333;font-size:13px;text-align:justify;"
- ul, ol: style="margin:0 0 12px 0;padding-left:24px;line-height:1.6;font-size:13px;"
- li: style="margin-bottom:6px;"
- Use numbered section h2 headings matching the contract outline.
- Include a signature block at the end with blank lines for dates and signatures for both parties.
- Use formal legal tone; define key terms in section 1 where appropriate.
- Mark unknown specifics as [●] or [To be completed] — do not invent registration numbers not in settings.
`.trim();

export function buildContractIssuerBlock(
  issuerProfile: 'agency' | 'freelancer',
  settings: Record<string, unknown>,
): Record<string, string> {
  if (issuerProfile === 'freelancer') {
    return {
      partyLabel: 'Consultant / Service Provider (individual)',
      legalName: String(settings.freelancerLegalName || '').trim() || '[Consultant legal name]',
      address: String(settings.freelancerAddress || '').trim(),
      idDocument: String(settings.freelancerIdDocument || '').trim(),
      standardClauses: String(settings.freelancerStandardClauses || '').trim(),
      voice:
        'Draft as an independent contractor agreement. Service Provider is the freelancer (individual). Use first person for consultant only in cover email subject guidance — the contract body stays third-person legal ("Consultant", "Client").',
    };
  }
  return {
    partyLabel: 'Service Provider (company)',
    legalName: String(settings.agencyLegalName || '').trim() || '[Company legal name]',
    registeredAddress: String(settings.agencyRegisteredAddress || '').trim(),
    signatoryName: String(settings.agencySignatoryName || '').trim(),
    signatoryTitle: String(settings.agencySignatoryTitle || '').trim(),
    gstOrReg: String(settings.agencyGstOrReg || '').trim(),
    standardClauses: String(settings.agencyStandardClauses || '').trim(),
    voice:
      'Draft as a Master Services Agreement or Statement of Work style contract. Service Provider is the agency/company. Use defined party names consistently (e.g. "Service Provider" and "Client").',
  };
}
