"use client";

import CrmLeadsReportPanel from "@/components/crm/reports/panels/CrmLeadsReportPanel";
import type { LeadReportVariant } from "@/lib/crm/shared/dashboard-routes";
import ReportsShell from "../_components/ReportsShell";

/** One dedicated lead report page — content only for this variant (no sibling tabs). */
export default function LeadsReportPage({
  slug = "leads",
  variant = "overview",
}: {
  slug?: string;
  variant?: LeadReportVariant;
}) {
  return (
    <ReportsShell slug={slug}>
      {({ period, owner, compare, compareMode }) => (
        <CrmLeadsReportPanel
          days={period}
          owner={owner}
          variant={variant}
          compare={compare}
          compareMode={compareMode}
        />
      )}
    </ReportsShell>
  );
}
