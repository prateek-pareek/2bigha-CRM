/**
 * Starter HTML for IT consulting proposals & quotations (CRM module).
 * Plain-text inputs are escaped; pre-built table blocks are trusted static HTML.
 */

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(text: string): string {
  return (text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

const MATHIONIX_INTRO = `2Bigha is a digital land marketplace focused on making agricultural land, farmland, and rural property discovery more transparent and accessible across India. We help buyers, sellers, and investors explore verified listings, compare locations, and connect with land opportunities through a map-first experience.`;

/** Package / tier lines — combined with payment block for section 4. */
const DEFAULT_PACKAGE_OPTIONS = `
<ul>
  <li><strong>Listing visibility boost</strong> — custom quote</li>
  <li><strong>Verified listing package</strong> — custom quote</li>
  <li><strong>Buyer lead management support</strong> — custom quote</li>
</ul>`;

const DEFAULT_PAYMENT_MILESTONES = `
<p><strong>Payment terms</strong></p>
<ul>
  <li>25% advance — to initiate the engagement</li>
  <li>40% midway — upon completion of agreed milestones</li>
  <li>25% before final delivery</li>
  <li>10% post delivery support phase</li>
</ul>`;

const DEFAULT_TECH_STACK = `
<ul>
  <li><strong>Web:</strong> Next.js, React</li>
  <li><strong>Backend:</strong> NestJS, REST, MongoDB, Redis</li>
  <li><strong>Maps &amp; listing tools:</strong> platform-native discovery</li>
  <li><strong>Infra:</strong> cloud hosting, secure auth sessions</li>
</ul>`;

const PAYMENT_BLOCK = `
<p><strong>Payment method</strong></p>
<p>Bank transfer (NEFT / IMPS / UPI)</p>
<p><strong>A/C Name:</strong> MY TWO BIGHA PRIVATE LIMITED</p>
<p>Bank details shared on acceptance.</p>`;

const PORTFOLIO_SNIPPET = `
<p>2Bigha.ai helps people explore agricultural land, farmland, farmhouse land, and rural investment opportunities across India with a focus on trust, transparency, and a simpler buying journey.</p>`;

function linesToUl(linesRaw: string | undefined): string | null {
  const lines = (linesRaw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

function packageOptionsFromLines(linesRaw: string | undefined): string {
  return linesToUl(linesRaw) ?? DEFAULT_PACKAGE_OPTIONS.trim();
}

function paymentMilestonesFromLines(linesRaw: string | undefined): string {
  const ul = linesToUl(linesRaw);
  if (!ul) return DEFAULT_PAYMENT_MILESTONES.trim();
  return `<p><strong>Payment terms</strong></p>${ul}`;
}

function techStackFromLines(linesRaw: string | undefined): string {
  return linesToUl(linesRaw) ?? DEFAULT_TECH_STACK.trim();
}

function deliverySectionFromLines(
  milestoneLines: string | undefined,
  timelineFallback: string | undefined,
): string {
  const ul = linesToUl(milestoneLines);
  if (ul) return ul;
  const t = (timelineFallback ?? "").trim();
  if (t) return `<p>${esc(t).replace(/\n/g, "<br/>")}</p>`;
  return `<p>${esc(
    "Approximately 8–12 weeks for MVP depending on feedback and approvals.",
  )}</p>`;
}

function portfolioFromTextOrHtml(
  plainText: string | undefined,
  htmlOverride: string | undefined,
): string {
  if (htmlOverride?.trim()) return htmlOverride.trim();
  const t = (plainText ?? "").trim();
  if (t) return paragraphs(t);
  return PORTFOLIO_SNIPPET.trim();
}

export type ItProposalVars = {
  projectTitle: string;
  /** e.g. product name for closing line */
  productName: string;
  projectOverview: string;
  scopeOfWork: string;
  /** Full override for section 4 (commercials + payment) */
  commercialsHtml?: string;
  /** One commercial tier / option per line (ignored if commercialsHtml is set) */
  commercialPackageLines?: string;
  /** One payment milestone per line (ignored if commercialsHtml is set) */
  paymentMilestoneLines?: string;
  /** Single paragraph timeline if no deliveryMilestoneLines */
  timelineText?: string;
  /** One delivery milestone per line (phase dates, deliverables) */
  deliveryMilestoneLines?: string;
  /** Full override for tech stack section */
  techStackHtml?: string;
  /** One bullet per line, e.g. "Mobile: React Native" */
  techStackLines?: string;
  /** Full override for portfolio section */
  portfolioHtml?: string;
  /** Case studies / portfolio as plain paragraphs (blank line between stories) */
  portfolioCaseStudyText?: string;
};

export function buildItConsultingProposalHtml(v: ItProposalVars): string {
  const title = esc(v.projectTitle || "Project proposal");
  const product = esc(v.productName || "your product");
  const overview = paragraphs(v.projectOverview || "Describe the project goals and MVP focus here.");
  const scope = paragraphs(v.scopeOfWork || "List modules, user roles, and key features. Break into subsections as needed.");
  const commercials =
    v.commercialsHtml?.trim() ||
    `${packageOptionsFromLines(v.commercialPackageLines)}\n${paymentMilestonesFromLines(v.paymentMilestoneLines)}`;
  const delivery = deliverySectionFromLines(v.deliveryMilestoneLines, v.timelineText);
  const tech = v.techStackHtml?.trim() || techStackFromLines(v.techStackLines);
  const portfolio = portfolioFromTextOrHtml(v.portfolioCaseStudyText, v.portfolioHtml);

  return `
<h1>${title}</h1>
<h2>1. Introduction</h2>
<p>${esc(MATHIONIX_INTRO)}</p>
<h2>2. Project overview</h2>
${overview}
<h2>3. Scope of work</h2>
${scope}
<h2>4. Commercials &amp; pricing options</h2>
${commercials}
<h2>5. Timeline &amp; delivery milestones</h2>
${delivery}
<h2>6. Tech stack</h2>
${tech}
<h2>7. Copyrights &amp; responsibilities</h2>
<p>Standard mutual NDA-friendly terms: timely client inputs and payments; delivery per agreed scope; IP transfer after full payment; portfolio showcase rights for 2Bigha without exposing sensitive data. Replace this section with your legal text if required.</p>
<h2>8. Why 2Bigha</h2>
<ul>
  <li>Proven mobile &amp; platform delivery</li>
  <li>Transparent communication</li>
  <li>Milestone-based delivery</li>
  <li>Post-launch support options</li>
</ul>
${PAYMENT_BLOCK}
<h2>9. Conclusion</h2>
<p>We look forward to partnering with you to bring <strong>${product}</strong> to life. This proposal can be adjusted to match the package and timeline you select.</p>
<h2>10. Portfolio</h2>
${portfolio}
`.trim();
}

export type QuotationVars = {
  quotationTitle: string;
  clientName: string;
  /** HTML rows &lt;tr&gt;...&lt;/tr&gt; or plain lines (we wrap as list) */
  lineItemsDescription: string;
  totalInr: string;
  validityDays?: string;
};

export function buildQuotationHtml(v: QuotationVars): string {
  const title = esc(v.quotationTitle || "Quotation");
  const client = esc(v.clientName || "Client");
  const total = esc(v.totalInr || "—");
  const validity = esc(v.validityDays || "30");
  const raw = v.lineItemsDescription || "";
  const itemsBlock = `<ul>${raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<li>${esc(l)}</li>`)
    .join("")}</ul>`;

  return `
<h1>${title}</h1>
<p>Prepared for <strong>${client}</strong></p>
<h2>Line items</h2>
${itemsBlock}
<p><strong>Total:</strong> ₹ ${total} + GST (as applicable)</p>
<p><em>This quotation is valid for ${validity} days from the date of issue.</em></p>
${PAYMENT_BLOCK}
`.trim();
}

export const TEMPLATE_OPTIONS = [
  { id: "it_proposal", label: "IT consulting — full proposal" },
  { id: "quotation", label: "Quotation — summary + payment" },
] as const;

export type DocumentKind = "proposal" | "quotation" | "contract";

/** Insert buttons shown in the editor depend on document kind. */
export function documentTemplatesForKind(kind: DocumentKind) {
  if (kind === "contract") {
    return [];
  }
  if (kind === "quotation") {
    return TEMPLATE_OPTIONS.filter((t) => t.id === "quotation");
  }
  return TEMPLATE_OPTIONS.filter((t) => t.id === "it_proposal");
}

/** Presets for section 4 (commercial tiers + payment milestones) and optional delivery hints. */
export type PricingMilestonePreset = {
  id: string;
  label: string;
  description: string;
  commercialPackageLines: string;
  paymentMilestoneLines: string;
  deliveryMilestoneLines: string;
  timelineText: string;
};

export const PRICING_MILESTONE_PRESETS: PricingMilestonePreset[] = [
  {
    id: "standard_mobile_tiers",
    label: "Standard — mobile / web tiers + 4-phase payment",
    description:
      "Three package tiers (Figma optional); 25% / 40% / 25% / 10% — matches the default proposal structure.",
    commercialPackageLines: [
      "Mobile App + Web + Admin + Figma — ₹ 2,70,000 + GST",
      "Mobile App + Web + Admin — ₹ 2,40,000 + GST",
      "Mobile App + Admin — ₹ 2,00,000 + GST",
    ].join("\n"),
    paymentMilestoneLines: [
      "25% — advance to initiate the project",
      "40% — midway upon completion of core modules",
      "25% — before final delivery",
      "10% — post deployment support phase",
    ].join("\n"),
    deliveryMilestoneLines: [
      "Week 1–2: Discovery, UX & technical specification",
      "Week 3–6: Core development & internal QA",
      "Week 7–8: UAT, refinements & handover",
      "Week 9–12: Stabilisation & optional go-live support",
    ].join("\n"),
    timelineText: "",
  },
  {
    id: "upfront_heavy",
    label: "Upfront-heavy — two tiers, 50 / 30 / 20",
    description: "Stronger cash flow up front; good for new clients or fixed-scope MVPs.",
    commercialPackageLines: [
      "Full stack MVP (mobile + API + admin) — ₹ 3,20,000 + GST",
      "MVP without admin console — ₹ 2,60,000 + GST",
    ].join("\n"),
    paymentMilestoneLines: [
      "50% — on contract / kick-off",
      "30% — on UAT sign-off",
      "20% — within 15 days of go-live",
    ].join("\n"),
    deliveryMilestoneLines: [
      "Phase 1: Requirements & design approval",
      "Phase 2: Build & QA",
      "Phase 3: UAT, launch & handover",
    ].join("\n"),
    timelineText: "",
  },
  {
    id: "simple_two_pay",
    label: "Simple — single offer, two payments",
    description: "One commercial line; 50% start / 50% before delivery.",
    commercialPackageLines: [
      "End-to-end product delivery (scope as per SOW) — custom quote + GST",
    ].join("\n"),
    paymentMilestoneLines: [
      "50% — to commence work after SOW sign-off",
      "50% — before production release / handover",
    ].join("\n"),
    deliveryMilestoneLines: "",
    timelineText:
      "Timeline agreed in the statement of work; typically 8–12 weeks for an MVP subject to feedback cycles.",
  },
  {
    id: "retainer_monthly",
    label: "Retainer — monthly engagement",
    description: "For ongoing product or engineering support (adjust amounts in the editor after insert).",
    commercialPackageLines: [
      "Dedicated squad — ₹ X / month + GST (160 hours, rollover capped at 20%)",
      "Fractional squad — ₹ Y / month + GST (80 hours)",
      "Ad-hoc support — ₹ Z / hour (minimum 10h / month)",
    ].join("\n"),
    paymentMilestoneLines: [
      "Monthly in advance — invoiced on the 1st, due within 7 days",
      "Security deposit — one month (adjustable against final invoice on notice period)",
    ].join("\n"),
    deliveryMilestoneLines: [
      "Sprint planning & backlog grooming — ongoing",
      "Bi-weekly releases & demo",
      "Monthly steering & roadmap review",
    ].join("\n"),
    timelineText: "",
  },
];

export function getPricingMilestonePreset(
  id: string,
): PricingMilestonePreset | undefined {
  return PRICING_MILESTONE_PRESETS.find((p) => p.id === id);
}
