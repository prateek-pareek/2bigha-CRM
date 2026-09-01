"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cloud, Loader2, RefreshCw, Users, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "@/components/crm/ui";
import { TwoBighaSyncStatusBadge } from "@/components/crm/platform/TwoBighaSyncStatusBadge";
import {
  fetchTwoBighaClientsSummary,
  resyncTwoBighaClient,
  type TwoBighaClientsSummary,
} from "@/lib/crm/twobigha-client-api";
import {
  fetchTwoBighaAdmins,
  fetchTwoBighaAgentsSummary,
  resyncTwoBighaAgent,
  type TwoBighaAgentFetchResult,
  type TwoBighaAgentsSummary,
} from "@/lib/crm/twobigha-agent-api";

type Tab = "clients" | "agents" | "reconcile";

function SummaryCards({ counts }: { counts: Record<string, number> }) {
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
        <div key={item.key} className={`rounded-lg border px-3 py-2.5 ${item.tone}`}>
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{item.label}</p>
          <p className="text-xl font-bold mt-0.5">{counts[item.key] ?? 0}</p>
        </div>
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
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");

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
    try {
      const data = await fetchTwoBighaAdmins({ limit: 100, search: adminSearch || undefined });
      setRemoteAdmins(data);
      if (data.status === "failed") {
        toast.error(data.error || "Failed to fetch 2bigha agents");
      }
    } catch {
      toast.error("Failed to fetch 2bigha agent list");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab !== "reconcile") return;
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
      if (tab === "reconcile") await loadRemoteAdmins();
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
        <CrmButton type="button" variant="secondary" onClick={() => void load()} className="h-8 text-xs gap-1.5">
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
          <SummaryCards counts={clientsSummary.counts} />
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
                {clientsSummary.items.map((row) => (
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
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : null}

      {tab === "agents" && agentsSummary ? (
        <div className="space-y-4">
          <SummaryCards counts={agentsSummary.counts} />
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
                {agentsSummary.items.map((row) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "reconcile" ? (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Compare CRM agents against 2bigha&apos;s live admin list (`getAllAdmins`). Matched by admin ID or email.
          </p>
          <input
            type="search"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="Filter 2bigha agents by email or name…"
            className="w-full max-w-md rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-dim/40 text-xs text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">CRM agent</th>
                  <th className="px-4 py-3 font-semibold">CRM sync</th>
                  <th className="px-4 py-3 font-semibold">2bigha match</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {reconcileRows.map(({ crm, remote }) => (
                  <tr key={crm._id} className="hover:bg-primary/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{[crm.firstName, crm.lastName].filter(Boolean).join(" ") || crm.email}</p>
                      <p className="text-xs text-text-muted">{crm.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TwoBighaSyncStatusBadge status={crm.twobighaSyncStatus} error={crm.twobighaSyncError} />
                    </td>
                    <td className="px-4 py-3">
                      {remote ? (
                        <div className="text-xs">
                          <p className="font-mono font-semibold">{remote.id}</p>
                          <p className="text-text-muted">{remote.department || "—"} · {remote.isActive ? "Active" : "Inactive"}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-700 font-medium">No match on 2bigha</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CrmButton
                        type="button"
                        variant="ghost"
                        disabled={syncingId === crm._id}
                        onClick={() => void resyncAgent(crm._id)}
                      >
                        {syncingId === crm._id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </CrmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remoteAdmins?.status === "mock" ? (
            <p className="text-xs text-sky-700">Showing mock 2bigha agent data (credentials not configured).</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
