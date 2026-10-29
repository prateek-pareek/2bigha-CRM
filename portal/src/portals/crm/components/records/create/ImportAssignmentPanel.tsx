"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import type { CrmAssignableUser } from "../detail/CrmTeammatePicker";

export type ImportAssignMode = "self" | "single" | "round_robin" | "file";

export type ImportAssignmentValue = {
  mode: ImportAssignMode;
  assignees: CrmAssignableUser[];
  reassignExisting: boolean;
  fallbackToSelf: boolean;
};

export const DEFAULT_IMPORT_ASSIGNMENT: ImportAssignmentValue = {
  mode: "self",
  assignees: [],
  reassignExisting: false,
  fallbackToSelf: false,
};

/** Body of the multipart `assignment` field the import endpoints expect. */
export function importAssignmentPayload(v: ImportAssignmentValue): string {
  return JSON.stringify({
    mode: v.mode,
    assignees: v.assignees.map((a) => a._id),
    reassignExisting: v.reassignExisting,
    fallbackToSelf: v.fallbackToSelf,
  });
}

/** Client-side mirror of the server rules, so the Import button can be disabled with a reason. */
export function importAssignmentProblem(v: ImportAssignmentValue): string | null {
  if (v.mode === "single" && v.assignees.length !== 1) return "Pick the person who should get these leads.";
  if (v.mode === "round_robin" && v.assignees.length < 2) return "Pick at least two people to share the leads between.";
  return null;
}

type AssignableTier = "all" | "team" | "own" | null;
type AssignablePage = { items: AssignableRow[]; total: number; tier: AssignableTier };
/** Super Admin rows also carry the CRM role name (Team Lead, Calling Agent, …). */
type AssignableRow = CrmAssignableUser & { roleName?: string };

type Props = {
  value: ImportAssignmentValue;
  onChange: (v: ImportAssignmentValue) => void;
  /** True when a file column is mapped to "Lead Owner" (leads only). */
  ownerColumnMapped: boolean;
  /**
   * `clients` imports can only be handed to other people by an admin, and have no owner
   * column — for anyone else the panel renders nothing and reports its tier via `onTierChange`.
   */
  entity?: "leads" | "clients";
  onTierChange?: (tier: AssignableTier) => void;
};

const MODES: { id: ImportAssignMode; label: string; hint: string }[] = [
  { id: "self", label: "Assign to me", hint: "You own every imported record." },
  { id: "single", label: "One person", hint: "Everything goes to the person you pick." },
  { id: "round_robin", label: "Distribute evenly", hint: "Records rotate equally between the people you pick." },
  { id: "file", label: "Use owner column", hint: "Each row's Lead Owner from the file (checked against your access)." },
];

/**
 * Who owns the imported records. The picker only lists people the server would accept for this
 * user (a Team Lead / Manager sees only their own team; an admin sees everyone) — the server
 * re-checks every name.
 */
export default function ImportAssignmentPanel({
  value,
  onChange,
  ownerColumnMapped,
  entity = "leads",
  onTierChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [data, setData] = useState<AssignablePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // The server clamps this to 50 for Team Leads and to 200 for admins.
    const params = new URLSearchParams({ page: "1", limit: "200" });
    if (query) params.set("search", query);
    void fetch(`${CRM_API_URL}/crm/leads/assignable-users?${params}`, {
      headers: { Authorization: `Bearer ${getCrmAuthToken() || ""}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || "Could not load teammates");
        return body as AssignablePage;
      })
      .then((body) => !cancelled && setData(body))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load teammates"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const tier = data?.tier ?? null;
  useEffect(() => {
    if (!loading) onTierChange?.(error ? null : tier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tier, error]);

  // No `leads:assign` grant → importing for yourself is the only option.
  const canAssign = tier !== null || loading;
  const multi = value.mode === "round_robin";
  const needsPeople = value.mode === "single" || value.mode === "round_robin";
  const selectedIds = new Set(value.assignees.map((a) => a._id));
  const isAdminPicker = tier === "all";

  const roleNames = useMemo(
    () => Array.from(new Set((data?.items ?? []).map((u) => u.roleName).filter((r): r is string => !!r))).sort(),
    [data],
  );
  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((u) => !roleFilter || u.roleName === roleFilter),
    [data, roleFilter],
  );
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((u) => selectedIds.has(u._id));

  const selectAllVisible = () => {
    const merged = [...value.assignees];
    for (const u of visibleItems) if (!selectedIds.has(u._id)) merged.push(u);
    onChange({ ...value, assignees: merged });
  };
  const clearVisible = () => {
    const hide = new Set(visibleItems.map((u) => u._id));
    onChange({ ...value, assignees: value.assignees.filter((a) => !hide.has(a._id)) });
  };

  const toggle = (u: CrmAssignableUser) => {
    if (!multi) return onChange({ ...value, assignees: [u] });
    const next = selectedIds.has(u._id) ? value.assignees.filter((a) => a._id !== u._id) : [...value.assignees, u];
    onChange({ ...value, assignees: next });
  };

  const setMode = (mode: ImportAssignMode) =>
    onChange({
      ...value,
      mode,
      // Switching between single and many keeps at most one person for "One person".
      assignees: mode === "single" ? value.assignees.slice(0, 1) : mode === "round_robin" ? value.assignees : [],
    });

  // Clients: only admins can hand imports to others, and there is no owner column to read.
  if (entity === "clients" && !loading && !isAdminPicker) return null;
  const modes = entity === "clients" ? MODES.filter((m) => m.id !== "file") : MODES;
  const noun = entity === "clients" ? "client" : "lead";

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {entity === "clients" ? "Client assignment" : "Lead assignment"}
        </span>
        {tier && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <ShieldCheck size={12} />
            {tier === "team" ? "You can assign to your team members only" : tier === "own" ? "You can assign within your workspace" : "You can assign to anyone"}
          </span>
        )}
      </div>

      <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", modes.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {modes.map((m) => {
          const disabled = (m.id !== "self" && !canAssign) || (m.id === "file" && !ownerColumnMapped);
          const selected = value.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-xl border p-2.5 text-left transition-all",
                selected ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30" : "border-slate-200 hover:border-slate-300",
                disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span className={cn("block text-xs font-bold", selected ? "text-primary" : "text-slate-700")}>{m.label}</span>
              <span className="block text-[11px] leading-tight text-slate-400">
                {m.id === "file" && !ownerColumnMapped ? "Map a column to Lead Owner first." : m.hint}
              </span>
            </button>
          );
        })}
      </div>

      {!loading && tier === null && !error && (
        <p className="text-[11px] font-medium text-amber-700">
          Your role can't assign {noun}s to others — imported {noun}s will be yours. Ask your Team Lead / Manager to reassign.
        </p>
      )}
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}

      {needsPeople && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {isAdminPicker && (roleNames.length > 0 || multi) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {roleNames.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setRoleFilter("")}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      !roleFilter ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300",
                    )}
                  >
                    Everyone
                  </button>
                  {roleNames.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(roleFilter === r ? "" : r)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        roleFilter === r ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-500 hover:border-slate-300",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </>
              )}
              {multi && visibleItems.length > 0 && (
                <button
                  type="button"
                  onClick={allVisibleSelected ? clearVisible : selectAllVisible}
                  className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/5"
                >
                  {allVisibleSelected ? `Clear ${roleFilter || "shown"}` : `Select all ${roleFilter || "shown"} (${visibleItems.length})`}
                </button>
              )}
            </div>
          )}
          <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {loading ? (
              <div className="flex items-center justify-center p-4 text-slate-400">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : visibleItems.length === 0 ? (
              <p className="p-3 text-[11px] text-slate-500">
                {query ? `No one matches "${query}".` : tier === "team" ? "No one reports to you yet — ask an admin to set your team." : "No teammates available."}
              </p>
            ) : (
              visibleItems.map((u) => (
                <label key={u._id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50">
                  <input
                    type={multi ? "checkbox" : "radio"}
                    checked={selectedIds.has(u._id)}
                    onChange={() => toggle(u)}
                    className="accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{u.label}</span>
                  {u.roleName && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {u.roleName}
                    </span>
                  )}
                  {u.email && <span className="truncate text-[11px] text-slate-400">{u.email}</span>}
                </label>
              ))
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {multi ? `${value.assignees.length} selected` : value.assignees[0]?.label ?? "No one selected"}
            {data && data.total > data.items.length ? ` · showing ${data.items.length} of ${data.total} — search to narrow` : ""}
          </p>
        </div>
      )}

      {value.mode === "file" && (
        <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
          <input
            type="checkbox"
            checked={value.fallbackToSelf}
            onChange={(e) => onChange({ ...value, fallbackToSelf: e.target.checked })}
            className="accent-primary"
          />
          Rows with a blank or not-allowed owner become mine (otherwise those rows are rejected)
        </label>
      )}

      <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
        <input
          type="checkbox"
          checked={value.reassignExisting}
          onChange={(e) => onChange({ ...value, reassignExisting: e.target.checked })}
          className="accent-primary"
        />
        Also move duplicates that get merged / replaced to this owner (otherwise they keep their current owner)
      </label>
    </div>
  );
}
