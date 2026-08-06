"use client";

import AppShell from "@/components/AppShell";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setBrowserTabIcon } from "@/lib/browser-tab-brand";
import { jiraSuiteShellClassName } from "@/lib/pm/jira-ui";
import "@/app/crm/crm-hubspot.css";
import "@/app/pm/pm.css";
import "@/app/suite-internal-jira.css";

export default function ClientPortalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, permittedTools, isAdmin, hasAccess } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    document.title = "Mathionix Client Portals";
    setBrowserTabIcon("crm");
    if (!isLoaded) return;
    const toolsUpper = permittedTools.map((t) => t.toUpperCase());
    const canUsePortals =
      isAdmin ||
      ((toolsUpper.includes("CRM") || toolsUpper.includes("CLIENT-PORTALS")) &&
        hasAccess("clients:read"));
    if (!canUsePortals) {
      router.replace("/unauthorized");
    }
  }, [isLoaded, permittedTools, isAdmin, hasAccess, router]);

  if (!isLoaded) return null;
  const toolsUpper = permittedTools.map((t) => t.toUpperCase());
  const canUsePortals =
    isAdmin ||
    ((toolsUpper.includes("CRM") || toolsUpper.includes("CLIENT-PORTALS")) &&
      hasAccess("clients:read"));
  if (!canUsePortals) return null;

  return (
    <div data-pm-jira className={jiraSuiteShellClassName}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
