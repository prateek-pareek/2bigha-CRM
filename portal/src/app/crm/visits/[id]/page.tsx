"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, FileText, MapPin, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
  CrmSoftBadge,
  CrmStatusBadge,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import VisitJsonBlock from "@/components/crm/visits/VisitJsonBlock";
import {
  VisitBool,
  VisitConfigBanner,
  VisitKpiCard,
  VisitMapsLink,
  VisitMetaRow,
  VisitPersonChip,
  VisitTimeline,
} from "@/components/crm/visits/visit-chrome";
import { fetchFieldVisitDetailed, type FieldVisitDetailed } from "@/lib/crm/twobigha-visits-api";
import {
  asFieldVisitReportSummary,
  coalesceVisitProperty,
  fieldVisitStatusTone,
  formatVisitCategory,
  formatVisitDate,
  formatVisitStatus,
  personName,
  propertyLabel,
  visitCategoryTone,
  visitReportStatusTone,
  visitRequestStatusFromPayload,
  visitRequestStatusTone,
} from "@/lib/crm/visits/visit-ui";

export default function FieldVisitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [detail, setDetail] = useState<FieldVisitDetailed | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFieldVisitDetailed(id);
      setConfigured(result.configured);
      setDetail(result.data);
      if (result.configured && !result.data) {
        toast.error("Field visit not found");
      }
    } catch {
      toast.error("Failed to load field visit");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CrmRecordDetailSkeleton />;

  const visit = detail?.fieldVisit;
  const property = coalesceVisitProperty(visit?.property, detail?.property);
  const requestStatus = visitRequestStatusFromPayload(detail?.request);
  const hasRequestDetails = Boolean(detail?.request || requestStatus);
  const title = visit
    ? propertyLabel(property) !== "—"
      ? propertyLabel(property)
      : `Visit ${id}`
    : `Visit ${id}`;
  const reportSummary = visit?.report || asFieldVisitReportSummary(detail?.report);
  const reportId = reportSummary?.reportId;
  const agent = detail?.agent || visit?.agentAssigned;
  const owner = detail?.owner || visit?.owner;

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<MapPin size={18} />}
        title={title}
        badge={
          visit ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <CrmStatusBadge tone={fieldVisitStatusTone(visit.status)}>
                {formatVisitStatus(visit.status)}
              </CrmStatusBadge>
              <CrmSoftBadge
                label={formatVisitCategory(visit.visitCategory)}
                tone={visitCategoryTone(visit.visitCategory)}
              />
            </div>
          ) : undefined
        }
        description={visit ? `Agent ${personName(agent)} · ${formatVisitDate(visit.scheduledAt)}` : undefined}
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Visit tracking", href: "/crm/visits" },
          { label: title },
        ]}
        actions={
          <CrmButton variant="secondary" onClick={() => router.push("/crm/visits")} leftIcon={<ArrowLeft size={14} />}>
            Back
          </CrmButton>
        }
        className="mb-4"
      />

      {!configured ? (
        <VisitConfigBanner />
      ) : !visit ? (
        <p className="text-sm text-[var(--text-muted)]">No field visit returned for id {id}.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VisitKpiCard
              emoji="📌"
              label="Status"
              value={formatVisitStatus(visit.status)}
              hint={formatVisitCategory(visit.visitCategory)}
              tone={
                visit.status === "COMPLETED"
                  ? "success"
                  : visit.status === "MISSED" || visit.status === "CANCELLED"
                    ? "danger"
                    : visit.status === "IN_PROGRESS" || visit.status === "AGENT_ON_WAY"
                      ? "warning"
                      : "info"
              }
            />
            <VisitKpiCard
              emoji="⏱"
              label="On site"
              value={visit.durationMinutes != null ? `${visit.durationMinutes} min` : "—"}
              hint={visit.checkInAt ? "Checked in" : "Not started"}
            />
            <VisitKpiCard
              emoji="📍"
              label="Check-in"
              value={visit.checkInAt ? formatVisitDate(visit.checkInAt) : "Pending"}
              hint={visit.checkInLat && visit.checkInLng ? "GPS captured" : "No GPS yet"}
              tone={visit.checkInAt ? "success" : "neutral"}
            />
            <VisitKpiCard
              emoji="📝"
              label="Report"
              value={reportSummary?.status ? formatVisitStatus(reportSummary.status) : "Not submitted"}
              hint={reportId ? "Open full report" : undefined}
              href={reportId ? `/crm/visits/reports/${reportId}` : undefined}
              tone={
                reportSummary?.status === "APPROVED"
                  ? "success"
                  : reportSummary?.status === "REJECTED" || reportSummary?.status === "CHANGES_REQUESTED"
                    ? "warning"
                    : "neutral"
              }
            />
          </div>

          <CrmSectionCard title="📍 On-site timeline" bodyClassName="p-3 sm:p-4">
            <VisitTimeline
              scheduledAt={visit.scheduledAt}
              checkInAt={visit.checkInAt}
              checkOutAt={visit.checkOutAt}
              durationMinutes={visit.durationMinutes}
            />
          </CrmSectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <CrmSectionCard title="📋 Visit details" className="lg:col-span-3" bodyClassName="p-3 sm:px-4 sm:py-3">
              <VisitMetaRow emoji="📅" label="Scheduled" value={formatVisitDate(visit.scheduledAt)} />
              <VisitMetaRow
                emoji="📍"
                label="Check-in"
                value={
                  visit.checkInAt ? (
                    <span className="inline-flex flex-col items-end gap-0.5">
                      {formatVisitDate(visit.checkInAt)}
                      <VisitMapsLink lat={visit.checkInLat} lng={visit.checkInLng} label="Open check-in map" />
                    </span>
                  ) : (
                    "⏳ Pending"
                  )
                }
              />
              <VisitMetaRow
                emoji="🏁"
                label="Check-out"
                value={
                  visit.checkOutAt ? (
                    <span className="inline-flex flex-col items-end gap-0.5">
                      {formatVisitDate(visit.checkOutAt)}
                      <VisitMapsLink lat={visit.checkOutLat} lng={visit.checkOutLng} label="Open check-out map" />
                    </span>
                  ) : (
                    "⏳ Pending"
                  )
                }
              />
              <VisitMetaRow
                emoji="⏱"
                label="Duration"
                value={
                  visit.durationMinutes != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> {visit.durationMinutes} min
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <VisitMetaRow emoji="🎯" label="Counts toward quota" value={<VisitBool value={visit.countsTowardLimit} />} />
              <VisitMetaRow emoji="🚪" label="Property accessible" value={<VisitBool value={visit.propertyAccessible} />} />
              <VisitMetaRow emoji="🗺️" label="Location match" value={visit.locationMatchCheck} />
              <VisitMetaRow emoji="📝" label="Notes" value={visit.notes} />
            </CrmSectionCard>

            <CrmSectionCard title="👥 People & property" className="lg:col-span-2" bodyClassName="space-y-3 p-3 sm:p-4">
              <VisitPersonChip person={owner} label="Owner" />
              <VisitPersonChip person={agent} label="Field agent" />
              <VisitPersonChip person={detail?.manager} label="Manager" />
              {agent?.phone ? (
                <a
                  href={`tel:${agent.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--primary)] no-underline hover:bg-[var(--primary-light)]"
                >
                  <Phone size={12} /> Call agent
                </a>
              ) : null}
              {visit.checkInLat && visit.checkInLng ? (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(visit.checkInLat)},${encodeURIComponent(visit.checkInLng)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--primary)] no-underline hover:bg-[var(--primary-light)]"
                >
                  <Navigation size={12} /> Open GPS
                </a>
              ) : null}
              <div className="border-t border-[var(--border-color)] pt-3">
                <VisitMetaRow emoji="🏡" label="Property" value={propertyLabel(property)} />
                <VisitMetaRow
                  emoji="📌"
                  label="Location"
                  value={[property?.city, property?.state].filter(Boolean).join(", ") || undefined}
                />
                <VisitMetaRow emoji="#️⃣" label="Khasra" value={property?.khasraNumber} />
                <VisitMetaRow
                  emoji="📨"
                  label="Request"
                  value={
                    visit.visitRequestId ? (
                      <span className="inline-flex flex-col items-end gap-1">
                        {hasRequestDetails ? (
                          <Link
                            href={`/crm/visits/requests/${visit.visitRequestId}`}
                            className="text-[var(--primary)] hover:underline"
                          >
                            Request #{visit.visitRequestId}
                          </Link>
                        ) : (
                          <span className="text-[var(--text-muted)]">Request #{visit.visitRequestId}</span>
                        )}
                        {requestStatus ? (
                          <CrmStatusBadge tone={visitRequestStatusTone(requestStatus)}>
                            {formatVisitStatus(requestStatus)}
                          </CrmStatusBadge>
                        ) : !hasRequestDetails ? (
                          <span className="text-[11px] font-normal text-[var(--text-muted)]">Details unavailable</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">Not linked</span>
                    )
                  }
                />
              </div>
            </CrmSectionCard>
          </div>

          <CrmSectionCard
            title="📝 Visit report"
            actions={
              reportId ? (
                <Link
                  href={`/crm/visits/reports/${reportId}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1 text-[12px] font-semibold text-white no-underline hover:opacity-90"
                >
                  <FileText size={13} /> Open full report
                </Link>
              ) : undefined
            }
            bodyClassName="p-3 sm:p-4"
          >
            {reportSummary?.status ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-sky-100 bg-sky-50/70 px-3 py-2.5">
                <span className="text-lg" aria-hidden>📄</span>
                <CrmStatusBadge tone={visitReportStatusTone(reportSummary.status)}>
                  {formatVisitStatus(reportSummary.status)}
                </CrmStatusBadge>
                <span className="text-[12px] text-[var(--text-muted)]">
                  Submitted {formatVisitDate(reportSummary.submittedAt)}
                  {reportSummary.reviewedAt ? ` · reviewed ${formatVisitDate(reportSummary.reviewedAt)}` : ""}
                </span>
              </div>
            ) : (
              <p className="text-sm italic text-[var(--text-muted)]">📭 No report submitted for this visit yet.</p>
            )}
            {detail?.report != null ? (
              <div className="mt-3">
                <VisitJsonBlock value={detail.report} collapsedLabel="Show joined report payload" />
              </div>
            ) : null}
          </CrmSectionCard>
        </div>
      )}
    </div>
  );
}
