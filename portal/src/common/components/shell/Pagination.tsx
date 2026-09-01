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

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 border-t border-[#e2e8f0] bg-white px-3 py-3 sm:flex-row",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#707070]">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="h-8 rounded-[5px] border border-[#e2e8f0] bg-white px-2 text-sm font-medium text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] outline-none focus:border-[var(--primary)]"
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

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-colors hover:bg-[#f7f8f9] disabled:cursor-not-allowed disabled:opacity-40"
          title="Previous"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-[#707070]">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p as number)}
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-[5px] border px-2 text-sm font-medium transition-colors",
                  p === page
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-[5px] border border-[#e2e8f0] bg-white text-[#1f2020] shadow-[0_4px_4px_0_rgba(219,219,219,0.25)] transition-colors hover:bg-[#f7f8f9] disabled:cursor-not-allowed disabled:opacity-40"
          title="Next"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
