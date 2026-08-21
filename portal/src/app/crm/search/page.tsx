"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Loader2,
  Search,
  User,
} from "lucide-react";
import {
  crmSearchHasResults,
  fetchCrmSearch,
  type CrmSearchResults,
} from "@/lib/crm/search-api";
import { canViewCrmRevenue, getStoredUser } from '@/lib/suite/auth';

const INITIAL_VISIBLE = 24;
const INCREMENT = 24;

function SearchPageFallback() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:py-10">
      <div className="h-10 w-64 bg-slate-100 rounded-lg animate-pulse mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="crm-kanban-card !mt-0 h-20 animate-pulse"
            style={{ ["--crm-stage-accent" as string]: "var(--border-color)" }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CrmSearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <CrmSearchPageContent />
    </Suspense>
  );
}

function CrmSearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryFromUrl = searchParams.get("q")?.trim() ?? "";
  const showDealAmounts = canViewCrmRevenue(getStoredUser());

  const [input, setInput] = useState(queryFromUrl);
  const [results, setResults] = useState<CrmSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visibleLeads, setVisibleLeads] = useState(INITIAL_VISIBLE);
  const [visibleDeals, setVisibleDeals] = useState(INITIAL_VISIBLE);
  const [visibleContacts, setVisibleContacts] = useState(INITIAL_VISIBLE);
  const [visibleOrgs, setVisibleOrgs] = useState(INITIAL_VISIBLE);
  const [visibleClients, setVisibleClients] = useState(INITIAL_VISIBLE);

  const runSearch = useCallback(async (q: string, signal?: AbortSignal) => {
    if (q.length < 2) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCrmSearch(q, { full: true, signal });
      setResults(data);
    } catch (err) {
      if (signal?.aborted) return;
      setResults(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setInput(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void runSearch(queryFromUrl, controller.signal);
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [queryFromUrl, runSearch]);

  useEffect(() => {
    setVisibleLeads(INITIAL_VISIBLE);
    setVisibleDeals(INITIAL_VISIBLE);
    setVisibleContacts(INITIAL_VISIBLE);
    setVisibleOrgs(INITIAL_VISIBLE);
    setVisibleClients(INITIAL_VISIBLE);
  }, [queryFromUrl]);

  const leads = results?.leads ?? [];
  const deals = results?.deals ?? [];
  const contacts = results?.contacts ?? [];
  const organizations = results?.organizations ?? [];
  const clients = results?.clients ?? [];

  const totalCount = useMemo(
    () =>
      leads.length +
      deals.length +
      contacts.length +
      organizations.length +
      clients.length,
    [
      leads.length,
      deals.length,
      contacts.length,
      organizations.length,
      clients.length,
    ],
  );

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q.length < 2) return;
    router.push(`/crm/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10 space-y-8">
      <header className="space-y-4">
        <div className="space-y-1 border-l-4 border-primary pl-5">
          <h1 className="text-2xl md:text-3xl font-bold text-text-main tracking-tight">
            Search CRM
          </h1>
          <p className="text-sm text-text-muted">
            Find leads, contacts, deals, companies, and clients across your
            workspace.
          </p>
        </div>

        <form onSubmit={submitSearch} className="relative max-w-2xl">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            size={20}
          />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by name, email, company, deal…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-full border border-border bg-white py-3.5 pl-12 pr-28 text-sm text-text-main shadow-[var(--crm-shadow-card)] focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
          />
          <button
            type="submit"
            disabled={input.trim().length < 2 || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Search
          </button>
        </form>

        {queryFromUrl ? (
          <p className="text-xs text-text-muted">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-primary" />
                Searching for &quot;{queryFromUrl}&quot;…
              </span>
            ) : (
              <>
                Results for{" "}
                <strong className="text-text-main">&quot;{queryFromUrl}&quot;</strong>
                {!loading && totalCount > 0 ? (
                  <span className="text-text-muted">
                    {" "}
                    · {totalCount} match{totalCount === 1 ? "" : "es"}
                  </span>
                ) : null}
              </>
            )}
          </p>
        ) : null}
      </header>

      {!queryFromUrl ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
          <Search size={48} className="text-slate-200" />
          <p className="text-sm text-text-muted max-w-md">
            Enter at least 2 characters to search. You can also use the header
            search and press Enter, or choose &quot;View all results&quot;.
          </p>
        </div>
      ) : loading && !results ? (
        <SearchPageFallback />
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : !crmSearchHasResults(results) ? (
        <div className="flex flex-col items-center justify-center min-h-[32vh] text-center space-y-3">
          <Search size={40} className="text-slate-200" />
          <p className="text-sm font-medium text-text-muted">
            No results found for &quot;{queryFromUrl}&quot;
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {leads.length > 0 ? (
            <SearchSection
              title="Leads"
              icon={<User size={16} className="text-primary" />}
              total={leads.length}
              visible={visibleLeads}
              onShowMore={() => setVisibleLeads((v) => v + INCREMENT)}
            >
              {leads.slice(0, visibleLeads).map((l) => (
                <SearchCard
                  key={l._id}
                  href={`/crm/leads/${l._id}`}
                  title={`${l.firstName || ""} ${l.lastName || ""}`.trim() || "Lead"}
                  subtitle={[l.email, l.organization, l.status]
                    .filter(Boolean)
                    .join(" · ")}
                  accent="#ffa201"
                />
              ))}
            </SearchSection>
          ) : null}

          {contacts.length > 0 ? (
            <SearchSection
              title="Contacts"
              icon={<User size={16} className="text-emerald-600" />}
              total={contacts.length}
              visible={visibleContacts}
              onShowMore={() => setVisibleContacts((v) => v + INCREMENT)}
            >
              {contacts.slice(0, visibleContacts).map((c) => (
                <SearchCard
                  key={c._id}
                  href={`/crm/contacts/${c._id}`}
                  title={`${c.firstName || ""} ${c.lastName || ""}`.trim() || "Contact"}
                  subtitle={c.email || "No email"}
                  accent="#27ae60"
                />
              ))}
            </SearchSection>
          ) : null}

          {deals.length > 0 ? (
            <SearchSection
              title="Deals"
              icon={<Briefcase size={16} className="text-amber-600" />}
              total={deals.length}
              visible={visibleDeals}
              onShowMore={() => setVisibleDeals((v) => v + INCREMENT)}
            >
              {deals.slice(0, visibleDeals).map((d) => (
                <SearchCard
                  key={d._id}
                  href={`/crm/deals/${d._id}`}
                  title={d.title || d.organization || "Deal"}
                  subtitle={
                    showDealAmounts
                      ? `$${(d.dealValue ?? 0).toLocaleString()}${d.status ? ` · ${d.status}` : ""}`
                      : d.status || ""
                  }
                  accent="#ff9f43"
                />
              ))}
            </SearchSection>
          ) : null}

          {organizations.length > 0 ? (
            <SearchSection
              title="Organizations"
              icon={<Building2 size={16} className="text-purple-600" />}
              total={organizations.length}
              visible={visibleOrgs}
              onShowMore={() => setVisibleOrgs((v) => v + INCREMENT)}
            >
              {organizations.slice(0, visibleOrgs).map((o) => (
                <SearchCard
                  key={o._id}
                  href={`/crm/organizations/${o._id}`}
                  title={o.name || "Organization"}
                  subtitle={o.industry || "No industry"}
                  accent="#9b51e0"
                />
              ))}
            </SearchSection>
          ) : null}

          {clients.length > 0 ? (
            <SearchSection
              title="Clients"
              icon={<Building2 size={16} className="text-blue-600" />}
              total={clients.length}
              visible={visibleClients}
              onShowMore={() => setVisibleClients((v) => v + INCREMENT)}
            >
              {clients.slice(0, visibleClients).map((cl) => (
                <SearchCard
                  key={cl._id}
                  href={`/crm/clients/${cl._id}`}
                  title={cl.name || "Client"}
                  subtitle={cl.email || "No email"}
                  accent="#2f80ed"
                />
              ))}
            </SearchSection>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  icon,
  total,
  visible,
  onShowMore,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  total: number;
  visible: number;
  onShowMore: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-bold text-text-muted">
          {title}
        </h2>
        <span className="text-xs text-text-muted">({total})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
      {visible < total ? (
        <button
          type="button"
          onClick={onShowMore}
          className="rounded-[var(--radius-md)] border border-border px-4 py-2 text-xs font-bold text-text-muted hover:border-primary/40 hover:text-primary"
        >
          Show more {title.toLowerCase()}
        </button>
      ) : null}
    </section>
  );
}

function SearchCard({
  href,
  title,
  subtitle,
  accent = "#2f80ed",
}: {
  href: string;
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <Link
      href={href}
      className="crm-kanban-card group !mt-0 block no-underline"
      style={{ ["--crm-stage-accent" as string]: accent }}
    >
      <div className="crm-kanban-card-head !mb-0">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="crm-kanban-avatar" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="crm-kanban-card-title truncate">{title}</div>
            {subtitle ? (
              <div className="crm-kanban-card-subtitle">{subtitle}</div>
            ) : null}
          </div>
        </div>
        <ArrowRight
          size={14}
          className="text-[var(--text-muted)] group-hover:text-primary shrink-0 mt-1 transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
