"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Cloud, Loader2, RefreshCw, Users, UserCircle, X } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import { TwoBighaSyncStatusBadge } from "@/components/crm/platform/TwoBighaSyncStatusBadge";
import {
  fetchTwoBighaClientsSummary,
  resyncTwoBighaClient,
  type TwoBighaClientsSummary,
  type TwoBighaSyncStatus,
} from "@/lib/crm/twobigha-client-api";
import {
  fetchTwoBighaAdmins,
  fetchTwoBighaAgentsSummary,
  resyncTwoBighaAgent,
  type TwoBighaAgentFetchResult,
  type TwoBighaAgentsSummary,
  type TwoBighaAdmin,
} from "@/lib/crm/twobigha-agent-api";

type Tab = "clients" | "agents" | "reconcile";
type SyncFilter = "all" | TwoBighaSyncStatus;
type IdFilter = "all" | "with_id" | "without_id";
type ActiveFilter = "all" | "active" | "inactive";
type ReconcileLinkFilter = "all" | "linked" | "not_in_crm";

const SYNC_FILTER_OPTIONS: { value: SyncFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "synced", label: "Synced" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
  { value: "mock", label: "Mock" },
  { value: "not_synced", label: "Not synced" },
];

function normalizeSyncStatus(status?: string): TwoBighaSyncStatus {
  return (status || "not_synced") as TwoBighaSyncStatus;
}

function matchesSearch(haystack: string, search: string): boolean {
  if (!search.trim()) return true;
  return haystack.toLowerCase().includes(search.trim().toLowerCase());
}

function uniqueDepartments(admins: TwoBighaAdmin[]): string[] {
  return [...new Set(admins.map((a) => a.department).filter(Boolean) as string[])].sort();
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-text-main outline-none focus:ring-2 focus:ring-primary/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar({
  children,
  onClear,
  showClear,
}: {
  children: ReactNode;
  onClear?: () => void;
  showClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-dim/30 p-3">
      {children}
      {showClear && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mb-0.5 inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-text-muted transition hover:text-text-main"
        >
          <X size={12} />
          Clear
        </button>
      ) : null}
    </div>
  );
}

function FilterResultBar({ shown, total, label = "records" }: { shown: number; total: number; label?: string }) {
  return (
    <p className="text-xs text-text-muted">
      Showing <strong className="text-text-main">{shown}</strong> of <strong className="text-text-main">{total}</strong>{" "}
      {label}
      {shown !== total ? " (filtered)" : ""}
    </p>
  );
}

function SummaryCards({
  counts,
  activeKey,
  onSelect,
}: {
  counts: Record<string, number>;
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  const items = [
    { key: "synced", label: "Synced", tone: "text-emerald-700 bg-emerald-50 border-emerald-100" },
    { key: "failed", label: "Failed", tone: "text-rose-700 bg-rose-50 border-rose-100" },
    { key: "skipped", label: "Skipped", tone: "text-amber-700 bg-amber-50 border-amber-100" },
    { key: "mock", label: "Mock", tone: "text-sky-700 bg-sky-50 border-sky-100" },
    { key: "not_synced", label: "Not synced", tone: "text-slate-600 bg-slate-50 border-slate-100" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect?.(item.key)}
          disabled={!onSelect}
          className={`rounded-lg border px-3 py-2.5 text-left transition ${item.tone} ${
            onSelect ? "cursor-pointer hover:ring-2 hover:ring-primary/20" : "cursor-default"
          } ${activeKey === item.key ? "ring-2 ring-primary/40" : ""}`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{item.label}</p>
          <p className="text-xl font-bold mt-0.5">{counts[item.key] ?? 0}</p>
        </button>
      ))}
    </div>
  );
}

export default function TwoBighaSyncHub() {
  const [tab, setTab] = useState<Tab>("clients");
  const [loading, setLoading] = useState(true);
  const [clientsSummary, setClientsSummary] = useState<TwoBighaClientsSummary | null>(null);
  const [agentsSummary, setAgentsSummary] = useState<TwoBighaAgentsSummary | null>(null);
  const [remoteAdmins, setRemoteAdmins] = useState<TwoBighaAgentFetchResult | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");

  // Clients tab filters
  const [clientSearch, setClientSearch] = useState("");
  const [clientSyncFilter, setClientSyncFilter] = useState<SyncFilter>("all");
  const [clientIdFilter, setClientIdFilter] = useState<IdFilter>("all");

  // Agents tab — CRM section filters
  const [crmAgentSearch, setCrmAgentSearch] = useState("");
  const [crmAgentSyncFilter, setCrmAgentSyncFilter] = useState<SyncFilter>("all");
  const [crmAgentIdFilter, setCrmAgentIdFilter] = useState<IdFilter>("all");

  // Agents / Reconcile — 2bigha platform filters
  const [remoteActiveFilter, setRemoteActiveFilter] = useState<ActiveFilter>("all");
  const [remoteDeptFilter, setRemoteDeptFilter] = useState("all");

  // Reconcile-specific filters
  const [reconcileLinkFilter, setReconcileLinkFilter] = useState<ReconcileLinkFilter>("all");

  const load = async () => {
    setLoading(true);
    try {
      const [clients, agents] = await Promise.all([
        fetchTwoBighaClientsSummary(),
        fetchTwoBighaAgentsSummary(),
      ]);
      setClientsSummary(clients);
      setAgentsSummary(agents);
    } catch {
      toast.error("Failed to load 2bigha sync status");
    } finally {
      setLoading(false);
    }
  };

  const loadRemoteAdmins = async () => {
    setRemoteLoading(true);
    try {
      const data = await fetchTwoBighaAdmins({ all: true, search: adminSearch || undefined });
      setRemoteAdmins(data);
      if (data.status === "failed") {
        toast.error(data.error || "Failed to fetch 2bigha agents");
      }
    } catch {
      toast.error("Failed to fetch 2bigha agent list");
    } finally {
      setRemoteLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab !== "reconcile" && tab !== "agents") return;
    const t = setTimeout(() => void loadRemoteAdmins(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, adminSearch]);

  const reconcileRows = useMemo(() => {
    const crm = agentsSummary?.items ?? [];
    const remote = remoteAdmins?.admins ?? [];
    const remoteByEmail = new Map(remote.map((a) => [a.email.toLowerCase(), a]));
    const remoteById = new Map(remote.map((a) => [a.id, a]));

    return crm.map((u) => {
      const remoteMatch =
        (u.twobighaAdminId && remoteById.get(u.twobighaAdminId)) ||
        (u.email && remoteByEmail.get(u.email.toLowerCase()));
      return { crm: u, remote: remoteMatch };
    });
  }, [agentsSummary, remoteAdmins]);

  /** Every 2bigha agent with optional linked CRM user — primary reconcile view. */
  const remoteReconcileRows = useMemo(() => {
    const crm = agentsSummary?.items ?? [];
    const remote = remoteAdmins?.admins ?? [];
    const crmByEmail = new Map(
      crm.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]),
    );
    const crmById = new Map(
      crm.filter((u) => u.twobighaAdminId).map((u) => [u.twobighaAdminId!, u]),
    );

    return remote.map((admin) => {
      const crmMatch =
        crmById.get(admin.id) ||
        (admin.email ? crmByEmail.get(admin.email.toLowerCase()) : undefined);
      return { remote: admin, crm: crmMatch };
    });
  }, [agentsSummary, remoteAdmins]);

  /** CRM team members with no matching 2bigha admin. */
  const crmOnlyRows = useMemo(
    () => reconcileRows.filter(({ remote }) => !remote).map(({ crm }) => crm),
    [reconcileRows],
  );

  const remoteDepartments = useMemo(
    () => uniqueDepartments(remoteAdmins?.admins ?? []),
    [remoteAdmins],
  );

  const filteredClients = useMemo(() => {
    const items = clientsSummary?.items ?? [];
    return items.filter((row) => {
      if (clientSyncFilter !== "all" && normalizeSyncStatus(row.twobighaSyncStatus) !== clientSyncFilter) {
        return false;
      }
      if (clientIdFilter === "with_id" && !row.twobighaUserId) return false;
      if (clientIdFilter === "without_id" && row.twobighaUserId) return false;
      const haystack = [row.name, row.email].filter(Boolean).join(" ");
      return matchesSearch(haystack, clientSearch);
    });
  }, [clientsSummary, clientSearch, clientSyncFilter, clientIdFilter]);

  const filteredCrmAgents = useMemo(() => {
    const items = agentsSummary?.items ?? [];
    return items.filter((row) => {
      if (crmAgentSyncFilter !== "all" && normalizeSyncStatus(row.twobighaSyncStatus) !== crmAgentSyncFilter) {
        return false;
      }
      if (crmAgentIdFilter === "with_id" && !row.twobighaAdminId) return false;
      if (crmAgentIdFilter === "without_id" && row.twobighaAdminId) return false;
      const haystack = [row.firstName, row.lastName, row.email].filter(Boolean).join(" ");
      return matchesSearch(haystack, crmAgentSearch);
    });
  }, [agentsSummary, crmAgentSearch, crmAgentSyncFilter, crmAgentIdFilter]);

  const filterRemoteAdmin = (admin: TwoBighaAdmin) => {
    if (remoteActiveFilter === "active" && !admin.isActive) return false;
    if (remoteActiveFilter === "inactive" && admin.isActive) return false;
    if (remoteDeptFilter !== "all" && (admin.department || "") !== remoteDeptFilter) return false;
    return true;
  };

  const filteredRemoteAdmins = useMemo(
    () => (remoteAdmins?.admins ?? []).filter(filterRemoteAdmin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remoteAdmins, remoteActiveFilter, remoteDeptFilter],
  );

  const filteredRemoteReconcileRows = useMemo(() => {
    return remoteReconcileRows.filter(({ remote, crm }) => {
      if (!filterRemoteAdmin(remote)) return false;
      if (reconcileLinkFilter === "linked" && !crm) return false;
      if (reconcileLinkFilter === "not_in_crm" && crm) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteReconcileRows, remoteActiveFilter, remoteDeptFilter, reconcileLinkFilter]);

  const filteredCrmOnlyRows = useMemo(() => {
    return crmOnlyRows.filter((crm) => {
      if (crmAgentSyncFilter !== "all" && normalizeSyncStatus(crm.twobighaSyncStatus) !== crmAgentSyncFilter) {
        return false;
      }
      const haystack = [crm.firstName, crm.lastName, crm.email].filter(Boolean).join(" ");
      return matchesSearch(haystack, crmAgentSearch);
    });
  }, [crmOnlyRows, crmAgentSearch, crmAgentSyncFilter]);

  const clientFiltersActive =
    clientSearch.trim() !== "" || clientSyncFilter !== "all" || clientIdFilter !== "all";
  const crmAgentFiltersActive =
    crmAgentSearch.trim() !== "" || crmAgentSyncFilter !== "all" || crmAgentIdFilter !== "all";
  const remoteFiltersActive = remoteActiveFilter !== "all" || remoteDeptFilter !== "all";
  const reconcileFiltersActive =
    adminSearch.trim() !== "" || remoteFiltersActive || reconcileLinkFilter !== "all";

  const clearClientFilters = () => {
    setClientSearch("");
    setClientSyncFilter("all");
    setClientIdFilter("all");
  };

  const clearCrmAgentFilters = () => {
    setCrmAgentSearch("");
    setCrmAgentSyncFilter("all");
    setCrmAgentIdFilter("all");
  };

  const clearRemoteFilters = () => {
    setAdminSearch("");
    setRemoteActiveFilter("all");
    setRemoteDeptFilter("all");
    setReconcileLinkFilter("all");
  };

  const resyncClient = async (id: string) => {
    setSyncingId(id);
    try {
      const result = await resyncTwoBighaClient(id);
      if (result.twobighaSyncStatus === "synced" || result.twobighaSyncStatus === "mock") {
        toast.success("Client synced to 2bigha");
      } else {
        toast.error(result.twobighaSyncError || "Sync failed");
      }
      await load();
    } catch {
      toast.error("Client sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const resyncAgent = async (id: string) => {
    setSyncingId(id);
    try {
      const result = await resyncTwoBighaAgent(id);
      if (result.twobighaSyncStatus === "synced" || result.twobighaSyncStatus === "mock") {
        toast.success("Agent synced to 2bigha");
      } else {
        toast.error(result.twobighaSyncError || "Sync failed");
      }
      await load();
      if (tab === "reconcile" || tab === "agents") await loadRemoteAdmins();
    } catch {
      toast.error("Agent sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
        <Loader2 size={18} className="animate-spin text-primary" />
        Loading 2bigha sync status…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface-dim/40 p-1">
          {([
            { id: "clients" as const, label: "Clients", icon: UserCircle },
            { id: "agents" as const, label: "Agents", icon: Users },
            { id: "reconcile" as const, label: "Reconcile", icon: Cloud },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === t.id ? "bg-card text-primary shadow-sm" : "text-text-muted hover:text-text-main"
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
        <CrmButton
          type="button"
          variant="secondary"
          onClick={() => {
            void load();
            if (tab === "agents" || tab === "reconcile") void loadRemoteAdmins();
          }}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </CrmButton>
      </div>

      {tab === "clients" && clientsSummary ? (
        <div className="space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Lists <strong>CRM clients</strong> in your database and their 2bigha sync status. This does not pull
            all platform users from 2bigha (there is no list API — only per-user <code className="text-[10px]">getUser</code> after sync).
            Create a client with an email first, then use client detail → <strong>View live profile</strong> to see the fetch output.
          </p>
          <SummaryCards
            counts={clientsSummary.counts}
            activeKey={clientSyncFilter === "all" ? undefined : clientSyncFilter}
            onSelect={(key) => setClientSyncFilter(key as SyncFilter)}
          />
          <FilterBar onClear={clearClientFilters} showClear={clientFiltersActive}>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Search</span>
              <input
                type="search"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Name or email…"
                className="h-9 rounded-md border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <FilterSelect
              label="Sync status"
              value={clientSyncFilter}
              onChange={(v) => setClientSyncFilter(v as SyncFilter)}
              options={SYNC_FILTER_OPTIONS}
            />
            <FilterSelect
              label="2bigha ID"
              value={clientIdFilter}
              onChange={(v) => setClientIdFilter(v as IdFilter)}
              options={[
                { value: "all", label: "All" },
                { value: "with_id", label: "Has 2bigha ID" },
                { value: "without_id", label: "No 2bigha ID" },
              ]}
            />
          </FilterBar>
          {clientsSummary.items.length > 0 ? (
            <FilterResultBar shown={filteredClients.length} total={clientsSummary.items.length} label="clients" />
          ) : null}
          {clientsSummary.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-dim/30 px-6 py-12 text-center">
              <UserCircle className="mx-auto h-10 w-10 text-text-muted/40 mb-3" />
              <p className="text-sm font-semibold text-text-main">No CRM clients yet</p>
              <p className="text-xs text-text-muted mt-1 max-w-md mx-auto">
                The table is empty because no clients exist in MongoDB — not because the API failed.
                Add a client (with email) from Clients or Add Lead, then return here to see sync status.
              </p>
              <Link
                href="/crm/clients"
                className="inline-block mt-4 text-xs font-semibold text-primary hover:underline"
              >
                Go to Clients →
              </Link>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-dim/40 text-xs text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">2bigha ID</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-xs text-text-muted">
                      No clients match the current filters.
                    </td>
                  </tr>
                ) : (
                filteredClients.map((row) => (
                  <tr key={row._id} className="hover:bg-primary/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/crm/clients/${row._id}`} className="font-semibold text-primary hover:underline">
                        {row.name || row.email || "Client"}
                      </Link>
                      {row.email ? <p className="text-xs text-text-muted">{row.email}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.twobighaUserId || "—"}</td>
                    <td className="px-4 py-3">
                      <TwoBighaSyncStatusBadge status={row.twobighaSyncStatus} error={row.twobighaSyncError} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CrmButton
                        type="button"
                        variant="ghost"
                        disabled={syncingId === row._id}
                        onClick={() => void resyncClient(row._id)}
                      >
                        {syncingId === row._id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </CrmButton>
                    </td>
                  </tr>
                ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : null}

      {tab === "agents" && agentsSummary ? (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-main">CRM team sync status</h3>
              <p className="text-xs text-text-muted mt-1">
                Your CRM team members and whether each was pushed to 2bigha via <code className="text-[10px]">createAdmin</code>.
              </p>
            </div>
            <SummaryCards
              counts={agentsSummary.counts}
              activeKey={crmAgentSyncFilter === "all" ? undefined : crmAgentSyncFilter}
              onSelect={(key) => setCrmAgentSyncFilter(key as SyncFilter)}
            />
            <FilterBar onClear={clearCrmAgentFilters} showClear={crmAgentFiltersActive}>
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Search</span>
                <input
                  type="search"
                  value={crmAgentSearch}
                  onChange={(e) => setCrmAgentSearch(e.target.value)}
                  placeholder="Name or email…"
                  className="h-9 rounded-md border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <FilterSelect
                label="Sync status"
                value={crmAgentSyncFilter}
                onChange={(v) => setCrmAgentSyncFilter(v as SyncFilter)}
                options={SYNC_FILTER_OPTIONS}
              />
              <FilterSelect
                label="2bigha Admin ID"
                value={crmAgentIdFilter}
                onChange={(v) => setCrmAgentIdFilter(v as IdFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "with_id", label: "Has admin ID" },
                  { value: "without_id", label: "No admin ID" },
                ]}
              />
            </FilterBar>
            <FilterResultBar shown={filteredCrmAgents.length} total={agentsSummary.items.length} label="CRM agents" />
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-dim/40 text-xs text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Agent</th>
                    <th className="px-4 py-3 font-semibold">2bigha Admin ID</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredCrmAgents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-xs text-text-muted">
                        No CRM agents match the current filters.
                      </td>
                    </tr>
                  ) : (
                  filteredCrmAgents.map((row) => (
                    <tr key={row._id} className="hover:bg-primary/[0.02]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-main">
                          {[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email}
                        </p>
                        <p className="text-xs text-text-muted">{row.email}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.twobighaAdminId || "—"}</td>
                      <td className="px-4 py-3">
                        <TwoBighaSyncStatusBadge status={row.twobighaSyncStatus} error={row.twobighaSyncError} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CrmButton
                          type="button"
                          variant="ghost"
                          disabled={syncingId === row._id}
                          onClick={() => void resyncAgent(row._id)}
                        >
                          {syncingId === row._id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </CrmButton>
                    </td>
                  </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h3 className="text-sm font-semibold text-text-main">2bigha platform agents</h3>
              <p className="text-xs text-text-muted mt-1">
                Live list from 2bigha&apos;s <code className="text-[10px]">getAllAdmins</code> query.
              </p>
            </div>
            <FilterBar
              onClear={() => {
                setAdminSearch("");
                setRemoteActiveFilter("all");
                setRemoteDeptFilter("all");
              }}
              showClear={adminSearch.trim() !== "" || remoteFiltersActive}
            >
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Search</span>
                <input
                  type="search"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Email or name (2bigha API)…"
                  className="h-9 rounded-md border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <FilterSelect
                label="Platform status"
                value={remoteActiveFilter}
                onChange={(v) => setRemoteActiveFilter(v as ActiveFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
              <FilterSelect
                label="Department"
                value={remoteDeptFilter}
                onChange={setRemoteDeptFilter}
                options={[
                  { value: "all", label: "All departments" },
                  ...remoteDepartments.map((d) => ({ value: d, label: d })),
                ]}
              />
            </FilterBar>
            {remoteAdmins?.status === "fetched" || remoteAdmins?.status === "mock" ? (
              <FilterResultBar
                shown={filteredRemoteAdmins.length}
                total={remoteAdmins.admins.length}
                label="2bigha agents"
              />
            ) : null}

            {remoteLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
                <Loader2 size={18} className="animate-spin text-primary" />
                Loading 2bigha agents…
              </div>
            ) : remoteAdmins?.status === "failed" ? (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {remoteAdmins.error || "Failed to load 2bigha agent list"}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-surface-dim/95 text-xs text-text-muted backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Department</th>
                      <th className="px-4 py-3 font-semibold">Admin ID</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredRemoteAdmins.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-xs text-text-muted">
                          No 2bigha agents match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRemoteAdmins.map((admin) => (
                        <tr key={admin.id} className="hover:bg-primary/[0.02]">
                          <td className="px-4 py-3 font-medium">
                            {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">{admin.email}</td>
                          <td className="px-4 py-3 text-xs text-text-muted">{admin.department || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{admin.id}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                admin.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {admin.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {remoteAdmins?.status === "mock" ? (
              <p className="text-xs text-sky-700">Showing mock 2bigha agent data (credentials not configured).</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "reconcile" ? (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text-main">2bigha platform agents</h3>
              <p className="text-xs text-text-muted mt-1">
                Compare 2bigha&apos;s <code className="text-[10px]">getAllAdmins</code> list against CRM team members.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: "all" as const, label: "All", count: remoteReconcileRows.length, filterable: true },
                { key: "linked" as const, label: "Linked to CRM", count: remoteReconcileRows.filter((r) => r.crm).length, filterable: true },
                { key: "not_in_crm" as const, label: "Not in CRM", count: remoteReconcileRows.filter((r) => !r.crm).length, filterable: true },
                { key: "crm_only" as const, label: "CRM only", count: crmOnlyRows.length, filterable: false },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={!item.filterable}
                  onClick={() => item.filterable && item.key !== "crm_only" && setReconcileLinkFilter(item.key)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    !item.filterable
                      ? "cursor-default border-slate-200 bg-slate-50 text-slate-700"
                      : reconcileLinkFilter === item.key
                        ? "border-primary/30 bg-primary/5 text-primary ring-2 ring-primary/20"
                        : "border-border bg-card text-text-main hover:bg-surface-dim/40"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{item.label}</p>
                  <p className="text-xl font-bold mt-0.5">{item.count}</p>
                </button>
              ))}
            </div>
            <FilterBar onClear={clearRemoteFilters} showClear={reconcileFiltersActive}>
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Search</span>
                <input
                  type="search"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Email or name (2bigha API)…"
                  className="h-9 rounded-md border border-border bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <FilterSelect
                label="CRM link"
                value={reconcileLinkFilter}
                onChange={(v) => setReconcileLinkFilter(v as ReconcileLinkFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "linked", label: "Linked to CRM" },
                  { value: "not_in_crm", label: "Not in CRM" },
                ]}
              />
              <FilterSelect
                label="Platform status"
                value={remoteActiveFilter}
                onChange={(v) => setRemoteActiveFilter(v as ActiveFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
              <FilterSelect
                label="Department"
                value={remoteDeptFilter}
                onChange={setRemoteDeptFilter}
                options={[
                  { value: "all", label: "All departments" },
                  ...remoteDepartments.map((d) => ({ value: d, label: d })),
                ]}
              />
            </FilterBar>
            {remoteAdmins?.status === "fetched" || remoteAdmins?.status === "mock" ? (
              <FilterResultBar
                shown={filteredRemoteReconcileRows.length}
                total={remoteReconcileRows.length}
                label="2bigha agents"
              />
            ) : null}
            {remoteLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-muted">
                <Loader2 size={18} className="animate-spin text-primary" />
                Loading 2bigha agents…
              </div>
            ) : remoteAdmins?.status === "failed" ? (
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {remoteAdmins.error || "Failed to load 2bigha agent list"}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card max-h-[520px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-surface-dim/95 text-xs text-text-muted backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3 font-semibold">2bigha agent</th>
                      <th className="px-4 py-3 font-semibold">Department</th>
                      <th className="px-4 py-3 font-semibold">Admin ID</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">CRM link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredRemoteReconcileRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-xs text-text-muted">
                          No 2bigha agents match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredRemoteReconcileRows.map(({ remote, crm }) => (
                        <tr key={remote.id} className="hover:bg-primary/[0.02]">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-text-main">
                              {[remote.firstName, remote.lastName].filter(Boolean).join(" ") || "—"}
                            </p>
                            <p className="text-xs text-text-muted">{remote.email}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-text-muted">{remote.department || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs">{remote.id}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                remote.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {remote.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {crm ? (
                              <div className="text-xs">
                                <p className="font-semibold text-text-main">
                                  {[crm.firstName, crm.lastName].filter(Boolean).join(" ") || crm.email}
                                </p>
                                <TwoBighaSyncStatusBadge
                                  status={crm.twobighaSyncStatus}
                                  error={crm.twobighaSyncError}
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-amber-700 font-medium">Not in CRM</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {crmOnlyRows.length > 0 ? (
            <div className="space-y-4 border-t border-border pt-6">
              <div>
                <h3 className="text-sm font-semibold text-text-main">CRM agents not on 2bigha</h3>
                <p className="text-xs text-text-muted mt-1">
                  CRM team members with no matching admin on 2bigha (by ID or email).
                </p>
                <FilterResultBar shown={filteredCrmOnlyRows.length} total={crmOnlyRows.length} label="CRM-only agents" />
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-dim/40 text-xs text-text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">CRM agent</th>
                      <th className="px-4 py-3 font-semibold">CRM sync</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredCrmOnlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-xs text-text-muted">
                          No CRM-only agents match the current filters.
                        </td>
                      </tr>
                    ) : (
                    filteredCrmOnlyRows.map((crm) => (
                      <tr key={crm._id} className="hover:bg-primary/[0.02]">
                        <td className="px-4 py-3">
                          <p className="font-semibold">
                            {[crm.firstName, crm.lastName].filter(Boolean).join(" ") || crm.email}
                          </p>
                          <p className="text-xs text-text-muted">{crm.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <TwoBighaSyncStatusBadge status={crm.twobighaSyncStatus} error={crm.twobighaSyncError} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <CrmButton
                            type="button"
                            variant="ghost"
                            disabled={syncingId === crm._id}
                            onClick={() => void resyncAgent(crm._id)}
                          >
                            {syncingId === crm._id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </CrmButton>
                        </td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {remoteAdmins?.status === "mock" ? (
            <p className="text-xs text-sky-700">Showing mock 2bigha agent data (credentials not configured).</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
