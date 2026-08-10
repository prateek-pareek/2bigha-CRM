/** Seeded defaults for 2Bigha — land marketplace proposals. */

export const MATHIONIX_AGENCY_NAME = '2Bigha';

export const MATHIONIX_AGENCY_INTRO =
  '2Bigha is a digital land marketplace focused on making agricultural land, farmland, and rural property discovery more transparent and accessible across India. We help buyers, sellers, and investors explore verified listings, compare locations, and connect with land opportunities through a map-first experience.';

export const MATHIONIX_AGENCY_SERVICES = `Land listing and discovery (map-based search)
Buyer–seller matching and lead management
Listing verification and visibility tools
Property insights and market comparison
Subscription plans for enhanced listing reach
Ongoing platform and CRM support`;

export const MATHIONIX_AGENCY_DIFFERENTIATORS = `Land-first product focus (not generic real estate)
Map-based discovery with clearer location context
Transparent listing information for buyers and sellers
CRM workflows tailored to land sales follow-ups`;

export const MATHIONIX_PAYMENT_TERMS = `Payment terms:
• 25% advance — to initiate the engagement
• 40% midway — upon completion of agreed milestones
• 25% before final delivery
• 10% post delivery support phase

Payment method: Bank transfer (NEFT / IMPS / UPI)
A/C Name: MY TWO BIGHA PRIVATE LIMITED
Bank details shared on acceptance.`;

export const MATHIONIX_TECH_STACK = `Web: Next.js, React
Backend: NestJS, REST, MongoDB, Redis
Maps & listing tools: platform-native discovery
Infra: cloud hosting, secure auth sessions`;

export const MATHIONIX_PORTFOLIO = `2Bigha.ai helps people explore agricultural land, farmland, farmhouse land, and rural investment opportunities across India with a focus on trust, transparency, and a simpler buying journey.`;

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
