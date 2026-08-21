"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneCall, Users, UserCheck, Upload, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import Pagination from "@/components/suite/shell/Pagination";
import { usePermissions } from "@/hooks/usePermissions";
import {
  CrmButton,
  CrmKpiCard,
  CrmListMutedText,
  CrmListStatusBadge,
  CrmPageHeader,
  CrmTable,
  CrmTableShell,
} from "@/components/crm/ui";

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { Authorization: `Bearer ${token}` };
}

type CallLogRow = {
  _id: string;
  agentName?: string;
  agentNumber?: string;
  customerName?: string;
  customerNumber?: string;
  duration: number;
  direction: "Incoming" | "Outgoing";
  status: string;
  callDate?: string;
  callEndDate?: string;
  followUpAt?: string | null;
  callbackScheduledAt?: string | null;
};

type Stats = {
  todayIncoming: number;
  todayOutgoing: number;
  todayAnswered: number;
  todayActiveAgents: number;
  todayActiveClients: number;
  totalIncoming: number;
  totalOutgoing: number;
  connected: number;
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function IvrCallLogsView({ mine }: { mine: boolean }) {
  const { hasAccess } = usePermissions();
  const canManageExportImport = hasAccess("admin:manage");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CallLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      const path = mine ? "call-logs/mine" : "call-logs";
      const res = await fetch(`${CRM_API_URL}/crm/ivr/${path}?${params}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to load call logs");
        return;
      }
      setRows(Array.isArray(data?.data) ? data.data : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch {
      toast.error("Failed to load call logs");
    } finally {
      setLoading(false);
    }
  }, [mine, page, pageSize, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ivr/stats`, { headers: authHeaders(), cache: "no-store" });
      if (res.ok) setStats(await res.json());
    } catch {
      /* KPI tiles are a nice-to-have — silent fail */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${CRM_API_URL}/crm/ivr/import`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Import failed");
        return;
      }
      toast.success(`Imported ${data.created} call log(s)${data.skipped ? `, skipped ${data.skipped}` : ""}`);
      void load();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ivr/export`, { headers: authHeaders() });
      if (!res.ok) {
        toast.error("Export failed");
        return;
      }
      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title={mine ? "My Call Logs" : "Call Summary"}
        icon={<Phone size={18} />}
        description={
          mine
            ? "Calls you've placed through the CRM."
            : "Outbound and inbound calls handled through Kommuno."
        }
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "IVR Service" },
          { label: mine ? "My Call Logs" : "Call Logs" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {!mine && canManageExportImport ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                    e.target.value = "";
                  }}
                />
                <CrmButton
                  variant="secondary"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Import
                </CrmButton>
                <CrmButton variant="secondary" disabled={exporting} onClick={() => void handleExport()} className="gap-1.5">
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Export
                </CrmButton>
              </>
            ) : null}
            <CrmButton variant="secondary" onClick={() => void load()}>
              Refresh
            </CrmButton>
          </div>
        }
        className="mb-4"
      />

      {!mine && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CrmKpiCard label="Today calls incoming" value={stats?.todayIncoming ?? 0} icon={<PhoneIncoming size={17} />} />
          <CrmKpiCard label="Today calls outgoing" value={stats?.todayOutgoing ?? 0} icon={<PhoneOutgoing size={17} />} />
          <CrmKpiCard label="Today calls answered" value={stats?.todayAnswered ?? 0} icon={<PhoneCall size={17} />} />
          <CrmKpiCard label="Today active agents" value={stats?.todayActiveAgents ?? 0} icon={<Users size={17} />} />
          <CrmKpiCard label="Total incoming" value={stats?.totalIncoming ?? 0} icon={<PhoneIncoming size={17} />} />
          <CrmKpiCard label="Total outgoing" value={stats?.totalOutgoing ?? 0} icon={<PhoneOutgoing size={17} />} />
          <CrmKpiCard label="Connected" value={stats?.connected ?? 0} icon={<PhoneCall size={17} />} />
          <CrmKpiCard label="Today active clients" value={stats?.todayActiveClients ?? 0} icon={<UserCheck size={17} />} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search caller or member"
          className="h-9 w-64 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
        />
      </div>

      <CrmTableShell>
        {loading ? (
          <div className="flex justify-center py-16 text-sm text-[var(--text-muted)]">Loading…</div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--text-muted)]">No calls logged yet.</p>
        ) : (
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10">Agent Name</th>
                <th className="sticky top-0 z-10">Agent Number</th>
                <th className="sticky top-0 z-10">Client Name</th>
                <th className="sticky top-0 z-10">Client Number</th>
                <th className="sticky top-0 z-10">Duration</th>
                <th className="sticky top-0 z-10">Type</th>
                <th className="sticky top-0 z-10">Status</th>
                <th className="sticky top-0 z-10">Call Date</th>
                <th className="sticky top-0 z-10">Call End Date</th>
                <th className="sticky top-0 z-10">Follow Up</th>
                <th className="sticky top-0 z-10">Callback Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>{row.agentName || "—"}</td>
                  <td>
                    <CrmListMutedText>{row.agentNumber || "—"}</CrmListMutedText>
                  </td>
                  <td>{row.customerName || "—"}</td>
                  <td>
                    <CrmListMutedText>{row.customerNumber || "—"}</CrmListMutedText>
                  </td>
                  <td>{formatDuration(row.duration)}</td>
                  <td>
                    <CrmListStatusBadge label={row.direction === "Incoming" ? "INCOMING" : "OUTGOING"} />
                  </td>
                  <td>
                    <CrmListStatusBadge label={row.status?.toUpperCase() || "—"} />
                  </td>
                  <td>
                    <CrmListMutedText>{formatDate(row.callDate)}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatDate(row.callEndDate)}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatDate(row.followUpAt)}</CrmListMutedText>
                  </td>
                  <td>
                    <CrmListMutedText>{formatDate(row.callbackScheduledAt)}</CrmListMutedText>
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        )}
      </CrmTableShell>
      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        className="mt-3 rounded-[var(--crm-radius-ui)] border-t-0"
      />
    </div>
  );
}
