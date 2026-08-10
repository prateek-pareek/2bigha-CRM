"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CRM_API_URL } from '@/lib/crm/config';
import SocialPostPreview, {
  coerceSocialMetadata,
  type SocialMetadata,
} from "@/components/crm/sales/SocialPostPreview";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  Loader2,
  Trash2,
  Briefcase,
  Edit2,
  Share2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import ScheduleMeetingModal from "@/components/crm/inbox/ScheduleMeetingModal";
import PlatformOpportunityCreatePanel, {
  type PlatformOpportunityEditRecord,
} from "@/components/crm/platform/PlatformOpportunityCreatePanel";
import { usePermissions } from "@/hooks/usePermissions";
import Timeline from "@/components/crm/inbox/Timeline";
import CrmRecordActivityComposer from "@/components/crm/inbox/CrmRecordActivityComposer";
import CrmRecordSegmentsPanel from "@/components/crm/segments/CrmRecordSegmentsPanel";
import {
  platformEngagementLabel,
} from "@/lib/crm/platform-opportunity";
import { sortPipelineStages } from "@/lib/crm/platform-opportunity-pipeline";
import crmApi from "@/lib/crm/api";

type PlatformRecord = {
  _id: string;
  title: string;
  opportunitySourcePlatform?: string;
  opportunityListingUrl?: string;
  platformClientLabel?: string;
  platformEngagementStatus?: string;
  stage?: string;
  pipeline?: string;
  platformLastEngagedAt?: string;
  ownerLabel?: string;
  notes?: string;
  source?: string;
  sourceMetadata?: SocialMetadata | null;
  createdAt?: string;
  updatedAt?: string;
};

export default function PlatformOpportunityDetailPage() {
  const { id } = useParams();
  const recordId = String(id || "");
  const router = useRouter();
  const { hasAccess, isLoaded, isAdmin } = usePermissions();
  const canRead =
    isAdmin ||
    hasAccess("platform-opportunities:read") ||
    hasAccess("leads:read");
  const canWrite =
    isAdmin ||
    hasAccess("platform-opportunities:write") ||
    hasAccess("leads:write");

  const [record, setRecord] = useState<PlatformRecord | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityType, setActivityType] = useState("Activity");
  const [newComment, setNewComment] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pipelines, setPipelines] = useState<
    Array<{ _id: string; name: string; stages: Array<{ name: string; isDefault?: boolean; order: number }> }>
  >([]);

  const recordPipeline = useMemo(() => {
    if (!record?.pipeline) return null;
    const pid =
      typeof record.pipeline === "string"
        ? record.pipeline
        : String((record.pipeline as { _id?: string })?._id || "");
    return pipelines.find((p) => p._id === pid) || null;
  }, [record, pipelines]);

  const recordStages = useMemo(
    () => sortPipelineStages(recordPipeline?.stages || []),
    [recordPipeline],
  );

  const fetchRecord = useCallback(async () => {
    if (!recordId || !canRead) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/platform-opportunities/${recordId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Not found");
    setRecord(await res.json());
  }, [recordId, canRead]);

  const fetchActivities = useCallback(async () => {
    if (!recordId) return;
    const token = localStorage.getItem("token");
    const res = await fetch(
      `${CRM_API_URL}/crm/activities?relatedTo=${encodeURIComponent(recordId)}&relatedType=PlatformOpportunity`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) setActivities(await res.json());
  }, [recordId]);

  useEffect(() => {
    if (!isLoaded || !canRead) return;
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/pipelines?type=platform_opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPipelines(Array.isArray(data) ? data : []))
      .catch(() => setPipelines([]));
  }, [isLoaded, canRead]);

  useEffect(() => {
    if (!isLoaded || !canRead) return;
    setLoading(true);
    Promise.all([fetchRecord(), fetchActivities()])
      .catch(() => setRecord(null))
      .finally(() => setLoading(false));
  }, [isLoaded, canRead, fetchRecord, fetchActivities]);

  const title = record?.title || "Platform opportunity";

  if (!isLoaded) return null;

  if (!canRead) {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-600">You do not have access to this module.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-8">
        <p className="text-sm">Opportunity not found.</p>
        <Link href="/crm/platform-opportunities" className="text-sm text-primary mt-2 inline-block">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="border-b border-[var(--border-color)] bg-white px-6 py-5">
        <Link
          href="/crm/platform-opportunities"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary-muted)] hover:text-primary mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Platform opportunities
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-primary" />
              {title}
            </h1>
            <p className="text-sm text-[var(--primary-muted)] mt-1">
              {record.opportunitySourcePlatform}
              {record.platformClientLabel ? ` · ${record.platformClientLabel}` : ""}
              {record.ownerLabel ? ` · ${record.ownerLabel}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {record.opportunityListingUrl && (
                <a
                  href={record.opportunityListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Open listing
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <span className="text-sm font-medium">
                {record.stage || platformEngagementLabel(record.platformEngagementStatus)}
              </span>
              {recordPipeline ? (
                <span className="text-xs text-[var(--primary-muted)]">
                  Pipeline: {recordPipeline.name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && (
              <div className="relative inline-flex items-center">
                <select
                  value={record.pipeline || ""}
                  onChange={async (e) => {
                    const newPipelineId = e.target.value;
                    if (!newPipelineId) return;
                    try {
                      const token = localStorage.getItem("token");
                      const pipeRes = await fetch(`${CRM_API_URL}/crm/pipelines/${newPipelineId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      const pipeData = await pipeRes.json();
                      const sortedStages = sortPipelineStages(pipeData?.stages || []) as any[];
                      const defaultStageName = sortedStages.find((s: any) => s.isDefault)?.name || sortedStages[0]?.name || "";

                      await crmApi.patch(`/crm/platform-opportunities/${recordId}`, {
                        pipeline: newPipelineId,
                        stage: defaultStageName || undefined
                      });
                      toast.success("Pipeline updated successfully.");
                      void fetchRecord();
                      void fetchActivities();
                    } catch (err) {
                      console.error("Failed to update pipeline:", err);
                      toast.error("Failed to update pipeline.");
                    }
                  }}
                  className="h-9 pl-3 pr-8 appearance-none rounded-lg border border-[var(--border-color)] text-sm font-semibold hover:bg-[var(--surface-dim)] bg-white cursor-pointer outline-none focus:ring-2 focus:ring-primary/20 text-[var(--text-main)]"
                >
                  <option value="" disabled>Change Pipeline...</option>
                  {pipelines.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-[var(--primary-muted)] pointer-events-none" />
              </div>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => setIsEditOpen(true)}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-color)] text-sm font-semibold hover:bg-[var(--surface-dim)]"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
            )}
            <button
              type="button"
              disabled={isSharing}
              onClick={async () => {
                const shareData = {
                  title: `${record.title} - Platform opportunity`,
                  text: `${record.opportunitySourcePlatform || "Platform"} · ${record.platformClientLabel || record.title}`,
                  url: window.location.href,
                };
                if (navigator.share) {
                  setIsSharing(true);
                  try {
                    await navigator.share(shareData);
                  } catch (err: unknown) {
                    if ((err as { name?: string }).name !== "AbortError") {
                      await navigator.clipboard.writeText(window.location.href);
                    }
                  } finally {
                    setIsSharing(false);
                  }
                } else {
                  await navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--border-color)] text-sm font-semibold hover:bg-[var(--surface-dim)]"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Delete this platform opportunity?")) return;
                  await crmApi.delete(`/crm/platform-opportunities/${recordId}`);
                  router.push("/crm/platform-opportunities");
                }}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-6 shadow-sm">
            <CrmRecordActivityComposer
              activityType={activityType}
              setActivityType={setActivityType}
              newComment={newComment}
              setNewComment={setNewComment}
              relatedTo={recordId}
              relatedType="PlatformOpportunity"
              lead={{
                source: record.source,
                sourceMetadata: record.sourceMetadata,
              }}
              onActivityPosted={(data) => {
                setActivities((prev) => [data as any, ...prev]);
              }}
              onMeetingScheduleClick={() => setIsMeetingOpen(true)}
            />
            <div className="mt-6">
              <Timeline
                activities={activities}
                filterType={activityType}
                onRefreshNeeded={fetchActivities}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <CrmRecordSegmentsPanel
            module="platform-opportunities"
            entityId={String(record._id)}
            recordLabel={record.title}
          />
          <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
              Details
            </h2>
            <dl className="text-sm space-y-2">
                <div>
                  <dt className="text-[var(--primary-muted)]">Client</dt>
                  <dd>{record.platformClientLabel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--primary-muted)]">Listing URL</dt>
                  <dd className="break-all">{record.opportunityListingUrl || "—"}</dd>
                </div>
                {coerceSocialMetadata(record.sourceMetadata) ? (
                  <div>
                    <dt className="text-[var(--primary-muted)] mb-2">Social post</dt>
                    <dd>
                      <SocialPostPreview
                        metadata={coerceSocialMetadata(record.sourceMetadata)!}
                      />
                    </dd>
                  </div>
                ) : record.source ? (
                  <div>
                    <dt className="text-[var(--primary-muted)]">Social post</dt>
                    <dd className="break-all">{record.source}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[var(--primary-muted)]">Notes</dt>
                  <dd className="whitespace-pre-wrap">{record.notes || "—"}</dd>
                </div>
            </dl>
          </div>
        </div>
      </div>

      <PlatformOpportunityCreatePanel
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editRecord={record as PlatformOpportunityEditRecord}
        onSuccess={() => {
          void fetchRecord();
          void fetchActivities();
        }}
      />

      <ScheduleMeetingModal
        isOpen={isMeetingOpen}
        onClose={() => setIsMeetingOpen(false)}
        entityId={recordId}
        module="platform-opportunities"
        recipientName={record.title}
        onSuccess={() => void fetchActivities()}
      />
    </div>
  );
}
