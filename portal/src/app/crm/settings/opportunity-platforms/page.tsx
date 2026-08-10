"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS,
  normalizeOpportunityPlatformName,
} from "@/lib/crm/crm-opportunity-portal-options";
import { invalidateOpportunitySourcePlatformsCache } from '@/lib/crm/hooks/useOpportunitySourcePlatforms';

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

export default function CrmOpportunityPlatformsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = getToken();
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/opportunity-platforms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setCustom(Array.isArray(data.custom) ? data.custom : []);
    } catch {
      toast.error("Could not load platform settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addDraft = () => {
    const name = normalizeOpportunityPlatformName(draft);
    if (name.length < 2) {
      toast.error("Enter a platform name (at least 2 characters).");
      return;
    }
    const key = name.toLowerCase();
    if (
      CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS.some((b) => b.toLowerCase() === key)
    ) {
      toast.error("That name is already in the built-in list.");
      return;
    }
    if (custom.some((c) => c.toLowerCase() === key)) {
      toast.error("That platform is already on your team list.");
      return;
    }
    setCustom((prev) => [...prev, name].sort((a, b) => a.localeCompare(b)));
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    const token = getToken();
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/opportunity-platforms`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ customPlatforms: custom }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `Save failed (${res.status})`);
      }
      invalidateOpportunitySourcePlatformsCache();
      toast.success("Platform list saved.");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href="/crm/settings"
          className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
        >
          <ChevronLeft size={16} />
          CRM Settings
        </Link>
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-dim)] text-[var(--text-main)]">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-main)]">
              Platform opportunities
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Add your own marketplace or customer portal names. They appear in Platform
              opportunities and on platform-type leads for everyone on the team.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[var(--border-color)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Built-in platforms</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Upwork, Fiverr, LinkedIn Jobs, and other common boards are always available.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS.map((p) => (
              <li
                key={p}
                className="text-xs px-2 py-1 rounded-md bg-[var(--surface-dim)] text-[var(--text-muted)]"
              >
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[var(--border-color)] pt-4">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">Your team platforms</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            e.g. a customer&apos;s hiring portal, an industry-specific board, or an internal
            referral channel.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-[var(--primary-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {custom.length === 0 ? (
                  <li className="text-sm text-[var(--primary-muted)]">
                    No custom platforms yet.
                  </li>
                ) : (
                  custom.map((name) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2"
                    >
                      <span className="text-sm text-[var(--text-main)]">{name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCustom((prev) => prev.filter((c) => c !== name))
                        }
                        className="p-1.5 rounded-md text-[var(--primary-muted)] hover:text-red-600 hover:bg-red-50"
                        aria-label={`Remove ${name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="flex gap-2 mt-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDraft();
                    }
                  }}
                  placeholder="Platform name"
                  className="flex-1 h-9 rounded-lg border border-[var(--border-color)] px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={addDraft}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border-color)] text-sm font-semibold hover:bg-[var(--surface-dim)]"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-[var(--border-color)]">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="h-9 px-4 rounded-lg bg-[var(--text-main)] text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin inline" />
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
