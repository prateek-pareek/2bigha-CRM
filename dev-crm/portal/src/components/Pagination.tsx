"use client";

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [25, 50, 100];

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    // Build visible page range with ellipsis
    const getPageNumbers = () => {
        const pages: (number | '...')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (page > 3) pages.push('...');
            for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
            if (page < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-2.5 border-t border-border bg-slate-50/5">
            <div className="flex items-center gap-3 text-sm text-text-muted">
                <div className="flex items-center gap-2">
                    <span className="font-bold uppercase text-[9px] tracking-widest opacity-50">Show</span>
                    <select
                        value={pageSize}
                        onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
                        className="bg-slate-100 border-none rounded-lg px-2 py-1 text-xs font-black text-text-main outline-none focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer h-7"
                    >
                        {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                {total > 0 && (
                    <span className="ml-2 font-black text-xs text-text-muted/40 uppercase tracking-tighter">
                        {start}–{end} of <span className="text-text-main opacity-80">{total}</span>
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-text-muted hover:bg-slate-100 hover:text-text-main disabled:opacity-10 disabled:cursor-not-allowed transition-all active:scale-90"
                    title="Previous Page"
                >
                    <ChevronLeft size={14} />
                </button>

                <div className="flex items-center gap-0.5">
                    {getPageNumbers().map((p, i) =>
                        p === '...' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-text-muted/30 font-black">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onPageChange(p as number)}
                                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-black transition-all active:scale-95 ${p === page
                                        ? 'bg-primary text-white shadow-md shadow-primary/10'
                                        : 'text-text-muted hover:bg-slate-100 hover:text-text-main'
                                    }`}
                            >
                                {p}
                            </button>
                        )
                    )}
                </div>

                <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-text-muted hover:bg-slate-100 hover:text-text-main disabled:opacity-10 disabled:cursor-not-allowed transition-all active:scale-90"
                    title="Next Page"
                >
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}
