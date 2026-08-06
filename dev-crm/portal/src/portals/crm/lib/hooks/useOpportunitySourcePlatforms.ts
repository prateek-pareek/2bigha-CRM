"use client";

import { useCallback, useEffect, useState } from "react";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS,
  mergeOpportunitySourcePlatforms,
  normalizeOpportunityPlatformName,
} from "@/lib/crm/crm-opportunity-portal-options";

type PlatformsResponse = {
  builtin?: string[];
  custom?: string[];
  options?: string[];
};

let cached: { custom: string[]; options: string[] } | null = null;
let inflight: Promise<{ custom: string[]; options: string[] }> | null = null;

async function fetchPlatforms(): Promise<{ custom: string[]; options: string[] }> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const token =
      typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      const options = mergeOpportunitySourcePlatforms([]);
      return { custom: [], options };
    }
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/opportunity-platforms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PlatformsResponse;
      const custom = Array.isArray(data.custom) ? data.custom : [];
      const options =
        Array.isArray(data.options) && data.options.length > 0
          ? data.options
          : mergeOpportunitySourcePlatforms(custom);
      cached = { custom, options };
      return cached;
    } catch {
      const options = mergeOpportunitySourcePlatforms([]);
      return { custom: [], options };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateOpportunitySourcePlatformsCache(): void {
  cached = null;
}

export function useOpportunitySourcePlatforms(extraValues: string[] = []) {
  const [custom, setCustom] = useState<string[]>(cached?.custom ?? []);
  const [loading, setLoading] = useState(!cached);

  const reload = useCallback(async () => {
    invalidateOpportunitySourcePlatformsCache();
    setLoading(true);
    const next = await fetchPlatforms();
    setCustom(next.custom);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPlatforms().then((data) => {
      if (cancelled) return;
      setCustom(data.custom);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = mergeOpportunitySourcePlatforms(custom, extraValues);

  const saveCustomPlatform = useCallback(
    async (rawName: string): Promise<string> => {
      const name = normalizeOpportunityPlatformName(rawName);
      if (name.length < 2) {
        throw new Error("Enter a platform name (at least 2 characters).");
      }
      const key = name.toLowerCase();
      if (
        CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS.some(
          (b) => b.toLowerCase() === key,
        )
      ) {
        throw new Error("That name is already a built-in platform.");
      }
      if (custom.some((c) => c.toLowerCase() === key)) {
        return name;
      }

      const token =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("token")
          : null;
      if (!token) throw new Error("Not signed in.");

      const nextCustom = [...custom, name].sort((a, b) => a.localeCompare(b));
      const res = await fetch(`${CRM_API_URL}/crm/settings/opportunity-platforms`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ customPlatforms: nextCustom }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string })?.message || `Save failed (${res.status})`,
        );
      }
      invalidateOpportunitySourcePlatformsCache();
      await reload();
      return name;
    },
    [custom, reload],
  );

  return {
    loading,
    custom,
    builtin: [...CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS],
    options,
    reload,
    saveCustomPlatform,
  };
}
