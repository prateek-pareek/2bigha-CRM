"use client";

import AppShell from "@/components/suite/shell/AppShell";
import { usePermissions } from "@/hooks/usePermissions";
import LazyGlobalEmailComposer from "@/components/crm/email/composer/LazyGlobalEmailComposer";
import WhatsAppSideChatDrawer from "@/portals/crm/components/whatsapp/WhatsAppSideChatDrawer";
// import { SalesCopilotWidget } from "@/components/crm/sales/SalesCopilotWidget"; // floating AI button hidden — see below
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
import { dashboardMasterKeyApplies } from "@/lib/crm/shared/dashboard-access";
import { crmLandingRoute, isCrmEntryPath } from "@/lib/crm/shared/crm-landing";
import {
  crmWorkspaceOf,
  isCrmPathHiddenForWorkspace,
  workspaceLeadListHref,
} from "@/lib/crm/shared/crm-workspace-nav";

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
  const { isLoaded, permittedTools, isAdmin, getDefaultRoute, hasAccess, user } =
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
    // Lead lists are per workspace: a PM role opening /crm/leads goes to PM Leads, a 2Bigha
    // role opening /crm/pm/leads goes to Leads (instead of an empty list or a denial).
    const workspace = crmWorkspaceOf(user);
    if (isCrmPathHiddenForWorkspace(pathname, workspace)) {
      router.replace(workspaceLeadListHref(workspace) || crmLandingRoute(hasAccess));
      return;
    }
    const module = crmModuleForPathname(pathname);
    if (!module || isAdmin) return;
    // Entry points (/crm, /crm/workspace) are "take me home", not a screen the user asked
    // for — the workspace layout sends them to the role's landing screen, so never deny here.
    if (isCrmEntryPath(pathname)) return;
    const required = defaultReadPermission(module.id);
    const isDashboardPage =
      module.id.startsWith("workspace-") ||
      module.id === "workspace" ||
      module.id.startsWith("reports-") ||
      module.id === "reports";
    const masterKey =
      module.id.startsWith("settings-")
        ? "settings:read"
        : isDashboardPage && dashboardMasterKeyApplies(hasAccess)
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
    user,
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
      <WhatsAppSideChatDrawer />
      {/* Sales Copilot floating AI button hidden for now — keep component, just don't render it */}
      {/* <SalesCopilotWidget /> */}
      <CrmThemeCustomizer />
    </div>
  );
}
