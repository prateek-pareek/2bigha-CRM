"use client";

import Link from "next/link";
import { FileText, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProposalBoardRow = {
  _id: string;
  title: string;
  kind: string;
  status: string;
  stage?: string;
  pipeline?: string;
  clientName?: string;
  clientEmail?: string;
  updatedAt?: string;
};

export type ProposalPipelineStage = {
  name: string;
  order?: number;
  isDefault?: boolean;
  probability?: number;
};

type Props = {
  stages: ProposalPipelineStage[];
  rows: ProposalBoardRow[];
  movingId?: string | null;
  entityLabel?: string;
  settingsPipelinesLabel?: string;
  onOpen: (row: ProposalBoardRow) => void;
  onMoveStage: (row: ProposalBoardRow, stage: string) => void;
};

function stageKey(row: ProposalBoardRow): string {
  return String(row.stage || row.status || "Draft").trim() || "Draft";
}

export default function ProposalPipelineBoard({
  stages,
  rows,
  movingId,
  entityLabel = "proposal",
  settingsPipelinesLabel = "Proposal Pipelines",
  onOpen,
  onMoveStage,
}: Props) {
  const ordered = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const known = new Set(ordered.map((s) => s.name));
  const unmatched = rows.filter((r) => !known.has(stageKey(r)));

  const columns =
    unmatched.length > 0
      ? [...ordered, { name: "Other", order: 999, isDefault: false }]
      : ordered;

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const items =
          col.name === "Other"
            ? unmatched
            : rows.filter((r) => stageKey(r) === col.name);
        return (
          <div
            key={col.name}
            className="flex w-[280px] shrink-0 flex-col rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)]/40"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] bg-white px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                  {col.name}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {items.length} proposal{items.length === 1 ? "" : "s"}
                  {typeof col.probability === "number"
                    ? ` · ${col.probability}%`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
                  No {entityLabel}s in this stage
                </p>
              ) : (
                items.map((row) => (
                  <div
                    key={row._id}
                    className={cn(
                      "rounded-md border border-[var(--border-color)] bg-white p-3 shadow-sm transition-opacity",
                      movingId === row._id && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(row)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                            {row.title || "Untitled"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                            {row.clientName || row.clientEmail || "No client"}
                          </p>
                          <p className="mt-1 text-[11px] capitalize text-[var(--text-muted)]">
                            {row.kind}
                          </p>
                        </div>
                      </div>
                    </button>
                    <div className="mt-2 flex items-center gap-2 border-t border-[var(--border-color)]/60 pt-2">
                      <select
                        value={known.has(stageKey(row)) ? stageKey(row) : ""}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next && next !== stageKey(row)) onMoveStage(row, next);
                        }}
                        className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-color)] bg-white px-2 text-xs font-medium text-[var(--text-main)]"
                        aria-label="Move to stage"
                      >
                        <option value="" disabled>
                          Move to…
                        </option>
                        {ordered.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onOpen(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)]"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
      {columns.length === 0 ? (
        <div className="w-full rounded-md border border-dashed border-[var(--border-color)] bg-white px-6 py-16 text-center">
          <p className="text-sm font-semibold text-[var(--text-main)]">
            No {entityLabel} pipeline stages
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Create stages under{" "}
            <Link
              href="/crm/settings/pipelines"
              className="font-semibold text-[var(--primary)] hover:underline"
            >
              Settings → Pipelines → {settingsPipelinesLabel}
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
