"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { runWhenIdle, warmCrmEssentials } from "@/lib/crm/shared/prefetch-cache";

/**
 * Warms common CRM API responses in the background after the CRM shell loads.
 * List/workspace pages read the shared cache for instant paint, then revalidate when stale.
 */
export default function CrmPrefetch() {
  const pathname = usePathname() || "";
  const { isLoaded, isAdmin, permittedTools, hasAccess, user } = usePermissions();
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const toolsUpper = permittedTools.map((t) => (t || "").toUpperCase());
    if (!isAdmin && !toolsUpper.includes("CRM")) return;

    const sessionKey = `${user?._id || "anon"}:${localStorage.getItem("token")?.slice(-8) || ""}`;
    if (sessionKeyRef.current === sessionKey) return;
    sessionKeyRef.current = sessionKey;

    const cancelIdle = runWhenIdle(() => {
      void warmCrmEssentials({
        hasAccess,
        user,
        skipWorkspace:
          pathname === "/crm/workspace" || pathname.startsWith("/crm/workspace/"),
        skipLeads: pathname.startsWith("/crm/leads"),
        skipContacts: pathname.startsWith("/crm/contacts"),
      });
    });

    return cancelIdle;
  }, [isLoaded, isAdmin, permittedTools, hasAccess, user, pathname]);

  return null;
}
