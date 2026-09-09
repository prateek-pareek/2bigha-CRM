"use client";

import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, UserCheck, UserX, Clock, Database } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";
import TwoBighaSyncHub from "@/components/crm/platform/TwoBighaSyncHub";

type HrmsCrmUser = {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  designation?: string;
  employmentStatus?: string;
  provisioningStatus?: string;
  hrmsEmployeeId?: string;
  availabilityStatus?: string;
  availabilityAttendanceStatus?: string;
  availabilityDate?: string;
  roleId?: string | { _id: string; name?: string };
  isActive?: boolean;
};

type Role = { _id: string; name: string };

export type PeopleSyncTab = "pending" | "unavailable" | "twobigha";

export function HrmsCrmSyncPanel({
  initialTab = "pending",
  onTabChange,
}: {
  initialTab?: PeopleSyncTab;
  onTabChange?: (tab: PeopleSyncTab) => void;
}) {
  const [tab, setTab] = useState<PeopleSyncTab>(initialTab);
  const [pending, setPending] = useState<HrmsCrmUser[]>([]);
  const [unavailable, setUnavailable] = useState<HrmsCrmUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [roleByUser, setRoleByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const selectTab = (next: PeopleSyncTab) => {
    setTab(next);
    onTabChange?.(next);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u, r] = await Promise.all([
        api.get("/integrations/hrms/pending-users"),
        api.get("/integrations/hrms/unavailable-today"),
        api.get("/crm-users/roles"),
      ]);
      setPending(Array.isArray(p.data) ? p.data : []);
      setUnavailable(Array.isArray(u.data) ? u.data : []);
      setRoles(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to load HRMS sync data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tab === "pending" ? pending : unavailable;

  const grant = async (user: HrmsCrmUser) => {
    const roleId =
      roleByUser[user._id] ||
      (typeof user.roleId === "object" ? user.roleId?._id : user.roleId);
    if (!roleId) {
      toast.error("Select a CRM role before granting access");
      return;
    }
    setGrantingId(user._id);
    try {
      await api.post(`/integrations/hrms/users/${user._id}/grant-access`, {
        roleId,
        activate: true,
      });
      toast.success(`Granted CRM access to ${user.email}`);
      await load();
      // Refresh CRM Team table on the same page
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("crm-users-changed"));
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Grant failed");
    } finally {
      setGrantingId(null);
    }
  };

  const statusBadge = (u: HrmsCrmUser) => {
    const s = u.provisioningStatus || "manual";
    const color =
      s === "pending_access"
        ? "bg-amber-100 text-amber-800"
        : s === "revoked"
          ? "bg-rose-100 text-rose-800"
          : s === "active"
            ? "bg-emerald-100 text-emerald-800"
            : "bg-slate-100 text-slate-700";
    return (
      <span className={clsx("rounded px-2 py-0.5 text-[11px] font-medium", color)}>
        {s.replace(/_/g, " ")}
      </span>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">People & sync</h3>
          <p className="text-xs text-muted-foreground">
            Eligible HRMS employees appear here as pending until a CRM Admin grants a role.
            Ineligible employees are removed from CRM lists automatically when HRMS access changes.
          </p>
        </div>
        {tab !== "twobigha" && (
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === "pending" ? "default" : "outline"}
          onClick={() => selectTab("pending")}
        >
          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          Pending ({pending.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "unavailable" ? "default" : "outline"}
          onClick={() => selectTab("unavailable")}
        >
          <Clock className="mr-1.5 h-3.5 w-3.5" />
          Unavailable today ({unavailable.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "twobigha" ? "default" : "outline"}
          onClick={() => selectTab("twobigha")}
        >
          <Database className="mr-1.5 h-3.5 w-3.5" />
          2bigha platform sync
        </Button>
      </div>

      {tab === "twobigha" ? (
        <div className="pt-1">
          <TwoBighaSyncHub />
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {tab === "pending" ? "No pending HRMS users." : "Everyone available today."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Dept / Designation</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                {tab === "pending" && (
                  <th className="py-2 pr-3 font-medium">CRM role</th>
                )}
                {tab === "unavailable" && (
                  <th className="py-2 pr-3 font-medium">Attendance</th>
                )}
                {tab === "pending" && (
                  <th className="py-2 font-medium">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u._id} className="border-b border-border/60">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                    {u.hrmsEmployeeId && (
                      <div className="text-[11px] text-muted-foreground">
                        ID {u.hrmsEmployeeId}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    <div>{u.department || "—"}</div>
                    <div className="text-muted-foreground">{u.designation || ""}</div>
                  </td>
                  <td className="py-2.5 pr-3">{statusBadge(u)}</td>
                  {tab === "unavailable" && (
                    <td className="py-2.5 pr-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-rose-700">
                        <UserX className="h-3.5 w-3.5" />
                        {u.availabilityAttendanceStatus || "Unavailable"}
                      </span>
                      <div className="text-muted-foreground">{u.availabilityDate}</div>
                    </td>
                  )}
                  {tab === "pending" && (
                    <>
                      <td className="py-2.5 pr-3">
                        <select
                          className="h-8 rounded border border-border bg-background px-2 text-xs"
                          value={
                            roleByUser[u._id] ||
                            (typeof u.roleId === "object"
                              ? u.roleId?._id
                              : u.roleId) ||
                            ""
                          }
                          onChange={(e) =>
                            setRoleByUser((prev) => ({
                              ...prev,
                              [u._id]: e.target.value,
                            }))
                          }
                          disabled={false}
                        >
                          <option value="">Select role…</option>
                          {roles.map((r) => (
                            <option key={r._id} value={r._id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5">
                        <Button
                          size="sm"
                          onClick={() => grant(u)}
                          disabled={grantingId === u._id}
                        >
                          {grantingId === u._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Grant access"
                          )}
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
