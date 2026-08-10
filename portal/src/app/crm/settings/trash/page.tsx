"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TrashItem = {
  entityType: string;
  entityLabel: string;
  id: string;
  title: string;
  deletedAt: string | null;
  deletedBy: string | null;
  preview?: { email?: string; status?: string };
};

type EntityTypeOption = { type: string; label: string };

export default function CrmTrashSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canManage = hasAccess("admin:manage");

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [total, setTotal] = useState(0);
  const [entityTypes, setEntityTypes] = useState<EntityTypeOption[]>([]);
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", "50");
      if (entityType) q.set("entityType", entityType);
      if (search.trim()) q.set("search", search.trim());
      const res = await fetch(`${CRM_API_URL}/crm/trash?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) toast.error("Admin permission required.");
        else toast.error("Failed to load trash.");
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      if (Array.isArray(data.entityTypes)) setEntityTypes(data.entityTypes);
    } catch {
      toast.error("Failed to load trash.");
    } finally {
      setLoading(false);
    }
  }, [canManage, entityType, page, search]);

  useEffect(() => {
    if (isLoaded && canManage) void load();
  }, [isLoaded, canManage, load]);

  const restore = async (item: TrashItem) => {
    const key = `${item.entityType}:${item.id}`;
    setBusyId(key);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/trash/${encodeURIComponent(item.entityType)}/${encodeURIComponent(item.id)}/restore`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        toast.error("Restore failed.");
        return;
      }
      toast.success(`Restored “${item.title}”`);
      void load();
    } catch {
      toast.error("Restore failed.");
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (item: TrashItem) => {
    if (
      !window.confirm(
        `Permanently delete “${item.title}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    const key = `${item.entityType}:${item.id}`;
    setBusyId(key);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/trash/${encodeURIComponent(item.entityType)}/${encodeURIComponent(item.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        let detail = "Permanent delete failed.";
        try {
          const body = await res.json();
          if (typeof body?.message === "string" && body.message.trim()) {
            detail = body.message;
          } else if (Array.isArray(body?.message) && body.message[0]) {
            detail = String(body.message[0]);
          }
        } catch {
          /* keep default */
        }
        toast.error(detail);
        return;
      }
      toast.success("Deleted permanently");
      void load();
    } catch {
      toast.error("Permanent delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const emptyTrash = async () => {
    const scope = entityType ? `all ${entityType}` : "all CRM trash";
    if (
      !window.confirm(
        `Empty ${scope}? This permanently deletes every item shown in trash for that scope.`,
      )
    ) {
      return;
    }
    setEmptying(true);
    const token = localStorage.getItem("token");
    try {
      const q = entityType
        ? `?entityType=${encodeURIComponent(entityType)}`
        : "";
      const res = await fetch(`${CRM_API_URL}/crm/trash${q}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Empty trash failed.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.success(
        `Emptied trash (${Number(data.deletedCount) || 0} deleted)`,
      );
      void load();
    } catch {
      toast.error("Empty trash failed.");
    } finally {
      setEmptying(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-text-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 text-amber-600" size={28} />
        <h1 className="text-lg font-semibold text-text-main">Trash</h1>
        <p className="mt-2 text-sm text-text-muted">
          Only CRM admins can view, restore, or permanently empty trash.
        </p>
        <Link
          href="/crm/settings"
          className="mt-6 inline-flex items-center gap-2 text-sm text-primary"
        >
          <ArrowLeft size={14} /> Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/crm/settings"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main"
          >
            <ArrowLeft size={12} /> Settings
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-text-main">
            <Trash2 size={20} /> Trash
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Soft-deleted CRM records. Restore to put them back, or delete
            forever.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void emptyTrash()}
            disabled={emptying || total === 0}
          >
            {emptying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Empty trash
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search trash…"
            className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-card pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={entityType}
          onChange={(e) => {
            setPage(1);
            setEntityType(e.target.value);
          }}
          className="h-9 rounded-[var(--radius-md)] border border-border bg-card px-3 text-sm"
        >
          <option value="">All types</option>
          {entityTypes.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-text-muted">
          {total} item{total === 1 ? "" : "s"}
        </div>
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16 text-text-muted">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-text-muted">
            Trash is empty.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const key = `${item.entityType}:${item.id}`;
              const busy = busyId === key;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-main">
                      {item.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 bg-surface-dim font-medium",
                        )}
                      >
                        {item.entityLabel}
                      </span>
                      {item.preview?.email ? (
                        <span>{item.preview.email}</span>
                      ) : null}
                      {item.deletedAt ? (
                        <span>
                          Deleted{" "}
                          {new Date(item.deletedAt).toLocaleString([], {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void restore(item)}
                    >
                      {busy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RotateCcw size={13} />
                      )}
                      Restore
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void purge(item)}
                    >
                      Delete forever
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > 50 ? (
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="self-center text-xs text-text-muted">
            Page {page}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
