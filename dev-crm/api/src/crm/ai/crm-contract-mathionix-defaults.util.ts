/** Default IT consulting contract clauses — Mathionix agency profile. */

export const DEFAULT_CONTRACT_SECTION_OUTLINE = `1. Parties and definitions
2. Scope of services
3. Deliverables and acceptance criteria
4. Fees, invoicing, and payment
5. Project timeline and client responsibilities
6. Intellectual property and ownership
7. Confidentiality and data protection
8. Warranties and disclaimers
9. Limitation of liability
10. Term, suspension, and termination
11. Governing law and dispute resolution
12. Signatures`;

export const MATHIONIX_GOVERNING_LAW =
  'This Agreement is governed by the laws of India. Courts at Bengaluru, Karnataka shall have exclusive jurisdiction.';

export const MATHIONIX_AGENCY_CONTRACT_PARTY = `Service Provider: MATHIONIX TECHNOLOGIES PRIVATE LIMITED
Registered address: [Your registered office address]
GSTIN: [Your GSTIN]`;

export const MATHIONIX_AGENCY_STANDARD_CLAUSES = `IP: Upon full payment, client receives ownership of custom deliverables created under this Agreement, excluding pre-existing tools, libraries, and generic frameworks retained by Service Provider. Service Provider may reuse non-confidential know-how.

Confidentiality: Both parties shall protect confidential information for three (3) years.

Warranty: Services performed in a professional manner consistent with industry standards. Software provided "as-is" after acceptance unless a separate support agreement exists.

Liability cap: Total liability limited to fees paid under this Agreement in the preceding twelve (12) months, excluding fraud or willful misconduct.

Client responsibilities: Timely feedback, access to stakeholders, content, and approvals. Delays may extend timeline and fees.

Change requests: Out-of-scope work requires written change order with revised fees and timeline.`;

export const MATHIONIX_FREELANCER_STANDARD_CLAUSES = `IP: Upon full payment, client receives ownership of custom work product. Consultant retains rights to pre-existing materials and general methodologies.

Confidentiality: Consultant will not disclose client confidential information except as required to perform services.

Warranty: Services performed with reasonable skill and care. No guarantee of specific business outcomes.

Liability cap: Limited to fees paid under this Agreement, excluding fraud or willful misconduct.

Independence: Consultant is an independent contractor, not an employee or agent of the client.`;

export const MATHIONIX_SEED_CONTRACT_AGENCY = {
  agencyLegalName: 'Mathionix Technologies Private Limited',
  agencyRegisteredAddress: '[Registered office address — update in settings]',
  agencySignatoryName: '[Authorized signatory name]',
  agencySignatoryTitle: 'Director',
  agencyGstOrReg: '[GSTIN]',
  governingLaw: MATHIONIX_GOVERNING_LAW,
  contractSectionOutline: DEFAULT_CONTRACT_SECTION_OUTLINE,
  agencyStandardClauses: MATHIONIX_AGENCY_STANDARD_CLAUSES,
};

export const MATHIONIX_SEED_CONTRACT_FREELANCER = {
  freelancerLegalName: '[Your full legal name]',
  freelancerAddress: '[Your business address]',
  freelancerIdDocument: 'PAN: [Your PAN]',
  freelancerStandardClauses: MATHIONIX_FREELANCER_STANDARD_CLAUSES,
};

export function applyMathionixContractAgencyFallbacks(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  if (!String(out.agencyLegalName || '').trim()) {
    out.agencyLegalName = MATHIONIX_SEED_CONTRACT_AGENCY.agencyLegalName;
  }
  if (!String(out.agencyStandardClauses || '').trim()) {
    out.agencyStandardClauses = MATHIONIX_AGENCY_STANDARD_CLAUSES;
  }
  if (!String(out.governingLaw || '').trim()) {
    out.governingLaw = MATHIONIX_GOVERNING_LAW;
  }
  if (!String(out.contractSectionOutline || '').trim()) {
    out.contractSectionOutline = DEFAULT_CONTRACT_SECTION_OUTLINE;
  }
  return out;
}
