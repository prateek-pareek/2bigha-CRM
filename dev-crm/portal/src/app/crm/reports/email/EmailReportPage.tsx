"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import CrmEmailSenderPerformancePanel from "@/components/crm/email/engagement/CrmEmailSenderPerformancePanel";
import CrmTemplatePerformancePanel from "@/components/crm/reports/panels/CrmTemplatePerformancePanel";
import { CrmSectionCard } from "@/components/crm/ui";
import ReportsShell from "../_components/ReportsShell";

export default function EmailReportPage() {
  return (
    <ReportsShell slug="email">
      {({ period, owner }) => (
        <div className="space-y-6 sm:space-y-8 font-sans pb-6">
          {/* Page Header Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#e2e8f0] pb-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-[#1e293b]">
                Email & Outreach Analytics
              </h2>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Performance metrics for email templates, sender account engagement, and delivery health.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
              <Link
                href="/crm/settings/email-templates"
                className="inline-flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1e293b] shadow-xs hover:bg-[#f8fafc] hover:border-slate-300 transition-all"
              >
                <ShieldCheck size={15} className="text-[#10b981]" />
                <span>Templates</span>
              </Link>
            </div>
          </div>

          <CrmTemplatePerformancePanel days={period} owner={owner} />
          <CrmEmailSenderPerformancePanel days={period} owner={owner} />

          {/* Deliverability Section Card */}
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 sm:p-6 shadow-[rgba(219,219,219,0.25)_0px_4px_4px_0px]">
            <h2 className="mb-0.5 text-lg font-bold text-[#1e293b]">Deliverability &amp; Domain Health</h2>
            <p className="mb-4 text-xs font-medium text-slate-500 leading-relaxed">
              Monitor spam rates, sender reputation, and domain delivery signals.
            </p>
            <Link
              href="/crm/postmaster"
              className="flex items-center justify-between gap-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 transition-all hover:bg-[#f1f5f9] hover:border-[#cbd5e1]"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10b981] text-white shadow-xs">
                  <ShieldCheck size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0f172a]">
                    Domain Reputation & Delivery Health Dashboard
                  </p>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Open Postmaster to inspect bounce rates, spam rate thresholds, and MX record health.
                  </p>
                </div>
              </div>
              <ArrowRight size={18} className="shrink-0 text-[var(--color-text-muted)]" />
            </Link>
          </div>
        </div>
      )}
    </ReportsShell>
  );
}
