"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmPageHeader } from "@/components/crm/ui";

type ExportLogRow = {
  _id: string;
  userName?: string;
  exportType: string;
  rowCount: number;
  createdAt: string;
};

/** Export History — every Lead Manager / IVR export attempt, for Super Admins to review. */
export default function ExportHistoryPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canManage = hasAccess("admin:manage");
  const [rows, setRows] = useState<ExportLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  useEffect(() => {
    if (!isLoaded || !canManage) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${CRM_API_URL}/crm/export-quota/history?pageSize=50`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        const data = res.ok ? await res.json() : { data: [], total: 0 };
        setRows(Array.isArray(data.data) ? data.data : []);
        setTotal(data.total || 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, canManage, authHeaders]);

  if (isLoaded && !canManage) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center p-6 text-sm text-[var(--text-muted)]">
        You don’t have permission to view this setting.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Export History"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Settings" }, { label: "Export History" }]}
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-2.5">User</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Rows</th>
              <th className="px-4 py-2.5">When</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  <Loader2 size={16} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No exports recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row._id} className="border-b border-[var(--border-color)] last:border-0">
                  <td className="px-4 py-2.5">{row.userName || "—"}</td>
                  <td className="px-4 py-2.5 capitalize">{row.exportType}</td>
                  <td className="px-4 py-2.5">{row.rowCount}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">{total} export(s) recorded.</p>
    </div>
  );
}
