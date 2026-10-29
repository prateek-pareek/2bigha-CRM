"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Loader2, ShieldCheck } from "lucide-react";
import api from "@/lib/crm/api";
import { CrmPageHeader } from "@/components/crm/ui";

type AccessLogEntry = {
  _id: string;
  actorLabel?: string;
  action: string;
  targetType: string;
  targetLabel?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  role_created: "Role created",
  role_updated: "Role updated",
  role_deleted: "Role deleted",
  user_created: "User added",
  user_updated: "User updated",
  user_deleted: "User removed",
  user_invited: "User invited",
  user_role_assigned: "Role assigned",
  permission_created: "Permission created",
  ownership_changed: "Ownership changed",
};

const PAGE_SIZE = 25;

function actionTone(action: string): string {
  if (action.endsWith("_created") || action.endsWith("_invited")) return "bg-emerald-50 text-emerald-600 border-emerald-100";
  if (action.endsWith("_deleted")) return "bg-rose-50 text-rose-600 border-rose-100";
  return "bg-blue-50 text-blue-600 border-blue-100";
}

function permissionNames(snapshot?: Record<string, unknown>): string[] {
  if (!snapshot) return [];
  const raw = (snapshot.crmPermissions ?? snapshot.permissions) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === "string" ? p : (p as { name?: string })?.name))
    .filter((p): p is string => !!p);
}

/** Field-level diff of the keys that changed, skipping noisy timestamps. */
function diffFields(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  const skip = new Set(["_id", "id", "createdAt", "updatedAt", "permissions", "crmPermissions"]);
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])).filter((k) => !skip.has(k));
  return keys
    .filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map((k) => ({ field: k, from: before?.[k], to: after?.[k] }));
}

function show(v: unknown): string {
  if (v == null || v === "") return "—";
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function AccessActivityLogPage() {
  const [items, setItems] = useState<AccessLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
      if (action) params.action = action;
      if (actor.trim()) params.actor = actor.trim();
      if (from) params.from = from;
      if (to) params.to = `${to}T23:59:59.999`;
      const { data } = await api.get("/crm-users/access-activity", { params });
      if (!data || !Array.isArray(data.items)) {
        throw new Error("Activity log endpoint not available — restart the API server.");
      }
      setItems(data.items);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setError(
        e?.response?.status === 403
          ? "You do not have access to this log."
          : e?.message || "Failed to load activity log.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, action, actor, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const input =
    "h-8 rounded-md border border-[var(--border-color)] bg-white px-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)]";

  return (
    <div className="space-y-5 p-5">
      <CrmPageHeader
        title="Users & roles activity log"
        description="Who created, changed or removed users, roles and permissions. Visible to Admin and CEO; other staff need access granted in the access control list."
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => { setPage(1); setAction(e.target.value); }}
          className={input}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={actor}
          onChange={(e) => { setPage(1); setActor(e.target.value); }}
          placeholder="Changed by (name / role)…"
          className={`${input} w-56`}
        />
        <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className={input} aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className={input} aria-label="To date" />
        <span className="ml-auto text-xs text-[var(--text-muted)]">{total} entries</span>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--surface-dim)] bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-rose-600">{error}</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--text-main)]">No activity yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--surface-dim)]">
            {items.map((e) => {
              const fields = diffFields(e.before, e.after);
              const prev = permissionNames(e.before);
              const next = permissionNames(e.after);
              const added = next.filter((p) => !prev.includes(p));
              const removed = prev.filter((p) => !next.includes(p));
              const open = expanded === e._id;
              const hasDetail = fields.length > 0 || added.length > 0 || removed.length > 0;
              return (
                <li key={e._id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-main)]">{e.actorLabel || "Unknown"}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${actionTone(e.action)}`}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">{e.targetLabel || e.targetType}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <Clock size={11} />
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {hasDetail && (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : e._id)}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--hs-link)] hover:underline"
                    >
                      {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {open ? "Hide" : "Show"} changes
                    </button>
                  )}
                  {open && (
                    <div className="mt-2 space-y-2 text-xs">
                      {(added.length > 0 || removed.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {added.map((p) => (
                            <span key={`a-${p}`} className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700">+ {p}</span>
                          ))}
                          {removed.map((p) => (
                            <span key={`r-${p}`} className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-rose-700">− {p}</span>
                          ))}
                        </div>
                      )}
                      {fields.length > 0 && (
                        <table className="w-full overflow-hidden rounded-md border border-[var(--surface-dim)]">
                          <thead>
                            <tr className="bg-[var(--background)] text-left text-[var(--text-muted)]">
                              <th className="px-3 py-1.5 font-semibold">Field</th>
                              <th className="px-3 py-1.5 font-semibold">Before</th>
                              <th className="px-3 py-1.5 font-semibold">After</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--surface-dim)]">
                            {fields.map((f) => (
                              <tr key={f.field}>
                                <td className="px-3 py-1.5 font-mono font-semibold">{f.field}</td>
                                <td className="break-all px-3 py-1.5 text-[var(--text-muted)]">{show(f.from)}</td>
                                <td className="break-all px-3 py-1.5">{show(f.to)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`${input} disabled:opacity-40`}>Prev</button>
          <span className="text-xs text-[var(--text-muted)]">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={`${input} disabled:opacity-40`}>Next</button>
        </div>
      )}
    </div>
  );
}
