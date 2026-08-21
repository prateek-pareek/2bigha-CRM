"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Contact,
  Copy,
  Info,
  Layers,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/suite/shell/Pagination";
import CRMFilterBar from "@/components/crm/segments/CRMFilterBar";
import SegmentMemberPicker from "@/components/crm/segments/SegmentMemberPicker";
import type { FilterCriteria } from "@/lib/crm/filter-config";
import {
  addCrmSegmentMember,
  assignCrmSegmentLeads,
  cloneCrmSegment,
  deleteCrmSegment,
  fetchCrmSegment,
  fetchCrmSegmentMembers,
  previewCrmSegmentCounts,
  previewCrmSegmentMembers,
  removeCrmSegmentMember,
  updateCrmSegment,
  type CrmSegment,
  type CrmSegmentListType,
  type CrmSegmentMemberModule,
  type CrmSegmentPreviewCounts,
} from "@/lib/crm/segments";
import { CRM_API_URL } from "@/lib/crm/config";
import { CRM_HS_PANEL, SUITE_PAGE_5XL } from "@/lib/suite-layout";
import { cn } from "@/lib/utils";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HS_PANEL = CRM_HS_PANEL;

type MemberRow = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  organization?: string;
  status?: string;
  stage?: string;
  leadOwner?: string;
};

function displayName(row: MemberRow) {
  const n = `${row.firstName || ""} ${row.lastName || ""}`.trim();
  return n || row.email || "—";
}

function memberHref(module: CrmSegmentMemberModule, id: string) {
  return `/crm/${module}/${id}`;
}

function tabLabel(module: CrmSegmentMemberModule) {
  return module;
}

function tabIcon(module: CrmSegmentMemberModule) {
  if (module === "contacts") return Contact;
  return Users;
}

function countForTab(
  counts: {
    leadCount?: number;
    contactCount?: number;
  },
  module: CrmSegmentMemberModule,
) {
  if (module === "leads") return counts.leadCount ?? 0;
  return counts.contactCount ?? 0;
}

function listTypeLabel(type: CrmSegmentListType) {
  return type === "dynamic" ? "Dynamic" : "Static";
}

function listTypeDescription(type: CrmSegmentListType) {
  return type === "dynamic"
    ? "Records are included automatically when they match your filter rules."
    : "You add and remove members manually by record id.";
}

export default function CrmSegmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [segment, setSegment] = useState<CrmSegment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<CrmSegmentMemberModule>("leads");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [listType, setListType] = useState<CrmSegmentListType>("dynamic");
  const [leadFilters, setLeadFilters] = useState<FilterCriteria[]>([]);
  const [contactFilters, setContactFilters] = useState<FilterCriteria[]>([]);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(25);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  const [previewCounts, setPreviewCounts] = useState<CrmSegmentPreviewCounts | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignScope, setAssignScope] = useState<"selected" | "all">("selected");
  const [assignOwner, setAssignOwner] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);

  const [addRecordId, setAddRecordId] = useState("");
  const [showPasteId, setShowPasteId] = useState(false);
  const [adding, setAdding] = useState(false);

  const [leadFiltersOpen, setLeadFiltersOpen] = useState(true);
  const [contactFiltersOpen, setContactFiltersOpen] = useState(true);

  const memberSearchRef = useRef<HTMLInputElement>(null);
  const memberPickerRef = useRef<HTMLInputElement>(null);

  const loadSegment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const seg = await fetchCrmSegment(id);
      setSegment(seg);
      setName(seg.name);
      setDescription(seg.description || "");
      setListType(seg.listType);
      setLeadFilters(seg.leadFilters || []);
      setContactFilters(seg.contactFilters || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load segment");
      setSegment(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadMembers = useCallback(async () => {
    if (!id || !segment) return;
    setMembersLoading(true);
    try {
      const res = await fetchCrmSegmentMembers(id, tab, {
        page: membersPage,
        pageSize: membersPageSize,
        search: debouncedMemberSearch.trim() || undefined,
      });
      setMembers((res.data || []) as MemberRow[]);
      setMembersTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load members");
      setMembers([]);
      setMembersTotal(0);
    } finally {
      setMembersLoading(false);
    }
  }, [id, segment, tab, debouncedMemberSearch, membersPage, membersPageSize]);

  useEffect(() => {
    void loadSegment();
  }, [loadSegment]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMemberSearch(memberSearch), 300);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  useEffect(() => {
    setMembersPage(1);
  }, [tab, debouncedMemberSearch]);

  useEffect(() => {
    setSelectedLeadIds(new Set());
  }, [tab, membersPage, debouncedMemberSearch, listType]);

  useEffect(() => {
    if (!assignOpen) return;
    let cancelled = false;
    setOwnersLoading(true);
    void fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
      headers: {
        Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") || "" : ""}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      })
      .then((users: Array<{ firstName?: string; lastName?: string; email?: string }>) => {
        if (cancelled) return;
        const labels = users
          .map((u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || String(u.email || "").trim())
          .filter(Boolean);
        setOwnerOptions(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {
        if (!cancelled) setOwnerOptions([]);
      })
      .finally(() => {
        if (!cancelled) setOwnersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignOpen]);

  const isDirty = useMemo(() => {
    if (!segment) return false;
    return (
      name.trim() !== segment.name ||
      description.trim() !== (segment.description || "") ||
      listType !== segment.listType ||
      JSON.stringify(leadFilters) !== JSON.stringify(segment.leadFilters || []) ||
      JSON.stringify(contactFilters) !== JSON.stringify(segment.contactFilters || [])
    );
  }, [segment, name, description, listType, leadFilters, contactFilters]);

  const filtersDirty = useMemo(() => {
    if (!segment) return false;
    return (
      listType !== segment.listType ||
      JSON.stringify(leadFilters) !== JSON.stringify(segment.leadFilters || []) ||
      JSON.stringify(contactFilters) !== JSON.stringify(segment.contactFilters || [])
    );
  }, [segment, listType, leadFilters, contactFilters]);

  // Saved membership preview (or static lists).
  useEffect(() => {
    if (!segment) return;
    if (listType === "dynamic" && filtersDirty) return;
    void loadMembers();
  }, [segment, loadMembers, listType, filtersDirty]);

  // Live draft membership preview while dynamic filters are dirty.
  useEffect(() => {
    if (!segment || listType !== "dynamic" || !filtersDirty) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setMembersLoading(true);
      void previewCrmSegmentMembers({
        listType,
        leadFilters,
        contactFilters,
        module: tab,
        page: membersPage,
        pageSize: membersPageSize,
        search: debouncedMemberSearch.trim() || undefined,
      })
        .then((res) => {
          if (cancelled) return;
          setMembers((res.data || []) as MemberRow[]);
          setMembersTotal(res.total);
        })
        .catch((e) => {
          if (cancelled) return;
          toast.error(e instanceof Error ? e.message : "Failed to preview members");
          setMembers([]);
          setMembersTotal(0);
        })
        .finally(() => {
          if (!cancelled) setMembersLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    segment,
    listType,
    filtersDirty,
    leadFilters,
    contactFilters,
    tab,
    membersPage,
    membersPageSize,
    debouncedMemberSearch,
  ]);

  // Live estimated counts while filter/type drafts change (debounced).
  useEffect(() => {
    if (!segment || listType !== "dynamic" || !filtersDirty) {
      setPreviewCounts(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      void previewCrmSegmentCounts({
        listType,
        leadFilters,
        contactFilters,
      })
        .then((counts) => {
          if (!cancelled) setPreviewCounts(counts);
        })
        .catch(() => {
          if (!cancelled) setPreviewCounts(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [segment, listType, filtersDirty, leadFilters, contactFilters]);

  const displayCounts = previewCounts ?? {
    leadCount: segment?.leadCount ?? 0,
    contactCount: segment?.contactCount ?? 0,
    memberCount: (segment?.leadCount ?? 0) + (segment?.contactCount ?? 0),
  };

  const totalMembers = displayCounts.memberCount;

  const staticMemberIds = useMemo(() => {
    if (!segment || listType !== "static") return new Set<string>();
    return new Set(
      (segment.members || [])
        .filter((m) => m.module === tab)
        .map((m) => m.entityId),
    );
  }, [segment, listType, tab]);

  const handleSave = useCallback(async () => {
    if (!segment || !isDirty) return;
    setSaving(true);
    try {
      const updated = await updateCrmSegment(segment.id, {
        name: name.trim(),
        description: description.trim(),
        listType,
        leadFilters,
        contactFilters,
      });
      setSegment(updated);
      setPreviewCounts(null);
      toast.success("Segment saved");
      void loadMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [
    segment,
    isDirty,
    name,
    description,
    listType,
    leadFilters,
    contactFilters,
    loadMembers,
  ]);

  const handleDelete = async () => {
    if (!segment) return;
    setDeleting(true);
    try {
      await deleteCrmSegment(segment.id);
      toast.success("Segment deleted");
      router.push("/crm/segments");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleClone = async () => {
    if (!segment) return;
    if (isDirty) {
      toast.error("Save your changes before duplicating");
      return;
    }
    setCloning(true);
    try {
      const copy = await cloneCrmSegment(segment.id);
      toast.success(`Duplicated as “${copy.name}”`);
      router.push(`/crm/segments/${copy.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    } finally {
      setCloning(false);
    }
  };

  const openAssignDialog = (scope: "selected" | "all") => {
    if (filtersDirty) {
      toast.error("Save filter changes before assigning leads");
      return;
    }
    if (scope === "selected" && selectedLeadIds.size === 0) {
      toast.error("Select at least one lead");
      return;
    }
    setAssignScope(scope);
    setAssignOwner("");
    setAssignOpen(true);
  };

  const handleAssignLeads = async () => {
    if (!segment) return;
    const ownerName = assignOwner.trim();
    if (!ownerName) {
      toast.error("Choose an owner");
      return;
    }
    setAssigning(true);
    try {
      const result = await assignCrmSegmentLeads(segment.id, {
        ownerName,
        scope: assignScope,
        leadIds:
          assignScope === "selected" ? Array.from(selectedLeadIds) : undefined,
      });
      toast.success(
        `Assigned ${result.modified} lead${result.modified === 1 ? "" : "s"} to ${ownerName}`,
      );
      if (result.truncated) {
        toast.message("Assignment capped at 2,000 leads — run again for the rest.");
      }
      setAssignOpen(false);
      setSelectedLeadIds(new Set());
      void loadMembers();
      void loadSegment();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign leads");
    } finally {
      setAssigning(false);
    }
  };

  const toggleLeadSelected = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = members.map((m) => m._id);
    const allSelected =
      pageIds.length > 0 && pageIds.every((id) => selectedLeadIds.has(id));
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleRemoveMember = async (entityId: string) => {
    if (!segment) return;
    try {
      const updated = await removeCrmSegmentMember(segment.id, tab, entityId);
      setSegment(updated);
      void loadMembers();
      toast.success("Removed from list");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const handleAddStaticMember = useCallback(async (entityId?: string) => {
    if (!segment || listType !== "static") return;
    const idToAdd = (entityId ?? addRecordId).trim();
    if (!idToAdd) {
      toast.error("Select a record or paste an id");
      return;
    }
    setAdding(true);
    try {
      const updated = await addCrmSegmentMember(segment.id, tab, idToAdd);
      setSegment(updated);
      setAddRecordId("");
      void loadMembers();
      toast.success("Added to list");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }, [segment, listType, addRecordId, tab, loadMembers]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (isDirty && segment) {
          e.preventDefault();
          void handleSave();
        }
        return;
      }

      if (e.key === "/" && !inField) {
        e.preventDefault();
        memberSearchRef.current?.focus();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        if (listType === "static" && segment) {
          e.preventDefault();
          memberPickerRef.current?.focus();
        }
        return;
      }

      if (e.altKey && e.key === "1" && !inField) {
        e.preventDefault();
        setTab("leads");
        return;
      }

      if (e.altKey && e.key === "2" && !inField) {
        e.preventDefault();
        setTab("contacts");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, isDirty, segment, listType]);

  if (loading) {
    return (
      <div className={cn(SUITE_PAGE_5XL, "flex min-h-[50vh] items-center justify-center")}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!segment) {
    return (
      <div className={cn(SUITE_PAGE_5XL, "py-16 text-center")}>
        <Layers className="mx-auto h-10 w-10 text-text-muted/40" />
        <p className="mt-4 text-text-muted">Segment not found.</p>
        <Link
          href="/crm/segments"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to segments
        </Link>
      </div>
    );
  }

  return (
    <div className={cn(SUITE_PAGE_5XL, "space-y-6")}>
      <Link
        href="/crm/segments"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All segments
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-text-main truncate">
                {name.trim() || segment.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    listType === "dynamic"
                      ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      : "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
                  )}
                >
                  {listTypeLabel(listType)} list
                </span>
                {isDirty ? (
                  <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
                ) : null}
              </div>
            </div>
          </div>
          {description.trim() ? (
            <p className="mt-2 text-sm text-text-muted max-w-2xl line-clamp-2">{description}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link
            href={`/crm/campaigns/new?segmentId=${segment.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <Mail className="h-4 w-4" />
            Email campaign
          </Link>
          <button
            type="button"
            disabled={cloning || isDirty}
            onClick={() => void handleClone()}
            title={isDirty ? "Save before duplicating" : "Duplicate segment"}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-medium text-text-main hover:bg-surface-dim/50 disabled:opacity-50 transition-colors"
          >
            {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Duplicate
          </button>
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => void handleSave()}
            title="Save (⌘S)"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
            <kbd className="hidden sm:inline rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">⌘S</kbd>
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-medium text-text-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 transition-colors"
            title="Delete segment"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Leads", value: displayCounts.leadCount ?? 0, icon: Users, accent: "text-sky-600 bg-sky-50" },
          { label: "Contacts", value: displayCounts.contactCount ?? 0, icon: Contact, accent: "text-violet-600 bg-violet-50" },
          { label: "Total members", value: totalMembers, icon: Layers, accent: "text-primary bg-primary/10" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className={cn(HS_PANEL, "flex items-center gap-3 p-4")}>
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", accent)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {label}
                {previewCounts ? (
                  <span className="ml-1.5 font-normal normal-case text-amber-700">
                    {previewLoading ? "estimating…" : "estimate"}
                  </span>
                ) : null}
              </p>
              <p className="text-xl font-bold text-text-main tabular-nums">
                {previewLoading && previewCounts ? "…" : value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Left: settings & filters */}
        <div className="space-y-4">
          <section className={cn(HS_PANEL, "overflow-hidden")}>
            <div className="border-b border-[var(--border-color)] bg-surface-dim/40 px-5 py-3">
              <h2 className="text-sm font-semibold text-text-main">Segment settings</h2>
              <p className="text-xs text-text-muted mt-0.5">{listTypeDescription(listType)}</p>
            </div>
            <div className="space-y-4 p-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-text-muted">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q2 agency outreach"
                  className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-text-muted">List type</span>
                <select
                  value={listType}
                  onChange={(e) => setListType(e.target.value as CrmSegmentListType)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="dynamic">Dynamic (filter rules)</option>
                  <option value="static">Static (manual members)</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-text-muted">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional — what this segment is for"
                  className="w-full resize-y rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
          </section>

          {listType === "dynamic" ? (
            <>
              <FilterSection
                title="Lead filters"
                description="Leads matching all filters are included."
                icon={Users}
                open={leadFiltersOpen}
                onToggle={() => setLeadFiltersOpen((v) => !v)}
                count={leadFilters.length}
              >
                <CRMFilterBar module="leads" filters={leadFilters} onChange={setLeadFilters} />
              </FilterSection>
              <FilterSection
                title="Contact filters"
                description="Contacts matching all filters are included."
                icon={Contact}
                open={contactFiltersOpen}
                onToggle={() => setContactFiltersOpen((v) => !v)}
                count={contactFilters.length}
              >
                <CRMFilterBar module="contacts" filters={contactFilters} onChange={setContactFilters} />
              </FilterSection>
              {isDirty ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold">Unsaved changes</p>
                    <p className="mt-0.5 leading-relaxed">
                      {listType === "dynamic"
                        ? "Member counts and the preview below update live from your draft filters. Save to keep them."
                        : "Save to keep name, description, and list type changes."}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" />
              <p>
                Search for leads or contacts in the member panel, or paste a record id under
                advanced options. Use <kbd className="rounded bg-white/80 px-1 text-[11px] font-mono">⌘⇧M</kbd> to
                focus the add-member search.
              </p>
            </div>
          )}
        </div>

        {/* Right: members preview */}
        <section className={cn(HS_PANEL, "overflow-hidden flex flex-col min-h-[480px]")}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] bg-surface-dim/40 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-text-main">Member preview</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {listType === "dynamic"
                  ? filtersDirty
                    ? "Live preview from draft filters (not saved yet)"
                    : "Live preview based on saved filters"
                  : "Manually added members"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (listType === "dynamic" && filtersDirty) {
                  setMembersLoading(true);
                  void previewCrmSegmentMembers({
                    listType,
                    leadFilters,
                    contactFilters,
                    module: tab,
                    page: membersPage,
                    pageSize: membersPageSize,
                    search: debouncedMemberSearch.trim() || undefined,
                  })
                    .then((res) => {
                      setMembers((res.data || []) as MemberRow[]);
                      setMembersTotal(res.total);
                    })
                    .catch((e) => {
                      toast.error(
                        e instanceof Error ? e.message : "Failed to preview members",
                      );
                    })
                    .finally(() => setMembersLoading(false));
                  return;
                }
                void loadMembers();
              }}
              disabled={membersLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-dim/50 disabled:opacity-50 transition-colors"
              title="Refresh members"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", membersLoading && "animate-spin")} />
              Refresh
            </button>
          </div>

          <div className="flex border-b border-[var(--border-color)]">
            {(["leads", "contacts"] as const).map((m) => {
              const count = countForTab(displayCounts, m);
              const Icon = tabIcon(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTab(m)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition-colors",
                    tab === m
                      ? "border-b-2 border-primary bg-primary/5 text-primary"
                      : "text-text-muted hover:bg-surface-dim/40",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tabLabel(m)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      tab === m ? "bg-primary/15 text-primary" : "bg-surface-dim text-text-muted",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  ref={memberSearchRef}
                  type="search"
                  placeholder={`Search ${tab}… (press /)`}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <p className="text-xs text-text-muted shrink-0 hidden sm:block">
                <kbd className="rounded bg-surface-dim px-1 font-mono">Alt+1</kbd> leads ·{" "}
                <kbd className="rounded bg-surface-dim px-1 font-mono">Alt+2</kbd> contacts
              </p>
            </div>

            {listType === "static" ? (
              <div className="space-y-2 rounded-lg border border-dashed border-[var(--border-color)] bg-surface-dim/20 p-3">
                <SegmentMemberPicker
                  module={tab}
                  memberIds={staticMemberIds}
                  disabled={adding}
                  inputRef={memberPickerRef}
                  onSelect={(entityId) => handleAddStaticMember(entityId)}
                />
                <button
                  type="button"
                  onClick={() => setShowPasteId((v) => !v)}
                  className="text-xs font-medium text-text-muted hover:text-primary transition-colors"
                >
                  {showPasteId ? "Hide" : "Or paste record id"}
                </button>
                {showPasteId ? (
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <label className="min-w-[200px] flex-1 space-y-1">
                      <span className="text-xs font-medium text-text-muted">Record id</span>
                      <input
                        value={addRecordId}
                        onChange={(e) => setAddRecordId(e.target.value)}
                        placeholder="MongoDB record id"
                        className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleAddStaticMember();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={adding || !addRecordId.trim()}
                      onClick={() => void handleAddStaticMember()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add by id"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "leads" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-color)] bg-surface-dim/20 px-3 py-2.5">
                <UserPlus className="h-4 w-4 text-primary shrink-0" />
                <p className="text-xs text-text-muted flex-1 min-w-[12rem]">
                  Reassign ownership for leads in this segment
                  {selectedLeadIds.size > 0
                    ? ` · ${selectedLeadIds.size} selected`
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={selectedLeadIds.size === 0 || filtersDirty}
                  onClick={() => openAssignDialog("selected")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-white px-2.5 py-1.5 text-xs font-semibold text-text-main hover:bg-surface-dim/50 disabled:opacity-50 transition-colors"
                >
                  Assign selected
                </button>
                <button
                  type="button"
                  disabled={(displayCounts.leadCount ?? 0) === 0 || filtersDirty}
                  onClick={() => openAssignDialog("all")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Assign all leads
                </button>
              </div>
            ) : null}

            {membersLoading ? (
              <div className="flex flex-1 items-center justify-center py-16 text-text-muted">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <MembersEmptyState listType={listType} tab={tab} isDirty={isDirty} />
            ) : (
              <>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold text-text-muted">
                        {tab === "leads" ? (
                          <th className="w-10 px-2 py-2.5">
                            <input
                              type="checkbox"
                              checked={
                                members.length > 0 &&
                                members.every((m) => selectedLeadIds.has(m._id))
                              }
                              onChange={toggleSelectAllOnPage}
                              aria-label="Select all leads on this page"
                              className="h-3.5 w-3.5 rounded border-[var(--border-color)]"
                            />
                          </th>
                        ) : null}
                        <th className="px-2 py-2.5">Name</th>
                        <th className="px-2 py-2.5">Email</th>
                        <th className="px-2 py-2.5 hidden sm:table-cell">Company</th>
                        <th className="px-2 py-2.5 hidden md:table-cell">
                          {tab === "leads" ? "Owner" : "Status"}
                        </th>
                        {listType === "static" ? <th className="w-12 px-2 py-2.5" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((row) => (
                        <tr
                          key={row._id}
                          className="border-t border-[var(--border-color)] hover:bg-surface-dim/30 transition-colors"
                        >
                          {tab === "leads" ? (
                            <td className="px-2 py-2.5">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(row._id)}
                                onChange={() => toggleLeadSelected(row._id)}
                                aria-label={`Select ${displayName(row)}`}
                                className="h-3.5 w-3.5 rounded border-[var(--border-color)]"
                              />
                            </td>
                          ) : null}
                          <td className="px-2 py-2.5">
                            <Link
                              href={memberHref(tab, row._id)}
                              className="font-medium text-primary hover:underline"
                            >
                              {displayName(row)}
                            </Link>
                          </td>
                          <td className="px-2 py-2.5 text-text-muted">{row.email || "—"}</td>
                          <td className="px-2 py-2.5 text-text-muted hidden sm:table-cell">
                            {row.organization || "—"}
                          </td>
                          <td className="px-2 py-2.5 hidden md:table-cell">
                            {tab === "leads" ? (
                              <span className="text-text-muted">
                                {row.leadOwner || "Unassigned"}
                              </span>
                            ) : row.status || row.stage ? (
                              <span className="inline-flex rounded-full bg-surface-dim px-2 py-0.5 text-xs font-medium text-text-muted capitalize">
                                {row.status || row.stage}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          {listType === "static" ? (
                            <td className="px-2 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => void handleRemoveMember(row._id)}
                                className="rounded p-1.5 text-text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                title="Remove from list"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {membersTotal > membersPageSize ? (
                  <Pagination
                    total={membersTotal}
                    page={membersPage}
                    pageSize={membersPageSize}
                    onPageChange={setMembersPage}
                    onPageSizeChange={(size) => {
                      setMembersPageSize(size);
                      setMembersPage(1);
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete segment?</AlertDialogTitle>
            <AlertDialogDescription>
              “{segment.name}” will be moved to trash. Campaigns that use this
              list may no longer resolve members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign leads to owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-text-muted">
              {assignScope === "selected"
                ? `Reassign ${selectedLeadIds.size} selected lead${selectedLeadIds.size === 1 ? "" : "s"} to another CRM user.`
                : `Reassign all leads in this segment (${displayCounts.leadCount ?? 0}, up to 2,000 per run) to another CRM user.`}
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-muted">New owner</span>
              {ownersLoading ? (
                <div className="flex items-center gap-2 text-sm text-text-muted py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading users…
                </div>
              ) : (
                <select
                  value={assignOwner}
                  onChange={(e) => setAssignOwner(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select a teammate…</option>
                  {ownerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {!ownersLoading && ownerOptions.length === 0 ? (
              <p className="text-xs text-amber-700">
                No CRM users found. You can still type an owner name below.
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-muted">
                Or enter owner name
              </span>
              <input
                value={assignOwner}
                onChange={(e) => setAssignOwner(e.target.value)}
                placeholder="First Last"
                className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAssignOpen(false)}
              className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-dim/50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={assigning || !assignOwner.trim()}
              onClick={() => void handleAssignLeads()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSection({
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  count,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Users;
  open: boolean;
  onToggle: () => void;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className={cn(HS_PANEL, "overflow-hidden")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b border-[var(--border-color)] bg-surface-dim/40 px-4 py-3 text-left hover:bg-surface-dim/60 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-main">{title}</h2>
            {count > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {count}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
      </button>
      {open ? <div className="p-4">{children}</div> : null}
    </section>
  );
}

function MembersEmptyState({
  listType,
  tab,
  isDirty,
}: {
  listType: CrmSegmentListType;
  tab: CrmSegmentMemberModule;
  isDirty: boolean;
}) {
  const Icon = tabIcon(tab);
  const label = tabLabel(tab).toLowerCase();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-dim text-text-muted/50">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-text-main">
        {listType === "dynamic"
          ? `No ${label} match the current filters`
          : `No ${label} in this list yet`}
      </p>
      <p className="mt-1 text-xs text-text-muted max-w-xs">
        {listType === "dynamic"
          ? isDirty
            ? "Counts update as you edit filters. Adjust rules on the left or check another tab."
            : "Try adjusting filters on the left, or check another tab."
          : "Search for records above to add them to this list."}
      </p>
    </div>
  );
}
