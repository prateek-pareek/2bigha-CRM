import type { CrmStatusTone } from "@/components/crm/ui";
import type {
  AdminMini,
  FieldVisitReportSummary,
  FieldVisitStatus,
  TwoBighaUserMini,
  VisitReportGeoPhoto,
  VisitReportMedia,
  VisitReportStatus,
  VisitRequestProperty,
  VisitRequestStatus,
} from "@/lib/crm/twobigha-visits-api";

export const FIELD_VISIT_STATUSES: FieldVisitStatus[] = [
  "SCHEDULED",
  "AGENT_ON_WAY",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
];

export const VISIT_REQUEST_STATUSES: VisitRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CLOSED",
  "SCHEDULED",
];

export const VISIT_REPORT_STATUSES: VisitReportStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
];

export const VISIT_CATEGORIES = ["PRE_VERIFICATION", "REGULAR", "MAINTENANCE", "EMERGENCY"] as const;

export function fieldVisitStatusTone(status?: string | null): CrmStatusTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "IN_PROGRESS":
    case "AGENT_ON_WAY":
      return "warning";
    case "SCHEDULED":
      return "info";
    case "MISSED":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function visitRequestStatusTone(status?: string | null): CrmStatusTone {
  switch (status) {
    case "APPROVED":
    case "SCHEDULED":
      return "success";
    case "PENDING":
      return "warning";
    case "REJECTED":
      return "danger";
    case "CLOSED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function visitReportStatusTone(status?: string | null): CrmStatusTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "info";
    case "CHANGES_REQUESTED":
    case "DRAFT":
      return "warning";
    case "REJECTED":
      return "danger";
    default:
      return "neutral";
  }
}

export function formatVisitDate(value?: string | number | null): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function formatVisitDateShort(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function personName(
  person?: TwoBighaUserMini | AdminMini | { firstName?: string; lastName?: string; email?: string } | null,
): string {
  if (!person) return "—";
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return name || person.email || "—";
}

export function propertyLabel(property?: { title?: string; propertyName?: string; address?: string } | null): string {
  if (!property) return "—";
  return property.title || property.propertyName || property.address || "—";
}

export function formatVisitCategory(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatVisitStatus(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function visitCategoryTone(
  value?: string | null,
): "primary" | "success" | "warning" | "info" | "danger" | "secondary" {
  switch (value) {
    case "EMERGENCY":
      return "danger";
    case "MAINTENANCE":
      return "warning";
    case "PRE_VERIFICATION":
      return "info";
    default:
      return "secondary";
  }
}

export function personInitials(
  person?: { firstName?: string; lastName?: string; email?: string } | string | null,
): string {
  if (!person) return "?";
  if (typeof person === "string") {
    const parts = person.trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
  }
  const fromName = [person.firstName, person.lastName]
    .filter(Boolean)
    .map((p) => String(p)[0])
    .join("");
  if (fromName) return fromName.slice(0, 2).toUpperCase();
  return (person.email?.[0] || "?").toUpperCase();
}

export function formatVisitWhen(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatVisitRelative(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const past = diffMs < 0;
  const ago = (label: string) => (past ? `${label} ago` : `in ${label}`);
  if (mins < 1) return past ? "Just now" : "Now";
  if (mins < 60) return ago(`${mins}m`);
  if (hours < 24) return ago(`${hours}h`);
  if (days < 14) return ago(`${days}d`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function mapsUrl(lat?: string | null, lng?: string | null): string | null {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

export function asVisitPerson(
  value: unknown,
): { firstName?: string; lastName?: string; email?: string; phone?: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const firstName = typeof row.firstName === "string" ? row.firstName : undefined;
  const lastName = typeof row.lastName === "string" ? row.lastName : undefined;
  const email = typeof row.email === "string" ? row.email : undefined;
  const phone = typeof row.phone === "string" ? row.phone : undefined;
  if (!firstName && !lastName && !email && !phone) return null;
  return { firstName, lastName, email, phone };
}

const VISIT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVisitUuidLabel(value?: string | null): boolean {
  return !!value && VISIT_UUID_RE.test(value.trim());
}

export type VisitDisplayMedia = {
  key: string;
  url: string;
  alt: string;
  caption?: string;
  mediaType: "PHOTO" | "VIDEO" | "AUDIO";
};

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  return /^https?:\/\//i.test(url) || url.startsWith("//");
}

function pickVisitMediaUrl(raw: unknown): string | null {
  if (isHttpUrl(raw)) return raw.trim();
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const found = [row.mediaUrl, row.url, row.thumbnailUrl, row.imageUrl].find(isHttpUrl);
  return found ? found.trim() : null;
}

export function inferVisitMediaType(
  mediaType?: string | null,
  url?: string | null,
): VisitDisplayMedia["mediaType"] {
  const t = (mediaType || "").toUpperCase();
  if (t.includes("AUDIO")) return "AUDIO";
  if (t.includes("VIDEO")) return "VIDEO";
  const path = (url || "").toLowerCase();
  if (path.includes("/audio/") || /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(path)) return "AUDIO";
  if (path.includes("/videos/") || path.includes("/video/") || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(path)) {
    return "VIDEO";
  }
  return "PHOTO";
}

export function collectVisitReportMedia(report: {
  media?: VisitReportMedia[] | null;
  geoTaggedPhotos?: VisitReportGeoPhoto[] | null;
}): VisitDisplayMedia[] {
  const byUrl = new Map<string, VisitDisplayMedia>();
  const upsert = (item: VisitDisplayMedia) => {
    const existing = byUrl.get(item.url);
    if (!existing) {
      byUrl.set(item.url, item);
      return;
    }
    if (!existing.caption && item.caption) existing.caption = item.caption;
    if (existing.mediaType === "PHOTO" && item.mediaType !== "PHOTO") existing.mediaType = item.mediaType;
  };

  for (const photo of report.geoTaggedPhotos || []) {
    const url = pickVisitMediaUrl(photo.mediaUrl);
    if (!url) continue;
    upsert({
      key: `geo-${photo.id ?? url}`,
      url,
      alt: photo.altText || photo.caption || "Visit photo",
      caption: photo.caption || photo.gps || undefined,
      mediaType: "PHOTO",
    });
  }

  for (const item of report.media || []) {
    const url = pickVisitMediaUrl(item.mediaUrl);
    if (!url) continue;
    upsert({
      key: `media-${item.id ?? url}`,
      url,
      alt: item.altText || item.caption || "Visit media",
      caption: item.caption || undefined,
      mediaType: inferVisitMediaType(item.mediaType, url),
    });
  }

  return Array.from(byUrl.values());
}

function collectReviewedAt(node: unknown, into: string[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectReviewedAt(item, into));
    return;
  }
  if (typeof node !== "object") return;
  const row = node as Record<string, unknown>;
  if (typeof row.reviewedAt === "string" && row.reviewedAt) into.push(row.reviewedAt);
  if (row.review) collectReviewedAt(row.review, into);
  for (const [key, child] of Object.entries(row)) {
    if (key === "reviewedAt") continue;
    if (child && typeof child === "object") collectReviewedAt(child, into);
  }
}

export function latestVisitReviewedAt(report: {
  reviewedAt?: string | null;
  sectionReviews?: unknown;
  reviewSections?: unknown;
}): string | undefined {
  if (report.reviewedAt) return report.reviewedAt;
  const dates: string[] = [];
  collectReviewedAt(report.sectionReviews, dates);
  collectReviewedAt(report.reviewSections, dates);
  if (!dates.length) return undefined;
  dates.sort();
  return dates[dates.length - 1];
}

export function visitAddonLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      labels.push(item.trim());
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = row.name ?? row.label ?? row.title;
    if (typeof name === "string" && name.trim()) labels.push(name.trim());
  }
  return labels;
}

export function visitSectionReviewsValue(report: {
  reviewSections?: unknown;
  sectionReviews?: unknown;
}): unknown {
  const rs = report.reviewSections;
  if (rs && typeof rs === "object" && !Array.isArray(rs)) {
    const sections = (rs as { sections?: unknown }).sections;
    if (Array.isArray(sections) && sections.length) return sections;
  }
  if (Array.isArray(rs) && rs.length) return rs;
  return report.sectionReviews;
}

export function visitChecklistValue(report: {
  checklistDetails?: unknown;
  checklistResponses?: unknown;
}): unknown {
  if (report.checklistDetails != null && report.checklistDetails !== "") {
    return report.checklistDetails;
  }
  return report.checklistResponses;
}

export function asFieldVisitReportSummary(raw: unknown): FieldVisitReportSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = row.reportId ?? row.id;
  const status = row.status ?? row.reportStatus;
  if (id == null && status == null) return null;
  const reportId = id == null ? undefined : Number(id);
  return {
    reportId: Number.isFinite(reportId) ? reportId : undefined,
    status: typeof status === "string" ? (status as FieldVisitReportSummary["status"]) : undefined,
    submittedAt: typeof row.submittedAt === "string" ? row.submittedAt : undefined,
    reviewedAt: typeof row.reviewedAt === "string" ? row.reviewedAt : undefined,
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** 2bigha often leaves FieldVisit.property null and puts the listing on the joined JSON instead. */
export function asVisitProperty(raw: unknown): VisitRequestProperty | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = asOptionalString(row.title);
  const propertyName = asOptionalString(row.propertyName);
  const address = asOptionalString(row.address);
  const city = asOptionalString(row.city);
  const khasraNumber = asOptionalString(row.khasraNumber);
  const propertyId = asOptionalString(row.propertyId) || asOptionalString(row.id);
  if (!propertyId && !title && !propertyName && !address && !city && !khasraNumber) return null;
  return {
    propertyId,
    title,
    propertyName,
    description: asOptionalString(row.description),
    propertyType: asOptionalString(row.propertyType),
    status: asOptionalString(row.status),
    khasraNumber,
    address,
    city,
    district: asOptionalString(row.district),
    state: asOptionalString(row.state),
    country: asOptionalString(row.country),
    pinCode: asOptionalString(row.pinCode),
  };
}

export function coalesceVisitProperty(
  nested?: VisitRequestProperty | null,
  joined?: unknown,
): VisitRequestProperty | null {
  if (nested && propertyLabel(nested) !== "—") return nested;
  return asVisitProperty(joined) ?? nested ?? null;
}

export function visitRequestStatusFromPayload(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const status = row.visitRequestStatus ?? row.status;
  return typeof status === "string" ? status : undefined;
}
