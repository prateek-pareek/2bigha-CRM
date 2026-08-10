"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import {
  canAccessCrmDashboardPage,
  CRM_WORKSPACE_ACCESS_ITEMS,
  firstAccessibleWorkspaceHref,
} from "@/lib/crm/shared/dashboard-access";
import { WORKSPACE_ROUTES } from "@/lib/crm/shared/dashboard-routes";

function matchWorkspacePermission(pathname: string): {
  permission: string;
  revenueOnly?: boolean;
} | null {
  const primaryHits = CRM_WORKSPACE_ACCESS_ITEMS.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  ).sort((a, b) => b.href.length - a.href.length);
  if (primaryHits[0]) {
    return {
      permission: primaryHits[0].requiredPermission,
      revenueOnly: primaryHits[0].revenueOnly,
    };
  }
  const legacyHits = WORKSPACE_ROUTES.filter(
    (r) => pathname === r.href || pathname.startsWith(`${r.href}/`),
  ).sort((a, b) => b.href.length - a.href.length);
  if (legacyHits[0]) {
    const legacy = legacyHits[0];
    return {
      permission: legacy.permission,
      revenueOnly: "revenueOnly" in legacy ? !!legacy.revenueOnly : false,
    };
  }
  return null;
}

export default function CrmWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, hasAccess, canViewCrmRevenue } = usePermissions();

  useEffect(() => {
    if (!isLoaded) return;
    const opts = { canViewCrmRevenue };
    if (pathname === "/crm/workspace" || pathname === "/crm/workspace/") {
      const href = firstAccessibleWorkspaceHref(hasAccess, opts);
      router.replace(href || "/unauthorized?module=workspace");
      return;
    }
    const match = matchWorkspacePermission(pathname);
    if (!match) return;
    if (
      !canAccessCrmDashboardPage(hasAccess, match.permission, {
        ...opts,
        revenueOnly: match.revenueOnly,
      })
    ) {
      const fallback = firstAccessibleWorkspaceHref(hasAccess, opts);
      router.replace(fallback || "/unauthorized?module=workspace");
    }
  }, [isLoaded, pathname, hasAccess, canViewCrmRevenue, router]);

  return <>{children}</>;
}
