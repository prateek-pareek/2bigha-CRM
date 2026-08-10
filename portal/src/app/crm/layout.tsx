"use client";

import AppShell from "@/components/suite/shell/AppShell";
import { usePermissions } from "@/hooks/usePermissions";
import LazyGlobalEmailComposer from "@/components/crm/email/composer/LazyGlobalEmailComposer";
import { SalesCopilotWidget } from "@/components/crm/sales/SalesCopilotWidget";
import CrmPrefetch from "@/components/crm/shell/CrmPrefetch";
import { CrmThemeCustomizer } from "@/components/crm/ui/CrmThemeCustomizer";
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import "@/app/crm/crm-hubspot.css";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setBrowserTabIcon } from "@/lib/browser-tab-brand";
import { crmSuiteShellClassName } from "@/lib/crm/shell";
import {
  crmModuleForPathname,
  defaultReadPermission,
} from "@/lib/permissions/registry";
import { applyCrmAccent, readCrmThemePrefs } from "@/lib/crm/settings/theme-prefs";

/**
 * CRM app root — owned by CRM (no PM/Jira CSS imports).
 * Theme: data-crm-app + data-crm-theme="crms" → crm-hubspot.css
 * See portal/src/lib/crm/SEPARATION.md for extract guidance.
 */
export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, permittedTools, isAdmin, getDefaultRoute, hasAccess } =
    usePermissions();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    document.title = "2Bigha CRM";
    setBrowserTabIcon("crm");
    applyCrmAccent(readCrmThemePrefs().accent);
    if (!isLoaded) return;
    const toolsUpper = permittedTools.map((t) => t.toUpperCase());
    if (!isAdmin && !toolsUpper.includes("CRM")) {
      router.replace("/unauthorized");
      return;
    }
    const module = crmModuleForPathname(pathname);
    if (!module || isAdmin) return;
    const required = defaultReadPermission(module.id);
    const masterKey =
      module.id.startsWith("settings-")
        ? "settings:read"
        : module.id.startsWith("workspace-") || module.id === "workspace"
          ? "dashboard:read"
          : module.id.startsWith("reports-") || module.id === "reports"
            ? "dashboard:read"
            : null;
    if (
      !hasAccess(required) &&
      !hasAccess(module.id) &&
      !(masterKey && hasAccess(masterKey))
    ) {
      router.replace(`/unauthorized?module=${encodeURIComponent(module.id)}`);
    }
  }, [
    isLoaded,
    permittedTools,
    isAdmin,
    router,
    getDefaultRoute,
    pathname,
    hasAccess,
  ]);

  if (!isLoaded) {
    return (
      <div
        data-crm-app
        data-crm-theme="crms"
        className={crmSuiteShellClassName}
      >
        <div className="flex h-screen items-center justify-center bg-[var(--background)]">
          <div
            className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-[var(--primary)]"
            aria-label="Loading CRM"
          />
        </div>
      </div>
    );
  }

  const toolsUpper = permittedTools.map((t) => t.toUpperCase());
  if (!isAdmin && !toolsUpper.includes("CRM")) return null;

  return (
    <div
      data-crm-app
      data-crm-theme="crms"
      className={crmSuiteShellClassName}
    >
      <AppShell>{children}</AppShell>
      <CrmPrefetch />
      <LazyGlobalEmailComposer />
      <SalesCopilotWidget />
      <CrmThemeCustomizer />
    </div>
  );
}
