"use client";

import NextLink from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { CRM_INPUT, CRM_PANEL } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import {
  EmptyHs,
  TaskRow,
  WORKSPACE_ITEMS_INCREMENT,
  recordHref,
  type WorkspacePayload,
} from "./workspace-ui";
import { EmptyDash, ViewAllLink } from "./dashboards/dashboardShared";
import { DashCardHeader } from "./dashboards/SalesOverviewCharts";

type Props = {
  ws: WorkspacePayload;
  taskSearch: string;
  setTaskSearch: Dispatch<SetStateAction<string>>;
  taskFilter: "all" | "overdue" | "due_today" | "no_due_date";
  setTaskFilter: Dispatch<
    SetStateAction<"all" | "overdue" | "due_today" | "no_due_date">
  >;
  filteredTasks: WorkspacePayload["priorityTasks"];
  renderedTasks: WorkspacePayload["priorityTasks"];
  setVisibleTaskCount: Dispatch<SetStateAction<number>>;
};

export default function TasksDuePanel({
  ws,
  taskSearch,
  setTaskSearch,
  taskFilter,
  setTaskFilter,
  filteredTasks,
  renderedTasks,
  setVisibleTaskCount,
}: Props) {
  return (
    <section className={cn(CRM_PANEL, "overflow-hidden")}>
      <DashCardHeader
        title="Tasks due"
        subtitle="Priority tasks for this workspace — overdue, due today, or unscheduled."
        actions={<ViewAllLink href="/crm/tasks" label="Open task board" />}
      />
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            placeholder="Search tasks, status, owner…"
            className={cn(CRM_INPUT, "md:max-w-[320px]")}
          />
          <select
            value={taskFilter}
            onChange={(e) =>
              setTaskFilter(
                e.target.value as
                  | "all"
                  | "overdue"
                  | "due_today"
                  | "no_due_date",
              )
            }
            className={cn(CRM_INPUT, "w-auto")}
            aria-label="Task filter"
          >
            <option value="all">All tasks</option>
            <option value="overdue">Overdue</option>
            <option value="due_today">Due today</option>
            <option value="no_due_date">No due date</option>
          </select>
          <p className="text-sm text-[var(--text-muted)]">
            Showing {filteredTasks.length} of {ws.priorityTasks.length}
          </p>
        </div>
        {!ws.priorityTasks.length ? (
          <EmptyDash message="No tasks here. Use the board to add and organize work." />
        ) : !filteredTasks.length ? (
          <EmptyHs message="No tasks match your current filters." />
        ) : (
          <ul className="divide-y divide-[var(--border-color)]">
            {renderedTasks.map((t) => {
              const href = recordHref(t.relatedType, t.relatedTo);
              const key = String(
                (t as { id?: string; _id?: string }).id ||
                  (t as { _id?: string })._id ||
                  t.title,
              );
              return (
                <li key={key}>
                  {href ? (
                    <NextLink
                      href={href}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-[var(--background)]"
                    >
                      <TaskRow t={t} />
                    </NextLink>
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-3">
                      <TaskRow t={t} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {renderedTasks.length < filteredTasks.length && (
          <button
            type="button"
            onClick={() =>
              setVisibleTaskCount((p) => p + WORKSPACE_ITEMS_INCREMENT)
            }
            className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 py-2 text-sm font-semibold text-[var(--primary)] shadow-[var(--crm-shadow-input)] hover:bg-[var(--background)]"
          >
            Show more tasks
          </button>
        )}
      </div>
    </section>
  );
}
