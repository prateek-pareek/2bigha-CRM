/**
 * Mock third-party property feed (in-memory + localStorage).
 * Covers Buy / Sell / Farms marketplace + Property Management (subscription) streams.
 */

import type {
  AreaUnit,
  PropertyLegalStatus,
  PropertyListingApprovalStatus,
  PropertyListingFor,
  PropertyListingRecord,
  PropertyListingStats,
  PropertyListingStatus,
  PropertyListingType,
  PropertyRecordBucket,
  LeadSubscriptionMock,
} from "./types";
import {
  planIncludesLegalVerification,
  planLegalVerificationAllowance,
} from "./types";
import type { PmPipelineStage, PmPlan } from "@/lib/crm/property-management/types";
import {
  DEFAULT_LEGAL_CHECKLIST,
  DEFAULT_REPORT_SECTIONS,
} from "@/lib/crm/property-management/types";

/**
 * Legal reviewer pool for the subscription Legal Verification queue
 * (@/app/crm/legal/verification) — distinct from PM's own legal-team pool
 * (PM_LEGAL_POOL in @/lib/crm/property-management), even though today's
 * mock data happens to use the same names.
 */
export const LEGAL_REVIEWER_POOL = ["Priya Desai (Legal)", "Ankit Verma (Legal)"];

const STORAGE_KEY = "crm_tp_property_listings_v5";

const MOCK_IMAGES = [
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80",
  "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&q=80",
  "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=800&q=80",
  "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&q=80",
];

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const SEED_LISTINGS: PropertyListingRecord[] = [
  {
    _id: "tp_listing_001",
    listingBucket: "sell",
    title: "Agricultural land near Dudu",
    address: "H7W3+588, Dudu, Dhani Nanu",
    city: "Dudu",
    state: "Rajasthan",
    price: 1_00_00_000,
    currency: "INR",
    propertyType: "Agricultural",
    listedFor: "Sale",
    areaBigha: 10,
    areaValue: 10,
    areaUnit: "Bigha",
    viewCount: 379,
    likeCount: 3,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[0], MOCK_IMAGES[1], MOCK_IMAGES[2]],
    amenities: [],
    contactName: "Ramesh Singh",
    contactPhone: "+919876543210",
    contactEmail: "ramesh.singh@example.com",
    leadId: "mock_lead_legal_demo",
    documents: [
      { name: "Title deed.pdf", url: "#", uploadedAt: daysAgoIso(20) },
      { name: "Khasra extract.pdf", url: "#", uploadedAt: daysAgoIso(18) },
    ],
    propertyLegal: {
      status: "Pending",
      requestedAt: daysAgoIso(2),
      assignedTo: "Priya Desai (Legal)",
      priorNotes: [
        {
          text: "Previous pass: asked for updated khasra — owner re-submitted.",
          at: daysAgoIso(120),
          by: "Priya Desai (Legal)",
        },
      ],
    },
    listedDate: daysAgoIso(29),
    createdAt: daysAgoIso(29),
    updatedAt: daysAgoIso(1),
  },
  {
    _id: "tp_listing_002",
    listingBucket: "buy",
    title: "Farm plot — Sultaniya",
    address: "JGMX+HM Sultaniya, Dudu",
    city: "Dudu",
    state: "Rajasthan",
    price: 2_10_00_000,
    currency: "INR",
    propertyType: "Agricultural",
    listedFor: "Sale",
    areaBigha: 4.5,
    areaValue: 4.5,
    areaUnit: "Bigha",
    viewCount: 241,
    likeCount: 2,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[1], MOCK_IMAGES[0]],
    amenities: [],
    contactName: "Meena Devi",
    contactPhone: "+919812345678",
    leadId: "mock_lead_legal_demo",
    documents: [
      { name: "Sale agreement draft.pdf", url: "#", uploadedAt: daysAgoIso(4) },
    ],
    propertyLegal: {
      status: "Verified",
      requestedAt: daysAgoIso(14),
      reviewedAt: daysAgoIso(10),
      reviewedBy: "Ankit Verma (Legal)",
      assignedTo: "Ankit Verma (Legal)",
      notes: "Title chain clear; boundaries match survey.",
      report: {
        fileName: "Legal_Report_Sultaniya.pdf",
        uploadedAt: daysAgoIso(10),
        url: "#",
      },
    },
    listedDate: daysAgoIso(1),
    createdAt: daysAgoIso(1),
    updatedAt: daysAgoIso(0),
  },
  {
    _id: "tp_listing_003",
    listingBucket: "farm",
    title: "Agricultural land — Dhakia Kalan",
    address: "Dhakia Kalan, Udham Singh Nagar",
    city: "Udham Singh Nagar",
    state: "Uttarakhand",
    price: 77_00_000,
    currency: "INR",
    propertyType: "Agricultural",
    listedFor: "Sale",
    areaBigha: 3.5,
    areaValue: 3.5,
    areaUnit: "Bigha",
    viewCount: 148,
    likeCount: 3,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[2], MOCK_IMAGES[3], MOCK_IMAGES[0]],
    amenities: [],
    contactName: "Vikram Rawat",
    contactPhone: "+919700112233",
    leadId: "mock_lead_legal_demo",
    propertyLegal: {
      status: "Rejected",
      requestedAt: daysAgoIso(21),
      reviewedAt: daysAgoIso(18),
      reviewedBy: "Priya Desai (Legal)",
      assignedTo: "Priya Desai (Legal)",
      rejectionReason:
        "Encumbrance certificate shows an open mortgage — clear lien before re-request.",
      notes: "Spoke with owner on call; they will share bank NOC.",
    },
    listedDate: daysAgoIso(27),
    createdAt: daysAgoIso(27),
    updatedAt: daysAgoIso(2),
  },
  {
    _id: "tp_listing_004",
    listingBucket: "sell",
    title: "Irrigated farmland — Jaipur outskirts",
    address: "Near Bagru, Jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    price: 1_50_00_000,
    currency: "INR",
    propertyType: "Agricultural",
    listedFor: "Sale",
    areaBigha: 6,
    areaValue: 6,
    areaUnit: "Bigha",
    viewCount: 512,
    likeCount: 8,
    verified: true,
    status: "Under Offer",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[3], MOCK_IMAGES[1]],
    amenities: [],
    contactName: "Suresh Agarwal",
    contactPhone: "+919888776655",
    leadId: "mock_lead_legal_demo",
    listedDate: daysAgoIso(12),
    createdAt: daysAgoIso(12),
    updatedAt: daysAgoIso(0),
  },
  {
    _id: "tp_listing_005",
    listingBucket: "buy",
    title: "Plot with road access — Ajmer Road",
    address: "Ajmer Road, Jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    price: 90_00_000,
    currency: "INR",
    propertyType: "Plot",
    listedFor: "Sale",
    areaBigha: 2,
    areaValue: 2,
    areaUnit: "Bigha",
    viewCount: 89,
    likeCount: 1,
    status: "Available",
    approvalStatus: "Pending",
    images: [MOCK_IMAGES[0]],
    amenities: [],
    contactName: "Anita Sharma",
    contactPhone: "+919911223344",
    leadId: "mock_lead_legal_basic",
    listedDate: daysAgoIso(5),
    createdAt: daysAgoIso(5),
    updatedAt: daysAgoIso(5),
  },
  {
    _id: "tp_pm_001",
    listingBucket: "pm",
    title: "PM — Agricultural land, Phagi",
    address: "HHJF+92 Phagi",
    city: "Phagi",
    district: "Jaipur",
    state: "Rajasthan",
    village: "Phagi",
    tehsil: "Phagi",
    zipCode: "303005",
    price: 0,
    currency: "INR",
    propertyType: "Agricultural",
    listedFor: "Sale",
    areaValue: 5,
    areaUnit: "Bigha",
    areaBigha: 5,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[0]],
    amenities: [],
    pmPlan: "Premium",
    khasraNumber: "112/3",
    googleMapsLink: "https://maps.google.com/?q=26.87,75.55",
    pmStage: "Assigned to RM",
    rmAssigneeName: "Asha Mehta (RM)",
    legalVerification: { status: "Not started", checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST) },
    fieldVisit: { status: "Pending" },
    leadId: "mock_lead_pm_demo",
    listedDate: daysAgoIso(9),
    createdAt: daysAgoIso(9),
    updatedAt: daysAgoIso(1),
  },
  {
    _id: "tp_pm_002",
    listingBucket: "pm",
    title: "PM — Residential plot, Udaipur",
    address: "RJG7+53 Gadriya Ka Gurha",
    city: "Udaipur",
    district: "Udaipur",
    state: "Rajasthan",
    village: "Gadriya Ka Gurha",
    tehsil: "Girwa",
    zipCode: "313001",
    price: 0,
    currency: "INR",
    propertyType: "Residential",
    listedFor: "Sale",
    areaValue: 19.132,
    areaUnit: "Bigha",
    areaBigha: 19.132,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[1]],
    amenities: [],
    pmPlan: "Featured",
    khasraNumber: "45/1",
    googleMapsLink: "https://maps.google.com/?q=24.58,73.68",
    pmStage: "Assigned to Legal",
    rmAssigneeName: "Ravi Sharma (RM)",
    legalAssigneeName: "Priya Desai (Legal)",
    legalVerification: {
      status: "In progress",
      startedAt: daysAgoIso(3),
      summary: "Reviewing ownership & khasra match",
      checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST).map((c, i) =>
        i === 0 ? { ...c, checked: true } : c,
      ),
    },
    fieldVisit: { status: "Pending" },
    listedDate: daysAgoIso(24),
    createdAt: daysAgoIso(24),
    updatedAt: daysAgoIso(2),
  },
  {
    _id: "tp_pm_003",
    listingBucket: "pm",
    title: "PM — Farmland, North Gola Range",
    address: "FQ65+WP North Gola Range",
    city: "Haldwani",
    district: "Nainital",
    state: "Uttarakhand",
    village: "North Gola Range",
    zipCode: "263139",
    price: 0,
    currency: "INR",
    propertyType: "Farmland",
    listedFor: "Sale",
    areaValue: 1920,
    areaUnit: "Sq. Yard",
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[2]],
    amenities: [],
    pmPlan: "Standard",
    khasraNumber: "88/2",
    googleMapsLink: "https://maps.google.com/?q=29.22,79.52",
    pmStage: "Assigned to Field Agent",
    rmAssigneeName: "Asha Mehta (RM)",
    legalAssigneeName: "Ankit Verma (Legal)",
    fieldAssigneeName: "Suresh Yadav (Field)",
    legalVerification: {
      status: "Completed",
      startedAt: daysAgoIso(10),
      completedAt: daysAgoIso(5),
      summary: "All document checks passed",
      checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST).map((c) => ({ ...c, checked: true })),
    },
    fieldVisit: { status: "Pending", scheduledAt: daysAgoIso(-2) },
    listedDate: daysAgoIso(18),
    createdAt: daysAgoIso(18),
    updatedAt: daysAgoIso(0),
  },
  {
    _id: "tp_pm_004",
    listingBucket: "pm",
    title: "PM — Commercial warehouse, Alwar",
    address: "9QR8+37 Bader",
    city: "Alwar",
    district: "Alwar",
    state: "Rajasthan",
    village: "Bader",
    tehsil: "Alwar",
    zipCode: "301001",
    price: 0,
    currency: "INR",
    propertyType: "Warehouse",
    listedFor: "Sale",
    areaValue: 3,
    areaUnit: "Bigha",
    areaBigha: 3,
    status: "Available",
    approvalStatus: "Approved",
    images: [MOCK_IMAGES[3]],
    amenities: [],
    pmPlan: "Basic",
    khasraNumber: "201/7",
    googleMapsLink: "https://maps.google.com/?q=27.55,76.63",
    pmStage: "Visit Report Pending",
    rmAssigneeName: "Ravi Sharma (RM)",
    legalAssigneeName: "Priya Desai (Legal)",
    fieldAssigneeName: "Neha Singh (Field)",
    legalVerification: {
      status: "Completed",
      startedAt: daysAgoIso(15),
      completedAt: daysAgoIso(12),
      summary: "Docs verified",
      checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST).map((c) => ({ ...c, checked: true })),
    },
    fieldVisit: {
      status: "Complete",
      scheduledAt: daysAgoIso(4),
      completedAt: daysAgoIso(2),
      notes: "Site accessible; markers present",
    },
    visitReport: {
      status: "Pending",
      submittedAt: daysAgoIso(2),
      sections: structuredClone(DEFAULT_REPORT_SECTIONS).map((s) => ({ ...s, checked: true })),
    },
    listedDate: daysAgoIso(23),
    createdAt: daysAgoIso(23),
    updatedAt: daysAgoIso(1),
  },
];

export const MOCK_THIRD_PARTY_LISTINGS = SEED_LISTINGS;

export type ThirdPartyListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  approvalStatus?: string;
  listedFor?: string;
  leadId?: string;
  listingBucket?: PropertyRecordBucket | "all";
  pmStage?: string;
  /** Subscription Legal Verification status filter (doc §3). */
  legalStatus?: PropertyLegalStatus | "all" | "queued";
  /** Sort legal queue by request time. */
  legalSort?: "requestedAt_desc" | "requestedAt_asc";
  /** ISO date — only requests on/after this day. */
  legalRequestedAfter?: string;
  /** Filter by assigned legal reviewer (or "unassigned"). */
  legalAssignee?: string;
};

export type CreateThirdPartyPropertyInput = {
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
  price?: number;
  currency?: string;
  propertyType: PropertyListingType;
  listedFor?: PropertyListingFor;
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  areaBigha?: number;
  areaValue?: number;
  areaUnit?: AreaUnit;
  status?: PropertyListingStatus;
  approvalStatus?: PropertyListingApprovalStatus;
  description?: string;
  images?: string[];
  amenities?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  leadId?: string;
  pmPlan?: PmPlan;
  khasraNumber?: string;
  googleMapsLink?: string;
  pmStage?: PmPipelineStage;
  verified?: boolean;
};

export type UpdateThirdPartyPropertyInput = Partial<CreateThirdPartyPropertyInput>;

function delay(ms = 350): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getStore(): PropertyListingRecord[] {
  if (typeof window === "undefined") return [...SEED_LISTINGS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PropertyListingRecord[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* fall through */
  }
  const seed = structuredClone(SEED_LISTINGS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function setStore(listings: PropertyListingRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

function matchesQuery(listing: PropertyListingRecord, q: ThirdPartyListQuery): boolean {
  if (q.listingBucket && q.listingBucket !== "all" && listing.listingBucket !== q.listingBucket) {
    return false;
  }
  if (q.status && q.status !== "all" && listing.status !== q.status) return false;
  if (q.approvalStatus && listing.approvalStatus !== q.approvalStatus) return false;
  if (q.listedFor && q.listedFor !== "all" && listing.listedFor !== q.listedFor) return false;
  if (q.leadId && listing.leadId !== q.leadId) return false;
  if (q.pmStage && q.pmStage !== "all" && listing.pmStage !== q.pmStage) return false;
  if (q.legalStatus && q.legalStatus !== "all") {
    if (q.legalStatus === "queued") {
      if (!listing.propertyLegal) return false;
    } else if (listing.propertyLegal?.status !== q.legalStatus) {
      return false;
    }
  }
  if (q.legalAssignee && q.legalAssignee !== "all") {
    if (q.legalAssignee === "unassigned") {
      if (listing.propertyLegal?.assignedTo) return false;
    } else if (listing.propertyLegal?.assignedTo !== q.legalAssignee) {
      return false;
    }
  }
  if (q.legalRequestedAfter) {
    const after = new Date(q.legalRequestedAfter).getTime();
    const requested = listing.propertyLegal?.requestedAt
      ? new Date(listing.propertyLegal.requestedAt).getTime()
      : 0;
    if (!requested || requested < after) return false;
  }
  const search = q.search?.trim().toLowerCase();
  if (search) {
    const hay = [
      listing.title,
      listing.address,
      listing.city,
      listing.state,
      listing.district,
      listing.village,
      listing.khasraNumber,
      listing.description,
      listing.contactName,
      listing.contactPhone,
      listing.contactEmail,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(search)) return false;
  }
  return true;
}

export async function fetchThirdPartyPropertyListings(
  query: ThirdPartyListQuery = {},
): Promise<{ data: PropertyListingRecord[]; total: number; page: number; pageSize: number }> {
  await delay();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(Math.max(1, query.pageSize || 25), 200);
  const filtered = getStore().filter((l) => matchesQuery(l, query));
  if (query.legalSort === "requestedAt_asc" || query.legalSort === "requestedAt_desc") {
    const dir = query.legalSort === "requestedAt_asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const ta = a.propertyLegal?.requestedAt
        ? new Date(a.propertyLegal.requestedAt).getTime()
        : 0;
      const tb = b.propertyLegal?.requestedAt
        ? new Date(b.propertyLegal.requestedAt).getTime()
        : 0;
      return (ta - tb) * dir;
    });
  }
  const start = (page - 1) * pageSize;
  return {
    data: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}

export async function fetchThirdPartyPropertyById(
  id: string,
): Promise<PropertyListingRecord | null> {
  await delay(200);
  return getStore().find((l) => l._id === id) ?? null;
}

export async function fetchThirdPartyPropertyStats(
  listingBucket?: PropertyRecordBucket | "all",
): Promise<PropertyListingStats> {
  await delay(200);
  const listings =
    listingBucket && listingBucket !== "all"
      ? getStore().filter((l) => l.listingBucket === listingBucket)
      : getStore();
  const byStatus: Record<string, number> = {};
  const byBucket: Record<string, number> = {};
  const byPmStage: Record<string, number> = {};
  let totalValue = 0;
  let availableValue = 0;
  for (const l of listings) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    byBucket[l.listingBucket] = (byBucket[l.listingBucket] || 0) + 1;
    if (l.pmStage) byPmStage[l.pmStage] = (byPmStage[l.pmStage] || 0) + 1;
    totalValue += l.price || 0;
    if (l.status === "Available") availableValue += l.price || 0;
  }
  return {
    total: listings.length,
    byStatus,
    byBucket,
    byPmStage,
    totalValue,
    availableValue,
  };
}

export async function createThirdPartyProperty(
  input: CreateThirdPartyPropertyInput,
): Promise<PropertyListingRecord> {
  await delay(450);
  const now = new Date().toISOString();
  const isPm = input.listingBucket === "pm";
  const listing: PropertyListingRecord = {
    _id: `tp_${isPm ? "pm" : "listing"}_${Date.now().toString(36)}`,
    listingBucket: input.listingBucket,
    title: input.title.trim(),
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || undefined,
    state: input.state?.trim() || undefined,
    district: input.district?.trim() || undefined,
    village: input.village?.trim() || undefined,
    tehsil: input.tehsil?.trim() || undefined,
    zipCode: input.zipCode?.trim() || undefined,
    country: input.country?.trim() || undefined,
    price: input.price ?? 0,
    currency: input.currency || "INR",
    propertyType: input.propertyType,
    listedFor: input.listedFor || "Sale",
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    areaSqft: input.areaSqft,
    areaBigha: input.areaBigha,
    areaValue: input.areaValue,
    areaUnit: input.areaUnit,
    viewCount: 0,
    likeCount: 0,
    verified: input.verified,
    status: input.status || "Available",
    approvalStatus: input.approvalStatus || (isPm ? "Approved" : "Pending"),
    description: input.description?.trim() || undefined,
    images: input.images?.length ? input.images : [MOCK_IMAGES[0]],
    amenities: input.amenities || [],
    listedDate: now,
    contactName: input.contactName?.trim() || undefined,
    contactPhone: input.contactPhone?.trim() || undefined,
    contactEmail: input.contactEmail?.trim() || undefined,
    leadId: input.leadId,
    pmPlan: input.pmPlan,
    khasraNumber: input.khasraNumber?.trim() || undefined,
    googleMapsLink: input.googleMapsLink?.trim() || undefined,
    pmStage: isPm ? input.pmStage || "Property Submitted" : undefined,
    legalVerification: isPm
      ? { status: "Not started", checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST) }
      : undefined,
    fieldVisit: isPm ? { status: "Pending" } : undefined,
    createdAt: now,
    updatedAt: now,
  };
  setStore([listing, ...getStore()]);
  return listing;
}

export async function updateThirdPartyProperty(
  id: string,
  input: UpdateThirdPartyPropertyInput,
): Promise<PropertyListingRecord> {
  await delay(400);
  const store = getStore();
  const idx = store.findIndex((l) => l._id === id);
  if (idx < 0) throw new Error("Listing not found");
  const prev = store[idx];
  const updated: PropertyListingRecord = {
    ...prev,
    ...input,
    title: input.title?.trim() ?? prev.title,
    address: input.address !== undefined ? input.address.trim() || undefined : prev.address,
    city: input.city !== undefined ? input.city.trim() || undefined : prev.city,
    state: input.state !== undefined ? input.state.trim() || undefined : prev.state,
    description:
      input.description !== undefined ? input.description.trim() || undefined : prev.description,
    images: input.images ?? prev.images,
    updatedAt: new Date().toISOString(),
  };
  const next = [...store];
  next[idx] = updated;
  setStore(next);
  return updated;
}

export async function deleteThirdPartyProperty(id: string): Promise<void> {
  await delay(300);
  setStore(getStore().filter((l) => l._id !== id));
}

/**
 * Generic patch helper shared by every mutation on the one third-party
 * listings collection (marketplace, subscription-legal, and — via
 * @/lib/crm/property-management/mock-pm — PM pipeline updates).
 */
export async function patchPropertyListing(
  id: string,
  patch: Partial<PropertyListingRecord>,
): Promise<PropertyListingRecord> {
  await delay(350);
  const store = getStore();
  const idx = store.findIndex((l) => l._id === id);
  if (idx < 0) throw new Error("Listing not found");
  const updated: PropertyListingRecord = {
    ...store[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const next = [...store];
  next[idx] = updated;
  setStore(next);
  return updated;
}

/** Mock subscription bound to a lead (PM doc §2 + Legal Verification doc §1). */
export async function fetchLeadSubscriptionMock(
  leadId: string,
): Promise<LeadSubscriptionMock | null> {
  await delay(200);
  if (!leadId) return null;
  const store = getStore();
  const pmForLead = store.filter((l) => l.listingBucket === "pm" && l.leadId === leadId);
  const marketplaceForLead = store.filter(
    (l) => l.listingBucket !== "pm" && l.leadId === leadId,
  );

  let plan: PmPlan = pmForLead[0]?.pmPlan || "Standard";
  if (leadId === "mock_lead_legal_basic") plan = "Basic";
  if (leadId === "mock_lead_legal_demo" && !pmForLead[0]?.pmPlan) plan = "Premium";

  const legalUsed = marketplaceForLead.filter((l) => !!l.propertyLegal).length;
  const allowance = planLegalVerificationAllowance(plan);
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 6);
  return {
    plan,
    expiryDate: expiry.toISOString(),
    featuredUsed: Math.min(pmForLead.length, 2),
    featuredAllowance: plan === "Featured" ? 10 : plan === "Premium" ? 5 : 2,
    includesLegalVerification: planIncludesLegalVerification(plan),
    legalVerificationAllowance: allowance,
    legalVerificationUsed: legalUsed,
    invoices: [
      {
        id: `inv_${leadId.slice(0, 6)}_1`,
        label: `${plan} plan — annual`,
        amount: plan === "Featured" ? 49999 : plan === "Premium" ? 29999 : 14999,
        date: daysAgoIso(40),
        status: "Paid",
      },
    ],
  };
}

/** Legal Verification queue — properties with a subscription legal request (doc §3). */
export async function fetchLegalVerificationQueue(
  query: ThirdPartyListQuery = {},
): Promise<{ data: PropertyListingRecord[]; total: number; page: number; pageSize: number }> {
  return fetchThirdPartyPropertyListings({
    ...query,
    legalStatus: query.legalStatus || "queued",
    listingBucket: query.listingBucket || "all",
    legalSort: query.legalSort || "requestedAt_desc",
  });
}

/**
 * Client requests Legal Verification for a listed property (doc §2).
 * Gated by subscription entitlement (doc §1).
 */
export async function requestPropertyLegalVerification(
  propertyId: string,
): Promise<PropertyListingRecord> {
  await delay(350);
  const current = getStore().find((l) => l._id === propertyId);
  if (!current) throw new Error("Property not found");
  if (current.listingBucket === "pm") {
    throw new Error("Use the PM pipeline legal step for Property Management cases");
  }
  if (current.propertyLegal?.status === "Pending") {
    throw new Error("A legal verification request is already pending");
  }

  const leadId = current.leadId || "";
  const sub = await fetchLeadSubscriptionMock(leadId);
  if (!sub?.includesLegalVerification) {
    throw new Error("Active plan does not include Legal Verification");
  }
  if (
    sub.legalVerificationAllowance != null &&
    sub.legalVerificationUsed >= sub.legalVerificationAllowance &&
    !current.propertyLegal
  ) {
    throw new Error("Legal Verification allowance exhausted for this plan");
  }

  const priorNotes = current.propertyLegal
    ? [
        ...(current.propertyLegal.priorNotes || []),
        ...(current.propertyLegal.notes
          ? [
              {
                text: current.propertyLegal.notes,
                at: current.propertyLegal.reviewedAt || current.propertyLegal.requestedAt,
                by: current.propertyLegal.reviewedBy,
              },
            ]
          : []),
        ...(current.propertyLegal.rejectionReason
          ? [
              {
                text: `Rejected: ${current.propertyLegal.rejectionReason}`,
                at: current.propertyLegal.reviewedAt || current.propertyLegal.requestedAt,
                by: current.propertyLegal.reviewedBy,
              },
            ]
          : []),
      ]
    : undefined;

  return patchPropertyListing(propertyId, {
    propertyLegal: {
      status: "Pending",
      requestedAt: new Date().toISOString(),
      priorNotes: priorNotes?.length ? priorNotes : undefined,
      noteHistory: current.propertyLegal?.noteHistory,
    },
  });
}

/** Decide Verified / Rejected, or move back to Pending (doc §§4, 8). */
export async function decidePropertyLegalVerification(
  propertyId: string,
  input: {
    status: PropertyLegalStatus;
    reviewedBy?: string;
    notes?: string;
    rejectionReason?: string;
  },
): Promise<PropertyListingRecord> {
  await delay(350);
  const current = getStore().find((l) => l._id === propertyId);
  if (!current?.propertyLegal) throw new Error("No legal verification request on this property");
  if (input.status === "Rejected" && !String(input.rejectionReason || "").trim()) {
    throw new Error("Rejection reason is required");
  }
  const now = new Date().toISOString();
  const reviewer = input.reviewedBy || LEGAL_REVIEWER_POOL[0];
  const noteHistory = [...(current.propertyLegal.noteHistory || [])];
  if (input.notes?.trim()) {
    noteHistory.push({ text: input.notes.trim(), at: now, by: reviewer });
  }
  return patchPropertyListing(propertyId, {
    propertyLegal: {
      ...current.propertyLegal,
      status: input.status,
      reviewedAt: input.status === "Pending" ? undefined : now,
      reviewedBy: input.status === "Pending" ? undefined : reviewer,
      assignedTo: input.reviewedBy || current.propertyLegal.assignedTo || reviewer,
      notes: input.notes ?? current.propertyLegal.notes,
      rejectionReason:
        input.status === "Rejected"
          ? String(input.rejectionReason).trim()
          : input.status === "Pending"
            ? undefined
            : current.propertyLegal.rejectionReason,
      noteHistory,
    },
  });
}

export async function assignPropertyLegalReviewer(
  propertyId: string,
  assignedTo: string,
): Promise<PropertyListingRecord> {
  const current = getStore().find((l) => l._id === propertyId);
  if (!current?.propertyLegal) throw new Error("No legal verification request on this property");
  return patchPropertyListing(propertyId, {
    propertyLegal: {
      ...current.propertyLegal,
      assignedTo: assignedTo.trim() || undefined,
    },
  });
}

/** Request legal verification for multiple marketplace properties (doc §2). */
export async function requestPropertyLegalVerificationBatch(
  propertyIds: string[],
): Promise<{ ok: PropertyListingRecord[]; errors: { id: string; message: string }[] }> {
  const ok: PropertyListingRecord[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const id of propertyIds) {
    try {
      ok.push(await requestPropertyLegalVerification(id));
    } catch (e) {
      errors.push({
        id,
        message: e instanceof Error ? e.message : "Request failed",
      });
    }
  }
  return { ok, errors };
}

export async function addPropertyLegalNote(
  propertyId: string,
  text: string,
  by?: string,
): Promise<PropertyListingRecord> {
  await delay(250);
  const current = getStore().find((l) => l._id === propertyId);
  if (!current?.propertyLegal) throw new Error("No legal verification request on this property");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Note text is required");
  const now = new Date().toISOString();
  const author = by || LEGAL_REVIEWER_POOL[0];
  return patchPropertyListing(propertyId, {
    propertyLegal: {
      ...current.propertyLegal,
      notes: trimmed,
      noteHistory: [
        ...(current.propertyLegal.noteHistory || []),
        { text: trimmed, at: now, by: author },
      ],
    },
  });
}

export async function attachPropertyLegalReport(
  propertyId: string,
  fileName: string,
  url?: string,
): Promise<PropertyListingRecord> {
  await delay(300);
  const current = getStore().find((l) => l._id === propertyId);
  if (!current?.propertyLegal) throw new Error("No legal verification request on this property");
  const name = fileName.trim() || "Legal_Report.pdf";
  return patchPropertyListing(propertyId, {
    propertyLegal: {
      ...current.propertyLegal,
      report: {
        fileName: name,
        uploadedAt: new Date().toISOString(),
        url: url || "#",
      },
    },
  });
}
