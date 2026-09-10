"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
  /** Override the default 10/25/50/100 page-size menu. */
  pageSizes?: number[];
  /** Tighter footer bar for list pages. */
  compact?: boolean;
}

/** CRMS DataTables-style: “Show N entries” + outline page chips */
const PAGE_SIZES = [10, 25, 50, 100];

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
  pageSizes = PAGE_SIZES,
  compact = false,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const controlH = compact ? "h-7 min-w-7" : "h-8 min-w-8";
  const iconBtn = compact
    ? "inline-flex h-7 w-7 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] transition-colors hover:bg-[#f7f8f9] disabled:cursor-not-allowed disabled:opacity-40"
    : "inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-colors hover:bg-[#f7f8f9] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-between border-t border-[#e2e8f0] bg-white sm:flex-row",
        compact ? "gap-1.5 px-2.5 py-1.5" : "gap-3 px-3 py-3",
        className,
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-1.5 text-[#707070]", compact ? "text-xs" : "text-sm")}>
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className={cn(
            "rounded-[5px] border border-[#e2e8f0] bg-white px-1.5 font-medium text-[#1f2020] outline-none focus:border-[var(--primary)]",
            compact ? "h-7 text-xs" : "h-8 px-2 text-sm shadow-[0_4px_4px_0_rgba(219,219,219,0.25)]",
          )}
          aria-label="Rows per page"
        >
          {pageSizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span>entries</span>
        {total > 0 ? (
          <span className="ml-1 text-[#707070]">
            ({start}–{end} of {total})
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={iconBtn}
          title="Previous"
          aria-label="Previous page"
        >
          <ChevronLeft size={compact ? 13 : 14} />
        </button>

        <div className="flex items-center gap-0.5">
          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className={cn("px-1 text-[#707070]", compact ? "text-xs" : "text-sm")}>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p as number)}
                className={cn(
                  "inline-flex items-center justify-center rounded-[5px] border px-2 font-medium transition-colors",
                  controlH,
                  compact ? "text-xs" : "text-sm",
                  p === page
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : compact
                      ? "border-[#e2e8f0] bg-white text-[#1f2020] hover:bg-[#f7f8f9]"
                      : "border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] hover:bg-[#f7f8f9]",
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={iconBtn}
          title="Next"
          aria-label="Next page"
        >
          <ChevronRight size={compact ? 13 : 14} />
        </button>
      </div>
    </div>
  );
}
