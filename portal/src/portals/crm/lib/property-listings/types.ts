import type {
  PmFieldVisit,
  PmLegalVerification,
  PmPipelineStage,
  PmPlan,
  PmVisitReport,
} from "@/lib/crm/property-management/types";

export type PropertyListingType =
  | "Apartment"
  | "Villa"
  | "Independent House"
  | "Plot"
  | "Commercial"
  | "Office"
  | "Warehouse"
  | "Farm"
  | "Agricultural"
  | "Residential"
  | "Industrial"
  | "Farmhouse"
  | "Farmland"
  | "Other";

/** 2Bigha marketplace streams. Property Management is its own module (see @/lib/crm/property-management) — not a bucket here. */
export type ListingBucket = "properties" | "farm";

/**
 * Discriminator on the shared record: marketplace buckets plus `"pm"` for
 * Property Management cases, which still live in the same third-party
 * listings collection under their own module.
 */
export type PropertyRecordBucket = ListingBucket | "pm";

export const LISTING_BUCKETS: { key: ListingBucket; label: string; description: string }[] = [
  { key: "properties", label: "Properties", description: "All property listings from 2Bigha marketplace" },
  { key: "farm", label: "Farms", description: "Farm & farmland marketplace listings" },
];

/** Type guard narrowing a PropertyRecordBucket to the marketplace-only ListingBucket (i.e. not "pm"). */
export function isMarketplaceBucket(bucket: PropertyRecordBucket): bucket is ListingBucket {
  return bucket !== "pm";
}

export type PropertyListingStatus =
  | "Available"
  | "Sold"
  | "Managed";

export type PropertyListingFor = "Sale" | "Rent";

export type PropertyListingApprovalStatus = "Pending" | "Approved" | "Rejected";

/** Area units used on 2Bigha / PM forms. */
export type AreaUnit =
  | "Bigha"
  | "Katha"
  | "Sq. Yard"
  | "Sq. Ft"
  | "Sq. M"
  | "Acre"
  | "Hectare"
  | "Marla"
  | "Kanal"
  | "Guntha"
  | "Cent";

export const AREA_UNITS: AreaUnit[] = [
  "Bigha",
  "Katha",
  "Sq. Yard",
  "Sq. Ft",
  "Sq. M",
  "Acre",
  "Hectare",
  "Marla",
  "Kanal",
  "Guntha",
  "Cent",
];

/**
 * Subscription-bundled property Legal Verification (2Bigha Legal Process Flow).
 * Distinct from PM pipeline `legalVerification` (Assigned to Legal checklist).
 */
export type PropertyLegalStatus = "Pending" | "Verified" | "Rejected";

export interface PropertyLegalNote {
  text: string;
  at: string;
  by?: string;
}

export interface PropertyLegalReport {
  fileName: string;
  uploadedAt: string;
  url?: string;
}

export interface PropertyLegalVerification {
  status: PropertyLegalStatus;
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  /** Optional queue assignee (shared team by default; doc §3). */
  assignedTo?: string;
  /** Free-form notes from the legal reviewer (property-level). */
  notes?: string;
  /** Required when status is Rejected — shown back to the client/owner. */
  rejectionReason?: string;
  report?: PropertyLegalReport;
  /** Prior review-pass notes when the property was reviewed before. */
  priorNotes?: PropertyLegalNote[];
  noteHistory?: PropertyLegalNote[];
}

export interface LeadSubscriptionMock {
  plan: PmPlan;
  expiryDate: string;
  featuredUsed: number;
  featuredAllowance: number;
  /** Plan includes Request Legal Verification (doc §1). */
  includesLegalVerification: boolean;
  /** Cap on verification requests; null = unlimited. */
  legalVerificationAllowance: number | null;
  legalVerificationUsed: number;
  invoices: { id: string; label: string; amount: number; date: string; status: string }[];
}

/** Whether the plan unlocks Legal Verification requests (doc §1). */
export function planIncludesLegalVerification(plan: PmPlan | string | undefined): boolean {
  return plan === "Standard" || plan === "Premium" || plan === "Featured";
}

/** Allowance for the plan; null = unlimited. Basic = 0. */
export function planLegalVerificationAllowance(plan: PmPlan | string | undefined): number | null {
  if (plan === "Featured") return null;
  if (plan === "Premium") return 5;
  if (plan === "Standard") return 2;
  return 0;
}

export interface PropertyListingRecord {
  _id: string;
  /** Product stream on 2Bigha — buy / sell / farm, or "pm" (see @/lib/crm/property-management). */
  listingBucket: PropertyRecordBucket;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  district?: string;
  village?: string;
  tehsil?: string;
  zipCode?: string;
  country?: string;
  price: number;
  currency?: string;
  propertyType: PropertyListingType;
  listedFor: PropertyListingFor;
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  /** Area in Bigha (Rajasthan / 2Bigha convention ≈ 3,025 sq. yd). */
  areaBigha?: number;
  /** Generic numeric area — use with areaUnit (PM + multi-unit marketplace). */
  areaValue?: number;
  areaUnit?: AreaUnit;
  viewCount?: number;
  likeCount?: number;
  verified?: boolean;
  status: PropertyListingStatus;
  approvalStatus: PropertyListingApprovalStatus;
  description?: string;
  images: string[];
  amenities: string[];
  listedDate?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  leadId?: string;
  /** PM-only */
  pmPlan?: PmPlan;
  khasraNumber?: string;
  googleMapsLink?: string;
  pmStage?: PmPipelineStage;
  rmAssigneeName?: string;
  legalAssigneeName?: string;
  fieldAssigneeName?: string;
  legalVerification?: PmLegalVerification;
  fieldVisit?: PmFieldVisit;
  visitReport?: PmVisitReport;
  /**
   * Subscription Legal Verification request (doc §§2–8) — marketplace / listed
   * properties. Not the PM pipeline legal checklist.
   */
  propertyLegal?: PropertyLegalVerification;
  /** Supporting docs for legal review (name + url). */
  documents?: { name: string; url: string; uploadedAt?: string }[];
  twobighaPropertyId?: string;
  twobighaSyncStatus?: string;
  // Detailed land & property fields
  murabbaNumber?: string;
  khewatNumber?: string;
  pricePerUnit?: string;
  waterLevel?: number;
  landMark?: string[];
  landMarkName?: string;
  category?: string;
  highwayConn?: boolean;
  landZoning?: string;
  ownersCount?: number;
  ownershipYes?: boolean;
  soilType?: string;
  roadAccess?: boolean;
  roadAccessDistance?: number;
  roadAccessWidth?: number;
  roadAccessDistanceUnit?: string;
  listerType?: string;
  whatsappNumber?: string;
  mapBoundaries?: any;
  mapCoordinates?: any;
  mapLocation?: any;
  createdAt: string;
  updatedAt: string;
}

export const PROPERTY_TYPES: PropertyListingType[] = [
  "Apartment",
  "Villa",
  "Independent House",
  "Plot",
  "Commercial",
  "Office",
  "Warehouse",
  "Farm",
  "Agricultural",
  "Residential",
  "Industrial",
  "Farmhouse",
  "Farmland",
  "Other",
];

export const PROPERTY_STATUSES: PropertyListingStatus[] = [
  "Available",
  "Sold",
  "Managed",
];

/** Rajasthan / 2Bigha: 1 Bigha ≈ 3,025.006 sq. yd (matches consumer app cards). */
export const SQYD_PER_BIGHA = 3025.006;
export const SQFT_PER_BIGHA = SQYD_PER_BIGHA * 9;

export function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "available") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "managed" || s === "under offer") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "sold") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

/** Maps a listing status to the shared `CrmStatusBadge` tone palette. */
export type PropertyStatusBadgeTone = "success" | "warning" | "info" | "neutral";
export function statusBadgeTone(status: string | undefined | null): PropertyStatusBadgeTone {
  const s = (status || "").toLowerCase();
  if (s === "available") return "success";
  if (s === "managed" || s === "under offer") return "warning";
  if (s === "sold") return "info";
  return "neutral";
}

export const PROPERTY_APPROVAL_STATUSES: PropertyListingApprovalStatus[] = [
  "Pending",
  "Approved",
  "Rejected",
];

/** Maps an approval status to the shared `CrmStatusBadge` tone palette. */
export function approvalStatusBadgeTone(status: string | undefined | null): PropertyStatusBadgeTone {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "success";
  if (s === "rejected") return "neutral";
  return "warning";
}

export function legalStatusBadgeTone(
  status: PropertyLegalStatus | string | undefined,
): PropertyStatusBadgeTone {
  const s = (status || "").toLowerCase();
  if (s === "verified") return "success";
  if (s === "rejected") return "neutral";
  return "warning";
}

export interface PropertyListingStats {
  total: number;
  byStatus: Record<string, number>;
  byBucket?: Record<string, number>;
  byPmStage?: Record<string, number>;
  totalValue: number;
  availableValue: number;
}

export function formatPrice(price: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

export function formatAddress(
  p: Pick<PropertyListingRecord, "address" | "city" | "state" | "district" | "village">,
): string {
  return [p.address, p.village, p.city, p.district, p.state].filter(Boolean).join(", ") || "—";
}

/** Compact currency for KPI tiles, e.g. "₹1.2Cr" / "₹85L" via Intl compact notation. */
export function formatCompactPrice(price: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(price);
  } catch {
    return formatPrice(price, currency);
  }
}

function trimNum(n: number, maxFrac = 2): string {
  return Number(n.toFixed(maxFrac)).toLocaleString("en-IN", {
    maximumFractionDigits: maxFrac,
  });
}

/**
 * Consumer-app style amounts: "₹ 1 Cr", "₹ 10 Lakh", "₹ 77 Lakh".
 * Falls back to standard currency formatting under ₹1 Lakh.
 */
export function formatIndianLandAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "—";
  if (amount >= 1_00_00_000) {
    return `₹ ${trimNum(amount / 1_00_00_000)} Cr`;
  }
  if (amount >= 1_00_000) {
    return `₹ ${trimNum(amount / 1_00_000)} Lakh`;
  }
  return formatPrice(amount);
}

export function resolveAreaBigha(
  listing: Pick<PropertyListingRecord, "areaBigha" | "areaSqft" | "areaValue" | "areaUnit">,
): number | null {
  if (typeof listing.areaBigha === "number" && listing.areaBigha > 0) {
    return listing.areaBigha;
  }
  if (listing.areaUnit === "Bigha" && typeof listing.areaValue === "number" && listing.areaValue > 0) {
    return listing.areaValue;
  }
  if (typeof listing.areaSqft === "number" && listing.areaSqft > 0) {
    return listing.areaSqft / SQFT_PER_BIGHA;
  }
  return null;
}

export function formatListingArea(listing: PropertyListingRecord): string {
  if (typeof listing.areaValue === "number" && listing.areaUnit) {
    return `${listing.areaValue} ${listing.areaUnit}`;
  }
  const bigha = resolveAreaBigha(listing);
  if (bigha != null) return `${Number(bigha.toFixed(2))} Bigha`;
  if (typeof listing.areaSqft === "number") return `${listing.areaSqft} sqft`;
  return "—";
}

export function areaBighaToSqYd(bigha: number): number {
  return bigha * SQYD_PER_BIGHA;
}

/** Rate per Bigha, e.g. "₹ 10 Lakh/ Bigha". */
export function formatRatePerBigha(price: number, areaBigha: number | null): string | null {
  if (!areaBigha || areaBigha <= 0 || !Number.isFinite(price)) return null;
  return `${formatIndianLandAmount(price / areaBigha)}/ Bigha`;
}

export function daysOnPlatform(listing: Pick<PropertyListingRecord, "listedDate" | "createdAt">): number {
  const raw = listing.listedDate || listing.createdAt;
  const start = new Date(raw).getTime();
  if (!Number.isFinite(start)) return 0;
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/** Display label aligned with 2Bigha consumer cards. */
export function displayPropertyType(type: string): string {
  if (type === "Farm" || type === "Farmland") return "Agricultural";
  return type;
}

