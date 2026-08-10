"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  GitMerge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Users,
  UserCircle,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DupRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  mobileNo: string;
  organization: string;
  linkedinUrl: string;
  converted: boolean;
  createdAt: string;
  updatedAt: string;
  leadOwner: string;
};

type DupGroup = {
  rule:
    | "exact_email"
    | "exact_phone"
    | "linkedin_profile"
    | "fuzzy_name_same_company";
  score: number;
  suggestedMasterId: string;
  records: DupRecord[];
};

const RULE_LABEL: Record<DupGroup["rule"], string> = {
  exact_email: "Exact email",
  exact_phone: "Exact phone",
  linkedin_profile: "LinkedIn profile",
  fuzzy_name_same_company: "Fuzzy name + company",
};

export default function CrmDuplicatesSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canManage = hasAccess("admin:manage");

  const [entityType, setEntityType] = useState<"lead" | "contact">("lead");
  const [loading, setLoading] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [scanned, setScanned] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [masters, setMasters] = useState<Record<string, string>>({});

  const runScan = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/admin/duplicates/scan?entityType=${entityType}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("You need admin permission to scan duplicates.");
        } else {
          toast.error("Scan failed.");
        }
        return;
      }
      const data = await res.json();
      setGroups(data.groups || []);
      setScanned(data.scanned ?? 0);
      setTruncated(!!data.truncated);
      const m: Record<string, string> = {};
      for (const g of data.groups || []) {
        const key = groupKey(g);
        m[key] = g.suggestedMasterId;
      }
      setMasters(m);
    } catch {
      toast.error("Scan failed.");
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    if (!isLoaded || !canManage) return;
    runScan();
  }, [isLoaded, canManage, runScan]);

  const setMasterForGroup = (g: DupGroup, masterId: string) => {
    setMasters((prev) => ({ ...prev, [groupKey(g)]: masterId }));
  };

  const mergeGroup = async (g: DupGroup) => {
    const key = groupKey(g);
    const masterId = masters[key] || g.suggestedMasterId;
    const dupIds = g.records.map((r) => r.id).filter((id) => id !== masterId);
    if (dupIds.length === 0) {
      toast.error("Select a master record different from the rows to merge.");
      return;
    }
    if (
      !confirm(
        `Merge ${dupIds.length} duplicate ${entityType}(s) into the master? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMergingId(key);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/admin/duplicates/merge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityType,
          masterId,
          duplicateIds: dupIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || "Merge failed.");
        return;
      }
      toast.success("Records merged.");
      await runScan();
    } catch {
      toast.error("Merge failed.");
    } finally {
      setMergingId(null);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50/80 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-700 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900">Admin only</h1>
        <p className="text-sm text-gray-600 mt-2">
          Duplicate management requires the <code className="text-xs bg-white px-1 rounded">admin:manage</code> permission.
        </p>
        <Link
          href="/crm/settings"
          className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-5xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div>
        <Link
          href="/crm/settings"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--hs-link)] hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-md bg-[var(--surface-dim)] text-[var(--text-main)]">
              <GitMerge className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-main)] tracking-tight">
                Duplicate management
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
                Merge rules: exact email (incl. additional), phone, LinkedIn, and
                fuzzy name within the same company. Open leads/contacts only;
                converted records are blocked from merge.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-[var(--border-color)] overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setEntityType("lead")}
                className={cn(
                  "px-3 py-2 text-xs font-semibold flex items-center gap-1.5",
                  entityType === "lead"
                    ? "bg-[var(--hs-link)] text-white"
                    : "text-[var(--text-main)] hover:bg-[var(--background)]",
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Leads
              </button>
              <button
                type="button"
                onClick={() => setEntityType("contact")}
                className={cn(
                  "px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-l border-[var(--border-color)]",
                  entityType === "contact"
                    ? "bg-[var(--hs-link)] text-white"
                    : "text-[var(--text-main)] hover:bg-[var(--background)]",
                )}
              >
                <UserCircle className="h-3.5 w-3.5" />
                Contacts
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-md border-[var(--border-color)]"
              onClick={() => runScan()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Rescan</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[var(--border-color)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-sm text-[var(--text-muted)]">
        Scanned <strong className="text-[var(--text-main)]">{scanned}</strong>{" "}
        {entityType === "lead" ? "leads" : "contacts"}.
        {truncated && (
          <span className="text-amber-800 ml-2">
            (Capped at 25,000 — oldest records first. Clean merged groups and rescan for the rest.)
          </span>
        )}
      </div>

      {loading && groups.length === 0 ? (
        <div className="flex justify-center py-16 text-[var(--text-muted)] text-sm">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Scanning…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--background)] p-10 text-center text-[var(--text-muted)] text-sm">
          No duplicate groups found with current rules.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const key = groupKey(g);
            const masterId = masters[key] || g.suggestedMasterId;
            return (
              <div
                key={key}
                className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {RULE_LABEL[g.rule]}
                    </span>
                    <span className="text-xs font-semibold text-[var(--hs-link)] bg-[#e0f4f7] px-2 py-0.5 rounded-md">
                      Score {g.score}
                    </span>
                    <span className="text-xs text-[var(--primary-muted)]">
                      {g.records.length} records
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-md bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white"
                    disabled={mergingId === key}
                    onClick={() => mergeGroup(g)}
                  >
                    {mergingId === key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <GitMerge className="h-4 w-4 mr-1.5" />
                        Merge into master
                      </>
                    )}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--surface-dim)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="px-4 py-2 w-10">Master</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Phone</th>
                        <th className="px-4 py-2">Company</th>
                        <th className="px-4 py-2">Owner</th>
                        <th className="px-4 py-2 w-24">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.records.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-[var(--background)] hover:bg-[var(--surface-dim)]"
                        >
                          <td className="px-4 py-2.5">
                            <input
                              type="radio"
                              name={`master-${key}`}
                              checked={masterId === r.id}
                              onChange={() => setMasterForGroup(g, r.id)}
                              className="accent-[var(--hs-link)]"
                            />
                          </td>
                          <td className="px-4 py-2.5 font-medium text-[var(--text-main)]">
                            {r.name}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-muted)]">{r.email || "—"}</td>
                          <td className="px-4 py-2.5 text-[var(--text-muted)]">
                            {r.mobileNo || r.phone || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--text-muted)] max-w-[180px] truncate">
                            {r.organization || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--primary-muted)] text-xs">
                            {r.leadOwner || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Link
                              href={
                                entityType === "lead"
                                  ? `/crm/leads/${r.id}`
                                  : `/crm/contacts/${r.id}`
                              }
                              className="text-[var(--hs-link)] font-semibold hover:underline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-[var(--primary-muted)] bg-[var(--surface-dim)] border-t border-[var(--surface-dim)]">
                  Master keeps pipeline/stage; empty fields are filled from duplicates;
                  activities, deals, email, and workflows are repointed to the master.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupKey(g: DupGroup): string {
  return `${g.rule}:${g.records
    .map((r) => r.id)
    .sort()
    .join(",")}`;
}
