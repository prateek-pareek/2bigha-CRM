"use client";

import { Suspense } from "react";
import AgentDashboardInner from "./AgentDashboardInner";
import { DashboardSkeleton } from "@/components/crm/dashboards/wireframe";

export default function AgentDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AgentDashboardInner />
    </Suspense>
  );
}
