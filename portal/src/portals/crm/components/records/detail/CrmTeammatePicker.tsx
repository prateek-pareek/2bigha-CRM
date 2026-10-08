"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";

/** One row of `GET /crm/leads/assignable-users` — someone the viewer may hand leads to. */
export type CrmAssignableUser = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  label: string;
};

type AssignablePage = {
  items: CrmAssignableUser[];
  total: number;
  page: number;
  limit: number;
  tier: "all" | "team" | "own" | null;
};

type Props = {
  value: CrmAssignableUser | null;
  onChange: (user: CrmAssignableUser | null) => void;
  /** Marks the record's current owner in the list. */
  currentOwnerLabel?: string | null;
  pageSize?: number;
  className?: string;
};

const SEARCH_DEBOUNCE_MS = 250;
/** Teammates per page — the pager only appears once there are more than this many. */
const TEAMMATES_PER_PAGE = 10;

/**
 * Searchable, paged teammate list for lead reassignment. The server scopes it to the
 * people the viewer may actually assign to (a Team Lead sees only their own team), so
 * this never offers a name the save would reject.
 */
export default function CrmTeammatePicker({
  value,
  onChange,
  currentOwnerLabel,
  pageSize = TEAMMATES_PER_PAGE,
  className,
}: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssignablePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (query) params.set("search", query);
    void fetch(`${CRM_API_URL}/crm/leads/assignable-users?${params}`, {
      headers: { Authorization: `Bearer ${getCrmAuthToken() || ""}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Could not load teammates");
        return body as AssignablePage;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load teammates");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page, pageSize]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const owner = String(currentOwnerLabel || "").trim().toLowerCase();
  // A short team is just a list — paging controls only when it doesn't fit on one page.
  const showPager = total > pageSize;

  const emptyMessage = query
    ? `No teammates match "${query}".`
    : data?.tier === "team"
      ? "No one reports to you yet — ask an admin to set your team."
      : "No teammates available.";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teammates…"
          aria-label="Search teammates"
          className="w-full rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] py-1.5 pl-8 pr-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        />
      </div>

      <div
        role="listbox"
        aria-label="Teammates"
        className="max-h-[28rem] overflow-y-auto rounded-md border border-[var(--border-color)] bg-[var(--card-bg)]"
      >
        {loading && !data ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading teammates…
          </div>
        ) : error ? (
          <p className="px-3 py-3 text-xs text-[var(--error)]">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-3 text-xs text-[var(--text-muted)]">{emptyMessage}</p>
        ) : (
          <ul className={cn("divide-y divide-[var(--border-color)]", loading && "opacity-60")}>
            {items.map((u) => {
              const selected = value?._id === u._id;
              const isOwner = owner !== "" && u.label.trim().toLowerCase() === owner;
              return (
                <li key={u._id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onChange(selected ? null : u)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      selected
                        ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                        : "hover:bg-[var(--surface-dim)]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        selected
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border-color)] text-[var(--text-muted)]",
                      )}
                    >
                      {u.label.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-main)]">
                        {u.label}
                      </span>
                      {u.email ? (
                        <span className="block truncate text-[11px] text-[var(--text-muted)]">{u.email}</span>
                      ) : null}
                    </span>
                    {isOwner ? (
                      <span className="shrink-0 rounded-full border border-[var(--border-color)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                        Current
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showPager ? (
        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
          <span>
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              aria-label="Previous page"
              className="rounded-md border border-[var(--border-color)] p-1 hover:bg-[var(--surface-dim)] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-1 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              aria-label="Next page"
              className="rounded-md border border-[var(--border-color)] p-1 hover:bg-[var(--surface-dim)] disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
