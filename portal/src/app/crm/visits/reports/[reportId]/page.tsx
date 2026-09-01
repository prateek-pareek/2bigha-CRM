"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
  CrmStatusBadge,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import VisitJsonBlock from "@/components/crm/visits/VisitJsonBlock";
import {
  VisitConfigBanner,
  VisitFindingBlock,
  VisitKpiCard,
  VisitMetaRow,
  VisitPersonChip,
  VisitPhotoGrid,
  VisitStars,
} from "@/components/crm/visits/visit-chrome";
import { fetchVisitReportDetails, type VisitReportItem } from "@/lib/crm/twobigha-visits-api";
import {
  formatVisitDate,
  formatVisitStatus,
  propertyLabel,
  visitAddonLabels,
  collectVisitReportMedia,
  latestVisitReviewedAt,
  visitChecklistValue,
  visitReportStatusTone,
  visitSectionReviewsValue,
} from "@/lib/crm/visits/visit-ui";

export default function VisitReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const reportId = params.reportId;
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [report, setReport] = useState<VisitReportItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchVisitReportDetails(reportId);
      setConfigured(result.configured);
      setReport(result.data);
      if (result.configured && !result.data) toast.error("Visit report not found");
    } catch {
      toast.error("Failed to load visit report");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const photos = useMemo(() => (report ? collectVisitReportMedia(report) : []), [report]);
  const addonLabels = useMemo(() => visitAddonLabels(report?.recommendedAddons), [report]);
  const reviewedAt = report ? latestVisitReviewedAt(report) : undefined;

  if (loading) return <CrmRecordDetailSkeleton />;

  const title = report ? propertyLabel(report.property) || `Report ${reportId}` : `Report ${reportId}`;

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<FileText size={18} />}
        title={title}
        badge={
          report?.status ? (
            <CrmStatusBadge tone={visitReportStatusTone(report.status)}>
              {formatVisitStatus(report.status)}
            </CrmStatusBadge>
          ) : undefined
        }
        description={
          report
            ? `Submitted ${formatVisitDate(report.submittedAt)} · ${report.resubmissionCount ?? 0} resubmission${(report.resubmissionCount ?? 0) === 1 ? "" : "s"}`
            : undefined
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Visit tracking", href: "/crm/visits" },
          { label: `Report ${reportId}` },
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
      ) : !report ? (
        <p className="text-sm text-[var(--text-muted)]">No report returned for id {reportId}.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VisitKpiCard
              emoji="⭐"
              label="Condition"
              value={<VisitStars value={report.conditionRating} />}
              tone={report.conditionRating != null ? "warning" : "neutral"}
            />
            <VisitKpiCard emoji="📁" label="Case" value={report.caseNumber || "—"} />
            <VisitKpiCard
              emoji="✅"
              label="Reviewed"
              value={formatVisitDate(reviewedAt)}
              tone={reviewedAt ? "success" : "neutral"}
            />
            <VisitKpiCard
              emoji="🧭"
              label="Field visit"
              value={`Visit #${report.fieldVisitId}`}
              hint="Open visit"
              href={`/crm/visits/${report.fieldVisitId}`}
              tone="info"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <CrmSectionCard title="🔍 Findings" className="lg:col-span-3" bodyClassName="space-y-3 p-3 sm:p-4">
              <VisitFindingBlock emoji="👁️" title="Observations" tone="info">
                <p className="whitespace-pre-wrap">{report.observations || "No observations recorded."}</p>
              </VisitFindingBlock>
              <VisitFindingBlock emoji="💡" title="Recommendations" tone="warning">
                {report.recommendations ? (
                  <p className="whitespace-pre-wrap">{report.recommendations}</p>
                ) : addonLabels.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {addonLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[12px] font-medium text-[var(--text-main)]"
                      >
                        🛠️ {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)]">No recommendations yet.</p>
                )}
              </VisitFindingBlock>
              <VisitFindingBlock emoji="⚠️" title="Issues found" tone={report.issuesFound ? "danger" : "success"}>
                <VisitJsonBlock value={report.issuesFound} empty="None recorded — looks clear." />
              </VisitFindingBlock>
              {report.rejectionReason ? (
                <VisitFindingBlock emoji="🚫" title="Changes requested" tone="danger">
                  {report.rejectionReason}
                </VisitFindingBlock>
              ) : null}
            </CrmSectionCard>

            <CrmSectionCard title="👥 Property & people" className="lg:col-span-2" bodyClassName="space-y-3 p-3 sm:p-4">
              <VisitPersonChip person={report.agent} label="Agent" />
              <VisitPersonChip person={report.owner} label="Owner" />
              <div className="border-t border-[var(--border-color)] pt-3">
                <VisitMetaRow emoji="🏡" label="Property" value={propertyLabel(report.property)} />
                <VisitMetaRow
                  emoji="📌"
                  label="Location"
                  value={[report.property?.city, report.property?.district, report.property?.state]
                    .filter(Boolean)
                    .join(", ")}
                />
                <VisitMetaRow emoji="#️⃣" label="Khasra" value={report.property?.khasraNumber} />
                <VisitMetaRow emoji="⚖️" label="Legal check" value={report.legalCheckSummary} />
                {report.localAreaMapUrl ? (
                  <VisitMetaRow
                    emoji="🗺️"
                    label="Area map"
                    value={
                      <a
                        href={report.localAreaMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                      >
                        <MapPin size={12} /> Open map
                      </a>
                    }
                  />
                ) : null}
              </div>
            </CrmSectionCard>
          </div>

          {photos.length ? (
            <CrmSectionCard title={`📷 Media · ${photos.length}`} bodyClassName="p-3 sm:p-4">
              <p className="mb-3 text-[12px] text-[var(--text-muted)]">Tap a tile to zoom — use the arrows to browse photos, video, and audio.</p>
              <VisitPhotoGrid photos={photos} />
            </CrmSectionCard>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CrmSectionCard title="🗂️ Section reviews" bodyClassName="p-3 sm:p-4">
              <VisitJsonBlock value={visitSectionReviewsValue(report)} empty="No section reviews yet" />
            </CrmSectionCard>
            <CrmSectionCard title="☑️ Checklist" bodyClassName="p-3 sm:p-4">
              <VisitJsonBlock value={visitChecklistValue(report)} empty="No checklist submitted" />
            </CrmSectionCard>
          </div>

          {report.legalDisclaimer ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)]/60 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              ℹ️ {report.legalDisclaimer}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
