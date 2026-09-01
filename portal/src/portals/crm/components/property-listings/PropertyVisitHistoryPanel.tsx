"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { CrmSegmentedControl, CrmStatusBadge } from "@/components/crm/ui";
import { VisitConfigBanner, VisitItemCard, VisitPanelShell } from "@/components/crm/visits/visit-chrome";
import {
  fetchFieldVisitsByProperty,
  fetchVisitReports,
  fetchVisitRequestsByProperty,
  type FieldVisit,
  type VisitReport,
  type VisitRequest,
} from "@/lib/crm/twobigha-visits-api";
import {
  fieldVisitStatusTone,
  formatVisitCategory,
  formatVisitRelative,
  formatVisitStatus,
  personName,
  visitReportStatusTone,
  visitRequestStatusTone,
} from "@/lib/crm/visits/visit-ui";

type PanelTab = "visits" | "requests" | "reports";

export default function PropertyVisitHistoryPanel({
  managePropertyId,
}: {
  managePropertyId?: string;
}) {
  const id = managePropertyId?.trim();
  const [loading, setLoading] = useState(!!id);
  const [configured, setConfigured] = useState(true);
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [reports, setReports] = useState<VisitReport[]>([]);
  const [visitTotal, setVisitTotal] = useState(0);
  const [tab, setTab] = useState<PanelTab>("visits");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchFieldVisitsByProperty(id, { page: 1, limit: 20 }),
      fetchVisitRequestsByProperty(id, { page: 1, limit: 20 }),
      fetchVisitReports({ userPropertyId: id }),
    ])
      .then(([visitRes, requestRes, reportRes]) => {
        if (cancelled) return;
        const anyConfigured =
          visitRes.configured || requestRes.configured || reportRes.configured;
        setConfigured(anyConfigured);
        const nextVisits = visitRes.data?.rows || [];
        const nextRequests = requestRes.data?.rows || [];
        const nextReports = reportRes.data || [];
        setVisits(nextVisits);
        setVisitTotal(visitRes.data?.meta?.total ?? nextVisits.length);
        setRequests(nextRequests);
        setReports(nextReports);
        if (!nextVisits.length && nextRequests.length) setTab("requests");
        else if (!nextVisits.length && !nextRequests.length && nextReports.length) setTab("reports");
      })
      .catch(() => {
        if (!cancelled) {
          setVisits([]);
          setRequests([]);
          setReports([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <VisitPanelShell title="Visit history" hint="Live 2bigha visits, requests, and reports for this property.">
        <p className="text-xs italic text-[var(--text-muted)]">
          This listing isn&apos;t linked to a 2bigha managed-property id yet. Use the lead or the Visits page to look up by customer.
        </p>
      </VisitPanelShell>
    );
  }

  return (
    <VisitPanelShell
      title="Visit history"
      hint="Live 2bigha field visits, requests, and reports for this property."
      action={
        <Link
          href="/crm/visits"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] no-underline hover:underline"
        >
          <MapPin size={12} /> All visits
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading visit history…
        </div>
      ) : !configured ? (
        <VisitConfigBanner compact />
      ) : visits.length === 0 && requests.length === 0 && reports.length === 0 ? (
        <p className="text-xs italic text-[var(--text-muted)]">No visits, requests, or reports for this property yet.</p>
      ) : (
        <div className="space-y-3">
          <CrmSegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "visits", label: `Visits · ${visitTotal}` },
              { value: "requests", label: `Requests · ${requests.length}` },
              { value: "reports", label: `Reports · ${reports.length}` },
            ]}
          />

          {tab === "requests" ? (
            requests.length === 0 ? (
              <p className="text-xs italic text-[var(--text-muted)]">No visit requests.</p>
            ) : (
              <div className="space-y-1.5">
                {requests.map((row) => (
                  <VisitItemCard
                    key={row.id}
                    href={`/crm/visits/requests/${row.id}`}
                    title={formatVisitCategory(row.visitCategory)}
                    subtitle={`Preferred ${formatVisitRelative(row.preferredDate)}${row.preferredTimeSlot ? ` · ${row.preferredTimeSlot}` : ""}`}
                    badge={
                      <CrmStatusBadge tone={visitRequestStatusTone(row.visitRequestStatus)}>
                        {formatVisitStatus(row.visitRequestStatus)}
                      </CrmStatusBadge>
                    }
                  />
                ))}
              </div>
            )
          ) : tab === "reports" ? (
            reports.length === 0 ? (
              <p className="text-xs italic text-[var(--text-muted)]">No reports yet.</p>
            ) : (
              <div className="space-y-1.5">
                {reports.map((row) => {
                  const reportId = row.report?.reportId;
                  const inner = (
                    <VisitItemCard
                      href={reportId ? `/crm/visits/reports/${reportId}` : `/crm/visits/${row.visitId}`}
                      title={`Visit ${row.visitId}`}
                      subtitle={formatVisitRelative(row.scheduledAt)}
                      badge={
                        <CrmStatusBadge tone={visitReportStatusTone(row.report?.reportStatus)}>
                          {formatVisitStatus(row.report?.reportStatus) || "No report"}
                        </CrmStatusBadge>
                      }
                    />
                  );
                  return <div key={row.visitId}>{inner}</div>;
                })}
              </div>
            )
          ) : visits.length === 0 ? (
            <p className="text-xs italic text-[var(--text-muted)]">No field visits yet.</p>
          ) : (
            <div className="space-y-1.5">
              {visits.map((row) => (
                <VisitItemCard
                  key={row.id}
                  href={`/crm/visits/${row.id}`}
                  title={formatVisitStatus(row.status)}
                  subtitle={`${formatVisitRelative(row.scheduledAt)}${row.agentAssigned ? ` · ${personName(row.agentAssigned)}` : ""}`}
                  badge={
                    <CrmStatusBadge tone={fieldVisitStatusTone(row.status)}>
                      {formatVisitStatus(row.status)}
                    </CrmStatusBadge>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </VisitPanelShell>
  );
}
