"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import {
  canAccessCrmDashboardPage,
  CRM_REPORT_ACCESS_ITEMS,
  firstAccessibleReportHref,
} from "@/lib/crm/shared/dashboard-access";

function matchReportItem(pathname: string) {
  const hits = CRM_REPORT_ACCESS_ITEMS.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0] ?? null;
}

export default function CrmReportsLayout({
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
    if (pathname === "/crm/reports" || pathname === "/crm/reports/") {
      const href = firstAccessibleReportHref(hasAccess, opts);
      router.replace(href || "/unauthorized?module=reports");
      return;
    }
    const item = matchReportItem(pathname);
    if (!item) return;
    if (
      !canAccessCrmDashboardPage(hasAccess, item.requiredPermission, {
        ...opts,
        revenueOnly: item.revenueOnly,
      })
    ) {
      const fallback = firstAccessibleReportHref(hasAccess, opts);
      router.replace(fallback || "/unauthorized?module=reports");
    }
  }, [isLoaded, pathname, hasAccess, canViewCrmRevenue, router]);

  return <>{children}</>;
}
