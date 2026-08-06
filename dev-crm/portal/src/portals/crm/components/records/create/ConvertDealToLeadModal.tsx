"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, UserRound, Loader2, CheckCircle2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import { crmModalChrome } from "@/lib/crm/chrome";

interface ConvertDealToLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealTitle: string;
  hasSourceLead?: boolean;
  onSuccess?: () => void;
}

export default function ConvertDealToLeadModal({
  isOpen,
  onClose,
  dealId,
  dealTitle,
  hasSourceLead,
  onSuccess,
}: ConvertDealToLeadModalProps) {
  const router = useRouter();
  const { user } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [leadPipelines, setLeadPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSuccess(false);
      return;
    }
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/pipelines?type=leads`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setLeadPipelines(list);
        if (list.length > 0) {
          const assignedPipeline = (user as any)?.assignedLeadsPipeline;
          if (
            assignedPipeline &&
            list.some((p: any) => p._id === assignedPipeline)
          ) {
            setSelectedPipelineId(assignedPipeline);
          } else {
            const defaultP = list.find((p: any) => p.isDefault) || list[0];
            setSelectedPipelineId(defaultP._id);
          }
        }
      })
      .catch(() => setLeadPipelines([]));
  }, [isOpen, user]);

  const handleConvert = async () => {
    if (!dealId) {
      alert("Invalid deal ID");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${CRM_API_URL}/crm/deals/${dealId}/convert-to-lead`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...(selectedPipelineId ? { pipelineId: selectedPipelineId } : {}),
          }),
        },
      );
      if (res.ok) {
        const { entity } = await res.json();
        invalidateCrmForEntityType("deal");
        invalidateCrmForEntityType("lead");
        setSuccess(true);
        onSuccess?.();
        setTimeout(() => {
          onClose();
          setSuccess(false);
          if (entity?._id) router.push(`/crm/leads/${entity._id}`);
          else router.push("/crm/leads");
        }, 1200);
      } else {
        const err = await res.json();
        alert(err.message || "Failed to convert deal to lead");
      }
    } catch (err) {
      console.error("Fetch error during deal→lead conversion:", err);
      alert("Network error during conversion");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`${crmModalChrome.overlay} z-[999] flex items-center justify-center p-4`}
    >
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-md crm-modal`}>
        {success ? (
          <div className="flex flex-col items-center space-y-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[#e3fcef] text-[#00875a]">
              <CheckCircle2 size={32} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-base font-medium text-[var(--text-main)]">
                Convert success
              </h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                The deal has been converted back to a lead. Opening lead…
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className={crmModalChrome.centerHeader}>
              <div className="min-w-0 flex-1">
                <h2 className={crmModalChrome.centerTitle}>Convert to lead</h2>
                <p className={crmModalChrome.centerLead}>
                  Move deal &quot;{dealTitle}&quot; back into the lead pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={crmModalChrome.closeBtn}
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex flex-col items-center space-y-4 px-5 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--primary-light)] text-[var(--primary)]">
                <UserRound size={28} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--text-main)]">
                  Ready to convert?
                </h3>
                <p className="mx-auto mt-2 max-w-[300px] text-sm text-[var(--text-muted)]">
                  {hasSourceLead
                    ? "This will reopen the original lead and mark the deal as lost."
                    : "This will create a lead from this deal and mark the deal as lost."}
                </p>
              </div>
              {leadPipelines.length > 0 ? (
                <div className="w-full text-left">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Lead pipeline
                  </label>
                  <select
                    value={selectedPipelineId}
                    onChange={(e) => setSelectedPipelineId(e.target.value)}
                    disabled={!!(user as any)?.assignedLeadsPipeline}
                    title={
                      (user as any)?.assignedLeadsPipeline
                        ? "Pipeline is fixed for your account"
                        : "Choose lead pipeline"
                    }
                    className={`mt-1.5 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm font-medium text-[var(--text-main)] outline-none focus:border-[var(--primary)] ${
                      (user as any)?.assignedLeadsPipeline
                        ? "cursor-not-allowed opacity-90"
                        : "cursor-pointer"
                    }`}
                  >
                    {leadPipelines.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className={`${crmModalChrome.centerFooter} gap-2`}>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={loading}
                className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-sm font-medium text-white hover:bg-[var(--primary-dark)] disabled:opacity-70"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? "Converting…" : "Convert now"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
