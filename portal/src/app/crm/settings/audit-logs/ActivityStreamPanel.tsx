"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CRM_API_URL } from "@/lib/crm/config";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ActivityList,
  EmptyHs,
  HsSection,
  WORKSPACE_ITEMS_INCREMENT,
  type WorkspacePayload,
} from "../../workspace/_components/workspace-ui";
import { cn } from "@/lib/utils";

/**
 * Sales activity stream for Settings → Audit (same list UI as former workspace Activity).
 */
export default function ActivityStreamPanel() {
  const { user, hasAccess, isLoaded } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<
    WorkspacePayload["recentActivities"]
  >([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(WORKSPACE_ITEMS_INCREMENT);

  const canRead = hasAccess("dashboard:read");

  useEffect(() => {
    if (!isLoaded || !canRead) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getCrmAuthToken();
        const q = new URLSearchParams({
          sections: "activity",
          window: "this_month",
        });
        const ownerId = user?._id || (user as { id?: string } | null)?.id;
        if (ownerId) q.set("owner", String(ownerId));
        const res = await fetch(`${CRM_API_URL}/crm/workspace?${q}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error("Could not load activity stream");
        }
        const data = (await res.json()) as Partial<WorkspacePayload>;
        if (!cancelled) {
          setActivities(Array.isArray(data.recentActivities) ? data.recentActivities : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load activity");
          setActivities([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, canRead, user]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return activities;
    return activities.filter((a) => a.type === typeFilter);
  }, [activities, typeFilter]);

  const rendered = filtered.slice(0, visibleCount);
  const types = Array.from(
    new Set(
      activities
        .map((a) => a.type)
        .filter((t): t is string => typeof t === "string" && t.length > 0),
    ),
  );

  if (!isLoaded || loading) {
    return (
      <div className="grid animate-pulse gap-3">
        <div className="h-24 rounded-lg bg-[var(--surface-dim)]" />
        <div className="h-40 rounded-lg bg-[var(--surface-dim)]" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <EmptyHs message="You don’t have permission to view the activity stream." />
    );
  }

  if (error) {
    return <EmptyHs message={error} />;
  }

  return (
    <HsSection
      title="Activity stream"
      icon={<TrendingUp className="h-4 w-4 text-[var(--text-main)]" />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setVisibleCount(WORKSPACE_ITEMS_INCREMENT);
          }}
          className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)] focus:ring-2 focus:ring-[var(--hs-link)]/25"
          aria-label="Activity type filter"
        >
          <option value="all">All activity types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className={cn("ml-auto text-sm text-[var(--text-muted)]")}>
          Showing {filtered.length} actions
        </p>
      </div>
      {!filtered.length ? (
        <EmptyHs message="No recent activity in this period." />
      ) : (
        <>
          <ActivityList items={rendered} dense={false} />
          {rendered.length < filtered.length && (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((p) => p + WORKSPACE_ITEMS_INCREMENT)
              }
              className="mt-3 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--hs-link)] hover:bg-[var(--background)]"
            >
              Show more activity
            </button>
          )}
        </>
      )}
    </HsSection>
  );
}
