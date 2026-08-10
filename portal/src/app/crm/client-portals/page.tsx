"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { CRM_API_URL } from '@/lib/crm/config';
import { PM_API_URL } from '@/lib/api/config';
import { usePermissions } from "@/hooks/usePermissions";
import PortalManagementCard from "@/components/crm/platform/PortalManagementCard";

type ClientPortalNeed = {
  _id: string;
  category: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  satisfiedDocUrl?: string;
  satisfiedAt?: string;
};

type ClientPortalRow = {
  dealId: string;
  dealTitle: string;
  dealStage: string;
  clientName: string;
  organizationName: string;
  portalToken: string;
  portalDomain?: string;
  portalScopeSummary?: string;
  portalPmProjectId?: string | null;
  portalGoogleLoginEnabled?: boolean;
  portalHasPassword?: boolean;
  portalNeedsCount: number;
  openPortalNeedsCount: number;
  inquiriesCount: number;
  assignedEmployeesCount: number;
  assignedEmployees: Array<{
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    role: string;
    grantedAt: string | null;
  }>;
  myPortalRole: "viewer" | "manager" | "portal_admin" | null;
  lastInquiryAt: string | null;
  updatedAt: string | null;
  portalDocuments: {
    name: string;
    url: string;
    uploadedBy?: string;
    type: "admin_provided" | "client_uploaded";
    createdAt: string;
  }[];
  portalMilestones: {
    label: string;
    status: "pending" | "in-progress" | "completed";
    percentage: number;
  }[];
  portalDeadlines: { label: string; date: string }[];
};

type CrmPortalUser = {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
};

export default function ClientPortalsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, hasAccess } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClientPortalRow[]>([]);
  const [portalUsers, setPortalUsers] = useState<CrmPortalUser[]>([]);
  const [pmProjects, setPmProjects] = useState<
    { _id: string; name: string; key: string }[]
  >([]);
  const [allDeals, setAllDeals] = useState<
    Array<{ _id: string; title: string; stage?: string; portalToken?: string }>
  >([]);
  const [selectedDealForPortal, setSelectedDealForPortal] = useState("");
  const [creatingPortal, setCreatingPortal] = useState(false);
  const [filterDealId, setFilterDealId] = useState("");

  const portalDisabledDeals = useMemo(
    () => allDeals.filter((d) => !String(d.portalToken || "").trim()),
    [allDeals],
  );

  const filteredRows = useMemo(() => {
    if (!filterDealId) return rows;
    return rows.filter((r) => r.dealId === filterDealId);
  }, [rows, filterDealId]);

  const fetchPortalConsoleRows = async () => {
    const token = localStorage.getItem("token");
    const [portalsRes, usersRes] = await Promise.all([
      fetch(`${CRM_API_URL}/crm/client-portals`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!portalsRes.ok) {
      throw new Error(`Failed to fetch portals: ${portalsRes.status}`);
    }
    const portals = await portalsRes.json();
    const users = usersRes.ok ? await usersRes.json() : [];
    setRows(Array.isArray(portals) ? portals : []);
    setPortalUsers(Array.isArray(users) ? users : []);
  };

  const fetchDealsForPortalEnable = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/deals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = res.ok ? await res.json() : [];
    setAllDeals(Array.isArray(d) ? d : []);
  };

  useEffect(() => {
    if (pathname?.startsWith("/crm/client-portals")) {
      router.replace("/client-portals");
    }
  }, [pathname, router]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPortalConsoleRows()
      .catch((err) => {
        console.error("Portal fetch failed:", err);
        setError(err instanceof Error ? err.message : "Failed to load portal data");
        setRows([]);
        setPortalUsers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${PM_API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPmProjects(Array.isArray(d) ? d : []))
      .catch(() => setPmProjects([]));
  }, []);

  useEffect(() => {
    fetchDealsForPortalEnable().catch(() => setAllDeals([]));
  }, []);

  const createPortalForDeal = async () => {
    if (!selectedDealForPortal) return;
    const token = localStorage.getItem("token");
    setCreatingPortal(true);
    try {
      const generatedToken = `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
      const res = await fetch(`${CRM_API_URL}/crm/deals/${selectedDealForPortal}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ portalToken: generatedToken }),
      });
      if (!res.ok) {
        toast.error("Could not enable portal for selected deal");
        return;
      }
      toast.success("Client portal enabled");
      await Promise.all([fetchPortalConsoleRows(), fetchDealsForPortalEnable()]);
      setSelectedDealForPortal("");
    } finally {
      setCreatingPortal(false);
    }
  };

  const trackOpenPortal = async (dealId: string) => {
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/track-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "portal_opened",
      }),
    });
  };

  if (!isAdmin && !hasAccess("clients:read")) {
    return (
      <div className="theme-crm-hubspot rounded-md border border-[var(--border-color)] bg-white p-8">
        <h1 className="text-[18px] font-semibold text-[var(--text-main)]">
          Client Portals
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This page is restricted to admin roles.
        </p>
      </div>
    );
  }

  return (
    <div className="theme-crm-hubspot mx-auto w-full max-w-[1180px] space-y-4 pb-8 md:pb-10">
      <div className="rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[20px] font-semibold text-[var(--text-main)]">
                Client Portals
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                All created portal links and submitted client data across CRM deals.
              </p>
            </div>
            <Link
              href="/client-portals"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--hs-link)] px-3 py-2 text-xs font-semibold text-white hover:bg-[#007a94]"
            >
              <Plus size={13} />
              Portal Console
            </Link>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--surface-dim)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedDealForPortal}
                onChange={(e) => setSelectedDealForPortal(e.target.value)}
                className="h-9 min-w-[260px] rounded-md border border-[var(--border-color)] px-2 text-xs"
              >
                <option value="">Select deal to enable portal</option>
                {portalDisabledDeals.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title} {d.stage ? `(${d.stage})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void createPortalForDeal()}
                disabled={!selectedDealForPortal || creatingPortal}
                className="h-9 rounded-md bg-[var(--hs-link)] px-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {creatingPortal ? "Enabling..." : "Enable Client Portal"}
              </button>
            </div>

            <select
              value={filterDealId}
              onChange={(e) => setFilterDealId(e.target.value)}
              className="h-9 min-w-[260px] rounded-md border border-[var(--border-color)] px-2 text-xs"
            >
              <option value="">Filter by active deal portal (Show All)</option>
              {rows.map((r) => (
                <option key={r.dealId} value={r.dealId}>
                  {r.dealTitle}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading portal records...
            </div>
          ) : error ? (
            <div className="p-10 bg-red-50 border border-red-100 rounded-[var(--radius-md)] text-center">
              <p className="text-sm text-red-600 font-medium">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  fetchPortalConsoleRows();
                }}
                className="mt-3 text-xs font-bold uppercase tracking-wider text-red-700 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No client portal records found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="crm-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>Deal</th>
                    <th>Client</th>
                    <th>Org</th>
                    <th>Needs</th>
                    <th>Inquiries</th>
                    <th>Access</th>
                    <th>Last Inquiry</th>
                    <th>Portal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const portalUrl =
                      typeof window !== "undefined"
                        ? `${String(r.portalDomain || window.location.origin).replace(/\/+$/, "")}/portal/${r.portalToken}`
                        : "";
                    return (
                      <tr key={r.dealId}>
                        <td>
                          <div className="space-y-0.5">
                            <Link
                              href={`/crm/deals/${r.dealId}`}
                              className="crm-list-name hover:underline"
                            >
                              {r.dealTitle}
                            </Link>
                            <p className="crm-list-sub uppercase tracking-wide">
                              {r.dealStage}
                            </p>
                          </div>
                        </td>
                        <td >{r.clientName || "—"}</td>
                        <td >{r.organizationName || "—"}</td>
                        <td >
                          {r.portalNeedsCount} total · {r.openPortalNeedsCount} open
                        </td>
                        <td >{r.inquiriesCount}</td>
                        <td >
                          <div className="text-xs text-[var(--text-muted)]">
                            {r.assignedEmployeesCount || 0} assigned
                          </div>
                          <div className="text-xs text-[var(--primary-muted)] uppercase">
                            {r.myPortalRole || "no access role"}
                          </div>
                        </td>
                        <td >
                          {r.lastInquiryAt
                            ? new Date(r.lastInquiryAt).toLocaleString()
                            : "—"}
                        </td>
                        <td >
                          <a
                            href={portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--hs-link)] hover:underline font-semibold"
                            onClick={() => void trackOpenPortal(r.dealId)}
                          >
                            Open <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {!loading && filteredRows.length > 0 && (
        <div className="space-y-4">
          {filteredRows.map((r) => (
            <PortalManagementCard
              key={`access-${r.dealId}`}
              portal={r}
              portalUsers={portalUsers}
              pmProjects={pmProjects}
              isAdmin={isAdmin}
              onPortalUpdated={fetchPortalConsoleRows}
            />
          ))}
        </div>
      )}
    </div>
  );
}
