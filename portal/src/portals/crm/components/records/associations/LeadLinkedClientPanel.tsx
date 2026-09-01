"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cloud, Loader2 } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { TwoBighaSyncStatusBadge } from "@/components/crm/platform/TwoBighaSyncStatusBadge";
import type { TwoBighaSyncStatus } from "@/lib/crm/twobigha-client-api";

type LinkedClient = {
  _id: string;
  name?: string;
  email?: string;
  twobighaUserId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
};

/** Lightweight indicator on lead detail when a lead is linked to a CRM client. */
export default function LeadLinkedClientPanel({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<LinkedClient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);
    const token = localStorage.getItem("token");
    fetch(`${CRM_API_URL}/crm/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setClient(data);
      })
      .catch(() => {
        if (!cancelled) setClient(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="rounded-[var(--crm-radius-ui)] border border-border bg-card p-4 shadow-sm flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" />
        Loading linked client…
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="rounded-[var(--crm-radius-ui)] border border-border bg-card p-4 shadow-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-text-muted flex items-center gap-1.5">
          <Cloud size={14} className="text-primary" />
          Linked client (2bigha)
        </h3>
        <TwoBighaSyncStatusBadge status={client.twobighaSyncStatus} error={client.twobighaSyncError} />
      </div>
      <p className="text-sm font-semibold text-text-main">{client.name || client.email}</p>
      {client.twobighaUserId ? (
        <p className="text-[11px] font-mono text-text-muted">Platform ID: {client.twobighaUserId}</p>
      ) : (
        <p className="text-[11px] text-amber-700">
          Not synced to 2bigha — lead sync to 2bigha requires a platform user ID.
        </p>
      )}
      <Link
        href={`/crm/clients/${client._id}`}
        className="inline-block text-xs font-semibold text-primary hover:underline"
      >
        Open client → manage 2bigha sync
      </Link>
    </div>
  );
}
