"use client";

import { useState, useEffect, Suspense } from 'react';
import { Shield, Search, Clock, Activity, ChevronLeft, Trash2, Loader2, ChevronDown, ChevronUp, ExternalLink, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import ActivityStreamPanel from './ActivityStreamPanel';
import { cn } from '@/lib/utils';

interface AuditLogUser {
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface AuditLog {
  _id: string;
  user: AuditLogUser;
  action: string;
  module: string;
  description: string;
  createdAt: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
}

function recordHref(module: string | undefined, entityId: string | undefined): string | null {
  if (!entityId) return null;
  const m = (module || '').toLowerCase();
  if (m === 'leads' || m === 'lead') return `/crm/leads/${entityId}`;
  if (m === 'contacts' || m === 'contact') return `/crm/contacts/${entityId}`;
  if (m === 'clients' || m === 'client') return `/crm/clients/${entityId}`;
  if (m === 'organizations' || m === 'organization' || m === 'companies') {
    return `/crm/organizations/${entityId}`;
  }
  return null;
}

function formatChangeValue(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'string') return val.length > 120 ? `${val.slice(0, 119)}…` : val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    const s = JSON.stringify(val);
    return s.length > 120 ? `${s.slice(0, 119)}…` : s;
  } catch {
    return String(val);
  }
}

function flattenChanges(changes: Record<string, unknown> | undefined): Array<{ field: string; old?: unknown; new?: unknown; raw?: unknown }> {
  if (!changes || typeof changes !== 'object') return [];
  const rows: Array<{ field: string; old?: unknown; new?: unknown; raw?: unknown }> = [];
  const sensitive = new Set(['password', 'token', 'refreshToken', 'accessToken', 'secret', 'apiKey', 'otp']);

  for (const [key, val] of Object.entries(changes)) {
    if (sensitive.has(key)) {
      rows.push({ field: key, raw: '[redacted]' });
      continue;
    }
    if (val && typeof val === 'object' && 'old' in val && 'new' in val) {
      const v = val as { old?: unknown; new?: unknown };
      rows.push({ field: key, old: v.old, new: v.new });
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      rows.push({ field: key, raw: val });
    } else if (Array.isArray(val)) {
      rows.push({ field: key, raw: `[${val.length} items]` });
    }
  }
  return rows.slice(0, 20);
}

const getActionStyle = (action: string) => {
  switch (action?.toLowerCase()) {
    case "create": return { badge: "bg-emerald-50 text-emerald-600 border border-emerald-100", icon: "bg-emerald-50 text-emerald-500 border border-emerald-100" };
    case "update": return { badge: "bg-blue-50 text-blue-600 border border-blue-100", icon: "bg-blue-50 text-blue-500 border border-blue-100" };
    case "delete": return { badge: "bg-rose-50 text-rose-600 border border-rose-100", icon: "bg-rose-50 text-rose-500 border border-rose-100" };
    case "enroll":
    case "start": return { badge: "bg-indigo-50 text-indigo-600 border border-indigo-100", icon: "bg-indigo-50 text-indigo-500 border border-indigo-100" };
    case "cancel": return { badge: "bg-amber-50 text-amber-700 border border-amber-100", icon: "bg-amber-50 text-amber-600 border border-amber-100" };
    default: return { badge: "bg-[var(--background)] text-[var(--text-muted)] border border-[var(--surface-dim)]", icon: "bg-[var(--background)] text-[var(--primary-muted)] border border-[var(--surface-dim)]" };
  }
};

export default function AuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-[var(--primary-muted)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <AuditLogsPageInner />
    </Suspense>
  );
}

function AuditLogsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: "activity" | "audit" =
    tabParam === "activity" ? "activity" : "audit";

  const setTab = (tab: "activity" | "audit") => {
    const q = tab === "activity" ? "?tab=activity" : "";
    router.replace(`/crm/settings/audit-logs${q}`);
  };

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const { isAdmin } = usePermissions();

  const fetchLogs = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry?')) return;
    setIsDeleting(id);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/audit-logs/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Log entry deleted');
        setLogs(logs.filter(l => l._id !== id));
      } else {
        toast.error('Failed to delete log');
      }
    } catch (err) {
      toast.error('Error deleting log');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear ALL audit logs? This cannot be undone.')) return;
    setIsClearing(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/audit-logs`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('All logs cleared');
        setLogs([]);
      } else {
        toast.error('Failed to clear logs');
      }
    } catch (err) {
      toast.error('Error clearing logs');
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const moduleOptions = ['all', ...Array.from(new Set(logs.map((l) => l.module).filter(Boolean))).sort()];
  const actionOptions = ['all', ...Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).sort()];

  const filteredLogs = logs.filter((log) => {
    const changeText = log.changes ? JSON.stringify(log.changes).toLowerCase() : '';
    const matchesSearch =
      (log.description?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (log.module?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (log.action?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (log.entityId || '').toLowerCase().includes(search.toLowerCase()) ||
      (log.ipAddress || '').includes(search) ||
      changeText.includes(search.toLowerCase()) ||
      `${log.user?.firstName || ''} ${log.user?.lastName || ''}`.toLowerCase().includes(search.toLowerCase()) ||
      (log.user?.email || '').toLowerCase().includes(search.toLowerCase());

    const matchesModule =
      filterModule === 'all' ||
      log.module?.toLowerCase() === filterModule.toLowerCase();
    const matchesAction =
      filterAction === 'all' ||
      log.action?.toLowerCase() === filterAction.toLowerCase();

    return matchesSearch && matchesModule && matchesAction;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/crm/settings"
            className="p-1.5 hover:bg-[var(--background)] rounded-md transition-colors border border-transparent hover:border-[var(--surface-dim)]"
          >
            <ChevronLeft size={18} className="text-[var(--primary-muted)]" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#fff3f0] border border-[#ffd6cc] flex items-center justify-center">
              <Shield size={16} className="text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text-main)] leading-tight">Audit</h1>
              <p className="text-xs text-[var(--primary-muted)]">
                Sales activity stream and system audit trail.
              </p>
            </div>
          </div>
        </div>
        {activeTab === "audit" && isAdmin && logs.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={isClearing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-rose-50 text-rose-600 border border-rose-200 text-sm font-semibold hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            {isClearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {isClearing ? "Clearing…" : "Clear All Logs"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--surface-dim)] pb-0">
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors -mb-px",
            activeTab === "activity"
              ? "border-[var(--hs-link)] text-[var(--hs-link)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]",
          )}
        >
          <TrendingUp size={14} />
          Activity stream
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={cn(
            "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors -mb-px",
            activeTab === "audit"
              ? "border-[var(--hs-link)] text-[var(--hs-link)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]",
          )}
        >
          <Shield size={14} />
          Audit logs
        </button>
      </div>

      {activeTab === "activity" ? (
        <ActivityStreamPanel />
      ) : (
      <div className="bg-white border border-[var(--surface-dim)] rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--surface-dim)] bg-[var(--background)] flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--primary-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search user, module, changes, IP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-main)] placeholder:text-[var(--primary-muted)] outline-none focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-muted)] font-semibold hover:bg-[var(--background)] transition-colors">
                Module: {filterModule === 'all' ? 'All' : filterModule}
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuLabel>Filter by module</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={filterModule} onValueChange={setFilterModule}>
                {moduleOptions.map((m) => (
                  <DropdownMenuRadioItem key={m} value={m}>
                    {m === 'all' ? 'All modules' : m}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-[var(--border-color)] rounded-md text-sm text-[var(--text-muted)] font-semibold hover:bg-[var(--background)] transition-colors">
                Action: {filterAction === 'all' ? 'All' : filterAction}
                <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filter by action</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={filterAction} onValueChange={setFilterAction}>
                {actionOptions.map((a) => (
                  <DropdownMenuRadioItem key={a} value={a}>
                    {a === 'all' ? 'All actions' : a}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="text-xs text-[var(--primary-muted)] ml-auto">
            {filteredLogs.length} of {logs.length} entries
          </span>
        </div>

        <div className="divide-y divide-[var(--surface-dim)]">
          {loading ? (
            [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-5 py-4 animate-pulse flex items-center gap-4">
                <div className="w-8 h-8 bg-[var(--background)] rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--background)] rounded w-1/4" />
                  <div className="h-3 bg-[var(--background)] rounded w-1/2" />
                </div>
              </div>
            ))
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 bg-[var(--background)] border border-[var(--surface-dim)] rounded-md flex items-center justify-center mx-auto mb-3">
                <Activity size={22} className="text-[var(--primary-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-main)]">No logs found</p>
              <p className="text-sm text-[var(--primary-muted)] mt-1">No activity matching your filters was found.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const style = getActionStyle(log.action);
              const href = recordHref(log.module, log.entityId);
              const changeRows = flattenChanges(log.changes);
              const isExpanded = expandedId === log._id;
              const hasDetails = changeRows.length > 0 || !!log.entityId;

              return (
                <div
                  key={log._id}
                  className="px-5 py-4 hover:bg-[var(--background)] transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${style.icon}`}>
                      <Activity size={15} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-main)]">
                          {log.user?.firstName || log.user?.email?.split('@')[0] || 'Unknown'}{' '}
                          {log.user?.lastName || ''}
                        </span>
                        <span className="text-[var(--border-color)]">·</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${style.badge}`}>
                          {log.action}
                        </span>
                        <span className="text-[var(--border-color)]">·</span>
                        <span className="text-xs font-semibold text-[var(--primary-muted)] uppercase tracking-wide">
                          {log.module?.replace(/-/g, ' ')}
                        </span>
                      </div>

                      <p className="text-sm text-[var(--text-muted)] leading-relaxed">{log.description}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[var(--primary-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                        {log.ipAddress ? (
                          <span>IP {log.ipAddress}</span>
                        ) : null}
                        {log.entityId ? (
                          <span className="font-mono truncate max-w-[200px]" title={log.entityId}>
                            ID {log.entityId}
                          </span>
                        ) : null}
                        {href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-0.5 text-[var(--hs-link)] font-semibold hover:underline"
                          >
                            View record
                            <ExternalLink size={11} />
                          </Link>
                        ) : null}
                      </div>

                      {hasDetails ? (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : log._id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--hs-link)] hover:underline"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? 'Hide' : 'Show'} field changes
                          {changeRows.length > 0 ? ` (${changeRows.length})` : ''}
                        </button>
                      ) : null}

                      {isExpanded && changeRows.length > 0 ? (
                        <div className="mt-3 rounded-md border border-[var(--surface-dim)] overflow-hidden text-xs">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-[var(--background)] text-left text-[var(--primary-muted)]">
                                <th className="px-3 py-2 font-semibold w-[28%]">Field</th>
                                <th className="px-3 py-2 font-semibold w-[36%]">Before</th>
                                <th className="px-3 py-2 font-semibold w-[36%]">After</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--surface-dim)]">
                              {changeRows.map((row) => (
                                <tr key={row.field} className="bg-white">
                                  <td className="px-3 py-2 font-mono font-semibold text-[var(--text-main)]">{row.field}</td>
                                  {row.old !== undefined || row.new !== undefined ? (
                                    <>
                                      <td className="px-3 py-2 text-[var(--text-muted)] break-all">{formatChangeValue(row.old)}</td>
                                      <td className="px-3 py-2 text-[var(--text-main)] break-all">{formatChangeValue(row.new)}</td>
                                    </>
                                  ) : (
                                    <td colSpan={2} className="px-3 py-2 text-[var(--text-muted)] break-all">
                                      {formatChangeValue(row.raw)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : isExpanded && !changeRows.length ? (
                        <p className="mt-2 text-xs text-[var(--primary-muted)]">No field-level changes captured for this entry.</p>
                      ) : null}
                    </div>

                    {isAdmin ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteLog(log._id); }}
                        disabled={isDeleting === log._id}
                        className="p-1.5 text-[var(--primary-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100 shrink-0"
                        title="Delete log"
                      >
                        {isDeleting === log._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}
    </div>
  );
}
