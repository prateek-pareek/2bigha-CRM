"use client";

import { useCallback, useEffect, useState } from "react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import CrmRecordOwnerCard from "./CrmRecordOwnerCard";

/**
 * Owner card for a client: loads the owner and "may I reassign?" from the same server rules
 * that gate creating a task on the client, and refreshes when a task changes the owner.
 */
export default function CrmClientOwnerCard({ clientId }: { clientId: string }) {
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [canReassign, setCanReassign] = useState(false);

  const load = useCallback(async () => {
    const token = getCrmAuthToken();
    if (!token || !clientId) return;
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/activities/record-task-context?relatedType=Client&relatedTo=${encodeURIComponent(clientId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const ctx = await res.json();
      setOwnerLabel(ctx?.owner?.label ?? null);
      setCanReassign(Boolean(ctx?.canReassign));
    } catch {
      /* owner card is informational — keep the page usable */
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent).detail as { relatedType?: string; relatedTo?: string } | undefined;
      if (d?.relatedType === "Client" && d.relatedTo === clientId) void load();
    };
    window.addEventListener("crm:record-owner-changed", onChanged);
    return () => window.removeEventListener("crm:record-owner-changed", onChanged);
  }, [clientId, load]);

  return (
    <CrmRecordOwnerCard
      ownerLabel={ownerLabel}
      clientId={clientId}
      canReassign={canReassign}
      onReassigned={() => void load()}
    />
  );
}
