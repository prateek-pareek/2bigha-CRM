"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/crm/config";
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";

export interface GrantAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  waId: string;
  onSuccess: () => void;
  leadOwner?: string;
  currentAssignee?: { _id: string; name: string; email?: string; accessType?: "read" | "read_write" };
  temporaryGrants?: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    accessType: "read" | "read_write";
    expiresAt: string;
  }>;
}

export default function GrantAccessModal({
  isOpen,
  onClose,
  waId,
  onSuccess,
  leadOwner,
  currentAssignee,
  temporaryGrants = [],
}: GrantAccessModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [grantType, setGrantType] = useState<"temporary" | "permanent">("temporary");
  const [accessType, setAccessType] = useState<"read" | "read_write">("read");
  const [duration, setDuration] = useState("60"); // 1 hour default
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const fetchUsers = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    void fetchUsers();
  }, [isOpen]);

  const handleUnassign = async () => {
    if (!confirm("Are you sure you want to remove the permanent assignment for this contact?")) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp-links/${encodeURIComponent(waId)}/assign`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Assignment removed successfully");
        onSuccess();
        onClose();
      } else {
        toast.error("Failed to remove assignment");
      }
    } catch {
      toast.error("Failed to remove assignment");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeGrant = async (targetUserId: string) => {
    if (!confirm("Are you sure you want to revoke this temporary access grant?")) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/whatsapp/revoke-temporary-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          waId,
          targetUserId,
        }),
      });
      if (res.ok) {
        toast.success("Temporary access revoked successfully");
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to revoke access");
      }
    } catch {
      toast.error("Failed to revoke access");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      let res;
      if (grantType === "temporary") {
        res = await fetch(`${CRM_API_URL}/crm/whatsapp/grant-temporary-access`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            waId,
            targetUserId: selectedUserId,
            accessType,
            durationMinutes: parseInt(duration, 10),
          }),
        });
      } else {
        res = await fetch(`${CRM_API_URL}/crm/whatsapp-links/${encodeURIComponent(waId)}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            assigneeId: selectedUserId,
            accessType,
          }),
        });
      }

      if (res.ok) {
        toast.success(
          grantType === "temporary"
            ? "Temporary access granted successfully"
            : "Permanent assignment set successfully"
        );
        onSuccess();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to update access");
      }
    } catch {
      toast.error("Failed to update access");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const activeGrants = (temporaryGrants || []).filter(
    (g) => new Date(g.expiresAt).getTime() > Date.now()
  );

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-border bg-white p-5 shadow-2xl">
        <h3 className="text-sm font-bold text-text-main">Manage Access & Assignment</h3>
        <p className="mt-1 text-xs text-text-muted">
          Configure temporary access grants or set the permanent assigned agent with permissions.
        </p>

        {/* Users with Access to Chat */}
        <div className="mt-3 space-y-1.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Users with Access to this Chat
          </label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 p-2">
            {/* 1. Lead Owner */}
            {leadOwner && (
              <div className="flex items-center justify-between rounded-md bg-white border border-blue-100 p-2 text-xs shadow-xs">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>{leadOwner}</span>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                      Lead Owner
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Full Access (Primary Owner)</p>
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Active
                </span>
              </div>
            )}

            {/* 2. Permanent Assignee */}
            {currentAssignee && (
              <div className="flex items-center justify-between rounded-md bg-white border border-emerald-100 p-2 text-xs shadow-xs">
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>{currentAssignee.name}</span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      Assigned Agent
                    </span>
                    <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {currentAssignee.accessType === "read" ? "Read Only" : "Read & Send"}
                    </span>
                  </div>
                  {currentAssignee.email && (
                    <p className="text-[10px] text-slate-500 mt-0.5">{currentAssignee.email}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleUnassign}
                  disabled={loading}
                  className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}

            {/* 3. Temporary Access Grants */}
            {activeGrants.map((g) => {
              const remainingMinutes = Math.max(
                0,
                Math.round((new Date(g.expiresAt).getTime() - Date.now()) / 60000)
              );
              const remainingText =
                remainingMinutes > 60
                  ? `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m`
                  : `${remainingMinutes}m`;
              return (
                <div
                  key={g.userId}
                  className="flex items-center justify-between rounded-md bg-amber-50/80 border border-amber-200/80 p-2 text-xs shadow-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <span>{g.userName || g.userEmail || "Agent"}</span>
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                        Temp Access ({g.accessType === "read_write" ? "Read & Send" : "Read Only"})
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-800 mt-0.5">Expires in {remainingText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeGrant(g.userId)}
                    disabled={loading}
                    className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50 ml-2"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}

            {!leadOwner && !currentAssignee && activeGrants.length === 0 && (
              <p className="text-xs text-slate-500 italic p-1 text-center">
                No specific user assignments or temporary grants for this chat yet.
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Assignment Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGrantType("temporary")}
                className={cn(
                  "py-1.5 rounded-md text-xs font-semibold border text-center transition",
                  grantType === "temporary"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold"
                    : "bg-white border-border text-text-muted hover:bg-slate-50"
                )}
              >
                Temporary Grant
              </button>
              <button
                type="button"
                onClick={() => setGrantType("permanent")}
                className={cn(
                  "py-1.5 rounded-md text-xs font-semibold border text-center transition",
                  grantType === "permanent"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold"
                    : "bg-white border-border text-text-muted hover:bg-slate-50"
                )}
              >
                Permanent Owner
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Select Agent</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
            >
              <option value="">-- Choose Agent --</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName || ""} {u.lastName || ""} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">Access Type</label>
            <select
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as any)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
            >
              <option value="read">Read Only</option>
              <option value="read_write">Read and Send</option>
            </select>
          </div>

          {grantType === "temporary" && (
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary text-text-main"
              >
                <option value="60">1 Hour</option>
                <option value="240">4 Hours</option>
                <option value="1440">24 Hours</option>
                <option value="10080">7 Days</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <CrmButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </CrmButton>
            <CrmButton type="submit" disabled={loading}>
              {loading ? "Saving..." : grantType === "temporary" ? "Grant Access" : "Assign Owner"}
            </CrmButton>
          </div>
        </form>
      </div>
    </div>
  );
}
