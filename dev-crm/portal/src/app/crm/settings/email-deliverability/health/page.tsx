"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Mail,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  BarChart2,
  MousePointerClick,
  Send,
  Search,
  X,
} from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from "sonner";

type HealthResponse = {
  summary: {
    totalAccounts: number;
    healthyAccounts: number;
    warningAccounts: number;
    actionRequiredAccounts: number;
    enforceSendLimits: boolean;
    totalSent24h: number;
  };
  domains: Array<{
    domain: string;
    spf: "verified" | "pending";
    dmarc: "verified" | "pending";
    dkim: "verified" | "pending";
  }>;
  accounts: Array<{
    accountId: string;
    email: string;
    displayName: string;
    provider: string;
    domain: string;
    auth: {
      spf: "verified" | "pending";
      dmarc: "verified" | "pending";
      dkim: "verified" | "pending";
    };
    metrics: {
      sent24h: number;
      opened24h: number;
      clicks24h: number;
      openRatePct: number;
      dayUtilizationPct: number;
    };
    limits: { perHour: number; perDay: number; overrideEnabled: boolean };
    realtimeMode: "imap_idle" | "graph_push" | "gmail_push" | "polling";
    healthStatus: "healthy" | "warning" | "action_required";
    factorsAffectingDeliverability: string[];
    lastSyncedAt: string | null;
    syncDiagnostics: {
      consecutiveFailures: number;
      lastError: string | null;
      lastErrorAt: string | null;
      lastSyncAttemptAt: string | null;
      lastSyncSuccessAt: string | null;
      lastSyncResultCount: number;
      pushLastError: string | null;
      pushLastErrorAt: string | null;
    };
  }>;
  checkedAt: string;
};

function token() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : "";
}

function authBadge(status: "verified" | "pending") {
  if (status === "verified")
    return { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle2 size={10} /> };
  return { cls: "bg-[#fff8f0] text-[#c87941] border border-[#f5d8bb]", icon: <Clock size={10} /> };
}

function healthCfg(status: "healthy" | "warning" | "action_required") {
  if (status === "healthy")
    return { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <ShieldCheck size={12} />, label: "Healthy" };
  if (status === "warning")
    return { cls: "bg-amber-50 text-amber-700 border border-amber-200", icon: <AlertTriangle size={12} />, label: "Warning" };
  return { cls: "bg-rose-50 text-rose-700 border border-rose-200", icon: <ShieldAlert size={12} />, label: "Action Required" };
}

function realtimeModeLabel(mode: "imap_idle" | "graph_push" | "gmail_push" | "polling") {
  if (mode === "graph_push") return "Microsoft Graph Push";
  if (mode === "gmail_push") return "Gmail Push";
  if (mode === "imap_idle") return "IMAP IDLE";
  return "Polling (fallback)";
}

function StatCard({
  label,
  value,
  colorCls,
  borderCls,
  bgCls,
}: {
  label: string;
  value: number;
  colorCls: string;
  borderCls: string;
  bgCls: string;
}) {
  return (
    <div className={`rounded-md border ${borderCls} ${bgCls} px-4 py-3.5`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${colorCls} mb-1`}>{label}</p>
      <p className={`text-[28px] font-black leading-none ${colorCls}`}>{value}</p>
    </div>
  );
}

export default function DeliverabilityHealthPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/email-deliverability/health`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      toast.error("Failed to load deliverability health");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const query = search.trim().toLowerCase();

  const filteredDomains = useMemo(() => {
    if (!data) return [];
    if (!query) return data.domains;
    return data.domains.filter((d) => {
      const haystack = [
        d.domain,
        `spf ${d.spf}`,
        `dkim ${d.dkim}`,
        `dmarc ${d.dmarc}`,
        d.spf,
        d.dkim,
        d.dmarc,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, query]);

  const filteredAccounts = useMemo(() => {
    if (!data) return [];
    if (!query) return data.accounts;
    return data.accounts.filter((a) => {
      const haystack = [
        a.email,
        a.displayName,
        a.provider,
        a.domain,
        a.healthStatus,
        healthCfg(a.healthStatus).label,
        realtimeModeLabel(a.realtimeMode),
        a.realtimeMode,
        `spf ${a.auth.spf}`,
        `dkim ${a.auth.dkim}`,
        `dmarc ${a.auth.dmarc}`,
        a.auth.spf,
        a.auth.dkim,
        a.auth.dmarc,
        ...a.factorsAffectingDeliverability,
        a.syncDiagnostics.lastError || "",
        a.syncDiagnostics.pushLastError || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, query]);

  return (
    <div className="space-y-5 pb-8">
      {/* Page header */}
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <ShieldCheck className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">Deliverability Health</h1>
              <p className="text-xs text-[var(--primary-muted)]">SPF · DKIM · DMARC and all factors affecting email deliverability</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/crm/settings/email-deliverability/checklist"
              className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)]"
            >
              <ListChecks size={13} />
              Full deliverability checklist
            </Link>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--background)] hover:border-[var(--primary-muted)] disabled:opacity-50 transition-all"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-16 text-sm text-[var(--primary-muted)]">
              <Loader2 size={16} className="animate-spin text-[var(--hs-link)]" />
              Checking health…
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center py-16 text-sm text-[var(--primary-muted)]">
              No data available.
            </div>
          ) : (
            <>
              {/* Summary stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label="Total Accounts" value={data.summary.totalAccounts} colorCls="text-[var(--text-muted)]" borderCls="border-[var(--border-color)]" bgCls="bg-white" />
                <StatCard label="Healthy" value={data.summary.healthyAccounts} colorCls="text-emerald-700" borderCls="border-emerald-200" bgCls="bg-emerald-50" />
                <StatCard label="Warnings" value={data.summary.warningAccounts} colorCls="text-amber-700" borderCls="border-amber-200" bgCls="bg-amber-50" />
                <StatCard label="Action Required" value={data.summary.actionRequiredAccounts} colorCls="text-rose-700" borderCls="border-rose-200" bgCls="bg-rose-50" />
                <StatCard label="Sent (24 h)" value={data.summary.totalSent24h} colorCls="text-[var(--text-muted)]" borderCls="border-[var(--border-color)]" bgCls="bg-white" />
              </div>

              {/* Search */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search domains, mailboxes, SPF, DKIM, DMARC, factors…"
                    className="w-full h-9 pl-8 pr-8 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] hover:text-[var(--text-main)] transition-colors"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                {query ? (
                  <p className="text-xs text-[var(--primary-muted)]">
                    {filteredDomains.length} domain{filteredDomains.length === 1 ? "" : "s"} · {filteredAccounts.length} mailbox
                    {filteredAccounts.length === 1 ? "" : "es"}
                  </p>
                ) : null}
              </div>

              {/* Domain Authentication */}
              <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Domain Authentication</p>
                </div>
                <div className="divide-y divide-[var(--surface-dim)]">
                  {filteredDomains.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-[var(--primary-muted)]">
                      {query ? "No domains match your search." : "No domains found."}
                    </p>
                  ) : (
                    filteredDomains.map((d) => {
                      const spf = authBadge(d.spf);
                      const dkim = authBadge(d.dkim);
                      const dmarc = authBadge(d.dmarc);
                      return (
                        <div key={d.domain} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                          <p className="text-sm font-semibold text-[var(--text-main)]">{d.domain}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {[
                              { label: "SPF", cfg: spf, val: d.spf },
                              { label: "DKIM", cfg: dkim, val: d.dkim },
                              { label: "DMARC", cfg: dmarc, val: d.dmarc },
                            ].map(({ label, cfg, val }) => (
                              <span key={label} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${cfg.cls}`}>
                                {cfg.icon}
                                {label}: {val}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="px-5 py-2.5 border-t border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                  <p className="text-xs text-[var(--primary-muted)]">
                    DKIM check uses common selector heuristics. If your selector is custom, status may stay pending until mapped.
                  </p>
                </div>
              </div>

              {/* Mailbox Health */}
              <div className="rounded-md border border-[var(--surface-dim)] bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">Mailbox Health</p>
                </div>
                <div className="divide-y divide-[var(--surface-dim)]">
                  {filteredAccounts.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-[var(--primary-muted)]">
                      {query ? "No mailboxes match your search." : "No accounts found."}
                    </p>
                  ) : (
                    filteredAccounts.map((a) => {
                      const hcfg = healthCfg(a.healthStatus);
                      const utilBar = Math.min(a.metrics.dayUtilizationPct, 100);
                      const utilColor =
                        utilBar >= 90 ? "bg-rose-500" : utilBar >= 70 ? "bg-amber-400" : "bg-emerald-500";
                      return (
                        <div key={a.accountId} className="px-5 py-4 space-y-3">
                          {/* Row 1: identity + health badge */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-dim)] text-xs font-bold text-[var(--text-muted)]">
                                {(a.displayName?.[0] || a.email[0]).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-[var(--text-main)]">{a.displayName}</p>
                                <p className="text-xs text-[var(--primary-muted)]">{a.email} · {a.provider}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${hcfg.cls}`}>
                                {hcfg.icon}
                                {hcfg.label}
                              </span>
                              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-[var(--background)] text-[var(--text-muted)] border border-[var(--surface-dim)]">
                                <Zap size={10} />
                                {realtimeModeLabel(a.realtimeMode)}
                              </span>
                            </div>
                          </div>

                          {/* Row 2: metric chips */}
                          <div className="flex flex-wrap gap-2">
                            {[
                              { icon: <Send size={10} />, label: "Sent 24h", value: a.metrics.sent24h },
                              { icon: <BarChart2 size={10} />, label: "Open rate", value: `${a.metrics.openRatePct}%` },
                              { icon: <MousePointerClick size={10} />, label: "Clicks", value: a.metrics.clicks24h },
                              { icon: <Mail size={10} />, label: "Limits", value: `${a.limits.perHour}/h · ${a.limits.perDay}/d` },
                            ].map(({ icon, label, value }) => (
                              <div key={label} className="flex items-center gap-1.5 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-2.5 py-1.5">
                                <span className="text-[var(--primary-muted)]">{icon}</span>
                                <span className="text-xs text-[var(--text-muted)]">{label}:</span>
                                <span className="text-xs font-semibold text-[var(--text-main)]">{value}</span>
                              </div>
                            ))}
                          </div>

                          {/* Row 3: utilisation bar */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[var(--primary-muted)]">Daily capacity used</p>
                              <p className="text-xs font-semibold text-[var(--text-main)]">{a.metrics.dayUtilizationPct}%</p>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[var(--surface-dim)] overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${utilColor}`} style={{ width: `${utilBar}%` }} />
                            </div>
                          </div>

                          {/* Row 4: auth chips */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {[
                              { label: "SPF", val: a.auth.spf },
                              { label: "DKIM", val: a.auth.dkim },
                              { label: "DMARC", val: a.auth.dmarc },
                            ].map(({ label, val }) => {
                              const cfg = authBadge(val);
                              return (
                                <span key={label} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                                  {cfg.icon}
                                  {label}: {val}
                                </span>
                              );
                            })}
                          </div>

                          {/* Row 5: sync diagnostics (debug logs) */}
                          {(a.syncDiagnostics.lastError ||
                            a.syncDiagnostics.pushLastError ||
                            a.syncDiagnostics.consecutiveFailures > 0) && (
                            <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5 space-y-1.5">
                              <p className="text-[10px] font-semibold text-amber-800">
                                Sync &amp; connection log
                              </p>
                              {a.syncDiagnostics.lastError ? (
                                <p className="text-xs text-amber-900 leading-snug font-mono break-words">
                                  <span className="font-sans font-semibold">Last sync error: </span>
                                  {a.syncDiagnostics.lastError}
                                  {a.syncDiagnostics.lastErrorAt
                                    ? ` (${new Date(a.syncDiagnostics.lastErrorAt).toLocaleString()})`
                                    : ""}
                                </p>
                              ) : null}
                              {a.syncDiagnostics.pushLastError ? (
                                <p className="text-xs text-amber-900 leading-snug font-mono break-words">
                                  <span className="font-sans font-semibold">Push/webhook: </span>
                                  {a.syncDiagnostics.pushLastError}
                                </p>
                              ) : null}
                              <p className="text-[11px] text-amber-800/90">
                                Failures: {a.syncDiagnostics.consecutiveFailures}
                                {a.syncDiagnostics.lastSyncSuccessAt
                                  ? ` · Last OK: ${new Date(a.syncDiagnostics.lastSyncSuccessAt).toLocaleString()} (${a.syncDiagnostics.lastSyncResultCount} msgs)`
                                  : ""}
                              </p>
                            </div>
                          )}

                          {/* Row 6: factors */}
                          {a.factorsAffectingDeliverability.length > 0 && (
                            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5">
                              <XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                              <p className="text-xs text-rose-700 leading-snug">
                                {a.factorsAffectingDeliverability.join(" · ")}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-5 py-2.5 border-t border-[var(--surface-dim)] bg-[var(--surface-dim)]">
                  <Clock size={11} className="text-[var(--primary-muted)]" />
                  <p className="text-xs text-[var(--primary-muted)]">Last checked: {new Date(data.checkedAt).toLocaleString()}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
