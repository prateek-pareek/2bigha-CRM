"use client";

import NextLink from "next/link";
import { ChevronRight, ListTodo } from "lucide-react";
import WorkspaceShell from "../_components/WorkspaceShell";
import {
  EmptyHs, HsSection, TaskRow, HS_PANEL, WORKSPACE_ITEMS_INCREMENT, recordHref,
} from "../_components/workspace-ui";
import { cn } from "@/lib/utils";

export default function TasksDashboardPage() {
  return (
    <WorkspaceShell section="tasks">
      {({ ws, loading, error, taskSearch, setTaskSearch, taskFilter, setTaskFilter, filteredTasks, renderedTasks, setVisibleTaskCount }) => (

                  <div className="mt-0 outline-none">
                  {!loading && !ws && (
                    <div className={cn(HS_PANEL, "p-6")}>
                      <EmptyHs
                        message={
                          error ||
                          "Workspace data is not available. Try refreshing the page."
                        }
                      />
                    </div>
                  )}
                  {!loading && ws && (
                    <HsSection
                      title="Tasks in this workspace"
                      action={{ href: "/crm/tasks", label: "Open task board" }}
                      icon={<ListTodo className="h-4 w-4 text-[var(--text-main)]" />}
                    >
                      <div className="mb-3 flex flex-col md:flex-row gap-2 md:items-center">
                        <input
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          placeholder="Search tasks, status, owner…"
                          className="w-full md:max-w-[320px] rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--hs-link)]/25 focus:border-[var(--hs-link)]"
                        />
                        <select
                          value={taskFilter}
                          onChange={(e) =>
                            setTaskFilter(
                              e.target.value as "all" | "overdue" | "due_today" | "no_due_date",
                            )
                          }
                          className="rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--hs-link)]/25 focus:border-[var(--hs-link)]"
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
                        <EmptyHs message="No tasks here. Use the board to add and organize work." />
                      ) : !filteredTasks.length ? (
                        <EmptyHs message="No tasks match your current filters." />
                      ) : (
                        <ul className="divide-y divide-[var(--surface-dim)]">
                          {renderedTasks.map((t, idx) => {
                            const href = recordHref(t.relatedType, t.relatedTo);
                            return (
                              <li key={String((t as any).id || (t as any)._id) + "-" + Math.random()}>
                                {href ? (
                                  <NextLink
                                    href={href}
                                    className="flex items-center justify-between gap-3 py-3 hover:bg-[var(--background)] rounded-md -mx-2 px-2"
                                  >
                                    <TaskRow t={t} />
                                    <ChevronRight className="h-4 w-4 text-[var(--border-color)]" />
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
                          onClick={() => setVisibleTaskCount((p) => p + WORKSPACE_ITEMS_INCREMENT)}
                          className="mt-3 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--hs-link)] hover:bg-[var(--background)]"
                        >
                          Show more tasks
                        </button>
                      )}
                    </HsSection>
                  )}
                </div>
      )}
    </WorkspaceShell>
  );
}
