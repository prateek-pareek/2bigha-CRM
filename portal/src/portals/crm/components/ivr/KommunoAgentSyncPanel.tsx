"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Phone, Clock, Shield } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { CrmButton } from "@/components/crm/ui";
import { cn } from "@/lib/utils";

type CRMUserRow = {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  kommunoAgentId?: string;
  kommunoSyncStatus?: "not_synced" | "synced" | "failed" | "skipped";
  kommunoSyncError?: string;
  kommunoSyncedAt?: string;
  agentMobile?: string;
  agentInTime?: string;
  agentOutTime?: string;
  agentOutPermission?: boolean;
  agentMasking?: boolean;
};

export default function KommunoAgentSyncPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<CRMUserRow[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Local editing states per user row
  const [editedFields, setEditedFields] = useState<Record<string, Partial<CRMUserRow>>>({});

  const loadUsers = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm-users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        toast.error("Failed to load CRM users");
        return;
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load CRM users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleFieldChange = (userId: string, field: keyof CRMUserRow, value: any) => {
    setEditedFields((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }));
  };

  const getFieldValue = (user: CRMUserRow, field: keyof CRMUserRow): any => {
    if (editedFields[user._id] && editedFields[user._id][field] !== undefined) {
      return editedFields[user._id][field];
    }
    return user[field];
  };

  const saveConfig = async (user: CRMUserRow) => {
    const changes = editedFields[user._id] || {};
    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save");
      return;
    }

    setSavingId(user._id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm-users/${user._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...changes,
          bypassKommunoSync: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Failed to update agent configuration");
        return;
      }

      toast.success("Agent configuration saved locally");
      // Update local row in users array
      setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, ...data } : u)));
      // Clear edited state for this user
      setEditedFields((prev) => {
        const next = { ...prev };
        delete next[user._id];
        return next;
      });
    } catch {
      toast.error("Failed to save agent configuration");
    } finally {
      setSavingId(null);
    }
  };

  const triggerSync = async (user: CRMUserRow) => {
    // First, save any pending changes if there are any
    if (editedFields[user._id]) {
      await saveConfig(user);
    }

    setSyncingId(user._id);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm-users/${user._id}/kommuno-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Kommuno sync failed");
        return;
      }

      if (data.kommunoSyncStatus === "synced") {
        toast.success(`Synced successfully. Kommuno Agent ID: ${data.kommunoAgentId}`);
      } else {
        toast.error(data.kommunoSyncError || "Kommuno sync failed");
      }

      // Update state
      setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, ...data } : u)));
    } catch {
      toast.error("Failed to communicate with Kommuno agent endpoint");
    } finally {
      setSyncingId(null);
    }
  };

  const statusBadge = (status?: string, err?: string) => {
    switch (status) {
      case "synced":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Synced
          </span>
        );
      case "failed":
        return (
          <span 
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200 cursor-help"
            title={err || "Sync failed"}
          >
            <XCircle size={12} /> Failed
          </span>
        );
      case "skipped":
        return (
          <span 
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 cursor-help"
            title={err || "Kommuno is not configured in backend env"}
          >
            <AlertCircle size={12} /> Bypassed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 border border-slate-200">
            <AlertCircle size={12} /> Not Synced
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
        <Loader2 size={16} className="animate-spin text-emerald-600" /> Loading CRM users…
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Phone size={15} className="text-emerald-600" /> Kommuno Agent Management
        </h3>
        <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
          Outbound and outbound bridged calls via Kommuno require the CRM users (agents) to be pre-registered on your Kommuno dashboard. 
          Configure agent shift hours, masking, and call permissions, then synchronize them with Kommuno.
        </p>
      </div>

      <div className="overflow-x-auto border border-slate-100 rounded-lg shadow-inner">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Kommuno Agent ID</th>
              <th className="px-4 py-3">Registered Mobile</th>
              <th className="px-4 py-3">Shift Hours (24h)</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Sync Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const hasChanges = Object.keys(editedFields[u._id] || {}).length > 0;
              const agentIdVal = getFieldValue(u, "kommunoAgentId") || "";
              const mobileVal = getFieldValue(u, "agentMobile") || "";
              const inTimeVal = getFieldValue(u, "agentInTime") || "09:00";
              const outTimeVal = getFieldValue(u, "agentOutTime") || "18:00";
              const outPermVal = !!getFieldValue(u, "agentOutPermission");
              const maskingVal = !!getFieldValue(u, "agentMasking");

              return (
                <tr key={u._id} className="hover:bg-slate-50/55 transition duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-slate-800 leading-tight">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0]}
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{u.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      value={agentIdVal}
                      onChange={(e) => handleFieldChange(u._id, "kommunoAgentId", e.target.value)}
                      placeholder="e.g. 3706"
                      className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition font-mono font-bold"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      value={mobileVal}
                      onChange={(e) => handleFieldChange(u._id, "agentMobile", e.target.value)}
                      placeholder="e.g. +919876543210"
                      className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={inTimeVal}
                        onChange={(e) => handleFieldChange(u._id, "agentInTime", e.target.value)}
                        placeholder="09:00"
                        className="h-8 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-center outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition"
                      />
                      <span className="text-slate-400 font-semibold">-</span>
                      <input
                        type="text"
                        value={outTimeVal}
                        onChange={(e) => handleFieldChange(u._id, "agentOutTime", e.target.value)}
                        placeholder="18:00"
                        className="h-8 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-center outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 space-y-1.5">
                    <label className="flex items-center gap-1.5 font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={outPermVal}
                        onChange={(e) => handleFieldChange(u._id, "agentOutPermission", e.target.checked)}
                        className="rounded border-slate-200"
                      />
                      Outgoing Perm
                    </label>
                    <label className="flex items-center gap-1.5 font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={maskingVal}
                        onChange={(e) => handleFieldChange(u._id, "agentMasking", e.target.checked)}
                        className="rounded border-slate-200"
                      />
                      Mask Customer No.
                    </label>
                  </td>
                  <td className="px-4 py-3.5">
                    {statusBadge(u.kommunoSyncStatus, u.kommunoSyncError)}
                    {u.kommunoSyncedAt && (
                      <p className="text-[9px] text-slate-400 font-semibold mt-1">
                        {new Date(u.kommunoSyncedAt).toLocaleDateString()}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right space-y-1.5">
                    <div className="flex justify-end gap-1.5">
                      {hasChanges && (
                        <CrmButton
                          variant="secondary"
                          disabled={savingId === u._id}
                          onClick={() => void saveConfig(u)}
                          className="h-8 px-2 font-bold border-slate-200 shadow-sm"
                        >
                          {savingId === u._id ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                        </CrmButton>
                      )}
                      <CrmButton
                        variant="primary"
                        disabled={syncingId === u._id}
                        onClick={() => void triggerSync(u)}
                        className="h-8 px-2.5 font-bold bg-emerald-600 hover:bg-emerald-700 shadow-sm gap-1"
                      >
                        {syncingId === u._id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={11} />
                        )}
                        Sync
                      </CrmButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
