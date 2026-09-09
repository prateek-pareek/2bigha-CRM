"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Layers,
  MapPin,
  Navigation,
  Phone,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import { CrmCenterModalShell } from "@/components/crm/shell/CrmCenterModalShell";
import { CrmButton, CrmStatusBadge, crmStatusToneFromLabel } from "@/components/crm/ui";
import type { ApprovalQueueProperty } from "@/lib/crm/property-listings/approval-queue-api";

interface PropertyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ApprovalQueueProperty | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isSelfSubmission?: boolean;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

export function PropertyReviewModal({
  isOpen,
  onClose,
  item,
  onApprove,
  onReject,
  isSelfSubmission = false,
}: PropertyReviewModalProps) {
  if (!item) return null;

  const p = item.property;
  const fullAddress =
    [p.address, p.city, p.district, p.state, p.pinCode].filter(Boolean).join(", ") ||
    "No address specified";

  const slug = item.seo?.slug;
  const listingHref = slug
    ? `/crm/property-listings/${slug}`
    : `/crm/property-listings/${p.id}`;

  const lat = p.location?.coordinates?.lat;
  const lng = p.location?.coordinates?.lng;
  const hasCoords = lat != null && lng != null;

  return (
    <CrmCenterModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Property Moderation Review"
      subtitle={`ID: ${p.id}${p.uuid ? ` · ${p.uuid}` : ""}`}
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4 pt-1 text-[var(--text-main)]">
        {/* Header Title & Price */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-dim)] p-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {p.propertyType || "Property"}
              </span>
              {p.category && (
                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                  {p.category}
                </span>
              )}
              {p.isVerified ? (
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  Verified Seller
                </span>
              ) : null}
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)]">
              {p.title || p.propertyName || "Untitled Property"}
            </h3>
            <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              {fullAddress}
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
              Listing Price
            </p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {p.price != null ? `₹${p.price.toLocaleString("en-IN")}` : "—"}
            </p>
            {p.pricePerUnit ? (
              <p className="text-xs text-[var(--text-muted)] font-medium">{p.pricePerUnit}</p>
            ) : null}
            <div className="mt-2">
              <Link
                href={listingHref}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Open Full Listing <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>

        {/* Grid Meta Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Total Area
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">
              {p.area ? `${p.area} ${p.areaUnit || ""}` : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Calculated Area
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">
              {p.calculatedArea || "—"}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Moderation Status
            </p>
            <div className="mt-1">
              <CrmStatusBadge tone={crmStatusToneFromLabel(p.approvalStatus || "Pending")}>
                {p.approvalStatus || "Pending"}
              </CrmStatusBadge>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Submitted Date
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">
              {formatDate(p.createdAt)}
            </p>
          </div>
        </div>

        {/* Owner Information Strip */}
        {(p.ownerName || p.ownerPhone || p.ownerWhatsapp) && (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3.5">
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              <User className="h-3.5 w-3.5 text-[var(--primary)]" /> Seller / Owner Details
            </h4>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-[var(--text-muted)]">Name: </span>
                <strong className="text-[var(--text-main)]">{p.ownerName || "—"}</strong>
              </div>
              {p.ownerPhone && (
                <div className="flex items-center gap-1">
                  <span className="text-[var(--text-muted)]">Phone: </span>
                  <a
                    href={`tel:${p.ownerPhone}`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline"
                  >
                    <Phone size={11} /> {p.ownerPhone}
                  </a>
                </div>
              )}
              {p.ownerWhatsapp && (
                <div>
                  <span className="text-[var(--text-muted)]">WhatsApp: </span>
                  <a
                    href={`https://wa.me/${p.ownerWhatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-600 hover:underline"
                  >
                    {p.ownerWhatsapp}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Land Specifications from GraphQL */}
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3.5">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
            <Layers className="h-3.5 w-3.5 text-[var(--primary)]" /> Land & Technical Specs
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Khasra Number
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.khasraNumber || "—"}</span>
            </div>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Land Zoning
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.landZoning || "—"}</span>
            </div>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Soil Type
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.soilType || "—"}</span>
            </div>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Water Level
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.waterLevel || "—"}</span>
            </div>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Highway Connectivity
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.highwayConn || "—"}</span>
            </div>
            <div className="rounded-lg bg-[var(--surface-dim)] p-2">
              <span className="block text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                Road Access
              </span>
              <span className="font-semibold text-[var(--text-main)]">{p.roadAccess || "—"}</span>
            </div>
          </div>
        </div>

        {/* GPS Coordinates & Map Link */}
        {(hasCoords || p.latLng) && (
          <div className="flex items-center justify-between rounded-xl border border-sky-200/80 bg-sky-50/50 p-3 text-xs dark:border-sky-900/40 dark:bg-sky-950/20">
            <div className="flex items-center gap-2">
              <Navigation className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <div>
                <span className="font-semibold text-sky-950 dark:text-sky-200">
                  GPS Location:{" "}
                </span>
                <span className="text-sky-800 dark:text-sky-300 font-mono">
                  {hasCoords ? `${lat}, ${lng}` : p.latLng}
                </span>
              </div>
            </div>
            {hasCoords && (
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline dark:text-sky-300"
              >
                Open Google Maps <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {/* Description */}
        {p.description ? (
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              <FileText className="h-3.5 w-3.5" /> Property Description
            </h4>
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3 text-xs leading-relaxed text-[var(--text-main)] max-h-32 overflow-y-auto">
              {p.description}
            </div>
          </div>
        ) : null}

        {/* Moderation note if available */}
        {p.approvalMessage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <p className="font-semibold flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" /> Previous Moderation Feedback:
            </p>
            <p className="mt-1 italic">{p.approvalMessage}</p>
          </div>
        ) : null}

        {/* Self approval prohibition alert */}
        {isSelfSubmission && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
              <XCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              Self-Approval Restricted
            </p>
            <p className="mt-1">
              You submitted this property listing. Another team member or reviewer must approve or reject this submission.
            </p>
          </div>
        )}

        {/* Modal Action Bar */}
        <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3.5">
          <CrmButton variant="ghost" onClick={onClose}>
            Close
          </CrmButton>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSelfSubmission}
              onClick={() => {
                if (isSelfSubmission) return;
                onClose();
                onReject(p.id);
              }}
              title={isSelfSubmission ? "You cannot reject your own property submission" : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-50 transition-colors"
            >
              <XCircle className="h-4 w-4" /> Reject Submission
            </button>
            <button
              type="button"
              disabled={isSelfSubmission}
              onClick={() => {
                if (isSelfSubmission) return;
                onClose();
                onApprove(p.id);
              }}
              title={isSelfSubmission ? "You cannot approve your own property submission" : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve Listing
            </button>
          </div>
        </div>
      </div>
    </CrmCenterModalShell>
  );
}
