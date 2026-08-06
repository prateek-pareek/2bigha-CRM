"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, ListChecks, Save, ShieldCheck } from "lucide-react";
import DeliverabilityPillarsCallout from "@/components/crm/email/deliverability/DeliverabilityPillarsCallout";
import { DELIVERABILITY_CHECKLIST_TOTAL } from "@/lib/crm/deliverability-checklist-data";
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from "sonner";

type DeliverabilitySettings = {
  enforceSendLimits: boolean;
  maxEmailsPerHourPerAccount: number;
  maxEmailsPerDayPerAccount: number;
  enableWarmupRamp: boolean;
  commercialMailingAddress: string;
  requireCommercialFooter: boolean;
  blockHighRiskComposerSends: boolean;
  emailTrackingEnabled: boolean;
  optOutFooterStyle: "natural" | "formal";
  enforceHumanOutreachChecks: boolean;
  minOutreachBodyWords: number;
  maxOutreachBodyWords: number;
  maxOutreachParagraphs: number;
  blockNonHumanOutreachSends: boolean;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

export default function EmailDeliverabilitySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<DeliverabilitySettings>({
    enforceSendLimits: false,
    maxEmailsPerHourPerAccount: 40,
    maxEmailsPerDayPerAccount: 200,
    enableWarmupRamp: true,
    commercialMailingAddress: "",
    requireCommercialFooter: true,
    blockHighRiskComposerSends: false,
    emailTrackingEnabled: true,
    optOutFooterStyle: "natural",
    enforceHumanOutreachChecks: true,
    minOutreachBodyWords: 50,
    maxOutreachBodyWords: 90,
    maxOutreachParagraphs: 3,
    blockNonHumanOutreachSends: false,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/settings/email-deliverability`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setSettings({
          enforceSendLimits: data?.enforceSendLimits === true,
          maxEmailsPerHourPerAccount: Number(data?.maxEmailsPerHourPerAccount || 40),
          maxEmailsPerDayPerAccount: Number(data?.maxEmailsPerDayPerAccount || 200),
          enableWarmupRamp: data?.enableWarmupRamp !== false,
          commercialMailingAddress: String(data?.commercialMailingAddress || ""),
          requireCommercialFooter: data?.requireCommercialFooter !== false,
          blockHighRiskComposerSends: data?.blockHighRiskComposerSends === true,
          emailTrackingEnabled: data?.emailTrackingEnabled !== false,
          optOutFooterStyle:
            data?.optOutFooterStyle === "formal" ? "formal" : "natural",
          enforceHumanOutreachChecks: data?.enforceHumanOutreachChecks !== false,
          minOutreachBodyWords: Math.max(
            20,
            Number(data?.minOutreachBodyWords ?? 50),
          ),
          maxOutreachBodyWords: Math.max(
            Math.max(20, Number(data?.minOutreachBodyWords ?? 50)) + 10,
            Number(data?.maxOutreachBodyWords ?? 90),
          ),
          maxOutreachParagraphs: Math.max(
            1,
            Number(data?.maxOutreachParagraphs ?? 3),
          ),
          blockNonHumanOutreachSends: data?.blockNonHumanOutreachSends === true,
        });
      } catch {
        toast.error("Failed to load deliverability settings");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const saveSettings = async () => {
    const hourly = Math.max(1, Math.floor(Number(settings.maxEmailsPerHourPerAccount || 1)));
    const daily = Math.max(hourly, Math.floor(Number(settings.maxEmailsPerDayPerAccount || hourly)));
    setSaving(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/email-deliverability`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          enforceSendLimits: settings.enforceSendLimits,
          maxEmailsPerHourPerAccount: hourly,
          maxEmailsPerDayPerAccount: daily,
          enableWarmupRamp: settings.enableWarmupRamp,
          commercialMailingAddress: settings.commercialMailingAddress.trim(),
          requireCommercialFooter: settings.requireCommercialFooter,
          blockHighRiskComposerSends: settings.blockHighRiskComposerSends,
          emailTrackingEnabled: settings.emailTrackingEnabled,
          optOutFooterStyle: settings.optOutFooterStyle,
          enforceHumanOutreachChecks: settings.enforceHumanOutreachChecks,
          minOutreachBodyWords: settings.minOutreachBodyWords,
          maxOutreachBodyWords: settings.maxOutreachBodyWords,
          maxOutreachParagraphs: settings.maxOutreachParagraphs,
          blockNonHumanOutreachSends: settings.blockNonHumanOutreachSends,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || "Failed to save settings");
      }
      const data = await res.json();
      setSettings({
        enforceSendLimits: data?.enforceSendLimits === true,
        maxEmailsPerHourPerAccount: Number(data?.maxEmailsPerHourPerAccount || hourly),
        maxEmailsPerDayPerAccount: Number(data?.maxEmailsPerDayPerAccount || daily),
        enableWarmupRamp: data?.enableWarmupRamp !== false,
        commercialMailingAddress: String(data?.commercialMailingAddress || ""),
        requireCommercialFooter: data?.requireCommercialFooter !== false,
        blockHighRiskComposerSends: data?.blockHighRiskComposerSends === true,
        emailTrackingEnabled: data?.emailTrackingEnabled !== false,
        optOutFooterStyle:
          data?.optOutFooterStyle === "formal" ? "formal" : "natural",
        enforceHumanOutreachChecks: data?.enforceHumanOutreachChecks !== false,
        minOutreachBodyWords: Math.max(
          20,
          Number(data?.minOutreachBodyWords ?? 50),
        ),
        maxOutreachBodyWords: Math.max(
          Math.max(20, Number(data?.minOutreachBodyWords ?? 50)) + 10,
          Number(data?.maxOutreachBodyWords ?? 90),
        ),
        maxOutreachParagraphs: Math.max(
          1,
          Number(data?.maxOutreachParagraphs ?? 3),
        ),
        blockNonHumanOutreachSends: data?.blockNonHumanOutreachSends === true,
      });
      toast.success("Deliverability settings updated");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          <h1 className="text-[20px] font-semibold text-[var(--text-main)]">Email Deliverability</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Sending caps, warmup ramp, compliance footer, and composer safeguards aligned with the{" "}
            {DELIVERABILITY_CHECKLIST_TOTAL}-point deliverability checklist.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link
              href="/crm/settings/email-deliverability/checklist"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-link)] hover:underline"
            >
              <ListChecks size={13} />
              Deliverability checklist
            </Link>
            <Link
              href="/crm/settings/email-deliverability/undeliverable"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hs-link)] hover:underline"
            >
              Undeliverable contacts
            </Link>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-4">
          <DeliverabilityPillarsCallout />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading settings...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-[var(--border-color)] bg-white p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-md bg-blue-50">
                    <ShieldCheck size={16} className="text-blue-600" />
                  </div>
                  <h2 className="text-base font-semibold text-[var(--text-main)]">Sending caps & warmup</h2>
                </div>

                <label className="flex items-center gap-3 p-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)]">
                  <input
                    type="checkbox"
                    checked={settings.enforceSendLimits}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, enforceSendLimits: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    Enforce sending limits per inbox account
                  </span>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)]">
                  <input
                    type="checkbox"
                    checked={settings.enableWarmupRamp}
                    disabled={!settings.enforceSendLimits}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, enableWarmupRamp: e.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    Warmup ramp for new mailboxes (20/day → full cap over ~4 weeks)
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                      Max emails per hour
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.maxEmailsPerHourPerAccount}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (!isNaN(v))
                          setSettings((s) => ({
                            ...s,
                            maxEmailsPerHourPerAccount: Math.max(1, v),
                          }));
                      }}
                      className="w-full h-9 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                      Max emails per day (after warmup)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={settings.maxEmailsPerDayPerAccount}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (!isNaN(v))
                          setSettings((s) => ({
                            ...s,
                            maxEmailsPerDayPerAccount: Math.max(1, v),
                          }));
                      }}
                      className="w-full h-9 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-semibold"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[var(--border-color)] bg-white p-5 space-y-4">
                <h2 className="text-base font-semibold text-[var(--text-main)]">
                  Human outreach validation
                </h2>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Keeps bulk and first-touch outreach short and conversational — not long,
                  templated, or AI-sounding. Shown in the composer before send; thread replies are
                  skipped.
                </p>
                <label className="flex items-center gap-3 p-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)]">
                  <input
                    type="checkbox"
                    checked={settings.enforceHumanOutreachChecks}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        enforceHumanOutreachChecks: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    Validate length and tone for new outbound emails
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                      Min words
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!settings.enforceHumanOutreachChecks}
                      value={settings.minOutreachBodyWords}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (!isNaN(v))
                          setSettings((s) => {
                            const min = Math.max(20, v);
                            return {
                              ...s,
                              minOutreachBodyWords: min,
                              maxOutreachBodyWords: Math.max(min + 10, s.maxOutreachBodyWords),
                            };
                          });
                      }}
                      className="w-full h-9 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-semibold disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                      Max words
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!settings.enforceHumanOutreachChecks}
                      value={settings.maxOutreachBodyWords}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (!isNaN(v))
                          setSettings((s) => ({
                            ...s,
                            maxOutreachBodyWords: Math.max(s.minOutreachBodyWords + 10, v),
                          }));
                      }}
                      className="w-full h-9 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-semibold disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                      Max paragraphs
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!settings.enforceHumanOutreachChecks}
                      value={settings.maxOutreachParagraphs}
                      onChange={(e) => {
                        const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (!isNaN(v))
                          setSettings((s) => ({
                            ...s,
                            maxOutreachParagraphs: Math.max(1, v),
                          }));
                      }}
                      className="w-full h-9 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm font-semibold disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Target for outreach:{" "}
                  <strong>
                    {settings.minOutreachBodyWords}–{settings.maxOutreachBodyWords} words
                  </strong>{" "}
                  in up to <strong>{settings.maxOutreachParagraphs}</strong> short paragraph
                  {settings.maxOutreachParagraphs === 1 ? "" : "s"}. Also flags buzzwords, bullet
                  lists, and templated phrasing.
                </p>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.blockNonHumanOutreachSends}
                    disabled={!settings.enforceHumanOutreachChecks}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        blockNonHumanOutreachSends: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 disabled:opacity-50"
                  />
                  <span className="text-sm text-[var(--text-main)]">
                    Block send when validation fails (otherwise warn and confirm)
                  </span>
                </label>
              </div>

              <div className="rounded-md border border-[var(--border-color)] bg-white p-5 space-y-4">
                <h2 className="text-base font-semibold text-[var(--text-main)]">
                  Opt-out footer
                </h2>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Shown on new outbound emails (outreach, bulk sends, workflows). Replies in existing
                  threads skip the footer. List-Unsubscribe headers stay active for deliverability.
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-3">
                    <input
                      type="radio"
                      name="optOutFooterStyle"
                      checked={settings.optOutFooterStyle === "natural"}
                      onChange={() =>
                        setSettings((s) => ({ ...s, optOutFooterStyle: "natural" }))
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[var(--text-main)]">
                        Natural (recommended for outreach)
                      </span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">
                        Reads like a real person: &quot;P.S. If this isn&apos;t relevant, just reply
                        — no hard feelings…&quot;
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-3">
                    <input
                      type="radio"
                      name="optOutFooterStyle"
                      checked={settings.optOutFooterStyle === "formal"}
                      onChange={() =>
                        setSettings((s) => ({ ...s, optOutFooterStyle: "formal" }))
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-[var(--text-main)]">
                        Formal compliance
                      </span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">
                        Standard legal-style unsubscribe language with visible compliance block.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-[var(--border-color)] bg-white p-5 space-y-4">
                <h2 className="text-base font-semibold text-[var(--text-main)]">
                  Email tracking
                </h2>
                <label className="flex items-center gap-3 p-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)]">
                  <input
                    type="checkbox"
                    checked={settings.emailTrackingEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        emailTrackingEnabled: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    Enable open and click tracking on outbound CRM emails
                  </span>
                </label>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  When enabled, sent emails include a tracking pixel and wrapped links. Disable for
                  privacy-sensitive outreach or to reduce spam-filter risk. Workflow open-tracking
                  and engagement stats require this to be on.
                </p>
              </div>

              <div className="rounded-md border border-[var(--border-color)] bg-white p-5 space-y-4">
                <h2 className="text-base font-semibold text-[var(--text-main)]">
                  Compliance & composer
                </h2>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--primary-muted)]">
                    Physical mailing address (CAN-SPAM)
                  </label>
                  <textarea
                    value={settings.commercialMailingAddress}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        commercialMailingAddress: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="Company Name, 123 Main St, City, ST 12345"
                    className="w-full px-3 py-2 border border-[var(--border-color)] rounded-md text-sm"
                  />
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.requireCommercialFooter}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        requireCommercialFooter: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-[var(--text-main)]">
                    Append address + unsubscribe footer on new outbound emails
                  </span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.blockHighRiskComposerSends}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        blockHighRiskComposerSends: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-[var(--text-main)]">
                    Block send in composer when deliverability score is below 50 (no override)
                  </span>
                </label>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Outbound mail already includes List-Unsubscribe (mailto + one-click when{" "}
                  <code className="text-[11px]">TRACKING_BASE_URL</code> is set), hard-bounce
                  suppression, and inbound unsubscribe detection.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => void saveSettings()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
