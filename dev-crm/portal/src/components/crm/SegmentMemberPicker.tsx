"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import type { CrmSegmentMemberModule } from "@/lib/crm/segments";
import { cn } from "@/lib/utils";

type SearchRecord = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  organization?: string;
  name?: string;
  title?: string;
  opportunitySourcePlatform?: string;
  platformClientLabel?: string;
};

function moduleLabel(module: CrmSegmentMemberModule) {
  if (module === "platform-opportunities") return "platform opportunities";
  return module;
}

function recordLabel(row: SearchRecord) {
  if (row.title) return row.title;
  const n = `${row.firstName || ""} ${row.lastName || ""}`.trim();
  return n || row.name || row.email || "Record";
}

function recordMeta(row: SearchRecord, module: CrmSegmentMemberModule) {
  if (module === "platform-opportunities") {
    return (
      [row.opportunitySourcePlatform, row.platformClientLabel]
        .filter(Boolean)
        .join(" · ") || String(row._id)
    );
  }
  return [row.email, row.organization].filter(Boolean).join(" · ") || String(row._id);
}

export default function SegmentMemberPicker({
  module,
  memberIds,
  onSelect,
  disabled,
  inputRef,
}: {
  module: CrmSegmentMemberModule;
  memberIds: Set<string>;
  onSelect: (entityId: string) => void | Promise<void>;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setSearching(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${CRM_API_URL}/crm/search?q=${encodeURIComponent(debouncedQuery.trim())}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Record<string, SearchRecord[]>;
        const rows =
          module === "leads"
            ? data.leads || []
            : module === "contacts"
              ? data.contacts || []
              : data.platformOpportunities || [];
        if (!cancelled) setResults(rows.slice(0, 12));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, module]);

  const showDropdown =
    open && query.trim().length >= 2 && (searching || results.length > 0);

  return (
    <div className="relative flex-1 min-w-[220px]">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-text-muted flex items-center gap-1">
          <UserPlus className="h-3.5 w-3.5" />
          Search {moduleLabel(module)} to add
        </span>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 150);
            }}
            placeholder={
              module === "platform-opportunities"
                ? "Type title or platform…"
                : "Type name or email…"
            }
            className="w-full rounded-md border border-[var(--border-color)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
          ) : null}
        </div>
      </label>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--border-color)] bg-white shadow-lg">
          {searching ? (
            <p className="px-3 py-2.5 text-xs text-text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-text-muted">No matching records.</p>
          ) : (
            <ul>
              {results.map((row) => {
                const id = String(row._id);
                const already = memberIds.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={disabled || already}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        void onSelect(id);
                        setQuery("");
                        setResults([]);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b border-[#ebecf0] px-3 py-2.5 text-left last:border-b-0 transition-colors",
                        already
                          ? "cursor-not-allowed bg-surface-dim/30 text-text-muted"
                          : "hover:bg-surface-dim/50",
                      )}
                    >
                      <span className="text-sm font-medium text-text-main">{recordLabel(row)}</span>
                      <span className="text-xs text-text-muted">{recordMeta(row, module)}</span>
                      {already ? (
                        <span className="text-[10px] font-semibold text-primary">
                          Already in list
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
