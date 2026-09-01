"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  CrmButton,
  CrmPageHeader,
  CrmSectionCard,
  CrmSoftBadge,
  CrmStatusBadge,
} from "@/components/crm/ui";
import CrmRecordDetailSkeleton from "@/components/crm/records/detail/CrmRecordDetailSkeleton";
import {
  VisitConfigBanner,
  VisitMetaRow,
  VisitPersonChip,
} from "@/components/crm/visits/visit-chrome";
import { fetchVisitRequestById, type VisitRequest } from "@/lib/crm/twobigha-visits-api";
import {
  asVisitPerson,
  coalesceVisitProperty,
  formatVisitCategory,
  formatVisitDate,
  formatVisitStatus,
  propertyLabel,
  visitCategoryTone,
  visitRequestStatusTone,
} from "@/lib/crm/visits/visit-ui";

export default function VisitRequestDetailPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = params.requestId;
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [request, setRequest] = useState<VisitRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchVisitRequestById(requestId);
      setConfigured(result.configured);
      setRequest(result.data);
      if (result.configured && !result.data) toast.error("Visit request not found");
    } catch {
      toast.error("Failed to load visit request");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <CrmRecordDetailSkeleton />;

  const property = coalesceVisitProperty(request?.property);
  const title = request
    ? propertyLabel(property) !== "—"
      ? propertyLabel(property)
      : `Request ${requestId}`
    : `Request ${requestId}`;
  const assigned = asVisitPerson(request?.assignedAgent);

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        icon={<ClipboardList size={18} />}
        title={title}
        badge={
          request ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <CrmStatusBadge tone={visitRequestStatusTone(request.visitRequestStatus)}>
                {formatVisitStatus(request.visitRequestStatus)}
              </CrmStatusBadge>
              <CrmSoftBadge
                label={formatVisitCategory(request.visitCategory)}
                tone={visitCategoryTone(request.visitCategory)}
              />
            </div>
          ) : undefined
        }
        description={
          request
            ? `Preferred ${formatVisitDate(request.preferredDate)}${request.preferredTimeSlot ? ` · ${request.preferredTimeSlot}` : ""}`
            : undefined
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Visit tracking", href: "/crm/visits?tab=requests" },
          { label: title },
        ]}
        actions={
          <CrmButton
            variant="secondary"
            onClick={() => router.push("/crm/visits?tab=requests")}
            leftIcon={<ArrowLeft size={14} />}
          >
            Back
          </CrmButton>
        }
        className="mb-4"
      />

      {!configured ? (
        <VisitConfigBanner />
      ) : !request ? (
        <CrmSectionCard title="Request unavailable" bodyClassName="p-4">
          <p className="text-sm text-[var(--text-main)]">
            Request #{requestId} is not available to open.
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            It may have been removed, or 2bigha did not return a matching visit request.
          </p>
          <CrmButton
            className="mt-4"
            variant="secondary"
            onClick={() => router.push("/crm/visits?tab=requests")}
            leftIcon={<ArrowLeft size={14} />}
          >
            Back to visit tracking
          </CrmButton>
        </CrmSectionCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <CrmSectionCard title="📨 Request" className="lg:col-span-3" bodyClassName="p-3 sm:px-4 sm:py-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-[var(--radius-md)] border border-sky-100 bg-sky-50/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">📅 Preferred date</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">{formatVisitDate(request.preferredDate)}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-amber-100 bg-amber-50/70 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">🕐 Time slot</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--text-main)]">{request.preferredTimeSlot || "—"}</p>
              </div>
            </div>
            <VisitMetaRow emoji="🆕" label="Created" value={formatVisitDate(request.createdAt)} />
            <VisitMetaRow emoji="🔄" label="Updated" value={formatVisitDate(request.updatedAt)} />
            <VisitMetaRow emoji="🧭" label="Agent assigned at" value={formatVisitDate(request.agentAssignedAt)} />
            <VisitMetaRow emoji="💬" label="Status reason" value={request.statusReason} />
            <VisitMetaRow emoji="📝" label="Description" value={request.description} />
          </CrmSectionCard>

          <CrmSectionCard title="👥 People & property" className="lg:col-span-2" bodyClassName="space-y-3 p-3 sm:p-4">
            <VisitPersonChip person={request.requestedBy} label="Requested by" />
            <VisitPersonChip person={request.owner} label="Owner" />
            <VisitPersonChip person={assigned} label="Assigned agent" />
            <div className="border-t border-[var(--border-color)] pt-3">
              <VisitMetaRow emoji="🏡" label="Property" value={propertyLabel(property)} />
              <VisitMetaRow
                emoji="📌"
                label="Location"
                value={[property?.city, property?.state].filter(Boolean).join(", ") || undefined}
              />
              <VisitMetaRow emoji="#️⃣" label="Khasra" value={property?.khasraNumber} />
            </div>
          </CrmSectionCard>
        </div>
      )}
    </div>
  );
}
