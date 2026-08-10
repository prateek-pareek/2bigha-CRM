"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Filter,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  cloneCrmSegment,
  createCrmSegment,
  deleteCrmSegment,
  fetchCrmSegments,
  type CrmSegment,
  type CrmSegmentListType,
} from "@/lib/crm/segments";
import { cn } from "@/lib/utils";
import { CRM_LIST_PAGE, CRM_PANEL } from "@/lib/crm/ui";
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmTableShell,
  CrmTable,
} from "@/components/crm/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TypeFilter = "all" | CrmSegmentListType;
type SortKey = "updated" | "name" | "members";

export default function CrmSegmentsPage() {
  const router = useRouter();
  const [segments, setSegments] = useState<CrmSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<CrmSegmentListType>("dynamic");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmSegment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSegments(await fetchCrmSegments());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load segments");
      setSegments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = segments.filter((s) => {
      if (typeFilter !== "all" && s.listType !== typeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "members") {
        const am =
          (a.leadCount ?? 0) +
          (a.contactCount ?? 0) +
          (a.platformOpportunityCount ?? 0);
        const bm =
          (b.leadCount ?? 0) +
          (b.contactCount ?? 0) +
          (b.platformOpportunityCount ?? 0);
        return bm - am;
      }
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [segments, search, typeFilter, sortKey]);

  const totals = useMemo(() => {
    const dynamic = segments.filter((s) => s.listType === "dynamic").length;
    const staticCount = segments.length - dynamic;
    const members = segments.reduce(
      (sum, s) =>
        sum +
        (s.leadCount ?? 0) +
        (s.contactCount ?? 0) +
        (s.platformOpportunityCount ?? 0),
      0,
    );
    return { dynamic, staticCount, members };
  }, [segments]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setCreating(true);
    try {
      const seg = await createCrmSegment({
        name,
        description: newDescription.trim() || undefined,
        listType: newType,
      });
      toast.success("Segment created");
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewType("dynamic");
      router.push(`/crm/segments/${seg.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create segment");
    } finally {
      setCreating(false);
    }
  };

  const handleClone = async (seg: CrmSegment) => {
    setBusyId(seg.id);
    try {
      const copy = await cloneCrmSegment(seg.id);
      toast.success(`Duplicated as “${copy.name}”`);
      setSegments((prev) => [copy, ...prev]);
      router.push(`/crm/segments/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setBusyId(id);
    try {
      await deleteCrmSegment(id);
      toast.success("Segment deleted");
      setSegments((prev) => prev.filter((s) => s.id !== id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={cn(CRM_LIST_PAGE, "overflow-auto")}>
      <CrmPageHeader
        bordered={false}
        title="Segments"
        badge={<CrmCountBadge>{segments.length}</CrmCountBadge>}
        description="Reusable lists of leads, contacts, and platform opportunities — for campaigns, automation, and reporting."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Segments" },
        ]}
        icon={<Layers className="h-4 w-4" />}
        actions={
          <CrmButton
            onClick={() => setCreateOpen(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            New segment
          </CrmButton>
        }
      />

      <div className="mb-4 grid shrink-0 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Dynamic lists",
            value: totals.dynamic,
            hint: "Update as records match filters",
            icon: Zap,
          },
          {
            label: "Static lists",
            value: totals.staticCount,
            hint: "Manually curated membership",
            icon: Users,
          },
          {
            label: "Total memberships",
            value: totals.members,
            hint: "Across all segments (your access)",
            icon: Layers,
          },
        ].map(({ label, value, hint, icon: Icon }) => (
          <div key={label} className={cn(CRM_PANEL, "flex items-start gap-3 p-4")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {label}
              </p>
              <p className="text-xl font-bold tabular-nums text-text-main">{value}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">{hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={cn(CRM_PANEL, "mb-4 shrink-0 space-y-3 p-4")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              placeholder="Search by name or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-[var(--border-color)] bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-[var(--border-color)] bg-white p-0.5">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "dynamic", label: "Dynamic" },
                  { id: "static", label: "Static" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                    typeFilter === opt.id
                      ? "bg-primary text-white"
                      : "text-text-muted hover:bg-surface-dim/60",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Filter className="h-3.5 w-3.5" />
              Sort
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-md border border-[var(--border-color)] bg-white px-2 py-1.5 text-xs font-semibold text-text-main"
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name</option>
                <option value="members">Largest first</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {createOpen && (
        <div className={cn(CRM_PANEL, "mb-4 shrink-0 space-y-4 p-5")}>
          <div>
            <h2 className="text-sm font-semibold text-text-main">New segment</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Choose how membership is built — you can refine filters or members on the next screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "dynamic" as const,
                  title: "Dynamic",
                  desc: "Auto-include records that match filter rules. Best for always-fresh outreach lists.",
                  icon: Zap,
                },
                {
                  id: "static" as const,
                  title: "Static",
                  desc: "Add and remove people yourself. Best for curated campaign audiences.",
                  icon: Users,
                },
              ] as const
            ).map(({ id, title, desc, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setNewType(id)}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  newType === id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-[var(--border-color)] hover:border-primary/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      newType === id ? "text-primary" : "text-text-muted",
                    )}
                  />
                  <span className="text-sm font-semibold text-text-main">{title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{desc}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-text-muted">Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                autoFocus
                className="w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
                placeholder="e.g. Q2 agency outreach"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-text-muted">
                Description <span className="font-normal">(optional)</span>
              </span>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
                placeholder="What this list is for"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <CrmButton
              disabled={creating}
              loading={creating}
              onClick={() => void handleCreate()}
            >
              Create &amp; configure
            </CrmButton>
            <CrmButton
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setNewName("");
                setNewDescription("");
              }}
            >
              Cancel
            </CrmButton>
          </div>
        </div>
      )}

      <CrmTableShell className="mb-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-main">
                {search || typeFilter !== "all"
                  ? "No segments match your filters"
                  : "No segments yet"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                {search || typeFilter !== "all"
                  ? "Try a different search or clear the type filter."
                  : "Create a dynamic list from filters, or a static list you curate by hand — then use it in email campaigns."}
              </p>
            </div>
            {!search && typeFilter === "all" ? (
              <CrmButton
                onClick={() => setCreateOpen(true)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Create your first segment
              </CrmButton>
            ) : (
              <CrmButton
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                }}
              >
                Clear filters
              </CrmButton>
            )}
          </div>
        ) : (
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10">Segment</th>
                <th className="sticky top-0 z-10">Type</th>
                <th className="sticky top-0 z-10 text-right">Leads</th>
                <th className="sticky top-0 z-10 text-right">Contacts</th>
                <th className="sticky top-0 z-10 text-right">Opps</th>
                <th className="sticky top-0 z-10 text-right">Total</th>
                <th className="crm-table-actions sticky top-0 z-10 text-right text-[13px] font-semibold text-[#1f2020]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((seg) => {
                const total =
                  (seg.leadCount ?? 0) +
                  (seg.contactCount ?? 0) +
                  (seg.platformOpportunityCount ?? 0);
                return (
                  <tr
                    key={seg.id}
                    className="group cursor-pointer transition-colors"
                  >
                    <td>
                      <Link
                        href={`/crm/segments/${seg.id}`}
                        className="text-sm font-medium text-[#1f2020] hover:text-[var(--primary)]"
                      >
                        {seg.name}
                      </Link>
                      {seg.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[13px] text-[#707070]">
                          {seg.description}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                          seg.listType === "dynamic"
                            ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                            : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
                        )}
                      >
                        {seg.listType}
                      </span>
                    </td>
                    <td className="text-right text-sm font-medium tabular-nums text-[#1f2020]">
                      {seg.leadCount ?? 0}
                    </td>
                    <td className="text-right text-sm font-medium tabular-nums text-[#1f2020]">
                      {seg.contactCount ?? 0}
                    </td>
                    <td className="text-right text-sm font-medium tabular-nums text-[#1f2020]">
                      {seg.platformOpportunityCount ?? 0}
                    </td>
                    <td className="text-right text-sm font-semibold tabular-nums text-[#1f2020]">
                      {total}
                    </td>
                    <td className="crm-table-actions">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === seg.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleClone(seg);
                          }}
                          className="crm-table-action-btn inline-flex h-5 w-5 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] hover:bg-[#f7f8f9]"
                          title="Duplicate"
                        >
                          {busyId === seg.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === seg.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(seg);
                          }}
                          className="crm-table-action-btn inline-flex h-5 w-5 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#ef1e1e] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] hover:bg-[#f7f8f9]"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CrmTable>
        )}
      </CrmTableShell>

      <p className="flex shrink-0 items-center gap-1.5 pb-4 text-xs text-text-muted">
        <Users className="h-3.5 w-3.5" />
        Open a segment to configure per-module filters or manual members, then launch an email campaign from the detail page.
      </p>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be moved to trash. Campaigns and
              workflows that reference it may stop matching members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
