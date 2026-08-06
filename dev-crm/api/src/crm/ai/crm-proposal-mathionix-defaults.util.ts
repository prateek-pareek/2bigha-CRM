/** Seeded defaults for Mathionix Technologies — agency IT consulting proposals. */

export const MATHIONIX_AGENCY_NAME = 'Mathionix Technologies';

export const MATHIONIX_AGENCY_INTRO =
  'Mathionix Technologies is a well-established IT services and software development company specializing in the design, development, and deployment of high-quality digital solutions. With extensive experience in mobile application development, web platforms, and custom software systems, we partner with businesses to transform ideas into reliable, scalable, and user-centric technology products.';

export const MATHIONIX_AGENCY_SERVICES = `Mobile application development (React Native, iOS/Android)
Web platforms and admin dashboards (Next.js, React)
Custom backend APIs and integrations (NestJS, MongoDB, Redis)
Cloud deployment and DevOps (AWS, GCP)
UI/UX design support (Figma)
Ongoing maintenance and post-launch support`;

export const MATHIONIX_AGENCY_DIFFERENTIATORS = `Milestone-based delivery with transparent communication
Proven delivery across mobile, web, and platform projects
Security-first engineering practices
Flexible engagement: fixed-scope packages or iterative MVP builds`;

export const MATHIONIX_PAYMENT_TERMS = `Payment terms:
• 25% advance — to initiate the project
• 40% midway — upon completion of core modules
• 25% before final delivery
• 10% post deployment support phase

Indicative package options:
• Mobile App + Web + Admin + Figma — ₹ 2,70,000 + GST
• Mobile App + Web + Admin — ₹ 2,40,000 + GST
• Mobile App + Admin — ₹ 2,00,000 + GST

Payment method: Bank transfer (NEFT / IMPS / SWIFT / Wise)
A/C Name: MATHIONIX TECHNOLOGIES PRIVATE LIMITED
Bank: HDFC BANK | IFSC: HDFC0006364 | A/C No.: 50200101247801
SWIFT: HDFCINBBXXX | UPI: mathionix@ybl`;

export const MATHIONIX_TECH_STACK = `Mobile: React Native, Redux, Firebase (OTP)
Web (if applicable): Next.js
Backend: NestJS, REST, MongoDB, Redis
Admin: React / Next.js (shared API)
Infra: AWS or GCP, S3-compatible storage, JWT sessions`;

export const MATHIONIX_PORTFOLIO = `Our portfolio includes work with Ecolopers, UME Health, Salar, Pulse Digital Health, and other long-term partners across mobile, web, and platform delivery.

Sample projects: Going Greek (US recruitment prep), AMME (nurse booking), GoalConnect (football scouting), Meyo (LinkedIn outreach).`;

export const MATHIONIX_FREELANCER_PAYMENT_TERMS = `Payment terms:
• 30% advance to start
• 40% on core milestone completion
• 30% before handover

Payment via bank transfer or UPI (details shared on acceptance).`;

export const MATHIONIX_SEED_AGENCY = {
  agencyName: MATHIONIX_AGENCY_NAME,
  agencyIntro: MATHIONIX_AGENCY_INTRO,
  agencyServices: MATHIONIX_AGENCY_SERVICES,
  agencyDifferentiators: MATHIONIX_AGENCY_DIFFERENTIATORS,
  agencyPaymentTerms: MATHIONIX_PAYMENT_TERMS,
  agencyTechStack: MATHIONIX_TECH_STACK,
  agencyPortfolio: MATHIONIX_PORTFOLIO,
};

export function applyMathionixAgencyFallbacks(
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  if (!String(out.agencyName || '').trim()) out.agencyName = MATHIONIX_AGENCY_NAME;
  if (!String(out.agencyIntro || '').trim()) out.agencyIntro = MATHIONIX_AGENCY_INTRO;
  if (!String(out.agencyServices || '').trim()) {
    out.agencyServices = MATHIONIX_AGENCY_SERVICES;
  }
  if (!String(out.agencyDifferentiators || '').trim()) {
    out.agencyDifferentiators = MATHIONIX_AGENCY_DIFFERENTIATORS;
  }
  if (!String(out.agencyPaymentTerms || '').trim()) {
    out.agencyPaymentTerms = MATHIONIX_PAYMENT_TERMS;
  }
  if (!String(out.agencyTechStack || '').trim()) {
    out.agencyTechStack = MATHIONIX_TECH_STACK;
  }
  if (!String(out.agencyPortfolio || '').trim()) {
    out.agencyPortfolio = MATHIONIX_PORTFOLIO;
  }
  return out;
}
