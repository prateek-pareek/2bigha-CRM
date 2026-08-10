"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Search,
  X,
  LayoutDashboard,
  Kanban,
  BookOpen,
  Loader2,
  ArrowRight,
  Box,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import api from "@/lib/pm/api";
import { cn } from "@/lib/pm/utils";
import { useGlobalSearchQuery } from "@/lib/hooks/useGlobalSearchQuery";

type PmSearchResults = {
  projects?: Array<{ _id: string; key: string; name: string }>;
  issues?: Array<{
    _id: string;
    key: string;
    summary: string;
    status?: string;
    project?: { _id?: string; name?: string; key?: string } | string;
  }>;
  pages?: Array<{
    _id: string;
    title: string;
    space?: { _id?: string; name?: string } | string;
  }>;
};

export default function PMGlobalSearch() {
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetcher = useCallback(async (query: string, signal: AbortSignal) => {
    const res = await api.get(`/search?q=${encodeURIComponent(query)}`, {
      signal,
    });
    return res.data as PmSearchResults;
  }, []);

  const {
    query,
    setQuery,
    results,
    loading,
    isOpen,
    setIsOpen,
    clear,
    minLength,
  } = useGlobalSearchQuery({ fetcher, minLength: 2, debounceMs: 180 });

  const typedResults = results as PmSearchResults | null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setIsOpen]);

  const navigateTo = (path: string) => {
    router.push(path);
    clear();
  };

  const hasResults =
    typedResults &&
    ((typedResults.projects?.length ?? 0) > 0 ||
      (typedResults.issues?.length ?? 0) > 0 ||
      (typedResults.pages?.length ?? 0) > 0);

  return (
    <div className="relative w-full max-w-2xl mx-auto" ref={searchRef}>
      <div
        className={cn(
          "relative flex items-center transition-all duration-300",
          isOpen && "translate-y-[-2px]",
        )}
      >
        <Search
          className={cn(
            "absolute left-3 transition-colors z-10",
            loading ? "text-[var(--hs-link)]" : "text-[var(--primary-muted)]",
          )}
          size={18}
        />
        <input
          type="search"
          placeholder="Search projects, issues, wiki…"
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full rounded-[3px] border border-[#dfe1e6] bg-[#f4f5f7] py-0 pl-9 pr-10 text-sm font-normal text-[#172b4d] outline-none transition-all placeholder:text-[#97a0af] focus:border-[#0c66e4] focus:bg-white focus:ring-1 focus:ring-[#0c66e4]/30"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= minLength && setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              navigateTo(`/pm/search?q=${encodeURIComponent(query.trim())}`);
            }
          }}
        />
        <div className="absolute right-3 flex items-center gap-2">
          {loading ? (
            <Loader2 className="animate-spin text-[var(--hs-link)]" size={18} />
          ) : query ? (
            <button
              type="button"
              onClick={clear}
              className="text-slate-300 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <X size={18} />
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-1 rounded-[3px] border border-[#dfe1e6] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#97a0af]">
              <span className="text-xs opacity-70">⌘</span> K
            </div>
          )}
        </div>
      </div>

      {isOpen ? (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-[var(--border-color)] overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
            {typedResults?.projects && typedResults.projects.length > 0 ? (
              <div className="mb-2">
                <div className="px-3 py-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#5e6c84] border-b border-[#ebecf0]">
                  <LayoutDashboard
                    size={12}
                    className="text-[var(--hs-link)]"
                  />
                  Projects
                </div>
                {typedResults.projects.map((project) => (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() =>
                      navigateTo(`/pm/projects/${project._id}/board`)
                    }
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[var(--background)] rounded-md transition-all group text-left"
                  >
                    <div className="w-8 h-8 rounded-md bg-[#e0f4f7] flex items-center justify-center border border-[var(--hs-link)]/20 text-[var(--hs-link)] font-bold text-xs">
                      {project.key}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-main)] group-hover:text-[var(--hs-link)] truncate">
                        {project.name}
                      </div>
                      <div className="text-xs text-slate-400 font-medium truncate uppercase tracking-tighter">
                        Project • {project.key}
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-slate-200 group-hover:text-[var(--hs-link)] transition-all transform group-hover:translate-x-1"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {typedResults?.issues && typedResults.issues.length > 0 ? (
              <div className="mb-2">
                <div className="px-3 py-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#5e6c84] border-b border-[#ebecf0]">
                  <Kanban size={12} className="text-orange-500" />
                  Tasks
                </div>
                {typedResults.issues.map((issue) => {
                  const projectId =
                    typeof issue.project === "object"
                      ? issue.project?._id
                      : issue.project;
                  const projectName =
                    typeof issue.project === "object"
                      ? issue.project?.name
                      : undefined;
                  return (
                    <button
                      key={issue._id}
                      type="button"
                      onClick={() =>
                        navigateTo(
                          `/pm/projects/${projectId || issue.project}/board?selectedIssue=${issue.key}`,
                        )
                      }
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[var(--background)] rounded-md transition-all group text-left"
                    >
                      <div className="w-8 h-8 rounded-md bg-[var(--accent)] flex items-center justify-center border border-[var(--primary-muted)] text-[#c2410c]">
                        <Box size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-main)] group-hover:text-[var(--hs-link)] truncate">
                          {issue.summary}
                        </div>
                        <div className="text-xs text-slate-400 font-medium truncate uppercase tracking-tighter">
                          {projectName || "Project"} • {issue.key}
                          <span
                            className={cn(
                              "ml-2 px-1.5 py-0.5 rounded text-[8px] border",
                              issue.status === "DONE"
                                ? "bg-green-50 border-green-100 text-green-600"
                                : "bg-[#e0f4f7] border-[#b8e4eb] text-[var(--hs-link)]",
                            )}
                          >
                            {issue.status}
                          </span>
                        </div>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-slate-200 group-hover:text-[var(--hs-link)] transition-all transform group-hover:translate-x-1"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            {typedResults?.pages && typedResults.pages.length > 0 ? (
              <div className="mb-2">
                <div className="px-3 py-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#5e6c84] border-b border-[#ebecf0]">
                  <BookOpen size={12} className="text-green-600" />
                  Pages
                </div>
                {typedResults.pages.map((page) => {
                  const spaceId =
                    typeof page.space === "object"
                      ? page.space?._id
                      : page.space;
                  const spaceName =
                    typeof page.space === "object"
                      ? page.space?.name
                      : undefined;
                  return (
                    <button
                      key={page._id}
                      type="button"
                      onClick={() =>
                        navigateTo(`/pm/wiki/${spaceId}/${page._id}`)
                      }
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[var(--background)] rounded-md transition-all group text-left"
                    >
                      <div className="w-8 h-8 rounded-md bg-green-50 flex items-center justify-center border border-green-100 text-green-600">
                        <Zap size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-main)] group-hover:text-green-600 truncate">
                          {page.title}
                        </div>
                        <div className="text-xs text-slate-400 font-medium truncate uppercase tracking-tighter">
                          {spaceName || "Wiki Space"}
                        </div>
                      </div>
                      <ArrowRight
                        size={14}
                        className="text-slate-200 group-hover:text-green-600 transition-all transform group-hover:translate-x-1"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}

            {!hasResults && !loading && query.trim().length >= minLength ? (
              <div className="py-12 text-center">
                <Search size={40} className="mx-auto text-slate-100 mb-4" />
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  No matching results found
                </p>
              </div>
            ) : null}

            {hasResults ? (
              <button
                type="button"
                onClick={() =>
                  navigateTo(
                    `/pm/search?q=${encodeURIComponent(query.trim())}`,
                  )
                }
                className="w-full mt-2 py-3 px-4 text-center text-xs font-bold text-[var(--hs-link)] hover:bg-[var(--surface-dim)] transition-colors border-t border-[var(--border-color)] uppercase tracking-[0.2em]"
              >
                View all results for &quot;{query}&quot;
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
