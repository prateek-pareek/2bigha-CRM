"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import crmApi from "@/lib/crm/api";
import { CRM_API_URL } from '@/lib/crm/config';
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import SocialPostPreview, {
  coerceSocialMetadata,
  type SocialMetadata,
} from "@/components/crm/sales/SocialPostPreview";
import OpportunitySourcePlatformField from "@/components/crm/platform/OpportunitySourcePlatformField";
import {
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_CONTROL_CLASS,
  CRM_HS_LABEL_CLASS,
  CRM_HS_SELECT_CLASS,
} from "@/components/crm/records/forms/crm-form-primitives";
import { CrmButton } from "@/components/crm/ui";
import {
  PLATFORM_ENGAGEMENT_STATUSES,
  hasValidPlatformLeadIdentity,
  isCrmSocialPostUrl,
  normalizeSocialPostUrlInput,
} from "@/lib/crm/platform-opportunity";
import { sortPipelineStages } from "@/lib/crm/platform-opportunity-pipeline";

const INP = CRM_HS_CONTROL_CLASS;
const SEL = CRM_HS_SELECT_CLASS;
const LBL = CRM_HS_LABEL_CLASS;

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
      title={isEdit ? "Edit Platform Opportunity" : "Add Platform Opportunity"}
      headerTone="hubspot"
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <CrmButton variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            type="submit"
            form="platform-opp-form"
            disabled={loading}
            loading={loading}
            leftIcon={!loading ? <Save size={15} /> : undefined}
          >
            {loading ? "Saving…" : "Save"}
          </CrmButton>
        </div>
      }
    >
      <form
        id="platform-opp-form"
        key={editRecord?._id ?? "create"}
        onSubmit={handleSubmit}
        className="space-y-3"
      >
        <CrmFormSection title="Basic Info" defaultOpen>
          <CrmFormGrid>
            <div className="sm:col-span-2">
              <label className={LBL}>
                Opportunity title<span className="text-[var(--primary)]">*</span>
              </label>
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
                className={SEL}
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
            <div>
              <label className={LBL}>
                {stages.length ? "Pipeline stage" : "Outreach status"}
              </label>
              {stages.length ? (
                <select
                  name="stage"
                  className={SEL}
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
                  className={SEL}
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
            <OpportunitySourcePlatformField
              required
              enableSaveToTeamList
              labelClassName={LBL}
              inputClassName={SEL}
              legacyValue={editRecord?.opportunitySourcePlatform}
            />
            <div>
              <label className={LBL}>Client on platform</label>
              <input
                name="platformClientLabel"
                className={INP}
                defaultValue={editRecord?.platformClientLabel ?? ""}
                placeholder="Client or company name on the board"
              />
            </div>
          </CrmFormGrid>
        </CrmFormSection>

        <CrmFormSection title="Listing & Source" defaultOpen={false}>
          <CrmFormGrid>
            <div className="sm:col-span-2">
              <label className={LBL}>Listing / project URL</label>
              <input
                name="opportunityListingUrl"
                type="url"
                className={INP}
                defaultValue={editRecord?.opportunityListingUrl ?? ""}
                placeholder="https://www.upwork.com/jobs/…"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                Required if you do not enter a client name above.
              </p>
            </div>
            <div className="sm:col-span-2">
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
                <p className="text-xs text-[var(--primary)] mt-1.5 animate-pulse">
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
            <div className="sm:col-span-2">
              <label className={LBL}>Notes (optional)</label>
              <textarea
                name="notes"
                className={`${INP} min-h-[72px] py-2.5 h-auto resize-y`}
                defaultValue={editRecord?.notes ?? ""}
                placeholder="Proposal angle, budget, deadline…"
              />
            </div>
          </CrmFormGrid>
        </CrmFormSection>
      </form>
    </CrmSlidePanelShell>
  );
}
