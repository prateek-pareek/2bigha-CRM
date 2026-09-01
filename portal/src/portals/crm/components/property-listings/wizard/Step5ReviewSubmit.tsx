"use client";

import { Check, Loader2, MapPin, Building, User, Image as ImageIcon } from "lucide-react";
import type { PropertyListingWizardDraft } from "./Step1LandDetails";

interface Step5ReviewSubmitProps {
  draft: PropertyListingWizardDraft;
  submitting: boolean;
  onSubmit: () => void;
}

export function Step5ReviewSubmit({ draft, submitting, onSubmit }: Step5ReviewSubmitProps) {
  const boundaryCount = draft.mapBoundaries?.length || (draft.mapCoordinates && draft.mapCoordinates.length >= 3 ? 1 : 0);
  const coordsCount = draft.mapCoordinates?.length || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 4-column summary card styled exactly like Page 5 in the PDF */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10 p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm border-b border-emerald-500/20 pb-4">
          <Check className="h-5 w-5 rounded-full bg-emerald-100 p-1 dark:bg-emerald-900/50" />
          <span>Review Your Listing</span>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Location */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)] mb-2">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <span>Location</span>
            </div>
            <p className="font-medium text-[var(--foreground)]">
              {draft.city || "—"}, {draft.district || "—"}
            </p>
            <p className="text-[var(--text-muted)] capitalize">
              {draft.state || "—"} {draft.pincode ? `- ${draft.pincode}` : ""}
            </p>
            {draft.khasraNumber && (
              <p className="text-[var(--text-muted)] text-[11px]">
                Khasra: {draft.khasraNumber}
              </p>
            )}
          </div>

          {/* Column 2: Property Details */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)] mb-2">
              <Building className="h-4 w-4 text-emerald-600" />
              <span>Property Details</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Type: <span className="font-medium text-[var(--foreground)] uppercase">{draft.landType}</span>
            </p>
            <p className="text-[var(--text-muted)]">
              Area: <span className="font-medium text-[var(--foreground)] uppercase">{draft.area || "0"} {draft.areaUnit}</span>
            </p>
            <p className="text-[var(--text-muted)]">
              Price: <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">₹{draft.totalPrice ? Number(draft.totalPrice).toLocaleString("en-IN") : "0"}</span>
            </p>
            {draft.pricePerUnit && draft.pricePerUnit !== "0" && (
              <p className="text-[var(--text-muted)] text-[11px]">
                Rate: ₹{Number(draft.pricePerUnit).toLocaleString("en-IN")}/{draft.areaUnit}
              </p>
            )}
          </div>

          {/* Column 3: Contact */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)] mb-2">
              <User className="h-4 w-4 text-emerald-600" />
              <span>Contact</span>
            </div>
            <p className="text-[var(--text-muted)]">
              Listed by: <span className="font-medium text-[var(--foreground)] uppercase">{draft.listerType}</span>
            </p>
            <p className="font-medium text-[var(--foreground)]">
              {draft.ownerName || "Property Owner"}
            </p>
            <p className="text-[var(--text-muted)] font-mono">
              {draft.phoneNumber || "—"}
            </p>
            {draft.whatsappNumber && (
              <p className="text-[var(--text-muted)] font-mono text-[11px]">
                WA: {draft.whatsappNumber}
              </p>
            )}
          </div>

          {/* Column 4: Media & Location */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--foreground)] mb-2">
              <ImageIcon className="h-4 w-4 text-emerald-600" />
              <span>Media & Location</span>
            </div>
            <p className="text-[var(--text-muted)]">
              <span className="font-medium text-[var(--foreground)]">{draft.images.length}</span> images uploaded
            </p>
            <p className="text-[var(--text-muted)]">
              <span className="font-medium text-[var(--foreground)]">{boundaryCount}</span> boundary(ies) drawn
            </p>
            <p className="text-[var(--text-muted)]">
              <span className="font-medium text-[var(--foreground)]">{coordsCount}</span> coordinates captured
            </p>
            {draft.calculatedAreaHectares > 0 && (
              <p className="text-[var(--text-muted)] text-[11px]">
                Area: {draft.calculatedAreaHectares} ha
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Centered Green Submit Button as per PDF */}
      <div className="flex justify-center pt-4">
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Property Listing
        </button>
      </div>
    </div>
  );
}
