"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";

/**
 * Super Admin daily export quota configuration — applies across both the
 * Lead Manager export flow and the IVR export flow.
 */
export default function ExportQuotaSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canManage = hasAccess("admin:manage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dailyLimitDefault, setDailyLimitDefault] = useState("5");

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
        const res = await fetch(`${CRM_API_URL}/crm/export-quota/config`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setDailyLimitDefault(String(data?.dailyLimitDefault ?? 5));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, canManage, authHeaders]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/export-quota/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dailyLimitDefault: Number(dailyLimitDefault) || 0 }),
      });
      if (!res.ok) {
        toast.error("Could not save quota settings");
        return;
      }
      toast.success("Export quota updated");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

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
        title="Export Quota"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Settings" }, { label: "Export Quota" }]}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <div className="max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5">
          <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
            Daily export limit per Super Admin
          </label>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Applies to both the Lead Manager export and the IVR call-log export. Set to 0 for unlimited.
          </p>
          <input
            type="number"
            min={0}
            value={dailyLimitDefault}
            onChange={(e) => setDailyLimitDefault(e.target.value)}
            className="mb-4 h-9 w-32 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--primary)]"
          />
          <div>
            <CrmButton type="button" onClick={() => void save()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </CrmButton>
          </div>
        </div>
      )}
    </div>
  );
}
