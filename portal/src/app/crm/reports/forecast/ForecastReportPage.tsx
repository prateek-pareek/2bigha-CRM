"use client";

import CrmBoardInsightsPanel from "@/components/crm/reports/panels/CrmBoardInsightsPanel";
import CrmDailyIntakeDetailPanel from "@/components/crm/reports/panels/CrmDailyIntakeDetailPanel";
import CrmSalesHealthPanel from "@/components/crm/reports/panels/CrmSalesHealthPanel";
import ReportsShell from "../_components/ReportsShell";

export type PipelineReportSection = "forecast" | "health";

/** Pipeline insights / sales health pages — 100% real backend data integration. */
export default function ForecastReportPage({
  section = "forecast",
}: {
  section?: PipelineReportSection;
}) {
  return (
    <ReportsShell slug={section}>
      {({ period, owner, owners }) => (
        <>
          {section === "forecast" && (
            <div className="space-y-4">
              <CrmDailyIntakeDetailPanel days={period} owner={owner} />
              <CrmBoardInsightsPanel
                ownerFilter={owner}
                owners={owners}
                pinnedFilters={{ days: period, owner }}
                defaultOpen
              />
            </div>
          )}

          {section === "health" && <CrmSalesHealthPanel owner={owner} />}
        </>
      )}
    </ReportsShell>
  );
}
