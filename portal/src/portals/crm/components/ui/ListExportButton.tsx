"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportListRows,
  type ListExportColumn,
  type ListExportFormat,
} from "@/lib/crm/export/list-export";
import { cn } from "@/lib/utils";

/**
 * Export button for list pages. Exports exactly what the list shows (current search +
 * filters — `getRows` supplies those rows, paging through the API when needed).
 * Hidden unless the user holds one of `permissions` (or is an admin).
 */
export function ListExportButton<T>({
  module,
  fileName,
  sheetName,
  columns,
  getRows,
  permissions,
  filters,
  label = "Export",
  className,
  disabled,
}: {
  module: string;
  fileName: string;
  sheetName?: string;
  columns: ListExportColumn<T>[];
  getRows: () => T[] | Promise<T[]>;
  /** Any one grants the button (admin:manage always does). */
  permissions: string[];
  filters?: Record<string, unknown>;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { hasAccess } = usePermissions();
  const [busy, setBusy] = useState(false);

  const allowed =
    hasAccess("admin:manage" as any) || permissions.some((p) => hasAccess(p as any));
  if (!allowed) return null;

  const run = async (format: ListExportFormat) => {
    if (busy) return;
    setBusy(true);
    const toastId = toast.loading("Preparing export…");
    try {
      const rows = await getRows();
      const count = await exportListRows({
        module,
        fileName,
        sheetName,
        columns,
        rows,
        format,
        filters,
      });
      toast.success(`Exported ${count} row${count === 1 ? "" : "s"}`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Export failed", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy || disabled}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm font-semibold text-[var(--text-main)] transition-colors hover:bg-[var(--surface-dim)] disabled:opacity-50",
            className,
          )}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy ? "Exporting…" : label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export current view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run("xlsx")}>
          <FileSpreadsheet size={14} className="mr-2" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("csv")}>
          <FileText size={14} className="mr-2" /> CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ListExportButton;
