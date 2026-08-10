"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Copy,
  ListChecks,
  Search,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { usePermissions } from "@/hooks/usePermissions";
import CrmPlaybookPreviewSheet from "@/components/crm/automation/playbooks/CrmPlaybookPreviewSheet";
import type { PlaybookPreviewPayload } from "@/components/crm/automation/playbooks/CrmPlaybookPreviewSheet";
import {
  APPLIES_TO_LABEL,
  playbookBodyCharCount,
} from "@/lib/crm/playbook-ui";
import { CRM_HS_CONTROL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";
import { cn } from "@/lib/utils";
import { CRM_LIST_PAGE, CRM_PANEL } from "@/lib/crm/ui";
import {
  CrmPageHeader,
  CrmButton,
  CrmCountBadge,
  CrmTableShell,
  CrmTable,
} from "@/components/crm/ui";

const hs = {
  text: "text-[var(--text-main)]",
  muted: "text-[var(--text-muted)]",
  subtle: "text-[var(--primary-muted)]",
  border: "border-[var(--border-color)]",
  canvas: "bg-[var(--background)]",
  card: CRM_PANEL,
};

const FILTER_KEYS = [
  "All",
  "Any",
  "Lead",
  "Deal",
  "Contact",
  "Organization",
  "Client",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

type SortKey = "name-asc" | "name-desc" | "content-desc" | "content-asc";

interface PlaybookRow {
  _id: string;
  name: string;
  description?: string;
  appliesTo: string;
  content?: string;
  status?: string;
  category?: string;
  team?: string;
  salesStages?: string[];
  sections?: { id: string; type: string; order: number; title: string; html: string }[];
  isActive?: boolean;
}

function Dropdown<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-9 inline-flex items-center gap-2 bg-white border rounded-md pl-3 pr-2.5 text-sm font-medium text-[var(--text-main)] shadow-sm transition-colors whitespace-nowrap min-w-[10rem] justify-between ${
          open ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30' : 'border-[var(--border-color)] hover:border-[var(--primary-muted)]'
        }`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={13} className={`text-[var(--primary-muted)] shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-[9999] bg-white border border-[var(--border-color)] rounded-md shadow-lg min-w-full overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors text-left ${
                opt.value === value
                  ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                  : 'text-[var(--text-main)] font-medium hover:bg-[var(--background)]'
              }`}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={13} className="text-[var(--primary)] shrink-0 ml-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CrmPlaybooksLibraryPage() {
  const router = useRouter();
  const { hasAccess, isLoaded } = usePermissions();
  const canManage = hasAccess("settings:write");

  const [list, setList] = useState<PlaybookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [preview, setPreview] = useState<PlaybookPreviewPayload | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [libCategory, setLibCategory] = useState("");
  const [libTeam, setLibTeam] = useState("");
  const [libSalesStage, setLibSalesStage] = useState("");

  const loadList = useCallback(async () => {
    const token = localStorage.getItem("token");
    setLoading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/playbooks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push("/auth/login?error=unauthorized");
        return;
      }
      const data = res.ok ? await res.json() : [];
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      All: list.length,
      Any: list.filter((p) => p.appliesTo === "Any").length,
    };
    for (const key of [
      "Lead",
      "Deal",
      "Contact",
      "Organization",
      "Client",
    ] as const) {
      c[key] = list.filter(
        (p) => p.appliesTo === "Any" || p.appliesTo === key,
      ).length;
    }
    return c;
  }, [list]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list.filter((p) => {
      if (filter !== "All" && filter !== "Any") {
        if (p.appliesTo !== "Any" && p.appliesTo !== filter) return false;
      }
      if (filter === "Any" && p.appliesTo !== "Any") return false;
      const cat = libCategory.trim().toLowerCase();
      if (cat && !(p.category || "").toLowerCase().includes(cat)) return false;
      const tm = libTeam.trim().toLowerCase();
      if (tm && !(p.team || "").toLowerCase().includes(tm)) return false;
      const st = libSalesStage.trim().toLowerCase();
      if (
        st &&
        !(p.salesStages || []).some((s) => s.toLowerCase().includes(st))
      ) {
        return false;
      }
      if (!q) return true;
      const inName = p.name.toLowerCase().includes(q);
      const inDesc = (p.description || "").toLowerCase().includes(q);
      const inContent = (p.content || "").toLowerCase().includes(q);
      return inName || inDesc || inContent;
    });

    rows = [...rows].sort((a, b) => {
      const ca = playbookBodyCharCount(a.content, a.sections);
      const cb = playbookBodyCharCount(b.content, b.sections);
      if (sort === "name-asc") return a.name.localeCompare(b.name);
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "content-desc") return cb - ca || a.name.localeCompare(b.name);
      return ca - cb || a.name.localeCompare(b.name);
    });
    return rows;
  }, [list, search, filter, sort, libCategory, libTeam, libSalesStage]);

  const openPreview = (p: PlaybookRow) => {
    setPreview({
      name: p.name,
      description: p.description,
      appliesTo: p.appliesTo,
      content: p.content,
      status: p.status,
      sections: p.sections,
    });
    setSheetOpen(true);
  };

  const clonePlaybook = async (id: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/playbooks/${id}/clone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast.success("Cloned as draft — see Settings → Playbooks");
      void loadList();
    } else {
      toast.error("Clone failed");
    }
  };

  if (!isLoaded) {
    return (
      <div className="h-40 animate-pulse rounded-md bg-[var(--surface-dim)]" />
    );
  }

  return (
    <div className={cn(CRM_LIST_PAGE, "overflow-auto")}>
      <CrmPageHeader
        bordered={false}
        title="Playbooks"
        badge={<CrmCountBadge>{list.length}</CrmCountBadge>}
        description="One library of sales guidance. Open any playbook to read the full guide; run it from a matching record when you want a single note on the timeline."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Playbooks" },
        ]}
        icon={<BookOpen className="h-4 w-4" />}
        actions={
          canManage ? (
            <CrmButton
              variant="secondary"
              leftIcon={<Settings size={16} />}
              onClick={() => router.push("/crm/settings/playbooks")}
            >
              Manage in settings
            </CrmButton>
          ) : null
        }
      />

      <div className="mb-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-start">
        <aside className={cn("rounded-[var(--crm-radius-ui)] p-4", hs.card)}>
          <p className={cn("mb-3 px-0.5 text-xs font-bold uppercase tracking-[0.15em]", hs.muted)}>
            Record type
          </p>
          <nav className="space-y-0.5" aria-label="Filter by record type">
            {FILTER_KEYS.map((key) => {
              const count = counts[key] ?? 0;
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-[var(--surface-dim)] font-semibold text-[var(--text-main)]"
                      : cn(hs.muted, "hover:bg-[var(--background)]"),
                  )}
                >
                  <span>{key === "All" ? "All playbooks" : APPLIES_TO_LABEL[key] || key}</span>
                  <span
                    className={cn(
                      "tabular-nums text-xs font-bold",
                      active ? "text-[var(--primary)]" : hs.muted,
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className={cn("min-w-0 overflow-hidden rounded-[var(--crm-radius-ui)]", hs.card)}>
          <div className={cn("flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4", hs.border, hs.canvas)}>
            <div className="relative min-w-0 max-w-md flex-1">
              <Search
                className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", hs.subtle)}
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search name, description, or guidance…"
                className={cn(CRM_HS_CONTROL_CLASS, "py-2.5 pl-10 pr-3")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("hidden text-xs font-bold uppercase tracking-wide sm:inline", hs.muted)}>
                Sort
              </span>
              <Dropdown
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'name-asc' as SortKey, label: 'Name A–Z' },
                  { value: 'name-desc' as SortKey, label: 'Name Z–A' },
                  { value: 'content-desc' as SortKey, label: 'Most guidance' },
                  { value: 'content-asc' as SortKey, label: 'Least guidance' },
                ]}
              />
            </div>
          </div>
          <div
            className={cn(
              "grid gap-2 border-t p-4 sm:grid-cols-3",
              hs.border,
              hs.canvas,
            )}
          >
            <input
              type="text"
              placeholder="Filter category…"
              className={cn(CRM_HS_CONTROL_CLASS, "py-2 text-sm")}
              value={libCategory}
              onChange={(e) => setLibCategory(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filter team…"
              className={cn(CRM_HS_CONTROL_CLASS, "py-2 text-sm")}
              value={libTeam}
              onChange={(e) => setLibTeam(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filter sales stage…"
              className={cn(CRM_HS_CONTROL_CLASS, "py-2 text-sm")}
              value={libSalesStage}
              onChange={(e) => setLibSalesStage(e.target.value)}
            />
          </div>

          <CrmTableShell className="rounded-none border-0 shadow-none" scrollClassName="overflow-x-auto">
            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-md bg-[var(--surface-dim)]"
                  />
                ))}
              </div>
            ) : filteredSorted.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ListChecks
                  size={32}
                  className={cn("mx-auto mb-3 opacity-60", hs.subtle)}
                />
                <p className={cn("font-semibold", hs.text)}>No playbooks match</p>
                <p className={cn("mx-auto mt-1 max-w-md text-sm", hs.muted)}>
                  {canManage ? (
                    <>
                      Create playbooks in{" "}
                      <Link
                        href="/crm/settings/playbooks"
                        className="font-semibold text-[var(--primary)] hover:underline"
                      >
                        Settings → Playbooks
                      </Link>
                      , or try another filter.
                    </>
                  ) : (
                    "Try another filter or ask an admin to publish playbooks."
                  )}
                </p>
              </div>
            ) : (
              <CrmTable className="min-w-[640px]">
                <thead>
                  <tr className={cn("border-b text-left text-xs font-bold uppercase tracking-wider", hs.border, "bg-[var(--surface-dim)]", hs.muted)}>
                    <th className="w-[40%] px-4 py-3 font-bold">
                      <span className="inline-flex items-center gap-1">
                        Playbook
                        {(sort === "name-asc" || sort === "name-desc") && (
                          sort === "name-asc" ? (
                            <ArrowDownAZ className="h-3.5 w-3.5 opacity-60" />
                          ) : (
                            <ArrowUpAZ className="h-3.5 w-3.5 opacity-60" />
                          )
                        )}
                      </span>
                    </th>
                    <th className="px-4 py-3 font-bold">Applies to</th>
                    <th className="px-4 py-3 text-right font-bold">Guidance</th>
                    <th className="min-w-[140px] px-4 py-3 text-right font-bold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((p) => {
                    const n = playbookBodyCharCount(p.content, p.sections);
                    return (
                      <tr
                        key={p._id}
                        className="border-b border-[var(--surface-dim)] transition-colors hover:bg-[var(--background)]"
                      >
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => openPreview(p)}
                            className="group text-left"
                          >
                            <span className={cn("font-semibold group-hover:text-[var(--primary)] group-hover:underline", hs.text)}>
                              {p.name}
                            </span>
                            {p.description ? (
                              <p className={cn("mt-1 line-clamp-2 text-xs font-normal", hs.muted)}>
                                {p.description}
                              </p>
                            ) : null}
                            {p.category || p.team ? (
                              <p className={cn("mt-1 text-xs", hs.subtle)}>
                                {[p.category, p.team].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="inline-flex whitespace-nowrap rounded-md border border-[var(--border-color)] bg-[var(--background)] px-2 py-0.5 text-xs font-semibold text-[var(--text-main)]">
                            {APPLIES_TO_LABEL[p.appliesTo] || p.appliesTo}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3 text-right align-top tabular-nums font-medium", hs.muted)}>
                          {n > 0 ? `${n.toLocaleString()} chars` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => openPreview(p)}
                              className="text-xs font-semibold text-[var(--primary)] hover:underline"
                            >
                              View
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => void clonePlaybook(p._id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)]"
                              >
                                <Copy className="h-3 w-3" aria-hidden />
                                Clone
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </CrmTable>
            )}
          </CrmTableShell>
        </div>
      </div>

      <div className="mb-4 shrink-0 rounded-[var(--crm-radius-ui)] border border-dashed border-[var(--border-color)] bg-[var(--background)] px-5 py-4 text-sm leading-relaxed text-[var(--text-muted)]">
        <p className={cn("mb-1 font-semibold", hs.text)}>Run on a record</p>
        Open any matching CRM record and use the{" "}
        <strong className={hs.text}>Playbooks</strong> panel—read the guidance, then{" "}
        <strong className={hs.text}>Log playbook to timeline</strong> (requires{" "}
        <code className="rounded-md border border-[var(--border-color)] bg-white px-1.5 py-0.5 text-xs text-[var(--text-main)]">
          activities:write
        </code>
        ).
      </div>

      <CrmPlaybookPreviewSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          setSheetOpen(o);
          if (!o) setPreview(null);
        }}
        playbook={preview}
      />
    </div>
  );
}
