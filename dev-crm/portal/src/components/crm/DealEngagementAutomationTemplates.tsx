"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/api/config";
import type { PipelineAssignment } from "@/lib/crm/lead-engagement-automation";

type Props = {
  canEdit: boolean;
};

export default function DealEngagementAutomationTemplates({ canEdit }: Props) {
  const [assignments, setAssignments] = useState<PipelineAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignSaving, setAssignSaving] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ _id: string; name: string }[]>(
    [],
  );

  const load = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${t}` };
    let loadErrors = 0;

    const pipelinesRes = await fetch(
      `${CRM_API_URL}/crm/pipelines?type=deals`,
      { headers },
    );
    let dealPipelines: { _id: string; name: string }[] = [];
    if (pipelinesRes.ok) {
      try {
        const raw = await pipelinesRes.json();
        dealPipelines = Array.isArray(raw) ? raw : [];
      } catch {
        loadErrors += 1;
      }
    } else {
      loadErrors += 1;
    }

    try {
      const [aRes, tRes] = await Promise.all([
        fetch(
          `${CRM_API_URL}/crm/deal-engagement-templates/pipeline-assignments`,
          { headers },
        ),
        fetch(`${CRM_API_URL}/crm/deal-engagement-templates`, { headers }),
      ]);

      let assignmentRows: PipelineAssignment[] = [];
      if (aRes.ok) {
        try {
          const data = await aRes.json();
          assignmentRows = Array.isArray(data) ? data : [];
        } catch {
          loadErrors += 1;
        }
      } else {
        loadErrors += 1;
      }

      if (tRes.ok) {
        try {
          const data = await tRes.json();
          setTemplates(Array.isArray(data) ? data : []);
        } catch {
          loadErrors += 1;
        }
      } else {
        loadErrors += 1;
      }

      if (!assignmentRows.length && dealPipelines.length > 0) {
        assignmentRows = dealPipelines.map((p) => ({
          pipelineId: String(p._id),
          pipelineName: String(p.name),
          templateId: null,
          templateName: null,
        }));
      }
      setAssignments(assignmentRows);
    } catch {
      loadErrors += 1;
    }

    if (loadErrors > 0 && dealPipelines.length === 0) {
      toast.error(
        "Could not load deal automation. Restart the API server if you recently deployed.",
      );
    } else if (loadErrors > 0) {
      toast.error("Some deal automation data could not be loaded.");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const assignTemplate = async (pipelineId: string, templateId: string) => {
    if (!canEdit) return;
    const t = localStorage.getItem("token");
    setAssignSaving(pipelineId);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/deal-engagement-templates/pipeline-assignments/${pipelineId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ templateId: templateId || null }),
        },
      );
      if (!res.ok) {
        toast.error("Could not update deal pipeline");
        return;
      }
      toast.success("Deal template applied");
      void load();
    } finally {
      setAssignSaving(null);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--text-muted)] flex items-center gap-2 py-4">
        <Loader2 size={16} className="animate-spin" />
        Loading deal automation…
      </p>
    );
  }

  return (
    <div className="rounded-[3px] border border-[var(--border-color)] bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-2 mb-2">
        <Briefcase size={16} className="text-[var(--hs-link)]" />
        Deal pipeline automation
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        System presets: engagement on open/reply and tasks when deals enter key
        stages (Proposal, At risk). Assign per deal pipeline.
      </p>
      {assignments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No deal pipelines found.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((row) => (
            <div
              key={row.pipelineId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-color)] px-3 py-2"
            >
              <span className="text-sm font-medium min-w-[120px]">
                {row.pipelineName}
              </span>
              <select
                disabled={!canEdit || assignSaving === row.pipelineId}
                value={row.templateId || ""}
                onChange={(e) =>
                  void assignTemplate(row.pipelineId, e.target.value)
                }
                className="flex-1 min-w-[200px] h-9 rounded-md border px-2 text-sm bg-white disabled:opacity-50"
              >
                <option value="">No automation</option>
                {templates.map((tpl) => (
                  <option key={tpl._id} value={tpl._id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              {assignSaving === row.pipelineId ? (
                <Loader2 size={14} className="animate-spin text-[var(--hs-link)]" />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
