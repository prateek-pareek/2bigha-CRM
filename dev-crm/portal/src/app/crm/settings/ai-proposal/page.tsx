"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import {
  AiProposalSettingsForm,
  type ProposalAiSettingsForm,
} from "@/components/crm/proposals/AiProposalSettingsForm";

const EMPTY: ProposalAiSettingsForm = {
  enabled: true,
  defaultIssuerProfile: "agency",
  useSharedOutreachContext: true,
  agencyName: "",
  agencyIntro: "",
  agencyServices: "",
  agencyDifferentiators: "",
  agencyPaymentTerms: "",
  agencyTechStack: "",
  agencyPortfolio: "",
  freelancerName: "",
  freelancerIntro: "",
  freelancerServices: "",
  freelancerDifferentiators: "",
  freelancerPaymentTerms: "",
  freelancerTechStack: "",
  freelancerPortfolio: "",
  tonePreset: "consultative",
  sectionOutline: "",
  mustInclude: "",
  mustAvoid: "",
  additionalContext: "",
};

export default function AiProposalSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canRead =
    hasAccess("settings:read") ||
    hasAccess("settings:write") ||
    hasAccess("proposals:read");
  const canWrite = hasAccess("settings:write");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingMathionix, setApplyingMathionix] = useState(false);
  const [form, setForm] = useState<ProposalAiSettingsForm>(EMPTY);
  const [profileTab, setProfileTab] = useState<"agency" | "freelancer">("agency");

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ai/proposal-settings`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        toast.error("Could not load AI proposal settings");
        setForm(EMPTY);
        return;
      }
      const data = (await res.json()) as Partial<ProposalAiSettingsForm>;
      setForm({
        enabled: data.enabled !== false,
        defaultIssuerProfile:
          data.defaultIssuerProfile === "freelancer" ? "freelancer" : "agency",
        useSharedOutreachContext: data.useSharedOutreachContext !== false,
        agencyName: data.agencyName ?? "",
        agencyIntro: data.agencyIntro ?? "",
        agencyServices: data.agencyServices ?? "",
        agencyDifferentiators: data.agencyDifferentiators ?? "",
        agencyPaymentTerms: data.agencyPaymentTerms ?? "",
        agencyTechStack: data.agencyTechStack ?? "",
        agencyPortfolio: data.agencyPortfolio ?? "",
        freelancerName: data.freelancerName ?? "",
        freelancerIntro: data.freelancerIntro ?? "",
        freelancerServices: data.freelancerServices ?? "",
        freelancerDifferentiators: data.freelancerDifferentiators ?? "",
        freelancerPaymentTerms: data.freelancerPaymentTerms ?? "",
        freelancerTechStack: data.freelancerTechStack ?? "",
        freelancerPortfolio: data.freelancerPortfolio ?? "",
        tonePreset: data.tonePreset || "consultative",
        sectionOutline: data.sectionOutline ?? "",
        mustInclude: data.mustInclude ?? "",
        mustAvoid: data.mustAvoid ?? "",
        additionalContext: data.additionalContext ?? "",
        updatedAt: data.updatedAt,
        apiKeyConfigured: data.apiKeyConfigured,
        settingsPersisted: data.settingsPersisted,
      });
      setProfileTab(
        data.defaultIssuerProfile === "freelancer" ? "freelancer" : "agency",
      );
    } catch {
      toast.error("Network error loading settings");
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded, load]);

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ai/proposal-settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.message === "string" ? data.message : "Save failed");
        return;
      }
      if ((data as { saveFailed?: boolean }).saveFailed) {
        toast.error("Could not save to the database.");
      } else {
        toast.success("AI proposal settings saved");
      }
      setForm((prev) => ({ ...prev, ...(data as ProposalAiSettingsForm) }));
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  const applyMathionix = async () => {
    if (!canWrite) return;
    setApplyingMathionix(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/ai/proposal-settings/apply-mathionix-defaults`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.message === "string" ? data.message : "Could not load defaults");
        return;
      }
      setForm((prev) => ({ ...prev, ...(data as ProposalAiSettingsForm) }));
      toast.success("Mathionix agency defaults loaded");
    } catch {
      toast.error("Network error");
    } finally {
      setApplyingMathionix(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 py-8 text-center">
        <p className="text-text-muted">
          You need settings or proposals access to view AI proposal configuration.
        </p>
        <Link href="/crm/settings" className="text-primary font-semibold hover:underline">
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div>
        <Link
          href="/crm/settings"
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-primary"
        >
          <ChevronLeft size={16} />
          Settings
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <div className="rounded-[var(--radius-md)] bg-primary/10 p-3 text-primary">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">AI proposal drafter</h1>
            <p className="mt-1 text-sm text-text-muted leading-relaxed">
              Configure agency vs freelancer profiles, sections, payment terms, and tone for
              beautifully formatted IT consulting proposals. Use{" "}
              <Link href="/crm/proposals" className="text-primary underline">
                CRM → Proposals
              </Link>{" "}
              to draft from leads, contacts, deals, and platform opportunities.
            </p>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <AiProposalSettingsForm
          form={form}
          canWrite={canWrite}
          saving={saving}
          applyingMathionix={applyingMathionix}
          profileTab={profileTab}
          onProfileTab={setProfileTab}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onSave={() => void save()}
          onApplyMathionixDefaults={() => void applyMathionix()}
        />
      )}
    </div>
  );
}
