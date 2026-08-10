"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import crmApi from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/api/config";
import CrmSlidePanelShell from "@/components/crm/CrmSlidePanelShell";
import SocialPostPreview, {
  coerceSocialMetadata,
  type SocialMetadata,
} from "@/components/crm/SocialPostPreview";
import OpportunitySourcePlatformField from "@/components/crm/OpportunitySourcePlatformField";
import {
  PLATFORM_ENGAGEMENT_STATUSES,
  hasValidPlatformLeadIdentity,
  isCrmSocialPostUrl,
  normalizeSocialPostUrlInput,
} from "@/lib/crm/platform-opportunity";
import { sortPipelineStages } from "@/lib/crm/platform-opportunity-pipeline";

const INP =
  "w-full h-9 rounded-lg border border-[var(--border-color)] bg-white px-3 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-primary/20";
const LBL =
  "block text-[10px] font-bold uppercase tracking-wide text-[var(--primary-muted)] mb-1";

export type PlatformOpportunityEditRecord = {
  _id: string;
  title?: string;
  opportunitySourcePlatform?: string;
  opportunityListingUrl?: string;
  platformClientLabel?: string;
  platformEngagementStatus?: string;
  stage?: string;
  pipeline?: string;
  notes?: string;
  source?: string;
  sourceMetadata?: SocialMetadata | null;
};

export default function PlatformOpportunityCreatePanel({
  isOpen,
  onClose,
  onSuccess,
  editRecord,
  defaultPipelineId,
  pipelineStages = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editRecord?: PlatformOpportunityEditRecord | null;
  defaultPipelineId?: string;
  pipelineStages?: Array<{ name: string; isDefault?: boolean }>;
}) {
  const isEdit = Boolean(editRecord?._id);
  const [loading, setLoading] = useState(false);
  const [sourceMetadata, setSourceMetadata] = useState<SocialMetadata | null>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);

  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    fetch(`${CRM_API_URL}/crm/pipelines?type=platform_opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setPipelines(Array.isArray(data) ? data : []))
      .catch(() => setPipelines([]));
  }, [isOpen]);

  useEffect(() => {
    if (editRecord?.pipeline) {
      setSelectedPipelineId(editRecord.pipeline);
    } else if (defaultPipelineId) {
      setSelectedPipelineId(defaultPipelineId);
    } else if (pipelines.length > 0) {
      const def = pipelines.find((p) => p.isDefault) || pipelines[0];
      setSelectedPipelineId(def?._id || "");
    }
  }, [editRecord, defaultPipelineId, pipelines]);

  useEffect(() => {
    const pipe = pipelines.find((p) => p._id === selectedPipelineId);
    if (pipe) {
      setStages(sortPipelineStages(pipe.stages || []));
    } else {
      setStages([]);
    }
  }, [selectedPipelineId, pipelines]);

  useEffect(() => {
    if (!isOpen) return;
    if (editRecord) {
      setSourceMetadata(coerceSocialMetadata(editRecord.sourceMetadata) ?? null);
    } else {
      setSourceMetadata(null);
    }
  }, [isOpen, editRecord]);

  const fetchSourceMetadata = useCallback(async (url: string) => {
    if (!url || !url.startsWith("http")) return;
    setIsFetchingMetadata(true);
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    try {
      const res = await fetch(`${CRM_API_URL}/crm/fetch-link-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });
      if (res.ok) setSourceMetadata(coerceSocialMetadata(await res.json()));
    } catch (err) {
      console.error("[PlatformOpportunityCreatePanel] fetch-link-metadata failed:", err);
    } finally {
      setIsFetchingMetadata(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<
      string,
      string
    >;

    if (!hasValidPlatformLeadIdentity(data)) {
      toast.error(
        "Choose a platform and add either a valid https listing URL or a client name on the platform.",
      );
      return;
    }

    let parsedSourceMetadata: unknown;
    if (data.sourceMetadata) {
      try {
        parsedSourceMetadata = JSON.parse(data.sourceMetadata);
      } catch {
        parsedSourceMetadata = undefined;
      }
    }

    setLoading(true);
    try {
      const defaultStage =
        stages.find((s) => s.isDefault)?.name ||
        stages[0]?.name ||
        undefined;
      const stageFromForm = data.stage?.trim() || defaultStage;
      const payload = {
        title: data.title?.trim(),
        opportunitySourcePlatform: data.opportunitySourcePlatform,
        opportunityListingUrl: data.opportunityListingUrl?.trim() || undefined,
        platformClientLabel: data.platformClientLabel?.trim() || undefined,
        pipeline: selectedPipelineId || undefined,
        ...(stageFromForm ? { stage: stageFromForm } : {}),
        platformEngagementStatus: data.platformEngagementStatus || "saved",
        notes: data.notes?.trim() || undefined,
        source: data.source?.trim() || undefined,
        sourceMetadata: parsedSourceMetadata,
      };
      if (isEdit && editRecord?._id) {
        await crmApi.patch(`/crm/platform-opportunities/${editRecord._id}`, payload);
        toast.success("Platform opportunity updated.");
      } else {
        await crmApi.post("/crm/platform-opportunities", payload);
        toast.success("Platform opportunity added.");
      }
      onSuccess?.();
      onClose();
      form.reset();
      setSourceMetadata(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Could not save.";
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit platform opportunity" : "Add platform opportunity"}
      subtitle="Upwork, Freelancer, your customer portals, and other boards — track outreach on a kanban board."
    >
      <form
        key={editRecord?._id ?? "create"}
        onSubmit={handleSubmit}
        className="space-y-4 p-4"
      >
        <div>
          <label className={LBL}>Opportunity title *</label>
          <input
            name="title"
            required
            className={INP}
            defaultValue={editRecord?.title ?? ""}
            placeholder="e.g. React dashboard for fintech client"
          />
        </div>

        <div>
          <label className={LBL}>Pipeline</label>
          <select
            name="pipeline"
            className={INP}
            value={selectedPipelineId}
            onChange={(e) => setSelectedPipelineId(e.target.value)}
          >
            {pipelines.length === 0 && <option value="">No pipeline available</option>}
            {pipelines.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} {p.isDefault ? "(default)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <OpportunitySourcePlatformField
            required
            enableSaveToTeamList
            labelClassName={LBL}
            inputClassName={INP}
            legacyValue={editRecord?.opportunitySourcePlatform}
          />
          <div>
            <label className={LBL}>
              {stages.length ? "Pipeline stage" : "Outreach status"}
            </label>
            {stages.length ? (
              <select
                name="stage"
                className={INP}
                defaultValue={
                  editRecord?.stage ||
                  stages.find((s) => s.isDefault)?.name ||
                  stages[0]?.name
                }
              >
                {stages.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="platformEngagementStatus"
                className={INP}
                defaultValue={editRecord?.platformEngagementStatus ?? "saved"}
              >
                {PLATFORM_ENGAGEMENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div>
          <label className={LBL}>Listing / project URL</label>
          <input
            name="opportunityListingUrl"
            type="url"
            className={INP}
            defaultValue={editRecord?.opportunityListingUrl ?? ""}
            placeholder="https://www.upwork.com/jobs/…"
          />
          <p className="text-[11px] text-[var(--primary-muted)] mt-1">
            Required if you do not enter a client name below.
          </p>
        </div>

        <div>
          <label className={LBL}>Client on platform</label>
          <input
            name="platformClientLabel"
            className={INP}
            defaultValue={editRecord?.platformClientLabel ?? ""}
            placeholder="Client or company name on the board"
          />
        </div>

        <div>
          <label className={LBL}>Social post source (optional)</label>
          <input
            name="source"
            type="text"
            className={INP}
            defaultValue={editRecord?.source ?? ""}
            placeholder="Paste LinkedIn, Threads, or Facebook post URL…"
            onBlur={(e) => {
              const val = normalizeSocialPostUrlInput(e.target.value);
              if (val !== e.target.value) e.target.value = val;
              if (isCrmSocialPostUrl(val)) void fetchSourceMetadata(val);
              else setSourceMetadata(null);
            }}
          />
          {isFetchingMetadata && (
            <p className="text-[11px] text-primary mt-1 animate-pulse">
              Fetching post preview…
            </p>
          )}
          {sourceMetadata && <SocialPostPreview metadata={sourceMetadata} />}
          <input
            type="hidden"
            name="sourceMetadata"
            value={sourceMetadata ? JSON.stringify(sourceMetadata) : ""}
          />
        </div>

        <div>
          <label className={LBL}>Notes (optional)</label>
          <textarea
            name="notes"
            className={`${INP} min-h-[72px] py-2 h-auto resize-y`}
            defaultValue={editRecord?.notes ?? ""}
            placeholder="Proposal angle, budget, deadline…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-[var(--border-color)] text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--text-main)] text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </form>
    </CrmSlidePanelShell>
  );
}
