"use client";

import dynamic from "next/dynamic";
import WorkspaceShell from "../_components/WorkspaceShell";

const CrmCalendar = dynamic(
  () => import("@/components/crm/calendar/CrmCalendar").then((m) => ({ default: m.CrmCalendar })),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[280px] rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] animate-pulse"
        aria-hidden
      />
    ),
  },
);

export default function CalendarDashboardPage() {
  return (
    <WorkspaceShell section="calendar">
      {() => (
        <div className="mt-0 outline-none">
          <CrmCalendar />
        </div>
      )}
    </WorkspaceShell>
  );
}
