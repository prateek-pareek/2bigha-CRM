"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmInput,
  CrmLabel,
  CrmStatusBadge,
  CrmTextarea,
} from "@/components/crm/ui";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import {
  PM_LEGAL_POOL,
  addPropertyLegalNote,
  assignPropertyLegalReviewer,
  attachPropertyLegalReport,
  decidePropertyLegalVerification,
} from "@/lib/crm/property-listings/third-party-api";
import {
  legalStatusBadgeTone,
  type PropertyLegalStatus,
  type PropertyListingRecord,
} from "@/lib/crm/property-listings/types";
import { whatsappUrlFromPhone, contactWhatsappWaId } from "@/lib/crm/crm-messaging-links";

type Props = {
  listing: PropertyListingRecord;
  onUpdated: (next: PropertyListingRecord) => void;
};

/** Legal reviewer actions for subscription Legal Verification (doc §§4–5, 8). */
export default function LegalVerificationReviewPanel({ listing, onUpdated }: Props) {
  const legal = listing.propertyLegal;
  const [busy, setBusy] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [reviewer, setReviewer] = useState(
    legal?.assignedTo || PM_LEGAL_POOL[0],
  );
  const [notes, setNotes] = useState(legal?.notes || "");
  const [rejectionReason, setRejectionReason] = useState(legal?.rejectionReason || "");
  const [reportName, setReportName] = useState(legal?.report?.fileName || "");
  const [noteDraft, setNoteDraft] = useState("");

  if (!legal) {
    return (
      <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 text-sm text-[var(--text-muted)]">
        No Legal Verification request on this property yet.
      </div>
    );
  }

  const run = async (fn: () => Promise<PropertyListingRecord>, okMsg: string) => {
    setBusy(true);
    try {
      const next = await fn();
      onUpdated(next);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const decide = (status: PropertyLegalStatus) =>
    run(
      () =>
        decidePropertyLegalVerification(listing._id, {
          status,
          reviewedBy: reviewer,
          notes,
          rejectionReason: status === "Rejected" ? rejectionReason : undefined,
        }),
      status === "Pending"
        ? "Moved back to Pending"
        : status === "Verified"
          ? "Property verified"
          : "Property rejected",
    );

  const phone = listing.contactPhone;
  const waId = contactWhatsappWaId({ phone: phone || undefined, mobileNo: phone || undefined });
  const waExternal = whatsappUrlFromPhone(phone);
  /** Prefer CRM WhatsApp inbox so the thread stays in-product (doc §5). */
  const crmWhatsappHref = waId
    ? `/crm/whatsapp?wa=${encodeURIComponent(waId)}${
        listing.leadId && /^[0-9a-fA-F]{24}$/.test(listing.leadId)
          ? `&leadId=${encodeURIComponent(listing.leadId)}`
          : ""
      }&propertyId=${encodeURIComponent(listing._id)}&propertyTitle=${encodeURIComponent(listing.title)}`
    : waExternal;

  const leadIdForCall =
    listing.leadId && /^[0-9a-fA-F]{24}$/.test(listing.leadId) ? listing.leadId : undefined;

  return (
    <div className="space-y-4 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Legal Verification</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Subscription legal review — separate from PM pipeline legal
          </p>
        </div>
        <CrmStatusBadge tone={legalStatusBadgeTone(legal.status)}>{legal.status}</CrmStatusBadge>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <span className="text-[var(--text-muted)]">Requested</span>
          <p className="font-medium text-[var(--text-main)]">
            {new Date(legal.requestedAt).toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Assigned</span>
          <p className="font-medium text-[var(--text-main)]">{legal.assignedTo || "Shared queue"}</p>
        </div>
        {legal.reviewedAt ? (
          <div>
            <span className="text-[var(--text-muted)]">Reviewed</span>
            <p className="font-medium text-[var(--text-main)]">
              {legal.reviewedBy || "—"} · {new Date(legal.reviewedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
        {listing.leadId ? (
          <div>
            <span className="text-[var(--text-muted)]">Client / lead</span>
            <p className="font-medium text-[var(--text-main)]">
              {leadIdForCall ? (
                <Link href={`/crm/leads/${listing.leadId}`} className="text-[#2f80ed] hover:underline">
                  Open lead
                </Link>
              ) : (
                listing.contactName || listing.leadId
              )}
            </p>
          </div>
        ) : null}
      </div>

      {/* Doc §5 — CRM Call (logged) + WhatsApp in context */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCallOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 text-xs font-semibold text-[var(--text-main)]"
        >
          <Phone size={14} /> Call owner
        </button>
        {crmWhatsappHref ? (
          <a
            href={crmWhatsappHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] px-3 text-xs font-semibold text-[var(--text-main)]"
          >
            <MessageCircle size={14} /> WhatsApp
          </a>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">No owner phone on file</span>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        Call uses CRM IVR and logs against the linked lead when available. WhatsApp opens the CRM
        inbox thread for this owner.
      </p>

      {legal.priorNotes?.length ? (
        <div className="rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Prior review notes
          </p>
          <ul className="space-y-1.5 text-xs text-amber-950">
            {legal.priorNotes.map((n, i) => (
              <li key={`${n.at}-${i}`}>
                <span className="font-medium">{n.by || "Legal"}</span>
                <span className="text-amber-700">
                  {" "}
                  · {new Date(n.at).toLocaleDateString()}
                </span>
                <p className="mt-0.5">{n.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {legal.rejectionReason && legal.status === "Rejected" ? (
        <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          <span className="font-semibold">Rejection reason: </span>
          {legal.rejectionReason}
        </div>
      ) : null}

      <div className="space-y-2">
        <CrmLabel>Assign / reviewer</CrmLabel>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 text-sm"
            value={reviewer}
            disabled={busy}
            onChange={(e) => setReviewer(e.target.value)}
          >
            {PM_LEGAL_POOL.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <CrmButton
            type="button"
            variant="secondary"
            disabled={busy || legal.assignedTo === reviewer}
            onClick={() =>
              void run(
                () => assignPropertyLegalReviewer(listing._id, reviewer),
                "Assigned to reviewer",
              )
            }
          >
            Assign
          </CrmButton>
        </div>
      </div>

      <div className="space-y-2">
        <CrmLabel>Notes regarding the property</CrmLabel>
        <CrmTextarea
          rows={3}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Review notes for the record…"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <CrmInput
          className="min-w-[200px] flex-1"
          value={noteDraft}
          disabled={busy}
          placeholder="Quick note…"
          onChange={(e) => setNoteDraft(e.target.value)}
        />
        <CrmButton
          type="button"
          variant="secondary"
          disabled={busy || !noteDraft.trim()}
          onClick={() =>
            void run(async () => {
              const next = await addPropertyLegalNote(listing._id, noteDraft, reviewer);
              setNoteDraft("");
              setNotes(next.propertyLegal?.notes || notes);
              return next;
            }, "Note saved")
          }
        >
          Add note
        </CrmButton>
      </div>

      <div className="space-y-2">
        <CrmLabel>Rejection reason (required if Rejected)</CrmLabel>
        <CrmTextarea
          rows={2}
          value={rejectionReason}
          disabled={busy}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Shown to the client/owner…"
        />
      </div>

      <div className="space-y-2">
        <CrmLabel>Legal report document</CrmLabel>
        <div className="flex flex-wrap gap-2">
          <CrmInput
            className="min-w-[200px] flex-1"
            value={reportName}
            disabled={busy}
            placeholder="Legal_Report.pdf"
            onChange={(e) => setReportName(e.target.value)}
          />
          <CrmButton
            type="button"
            variant="secondary"
            disabled={busy || !reportName.trim()}
            onClick={() =>
              void run(
                () => attachPropertyLegalReport(listing._id, reportName.trim()),
                "Report attached",
              )
            }
          >
            <FileText size={14} /> Attach
          </CrmButton>
        </div>
        {legal.report ? (
          <p className="text-xs text-[var(--text-muted)]">
            On file: <span className="font-medium text-[var(--text-main)]">{legal.report.fileName}</span>
            {" · "}
            {new Date(legal.report.uploadedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-3">
        <CrmButton type="button" disabled={busy} onClick={() => void decide("Verified")}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Mark Verified
        </CrmButton>
        <CrmButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void decide("Rejected")}
        >
          Mark Rejected
        </CrmButton>
        {legal.status !== "Pending" ? (
          <CrmButton
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void decide("Pending")}
          >
            Back to Pending
          </CrmButton>
        ) : null}
      </div>

      <CallLeadModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        phone={phone}
        leadId={leadIdForCall}
        leadName={listing.contactName || listing.title}
        relatedType="Lead"
      />
    </div>
  );
}
