"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";

const PMGlobalSearch = dynamic(() => import("./PMGlobalSearch"), { ssr: false });

type LazyPMGlobalSearchProps = {
  variant?: "default" | "jira";
};

export default function LazyPMGlobalSearch({ variant = "default" }: LazyPMGlobalSearchProps) {
  const [engaged, setEngaged] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engaged) return;
    const id = requestAnimationFrame(() => {
      wrapRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [engaged]);

  const engage = () => setEngaged(true);

  const wrapClass =
    variant === "jira"
      ? "relative w-full"
      : "relative w-full max-w-2xl mx-auto";

  if (engaged) {
    return (
      <div ref={wrapRef} className={wrapClass}>
        <PMGlobalSearch />
      </div>
    );
  }

  if (variant === "jira") {
    return (
      <div className={wrapClass}>
        <button
          type="button"
          onClick={engage}
          onMouseEnter={() => {
            void import("./PMGlobalSearch");
          }}
          onFocus={engage}
          className="pm-jira-header-search-trigger relative flex h-8 w-full items-center rounded-[3px] border border-[#dfe1e6] bg-[#f4f5f7] pl-8 pr-3 text-left text-sm font-normal text-[#97a0af] transition-colors hover:bg-[#ebecf0]"
          aria-label="Open search"
        >
          <Search
            className="absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[#7a869a]"
            size={16}
            strokeWidth={1.75}
          />
          <span className="truncate">Search</span>
          <span className="pointer-events-none ml-auto hidden items-center gap-0.5 rounded-[3px] border border-[#dfe1e6] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#97a0af] md:inline-flex">
            <span className="text-xs opacity-70">⌘</span>K
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <button
        type="button"
        onClick={engage}
        onMouseEnter={() => {
          void import("./PMGlobalSearch");
        }}
        onFocus={engage}
        className="relative flex w-full items-center text-left transition-all duration-300"
        aria-label="Open search"
      >
        <Search className="absolute left-4 z-10 text-[var(--text-muted)]" size={18} strokeWidth={1.75} />
        <span className="w-full rounded-full border border-[var(--border-color)] bg-white py-3 pl-11 pr-16 text-sm font-normal text-[var(--text-muted)] shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)]">
          Search projects, tasks, wiki…
        </span>
        <div className="pointer-events-none absolute right-4 flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--surface-dim)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <span className="text-xs opacity-70">⌘</span> K
        </div>
      </button>
    </div>
  );
}
