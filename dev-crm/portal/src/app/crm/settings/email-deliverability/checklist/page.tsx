"use client";

import Link from "next/link";
import { ListChecks, ShieldCheck } from "lucide-react";
import DeliverabilityChecklist from "@/components/crm/email/deliverability/DeliverabilityChecklist";
import DeliverabilityPillarsCallout from "@/components/crm/email/deliverability/DeliverabilityPillarsCallout";
import { DELIVERABILITY_CHECKLIST_TOTAL } from "@/lib/crm/deliverability-checklist-data";

export default function DeliverabilityChecklistPage() {
  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <ListChecks className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">
                Email Deliverability Checklist
              </h1>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--primary-muted)] leading-relaxed">
                {DELIVERABILITY_CHECKLIST_TOTAL}-point audit covering authentication, reputation,
                infrastructure, sending practices, content, and monitoring — based on industry
                deliverability best practices. Check items as you go and export for your tech team.
              </p>
            </div>
          </div>
          <Link
            href="/crm/settings/email-deliverability/health"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
          >
            <ShieldCheck size={13} />
            Deliverability Health
          </Link>
        </div>
        <div className="px-6 py-4 border-b border-[var(--surface-dim)] bg-white">
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Progress is saved in your browser. Use{" "}
            <strong className="text-[var(--text-main)]">Apply detected</strong> to mark items
            Mathionix can verify (SPF/DKIM/DMARC, send limits, List-Unsubscribe). For content
            checks, use the spam and subject &amp; body tester in the email composer (links,
            attachments, HTML weight, images, colors, duplicate sends, and simple subjects).
          </p>
        </div>
      </div>

      <DeliverabilityPillarsCallout />
      <DeliverabilityChecklist />
    </div>
  );
}
