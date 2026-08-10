"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  X,
  User,
  Briefcase,
  Building2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  crmSearchHasResults,
  fetchCrmSearch,
  type CrmSearchResults,
} from "@/lib/crm/search-api";
import { canViewCrmRevenue, getStoredUser } from '@/lib/suite/auth';
import { useGlobalSearchQuery } from "@/lib/hooks/useGlobalSearchQuery";

export default function GlobalSearch() {
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const showDealAmounts = canViewCrmRevenue(getStoredUser());

  const fetcher = useCallback(
    (q: string, signal: AbortSignal) =>
      fetchCrmSearch(q, { signal }),
    [],
  );

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

  const typedResults = results as CrmSearchResults | null;

  const [placeholder, setPlaceholder] = useState("Search…");
  useEffect(() => {
    const update = () => {
      setPlaceholder(window.innerWidth < 640 ? "Search…" : "Search companies, contacts, deals…");
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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

  const hasAnyResult = crmSearchHasResults(typedResults);

  return (
    <div className="relative w-full max-w-xl" ref={searchRef}>
      <div
        className={`relative flex items-center transition-all duration-300 ${isOpen ? "scale-105" : ""}`}
      >
        <Search
          className={`absolute left-3 transition-colors ${loading ? "text-[var(--hs-link)]" : "text-[var(--primary-muted)]"}`}
          size={18}
        />
        <input
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-[var(--surface-dim)] border border-transparent rounded-md py-2 sm:py-2.5 pl-10 pr-10 text-xs sm:text-sm font-normal text-[var(--text-main)] placeholder:text-[var(--primary-muted)] focus:ring-2 focus:ring-[var(--hs-link)]/20 focus:border-[var(--hs-link)] focus:bg-white transition-all outline-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= minLength && setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim().length >= minLength) {
              navigateTo(
                `/crm/search?q=${encodeURIComponent(query.trim())}`,
              );
            }
          }}
        />
        {loading ? (
          <Loader2
            className="absolute right-3 animate-spin text-[var(--hs-link)]"
            size={18}
          />
        ) : null}
        {query && !loading ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 text-[var(--primary-muted)] hover:text-[var(--text-main)]"
            aria-label="Clear search"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {isOpen && typedResults ? (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-md shadow-lg border border-[var(--border-color)] overflow-hidden z-[100] animate-in slide-in-from-top-2 duration-200">
          <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-2">
            {typedResults.platformOpportunities &&
            typedResults.platformOpportunities.length > 0 ? (
              <ResultSection
                title="Platform opportunities"
                icon={<Briefcase size={14} />}
                items={typedResults.platformOpportunities}
                render={(p) => (
                  <ResultItem
                    key={p._id}
                    title={p.title || "Opportunity"}
                    sub={`${p.opportunitySourcePlatform || "Platform"}${p.platformClientLabel ? ` · ${p.platformClientLabel}` : ""}`}
                    onClick={() =>
                      navigateTo(`/crm/platform-opportunities/${p._id}`)
                    }
                  />
                )}
              />
            ) : null}

            {typedResults.leads && typedResults.leads.length > 0 ? (
              <ResultSection
                title="Leads"
                icon={<User size={14} />}
                items={typedResults.leads}
                render={(l) => (
                  <ResultItem
                    key={l._id}
                    title={`${l.firstName || ""} ${l.lastName || ""}`.trim()}
                    sub={l.email}
                    onClick={() => navigateTo(`/crm/leads/${l._id}`)}
                  />
                )}
              />
            ) : null}

            {typedResults.deals && typedResults.deals.length > 0 ? (
              <ResultSection
                title="Deals"
                icon={<Briefcase size={14} />}
                items={typedResults.deals}
                render={(d) => (
                  <ResultItem
                    key={d._id}
                    title={d.title || d.organization || "Deal"}
                    sub={
                      showDealAmounts
                        ? `$${(d.dealValue ?? 0).toLocaleString()} • ${d.status || ""}`
                        : String(d.status || "")
                    }
                    onClick={() => navigateTo(`/crm/deals/${d._id}`)}
                  />
                )}
              />
            ) : null}

            {typedResults.organizations &&
            typedResults.organizations.length > 0 ? (
              <div className="p-2 border-b border-slate-50 last:border-0">
                <h3 className="px-4 py-2 text-xs font-black text-text-muted uppercase tracking-[0.2em] opacity-40">
                  Organizations
                </h3>
                <div className="space-y-1">
                  {typedResults.organizations.map((o) => (
                    <button
                      key={o._id}
                      type="button"
                      onClick={() => navigateTo(`/crm/organizations/${o._id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-dim rounded-2xl transition-all group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100/50">
                        <Building2 size={16} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">
                          {o.name}
                        </div>
                        <div className="text-xs text-text-muted font-medium truncate">
                          {o.industry || "No industry"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {typedResults.contacts && typedResults.contacts.length > 0 ? (
              <div className="p-2 border-b border-slate-50 last:border-0">
                <h3 className="px-4 py-2 text-xs font-black text-text-muted uppercase tracking-[0.2em] opacity-40">
                  Contacts
                </h3>
                <div className="space-y-1">
                  {typedResults.contacts.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => navigateTo(`/crm/contacts/${c._id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-dim rounded-2xl transition-all group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/50">
                        <User size={16} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-xs text-text-muted font-medium truncate">
                          {c.email || "No email"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {typedResults.clients && typedResults.clients.length > 0 ? (
              <div className="p-2 last:border-0">
                <h3 className="px-4 py-2 text-xs font-black text-text-muted uppercase tracking-[0.2em] opacity-40">
                  Clients
                </h3>
                <div className="space-y-1">
                  {typedResults.clients.map((cl) => (
                    <button
                      key={cl._id}
                      type="button"
                      onClick={() => navigateTo(`/crm/clients/${cl._id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-dim rounded-2xl transition-all group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/50">
                        <Building2 size={16} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">
                          {cl.name}
                        </div>
                        <div className="text-xs text-text-muted font-medium truncate">
                          {cl.email || "No email"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!hasAnyResult && !loading ? (
              <div className="py-12 text-center">
                <Search size={40} className="mx-auto text-slate-200 mb-4" />
                <p className="text-slate-400 font-bold">
                  No results found for &quot;{query}&quot;
                </p>
              </div>
            ) : null}

            {hasAnyResult ? (
              <button
                type="button"
                onClick={() =>
                  navigateTo(
                    `/crm/search?q=${encodeURIComponent(query.trim())}`,
                  )
                }
                className="w-full mt-2 py-3 px-4 text-center text-xs font-bold text-primary hover:bg-slate-50 transition-colors border-t border-border"
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

function ResultSection<T>({
  title,
  icon,
  items,
  render,
}: {
  title: string;
  icon: React.ReactNode;
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div className="p-2">
      <div className="flex items-center gap-2 px-4 py-2 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">
        {icon} {title}
      </div>
      {items.map((item) => render(item))}
    </div>
  );
}

function ResultItem({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-all rounded-2xl group text-left"
    >
      <div>
        <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">
          {title}
        </h4>
        {sub ? (
          <p className="text-xs font-black text-slate-400 mt-0.5 uppercase tracking-widest leading-none">
            {sub}
          </p>
        ) : null}
      </div>
      <ArrowRight
        size={16}
        className="text-slate-200 group-hover:text-blue-600 transition-all transform group-hover:translate-x-1"
      />
    </button>
  );
}
