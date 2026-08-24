"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const GlobalSearch = dynamic(() => import("./GlobalSearch"), { ssr: false });

export default function LazyGlobalSearch({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
} = {}) {
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
  const label = placeholder || "Search companies, contacts, leads…";

  if (engaged) {
    return (
      <div ref={wrapRef} className={cn("relative w-full max-w-xl", className)}>
        <GlobalSearch />
      </div>
    );
  }

  return (
    <div className={cn("relative w-full max-w-xl", className)}>
      <button
        type="button"
        onClick={engage}
        onMouseEnter={() => {
          void import("./GlobalSearch");
        }}
        onFocus={engage}
        className="relative flex w-full items-center text-left transition-all duration-300"
        aria-label="Open search"
      >
        <Search className="absolute left-4 z-10 text-[var(--text-muted)]" size={18} strokeWidth={1.75} />
        <span className="w-full rounded-full border border-[var(--border-color)] bg-white py-2 sm:py-2.5 pl-11 pr-4 text-xs sm:text-sm font-normal text-[var(--text-muted)] shadow-[var(--crm-shadow-card)] transition-shadow hover:shadow-[var(--crm-shadow-raised)] truncate whitespace-nowrap block text-left">
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">Search…</span>
        </span>
      </button>
    </div>
  );
}
