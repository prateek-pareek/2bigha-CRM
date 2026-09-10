"use client";

import { Suspense } from "react";
import TeamDashboardInner from "./TeamDashboardInner";
import { DashboardSkeleton } from "@/components/crm/dashboards/wireframe";

export default function TeamDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeamDashboardInner />
    </Suspense>
  );
}
