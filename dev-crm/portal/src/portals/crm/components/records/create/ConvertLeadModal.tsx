"use client";

import { useState, useEffect } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { useRouter } from "next/navigation";
import { User, Building2, Handshake, Loader2, UserCheck, CheckCircle2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";

interface ConvertLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  lead: {
    firstName: string;
    lastName: string;
    organization?: string;
    annualRevenue?: number;
  };
  onSuccess?: () => void;
}

export default function ConvertLeadModal({
  isOpen,
  onClose,
  leadId,
  lead,
  onSuccess,
}: ConvertLeadModalProps) {
  const router = useRouter();
  const { user } = usePermissions();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [convertType, setConvertType] = useState<
    "contact" | "organization" | "deal" | "client"
  >("contact");
  const [dealPipelines, setDealPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  useEffect(() => {
    if (isOpen && convertType === "deal") {
      const token = localStorage.getItem("token");
      fetch(`${CRM_API_URL}/crm/pipelines?type=deals`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setDealPipelines(data);
          if (data.length > 0) {
            const assignedPipeline = (user as any)?.assignedDealsPipeline;
            if (
              assignedPipeline &&
              data.some((p: any) => p._id === assignedPipeline)
            ) {
              setSelectedPipelineId(assignedPipeline);
            } else {
              const defaultP = data.find((p: any) => p.isDefault) || data[0];
              setSelectedPipelineId(defaultP._id);
            }
          }
        });
    }
  }, [isOpen, convertType, user]);

  useEffect(() => {
    if (!isOpen) {
      setSuccess(false);
      setConvertType("contact");
    }
  }, [isOpen]);

  const handleConvert = async () => {
    if (!leadId) {
      alert("Invalid lead ID");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: convertType,
          ...(convertType === "deal" &&
            selectedPipelineId && { pipelineId: selectedPipelineId }),
        }),
      });
      if (res.ok) {
        const { type, entity } = await res.json();
        invalidateCrmForEntityType(
          type === "organization" ? "organization" : type,
        );
        invalidateCrmForEntityType("lead");
        if (type === "client") {
          setSuccess(true);
          onSuccess?.();
          setTimeout(() => {
            onClose();
            setSuccess(false);
          }, 2000);
        } else {
          onClose();
          onSuccess?.();
          if (type === "contact") router.push(`/crm/contacts/${entity._id}`);
          else if (type === "organization")
            router.push(`/crm/organizations/${entity._id}`);
          else if (type === "deal") router.push(`/crm/deals/${entity._id}`);
        }
      } else {
        const err = await res.json();
        alert(err.message || "Failed to convert lead");
      }
    } catch (err) {
      console.error("Fetch error during lead conversion:", err);
      alert(
        `Failed to convert lead: ${err instanceof Error ? err.message : "Network error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const convertLabel =
    convertType === "contact"
      ? "Contact"
      : convertType === "organization"
        ? "Organization"
        : convertType === "deal"
          ? "Deal"
          : "Client";

  const panel = (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={success ? "Converted" : "Convert lead"}
      subtitle={
        success
          ? undefined
          : `${lead.firstName} ${lead.lastName} — choose what to create`
      }
      headerTone="hubspot"
      maxWidthClass="max-w-lg"
      footer={
        success ? undefined : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConvert}
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              Convert to {convertLabel}
            </button>
          </div>
        )
      }
    >
      {success ? (
        <div className="py-8 flex flex-col items-center text-center space-y-4">
          <div className="w-20 h-20 rounded-[var(--crm-radius-ui)] bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle2 size={44} />
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium max-w-xs">
            The lead has been successfully converted to a client record.
          </p>
        </div>
      ) : (
        <div className="space-y-4 -mx-1">
          {(
            [
              {
                type: "contact" as const,
                label: "Contact",
                icon: User,
                desc: "Create a new contact from this lead",
              },
              {
                type: "organization" as const,
                label: "Organization",
                icon: Building2,
                desc: "Create organization from company info",
              },
              {
                type: "deal" as const,
                label: "Deal",
                icon: Handshake,
                desc: "Move to sales pipeline as a deal",
              },
              {
                type: "client" as const,
                label: "Client",
                icon: UserCheck,
                desc: "Convert directly to a Client record",
              },
            ] as const
          ).map(({ type, label, icon: Icon, desc }) => (
            <button
              key={type}
              type="button"
              onClick={() => setConvertType(type)}
              className={`w-full flex items-center gap-4 p-4 rounded-[var(--radius-md)] border-2 transition-all text-left ${
                convertType === type
                  ? "border-[var(--hs-link)] bg-[var(--primary)]/5"
                  : "border-[var(--border-color)] hover:border-[var(--hs-link)]/40 hover:bg-[var(--background)]"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 ${
                  convertType === type
                    ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "bg-[var(--background)] text-[var(--text-muted)]"
                }`}
              >
                <Icon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--text-main)]">{label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{desc}</p>
              </div>
            </button>
          ))}

          {convertType === "deal" && dealPipelines.length > 0 ? (
            <div className="pt-1">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                Deal pipeline
              </label>
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                disabled={!!(user as any)?.assignedDealsPipeline}
                title={
                  (user as any)?.assignedDealsPipeline
                    ? "Pipeline is fixed for your account"
                    : "Choose deal pipeline"
                }
                className={`w-full mt-1.5 h-10 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-medium text-[var(--text-main)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/35 ${
                  (user as any)?.assignedDealsPipeline
                    ? "cursor-not-allowed opacity-90"
                    : "cursor-pointer"
                }`}
              >
                {dealPipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      )}
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
