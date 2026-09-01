"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin } from "lucide-react";
import { CrmSegmentedControl, CrmStatusBadge } from "@/components/crm/ui";
import { VisitConfigBanner, VisitItemCard, VisitPanelShell } from "@/components/crm/visits/visit-chrome";
import {
  fetchVisitContextForClient,
  fetchVisitContextForLead,
  type FieldVisit,
  type VisitContextPayload,
  type VisitRequest,
} from "@/lib/crm/twobigha-visits-api";
import {
  fieldVisitStatusTone,
  formatVisitCategory,
  formatVisitRelative,
  formatVisitStatus,
  personName,
  propertyLabel,
  visitRequestStatusTone,
} from "@/lib/crm/visits/visit-ui";

type PanelTab = "requests" | "visits";

export default function TwoBighaVisitTrackingPanel({
  leadId,
  clientId,
}: {
  leadId?: string;
  clientId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [payload, setPayload] = useState<VisitContextPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<PanelTab>("visits");

  useEffect(() => {
    const id = leadId || clientId;
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const fetch = leadId
      ? fetchVisitContextForLead(leadId, { page: 1, limit: 8 })
      : fetchVisitContextForClient(clientId!, { page: 1, limit: 8 });
    fetch
      .then((result) => {
        if (cancelled) return;
        setConfigured(result.configured);
        setPayload(result.data);
        const visits = result.data?.visits?.rows || [];
        const requests = result.data?.requests?.rows || [];
        if (!visits.length && requests.length) setTab("requests");
      })
      .catch(() => {
        if (!cancelled) {
          setConfigured(true);
          setPayload(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, clientId]);

  const visits = payload?.visits?.rows || [];
  const requests = payload?.requests?.rows || [];
  const visitTotal = payload?.visits?.meta?.total ?? visits.length;
  const requestTotal = payload?.requests?.meta?.total ?? requests.length;

  return (
    <VisitPanelShell
      title="Visit tracking"
      hint="Field visits and requests from 2bigha — for a live customer call."
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
      ) : failed ? (
        <p className="text-xs italic text-[var(--text-muted)]">Couldn&apos;t load visit history. Refresh and try again.</p>
      ) : payload?.reason === "no_client" ? (
        <p className="text-xs italic text-[var(--text-muted)]">
          Link a client to this lead, then sync them to 2bigha, to load visit history.
        </p>
      ) : payload?.reason === "not_synced" ? (
        <p className="text-xs italic text-[var(--text-muted)]">
          This client isn&apos;t synced to 2bigha yet — visit history needs a platform user id.
        </p>
      ) : visits.length === 0 && requests.length === 0 ? (
        <p className="text-xs italic text-[var(--text-muted)]">No visit requests or field visits on file for this customer.</p>
      ) : (
        <div className="space-y-3">
          <CrmSegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "visits", label: `Visits · ${visitTotal}` },
              { value: "requests", label: `Requests · ${requestTotal}` },
            ]}
          />
          {tab === "requests" ? (
            requests.length === 0 ? (
              <p className="text-xs italic text-[var(--text-muted)]">No visit requests.</p>
            ) : (
              <div className="space-y-1.5">
                {requests.map((row: VisitRequest) => (
                  <VisitItemCard
                    key={row.id}
                    href={`/crm/visits/requests/${row.id}`}
                    title={propertyLabel(row.property)}
                    subtitle={`${formatVisitCategory(row.visitCategory)} · preferred ${formatVisitRelative(row.preferredDate)}${row.preferredTimeSlot ? ` · ${row.preferredTimeSlot}` : ""}`}
                    badge={
                      <CrmStatusBadge tone={visitRequestStatusTone(row.visitRequestStatus)}>
                        {formatVisitStatus(row.visitRequestStatus)}
                      </CrmStatusBadge>
                    }
                  />
                ))}
              </div>
            )
          ) : visits.length === 0 ? (
            <p className="text-xs italic text-[var(--text-muted)]">No field visits yet.</p>
          ) : (
            <div className="space-y-1.5">
              {visits.map((row: FieldVisit) => (
                <VisitItemCard
                  key={row.id}
                  href={`/crm/visits/${row.id}`}
                  title={propertyLabel(row.property)}
                  subtitle={`${formatVisitCategory(row.visitCategory)} · ${formatVisitRelative(row.scheduledAt)}${row.agentAssigned ? ` · ${personName(row.agentAssigned)}` : ""}`}
                  badge={
                    <CrmStatusBadge tone={fieldVisitStatusTone(row.status)}>
                      {formatVisitStatus(row.status)}
                    </CrmStatusBadge>
                  }
                  footer={
                    row.report?.status ? (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        Report {formatVisitStatus(row.report.status)}
                        {row.report.reportId ? ` · #${row.report.reportId}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] italic text-[var(--text-muted)]">No report yet</p>
                    )
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
