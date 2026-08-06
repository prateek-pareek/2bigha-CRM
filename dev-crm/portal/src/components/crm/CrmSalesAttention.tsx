"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Mail, UserX, Clock, ChevronRight, CalendarPlus } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import {
  crmCacheKeys,
  crmCachePeek,
  crmCacheSet,
  crmCacheShouldRevalidate,
} from "@/lib/crm/prefetch-cache";
import { cn } from "@/lib/utils";

export type SalesAttentionPayload = {
  neverContactedLeads: Array<{
    id: string;
    name: string;
    email: string;
    organization?: string;
    leadOwner?: string;
  }>;
  /** Minimum calendar days since window start; copy aligns with header time window. */
  staleFollowUpThresholdDays?: number;
  staleFollowUpDescription?: string;
  staleLeads: Array<{
    id: string;
    name: string;
    email: string;
    organization?: string;
    leadOwner?: string;
    lastTouchAt: string;
    accessSummary?: string;
  }>;
  unopenedTrackedEmails: Array<{
    id: string;
    recipient: string;
    subject?: string;
    createdAt: string;
    module?: string;
    entityId?: string;
  }>;
  replyReceivedEmails: Array<{
    id: string;
    fromEmail: string;
    subject?: string;
    createdAt: string;
    module?: string;
    entityId?: string;
    /** Record owner, mailbox, sync user, client assignees — from API. */
    accessSummary?: string;
  }>;
  repliesAwaitingResponse: Array<{
    id: string;
    fromEmail: string;
    subject?: string;
    createdAt: string;
    module?: string;
    entityId?: string;
    accessSummary?: string;
  }>;
  openedTrackedEmails: Array<{
    id: string;
    recipient: string;
    subject?: string;
    createdAt: string;
    lastOpenedAt?: string;
    openCount: number;
    module?: string;
    entityId?: string;
  }>;
  /** Calendar / meeting invite emails synced from CRM inbox. */
  meetingInvites?: Array<{
    id: string;
    fromEmail: string;
    fromName?: string;
    subject?: string;
    inviteSummary?: string;
    inviteMethod?: string;
    createdAt: string;
    isRead: boolean;
    folder?: string;
  }>;
  note: string;
};

type Props = {
  owner: string;
  /** When set (e.g. from `/crm/workspace`), skips duplicate fetch to `/reports/attention`. */
  prefetchedAttention?: SalesAttentionPayload | null;
  /** `hubspot` = white Calypso cards, 3px radius (Sales workspace). */
  variant?: "default" | "hubspot";
  /** `true` = show one queue at a time with tabs (cleaner). */
  focusMode?: boolean;
};

function recordHref(module: string | undefined, entityId: string | undefined): string | null {
  if (!entityId) return null;
  const m = (module || "").toLowerCase();
  if (m === "leads") return `/crm/leads/${entityId}`;
  if (m === "deals") return `/crm/deals/${entityId}`;
  if (m === "contacts") return `/crm/contacts/${entityId}`;
  if (m === "clients") return `/crm/clients/${entityId}`;
  if (m === "organizations") return `/crm/organizations/${entityId}`;
  return null;
}

/** Drop duplicate awaiting-reply cards (same client mail synced twice) for display only. */
function dedupeAwaitingReplyRows<
  T extends {
    id: string;
    fromEmail?: string;
    subject?: string;
    entityId?: string;
    createdAt?: string;
  },
>(rows: T[]): T[] {
  const seenIds = new Set<string>();
  const seenLogical = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (id && seenIds.has(id)) continue;
    const logical = [
      String(row.fromEmail || "").trim().toLowerCase(),
      String(row.subject || "").trim().toLowerCase(),
      String(row.entityId || "").trim(),
      String(row.createdAt || "").trim(),
    ].join("\0");
    if (seenLogical.has(logical)) continue;
    if (id) seenIds.add(id);
    seenLogical.add(logical);
    out.push(row);
  }
  return out;
}

export default function CrmSalesAttention({
  owner,
  prefetchedAttention,
  variant = "default",
  focusMode = false,
}: Props) {
  const hs = variant === "hubspot";
  const [data, setData] = useState<SalesAttentionPayload | null>(
    prefetchedAttention ?? null,
  );
  const [loading, setLoading] = useState(prefetchedAttention == null);

  useEffect(() => {
    if (prefetchedAttention != null) {
      setData(prefetchedAttention);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ownerKey = owner && owner !== "All" ? owner : "All";
    const cacheKey = crmCacheKeys.attention(ownerKey);
    const cached = crmCachePeek<SalesAttentionPayload>(cacheKey);
    if (cached?.data) {
      setData(cached.data);
      setLoading(false);
      if (!crmCacheShouldRevalidate(cached.ageMs)) {
        return () => {
          cancelled = true;
        };
      }
    }

    const load = async () => {
      if (!cached?.data) setLoading(true);
      const token = getCrmAuthToken();
      try {
        const q = new URLSearchParams();
        if (owner && owner !== "All") q.set("owner", owner);
        const res = await fetch(`${CRM_API_URL}/crm/reports/attention?${q}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          console.warn("CRM attention report failed:", res.status, res.statusText);
          throw new Error(String(res.status));
        }
        const json = await res.json();
        if (
          !json ||
          typeof json !== "object" ||
          !Array.isArray((json as SalesAttentionPayload).neverContactedLeads) ||
          !Array.isArray((json as SalesAttentionPayload).staleLeads) ||
          !Array.isArray((json as SalesAttentionPayload).unopenedTrackedEmails) ||
          !Array.isArray((json as SalesAttentionPayload).replyReceivedEmails) ||
          !Array.isArray((json as SalesAttentionPayload).repliesAwaitingResponse) ||
          !Array.isArray((json as SalesAttentionPayload).openedTrackedEmails)
        ) {
          console.warn("CRM attention report: unexpected response shape");
          throw new Error("invalid_payload");
        }
        if (!cancelled) {
          const payload = json as SalesAttentionPayload;
          setData(payload);
          crmCacheSet(cacheKey, payload);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [owner, prefetchedAttention]);

  const awaitingReplies = useMemo(
    () => dedupeAwaitingReplyRows(data?.repliesAwaitingResponse ?? []),
    [data?.repliesAwaitingResponse],
  );

  const total =
    (data?.neverContactedLeads?.length ?? 0) +
    (data?.staleLeads?.length ?? 0) +
    (data?.unopenedTrackedEmails?.length ?? 0) +
    (data?.replyReceivedEmails?.length ?? 0) +
    awaitingReplies.length +
    (data?.openedTrackedEmails?.length ?? 0) +
    (data?.meetingInvites?.length ?? 0);

  const queueColumns = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: "invites",
        title: "Client meeting invites",
        subtitle: "Calendar invitations received in your connected inbox",
        icon: <CalendarPlus size={16} />,
        empty: "No meeting invitations in this window. Sync inbox to detect .ics / calendar invites.",
        rows: (data.meetingInvites ?? []).map((e) => ({
          key: e.id,
          primary: e.fromName || e.fromEmail || "(unknown sender)",
          secondary: e.inviteSummary || e.subject || "(no subject)",
          meta: [
            e.inviteMethod ? e.inviteMethod : null,
            e.createdAt ? `Received ${new Date(e.createdAt).toLocaleString()}` : null,
            e.isRead ? "Read" : "Unread",
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/crm/inbox?highlight=${encodeURIComponent(e.id)}`,
        })),
      },
      {
        key: "never",
        title: "No logged outreach",
        subtitle: "Open leads with no non-system activity",
        icon: <UserX size={16} />,
        empty: "All open leads have at least one touch logged.",
        rows: data.neverContactedLeads.map((l) => ({
          key: l.id,
          primary: l.name,
          secondary: l.organization || l.email || "—",
          meta: l.leadOwner ? `Owner: ${l.leadOwner}` : undefined,
          href: `/crm/leads/${l.id}`,
        })),
      },
      {
        key: "stale",
        title: "Stale follow-up",
        subtitle:
          data.staleFollowUpThresholdDays != null
            ? `Last touch before your selected time window (~${data.staleFollowUpThresholdDays} day${data.staleFollowUpThresholdDays === 1 ? "" : "s"})`
            : "Last touch over 7 days ago",
        icon: <Clock size={16} />,
        empty: "No stale open leads in this view.",
        rows: data.staleLeads.map((l) => ({
          key: l.id,
          primary: l.name,
          secondary: l.organization || l.email || "—",
          meta: l.lastTouchAt
            ? `Last touch: ${new Date(l.lastTouchAt).toLocaleString()}`
            : undefined,
          access: l.accessSummary,
          href: `/crm/leads/${l.id}`,
        })),
      },
      {
        key: "unopened",
        title: "Tracked email — not opened",
        subtitle: "Last 14 days, zero opens",
        icon: <Mail size={16} />,
        empty: "No unopened tracked sends in this window.",
        rows: data.unopenedTrackedEmails.map((e) => {
          const href = recordHref(e.module, e.entityId);
          return {
            key: e.id,
            primary: e.recipient,
            secondary: e.subject || "(no subject)",
            meta: e.createdAt
              ? `Sent ${new Date(e.createdAt).toLocaleString()}`
              : undefined,
            href: href || undefined,
          };
        }),
      },
      {
        key: "opened",
        title: "Tracked email — opened",
        subtitle: "Last 14 days, opened at least once",
        icon: <Mail size={16} />,
        empty: "No opened tracked sends in this window.",
        rows: data.openedTrackedEmails.map((e) => {
          const href = recordHref(e.module, e.entityId);
          return {
            key: e.id,
            primary: e.recipient,
            secondary: e.subject || "(no subject)",
            meta: e.lastOpenedAt
              ? `${e.openCount} open${e.openCount === 1 ? "" : "s"} · last ${new Date(e.lastOpenedAt).toLocaleString()}`
              : `${e.openCount} open${e.openCount === 1 ? "" : "s"} · sent ${new Date(e.createdAt).toLocaleString()}`,
            href: href || undefined,
          };
        }),
      },
      {
        key: "replies",
        title: "Client replies received",
        subtitle: "Inbound replies on tracked outreach",
        icon: <Mail size={16} />,
        empty: "No replies received in this window.",
        rows: data.replyReceivedEmails.map((e) => {
          const href = recordHref(e.module, e.entityId);
          return {
            key: e.id,
            primary: e.fromEmail || "(unknown sender)",
            secondary: e.subject || "(no subject)",
            meta: e.createdAt
              ? `Received ${new Date(e.createdAt).toLocaleString()}`
              : undefined,
            access: e.accessSummary,
            href: href || undefined,
          };
        }),
      },
      {
        key: "awaiting",
        title: "Replies awaiting your response",
        subtitle: "Inbound client replies with no outbound follow-up yet",
        icon: <Clock size={16} />,
        empty: "No pending replies right now.",
        rows: awaitingReplies.map((e) => {
          const href = recordHref(e.module, e.entityId);
          return {
            key: e.id,
            primary: e.fromEmail || "(unknown sender)",
            secondary: e.subject || "(no subject)",
            meta: e.createdAt
              ? `Received ${new Date(e.createdAt).toLocaleString()}`
              : undefined,
            access: e.accessSummary,
            href: href || undefined,
          };
        }),
      },
    ];
  }, [data, awaitingReplies]);
  const [activeQueueKey, setActiveQueueKey] = useState("invites");

  useEffect(() => {
    if (!queueColumns.length) return;
    if (!queueColumns.some((c) => c.key === activeQueueKey)) {
      setActiveQueueKey(queueColumns[0].key);
    }
  }, [queueColumns, activeQueueKey]);

  if (loading) {
    return (
      <div
        className={
          hs
            ? "rounded-md border border-[var(--border-color)] bg-white p-6 animate-pulse shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            : "rounded-[28px] border border-amber-200/80 bg-amber-50/40 p-6 animate-pulse"
        }
      >
        <div
          className={
            hs ? "h-5 w-48 bg-[var(--surface-dim)] rounded-md mb-4" : "h-5 w-48 bg-amber-100 rounded mb-4"
          }
        />
        <div className={hs ? "h-24 bg-[var(--background)] rounded-md" : "h-24 bg-white/60 rounded-[3px]"} />
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className={
          hs
            ? "rounded-md border border-[var(--border-color)] bg-white p-5 text-sm text-[var(--text-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
            : "rounded-[28px] border border-[#dfe1e6] bg-card p-5 text-sm text-text-muted"
        }
      >
        Could not load attention items. Check the browser console for the HTTP status or sign in
        again — this request uses the same CRM session keys as the rest of the app (`token` or
        `crm_token`).
      </div>
    );
  }

  return (
    <div
      className={
        hs
          ? "rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden"
          : "rounded-[28px] border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-orange-50/40 shadow-sm overflow-hidden"
      }
    >
      <div
        className={
          hs
            ? "px-5 py-3.5 border-b border-[var(--border-color)] bg-[#fafbfc] flex flex-wrap items-center justify-between gap-3"
            : "px-5 py-4 border-b border-amber-200/60 flex flex-wrap items-center justify-between gap-3"
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={
              hs
                ? "p-1.5 rounded-md bg-[var(--surface-dim)] text-[var(--text-main)] shrink-0"
                : "p-2 rounded-[3px] bg-amber-100 text-amber-800 shrink-0"
            }
          >
            <AlertCircle size={hs ? 18 : 20} />
          </div>
          <div className="min-w-0">
            <h2
              className={
                hs
                  ? "text-sm font-semibold text-[var(--text-main)] tracking-tight"
                  : "text-sm font-semibold text-text-main tracking-tight"
              }
            >
              {hs ? "Work queue" : "Needs your attention"}
            </h2>
            <p className={hs ? "text-xs text-[var(--text-muted)] mt-0.5" : "text-xs text-text-muted"}>
              {total === 0
                ? hs
                  ? "You’re caught up — keep prospecting."
                  : "Nothing queued — keep outreach consistent."
                : `${total} item${total !== 1 ? "s" : ""} to work`}
            </p>
          </div>
        </div>
      </div>

      <p
        className={
          hs
            ? "px-5 py-2.5 text-xs text-[var(--text-muted)] leading-relaxed border-b border-[var(--surface-dim)] bg-white"
            : "px-5 pt-3 text-xs text-amber-900/80 leading-relaxed border-b border-amber-100/80"
        }
      >
        {data.note}
      </p>

      <div className={hs ? "p-4" : "p-5"}>
        {focusMode ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {queueColumns.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveQueueKey(c.key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    c.key === activeQueueKey
                      ? "border-[var(--hs-link)] bg-[#fff3ef] text-[#b94b36]"
                      : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--background)]",
                  )}
                >
                  {c.title}
                </button>
              ))}
            </div>
            {queueColumns
              .filter((c) => c.key === activeQueueKey)
              .map((c) => (
                <AttentionColumn
                  key={c.key}
                  variant={variant}
                  title={c.title}
                  subtitle={c.subtitle}
                  icon={c.icon}
                  empty={c.empty}
                  rows={c.rows}
                />
              ))}
          </div>
        ) : (
          <div className={hs ? "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3" : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5"}>
            {queueColumns.map((c) => (
              <AttentionColumn
                key={c.key}
                variant={variant}
                title={c.title}
                subtitle={c.subtitle}
                icon={c.icon}
                empty={c.empty}
                rows={c.rows}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttentionColumn({
  variant = "default",
  title,
  subtitle,
  icon,
  empty,
  rows,
}: {
  variant?: "default" | "hubspot";
  title: string;
  subtitle: string;
  icon: ReactNode;
  empty: string;
  rows: Array<{
    key: string;
    primary: string;
    secondary: string;
    meta?: string;
    /** Record / owner / mailbox / who synced — for inbound reply queues. */
    access?: string;
    href?: string;
  }>;
}) {
  const hs = variant === "hubspot";
  return (
    <div
      className={
        hs
          ? "rounded-md border border-[var(--border-color)] bg-[var(--background)] overflow-hidden flex flex-col min-h-[200px] max-h-[340px]"
          : "rounded-[3px] border border-white/80 bg-white/70 overflow-hidden flex flex-col min-h-[200px] max-h-[320px]"
      }
    >
      <div
        className={
          hs
            ? "px-3 py-2.5 border-b border-[var(--border-color)] bg-white"
            : "px-4 py-3 border-b border-[#ebecf0] bg-white/90"
        }
      >
        <div
          className={
            hs ? "flex items-center gap-2 text-[var(--text-main)]" : "flex items-center gap-2 text-amber-900"
          }
        >
          {icon}
          <div>
            <h3
              className={
                hs
                  ? "text-xs font-bold uppercase tracking-wide text-[var(--text-main)]"
                  : "text-xs font-black uppercase tracking-wider"
              }
            >
              {title}
            </h3>
            <p
              className={
                hs ? "text-xs text-[var(--text-muted)] font-normal mt-0.5" : "text-xs text-text-muted font-medium"
              }
            >
              {subtitle}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
        {rows.length === 0 ? (
          <p
            className={
              hs
                ? "text-xs text-[var(--text-muted)] text-center py-8 px-2"
                : "text-xs text-text-muted text-center py-8 px-2"
            }
          >
            {empty}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {rows.map((r) => {
              const inner = (
                <div className="flex items-start gap-2 group">
                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        hs
                          ? "text-sm font-medium text-[var(--text-main)] truncate"
                          : "text-xs font-semibold text-text-main truncate"
                      }
                    >
                      {r.primary}
                    </p>
                    <p
                      className={
                        hs ? "text-xs text-[var(--text-muted)] truncate" : "text-xs text-text-muted truncate"
                      }
                    >
                      {r.secondary}
                    </p>
                    {r.meta && (
                      <p
                        className={
                          hs
                            ? "text-xs text-[var(--primary-muted)] mt-0.5"
                            : "text-[9px] text-text-muted/90 mt-0.5"
                        }
                      >
                        {r.meta}
                      </p>
                    )}
                    {r.access && (
                      <p
                        className={
                          hs
                            ? "text-xs text-[var(--text-muted)] mt-1 leading-snug"
                            : "text-[9px] text-text-main/90 mt-1 leading-snug"
                        }
                        title={r.access}
                      >
                        {r.access}
                      </p>
                    )}
                  </div>
                  {r.href && (
                    <ChevronRight
                      size={14}
                      className={
                        hs
                          ? "text-[var(--border-color)] group-hover:text-[var(--hs-link)] shrink-0 mt-0.5"
                          : "text-slate-300 group-hover:text-primary shrink-0 mt-0.5"
                      }
                    />
                  )}
                </div>
              );
              return (
                <li key={r.key}>
                  {r.href ? (
                    <Link
                      href={r.href}
                      className={
                        hs
                          ? "block rounded-md px-2.5 py-2 hover:bg-white transition-colors border border-transparent hover:border-[var(--border-color)]"
                          : "block rounded-[3px] px-3 py-2.5 hover:bg-amber-50/80 transition-colors border border-transparent hover:border-amber-100"
                      }
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      className={
                        hs
                          ? "rounded-md px-2.5 py-2 border border-transparent"
                          : "rounded-[3px] px-3 py-2.5 border border-slate-50"
                      }
                    >
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
