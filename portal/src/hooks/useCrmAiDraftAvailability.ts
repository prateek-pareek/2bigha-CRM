"use client";

import { useEffect, useState } from "react";
import { CRM_API_URL } from "@/lib/api/config";
import { getCrmAuthToken } from "@/lib/crm/api";

/** Whether CRM person-email AI draft is configured (API key + settings). */
export function useCrmAiDraftAvailability(enabled: boolean) {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getCrmAuthToken();
        if (!token) {
          if (!cancelled) setAvailable(false);
          return;
        }
        const res = await fetch(`${CRM_API_URL}/crm/ai/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          personDraftAvailable?: boolean;
        };
        if (!res.ok) {
          // Status check may lack permission while draft still works after RBAC fix.
          setAvailable(res.status === 403);
          return;
        }
        setAvailable(data.personDraftAvailable === true);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return available;
}
