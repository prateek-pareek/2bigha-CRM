"use client";

import { useRealtime } from "@/hooks/pm/use-realtime";
import { CRM_API_URL } from "@/lib/api/config";
import { cn } from "@/lib/utils";
import {
  Download,
  Eye,
  FileText,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

type AssignmentRow = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  role: "viewer" | "manager" | "portal_admin";
  active: boolean;
  grantedAt: string | null;
};

type AccessLogRow = {
  _id: string;
  employeeId: string;
  employeeName: string;
  action: string;
  createdAt: string | null;
};

type PortalUpdateRow = {
  _id: string;
  title: string;
  body: string;
  cadence: "daily" | "weekly" | "general";
  createdAt: string | null;
  createdByName?: string;
};

interface PortalManagementCardProps {
  portal: ClientPortalRow;
  portalUsers: CrmPortalUser[];
  pmProjects: { _id: string; name: string; key: string }[];
  isAdmin: boolean;
  onPortalUpdated: () => Promise<void>;
}

const PORTAL_DOMAIN_OPTIONS = ["https://mathionix.com", "https://prateekpareek.com"];

export default function PortalManagementCard({
  portal,
  portalUsers,
  pmProjects,
  isAdmin,
  onPortalUpdated,
}: PortalManagementCardProps) {
  const dealId = portal.dealId;
  const canAssign = isAdmin || portal.myPortalRole === "portal_admin";

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "requirements" | "settings" | "access" | "chat"
  >("requirements");

  // Local config states
  const [scope, setScope] = useState(portal.portalScopeSummary || "");
  const [domain, setDomain] = useState(portal.portalDomain || "");
  const [pmId, setPmId] = useState(portal.portalPmProjectId || "");
  const [googleLogin, setGoogleLogin] = useState(
    portal.portalGoogleLoginEnabled || false,
  );
  const [portalPassword, setPortalPassword] = useState("");
  const [portalPasswordEnabled, setPortalPasswordEnabled] = useState(
    portal.portalHasPassword || false,
  );
  const [saving, setSaving] = useState(false);

  // Array states
  const [docs, setDocs] = useState<ClientPortalRow["portalDocuments"]>(
    portal.portalDocuments || [],
  );
  const [milestones, setMilestones] = useState<ClientPortalRow["portalMilestones"]>(
    portal.portalMilestones || [],
  );
  const [deadlines, setDeadlines] = useState<ClientPortalRow["portalDeadlines"]>(
    portal.portalDeadlines || [],
  );

  // Assignments & Logs states
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedRole, setSelectedRole] = useState<"viewer" | "manager" | "portal_admin">(
    "manager",
  );

  // Requirements / Needs states
  const [needs, setNeeds] = useState<ClientPortalNeed[]>([]);
  const [loadingNeeds, setLoadingNeeds] = useState(false);
  const [newNeedCategory, setNewNeedCategory] = useState("document");
  const [newNeedTitle, setNewNeedTitle] = useState("");
  const [newNeedDesc, setNewNeedDesc] = useState("");
  const [newNeedDueDate, setNewNeedDueDate] = useState("");

  // Updates states
  const [updates, setUpdates] = useState<PortalUpdateRow[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [updateTitle, setUpdateTitle] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const [updateCadence, setUpdateCadence] = useState<"daily" | "weekly" | "general">(
    "general",
  );
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  // Initial Fetches
  const fetchAssignments = async () => {
    const token = localStorage.getItem("token");
    setLoadingAssignments(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : [];
      setAssignments(Array.isArray(data) ? data : []);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const fetchLogs = async () => {
    const token = localStorage.getItem("token");
    setLoadingLogs(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/client-portals/${dealId}/access-logs?limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = res.ok ? await res.json() : [];
      setLogs(Array.isArray(data) ? data : []);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchNeeds = async () => {
    const token = localStorage.getItem("token");
    setLoadingNeeds(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}/portal-needs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.ok ? await res.json() : [];
      setNeeds(Array.isArray(data) ? data : []);
    } finally {
      setLoadingNeeds(false);
    }
  };

  const fetchUpdates = async () => {
    const token = localStorage.getItem("token");
    setLoadingUpdates(true);
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/client-portals/${dealId}/updates?limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = res.ok ? await res.json() : [];
      setUpdates(Array.isArray(data) ? data : []);
    } finally {
      setLoadingUpdates(false);
    }
  };

  useEffect(() => {
    void fetchAssignments();
    void fetchLogs();
    void fetchNeeds();
    void fetchUpdates();
  }, [dealId]);

  // Sync props to state if they change
  useEffect(() => {
    setDocs(portal.portalDocuments || []);
    setMilestones(portal.portalMilestones || []);
    setDeadlines(portal.portalDeadlines || []);
    setScope(portal.portalScopeSummary || "");
    setDomain(portal.portalDomain || "");
    setPmId(portal.portalPmProjectId || "");
    setGoogleLogin(portal.portalGoogleLoginEnabled || false);
    setPortalPasswordEnabled(portal.portalHasPassword || false);
  }, [portal]);

  const randomPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let out = "";
    for (let i = 0; i < 14; i += 1)
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    setPortalPassword(out);
  };

  // Actions
  const handleSaveConfig = async (scopeOnly = false, removePass = false) => {
    const token = localStorage.getItem("token");
    setSaving(true);
    try {
      let patch: Record<string, any> = {};
      if (scopeOnly) {
        patch = { portalScopeSummary: scope };
      } else if (removePass) {
        patch = { portalPassword: null };
      } else {
        const rawDomain = String(domain || "").trim();
        const formattedDomain = rawDomain
          ? rawDomain.startsWith("http://") || rawDomain.startsWith("https://")
            ? rawDomain
            : `https://${rawDomain}`
          : null;

        patch = {
          portalDomain: formattedDomain,
          portalPmProjectId: pmId || null,
          portalScopeSummary: scope,
          portalGoogleLoginEnabled: Boolean(googleLogin),
          portalPassword: portalPassword || undefined,
          portalDocuments: docs,
          portalMilestones: milestones,
          portalDeadlines: deadlines,
        };
      }

      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        toast.error("Could not save portal settings");
        return;
      }

      toast.success("Portal settings updated");
      if (!scopeOnly && !removePass && portalPassword) {
        setPortalPassword("");
        setPortalPasswordEnabled(true);
      }
      if (removePass) {
        setPortalPassword("");
        setPortalPasswordEnabled(false);
      }
      await onPortalUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleAssignEmployee = async () => {
    if (!selectedEmployee) return;
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        employeeId: selectedEmployee,
        role: selectedRole,
      }),
    });
    setSelectedEmployee("");
    await Promise.all([fetchAssignments(), fetchLogs()]);
  };

  const handleRevokeEmployee = async (employeeId: string) => {
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/access/${employeeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await Promise.all([fetchAssignments(), fetchLogs()]);
  };

  // Needs handlers
  const handleAddNeed = async () => {
    if (!newNeedTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}/portal-needs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: newNeedCategory,
          title: newNeedTitle.trim(),
          description: newNeedDesc.trim() || undefined,
          dueDate: newNeedDueDate || undefined,
        }),
      });
      if (res.ok) {
        toast.success("Request added");
        setNewNeedTitle("");
        setNewNeedDesc("");
        setNewNeedDueDate("");
        await fetchNeeds();
      } else {
        toast.error("Failed to add request");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  const handlePatchNeed = async (needId: string, patch: Record<string, any>) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/portal-needs/${needId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await fetchNeeds();
      } else {
        toast.error("Failed to update request");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveNeed = async (needId: string) => {
    if (!confirm("Are you sure you want to remove this request?")) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/portal-needs/${needId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Removed");
        await fetchNeeds();
      } else {
        toast.error("Failed to remove request");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Documents
  const addDoc = () =>
    setDocs((p) => [
      ...p,
      {
        name: "",
        url: "",
        type: "admin_provided",
        createdAt: new Date().toISOString(),
      },
    ]);
  const updateDoc = (idx: number, key: string, val: string) =>
    setDocs((p) => {
      const arr = [...p];
      arr[idx] = { ...arr[idx], [key]: val };
      return arr;
    });
  const removeDoc = (idx: number) => setDocs((p) => p.filter((_, i) => i !== idx));

  // Milestones
  const addMilestone = () =>
    setMilestones((p) => [...p, { label: "", status: "pending", percentage: 0 }]);
  const updateMilestone = (idx: number, key: string, val: string | number) =>
    setMilestones((p) => {
      const arr = [...p];
      arr[idx] = { ...arr[idx], [key]: val };
      return arr;
    });
  const removeMilestone = (idx: number) =>
    setMilestones((p) => p.filter((_, i) => i !== idx));

  // Deadlines
  const addDeadline = () => setDeadlines((p) => [...p, { label: "", date: "" }]);
  const updateDeadline = (idx: number, key: string, val: string) =>
    setDeadlines((p) => {
      const arr = [...p];
      arr[idx] = { ...arr[idx], [key]: val };
      return arr;
    });
  const removeDeadline = (idx: number) =>
    setDeadlines((p) => p.filter((_, i) => i !== idx));

  // Updates
  const handlePostUpdate = async () => {
    const title = updateTitle.trim();
    const body = updateBody.trim();
    if (!title || !body) return;
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, body, cadence: updateCadence }),
    });
    setUpdateTitle("");
    setUpdateBody("");
    await fetchUpdates();
  };

  const handlePostDailyUpdateQuick = async () => {
    const body = updateBody.trim();
    if (!body) {
      toast.error("Write update content first, then use Post Daily Update.");
      return;
    }
    const dateLabel = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const title = updateTitle.trim() || `Daily Update - ${dateLabel}`;
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, body, cadence: "daily" }),
    });
    setUpdateTitle("");
    setUpdateBody("");
    setUpdateCadence("daily");
    toast.success("Daily update posted");
    await fetchUpdates();
  };

  const handleGenerateDailyDraftFromTickets = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(
      `${CRM_API_URL}/crm/client-portals/${dealId}/updates/auto-draft?lookbackHours=24`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      toast.error("Could not generate draft from ticket movement");
      return;
    }
    const draft = await res.json();
    setUpdateTitle(String(draft?.title || ""));
    setUpdateBody(String(draft?.body || ""));
    setUpdateCadence((draft?.cadence || "daily") as any);
    toast.success("Daily draft generated from ticket movement");
  };

  const handleDraftUpdateWithAi = async () => {
    const token = localStorage.getItem("token");
    setAiDrafting(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/ai/draft-client-portal-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dealId,
          cadence: updateCadence,
          instructions: aiInstructions.trim() || undefined,
          lookbackHours: 24,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Could not generate AI draft");
        return;
      }
      setUpdateTitle(String(data?.title || ""));
      setUpdateBody(String(data?.body || ""));
      setUpdateCadence(data?.cadence || updateCadence);
      toast.success("AI draft generated");
    } finally {
      setAiDrafting(false);
    }
  };

  const handleRemoveUpdate = async (updateId: string) => {
    const token = localStorage.getItem("token");
    await fetch(`${CRM_API_URL}/crm/client-portals/${dealId}/updates/${updateId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchUpdates();
  };

  return (
    <div className="rounded border border-[#dfe1e6] bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Jira style Header */}
      <div className="px-4 py-3 bg-[#fafbfc] border-b border-[#dfe1e6] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#172b4d] tracking-tight">
            {portal.dealTitle}
          </h2>
          <p className="text-xs text-[#5e6c84] font-medium mt-0.5">
            Client: {portal.clientName || "—"} &middot; Organization:{" "}
            {portal.organizationName || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 bg-[#f4f5f7] hover:bg-[#ebecf0] text-[#344563] text-xs font-semibold px-2.5 py-1.5 rounded transition"
            onClick={async () => {
              await Promise.all([
                fetchAssignments(),
                fetchLogs(),
                fetchNeeds(),
                fetchUpdates(),
              ]);
              toast.success("Sync completed");
            }}
          >
            <RefreshCw size={12} /> Sync
          </button>
        </div>
      </div>

      {/* Jira Style Tab Bar */}
      <div className="px-4 bg-white border-b border-[#dfe1e6] flex gap-4 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("requirements")}
          className={cn(
            "py-2 px-1 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 outline-none whitespace-nowrap",
            activeTab === "requirements"
              ? "border-[#0052cc] text-[#0052cc]"
              : "border-transparent text-[#5e6c84] hover:text-[#172b4d]",
          )}
        >
          <Eye size={13} /> Scope & Requirements
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "py-2 px-1 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 outline-none whitespace-nowrap",
            activeTab === "settings"
              ? "border-[#0052cc] text-[#0052cc]"
              : "border-transparent text-[#5e6c84] hover:text-[#172b4d]",
          )}
        >
          <Settings size={13} /> Settings & Security
        </button>
        <button
          onClick={() => setActiveTab("access")}
          className={cn(
            "py-2 px-1 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 outline-none whitespace-nowrap",
            activeTab === "access"
              ? "border-[#0052cc] text-[#0052cc]"
              : "border-transparent text-[#5e6c84] hover:text-[#172b4d]",
          )}
        >
          <Users size={13} /> Access Controls
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={cn(
            "py-2 px-1 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 outline-none whitespace-nowrap",
            activeTab === "chat"
              ? "border-[#0052cc] text-[#0052cc]"
              : "border-transparent text-[#5e6c84] hover:text-[#172b4d]",
          )}
        >
          <MessageSquare size={13} /> Chat & Feed Updates
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-4 flex-1">
        {/* Tab 1: Scope, Requirements, Documents & Milestones */}
        {activeTab === "requirements" && (
          <div className="space-y-6">
            {/* 1. Requirements & Document Requests */}
            <div>
              <h3 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-2">
                📋 Client Upload Requirements
              </h3>

              {/* Requirement Addition Form */}
              {isAdmin && (
                <div className="bg-[#f4f5f7] border border-[#dfe1e6] rounded p-3 mb-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={newNeedCategory}
                      onChange={(e) => setNewNeedCategory(e.target.value)}
                      className="h-8 rounded border border-[#dfe1e6] px-2 text-xs bg-white focus:border-[#0052cc] outline-none"
                    >
                      <option value="document">📄 Document</option>
                      <option value="asset">📦 Asset / File</option>
                      <option value="credential">🔑 Credential</option>
                      <option value="access">🌐 Access / Env</option>
                      <option value="other">❓ Other</option>
                    </select>
                    <input
                      value={newNeedTitle}
                      onChange={(e) => setNewNeedTitle(e.target.value)}
                      placeholder="Requirement name (e.g. GST Certificate)"
                      className="h-8 flex-1 min-w-[200px] rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                    />
                    <input
                      type="date"
                      value={newNeedDueDate}
                      onChange={(e) => setNewNeedDueDate(e.target.value)}
                      className="h-8 w-[140px] rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddNeed}
                      className="h-8 px-3 rounded bg-[#0052cc] text-white text-xs font-semibold hover:bg-[#0065ff] transition"
                    >
                      Request
                    </button>
                  </div>
                  <input
                    value={newNeedDesc}
                    onChange={(e) => setNewNeedDesc(e.target.value)}
                    placeholder="Provide additional instructions or details (optional)"
                    className="h-8 w-full rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                  />
                </div>
              )}

              {/* Requirements List */}
              {loadingNeeds ? (
                <div className="text-xs text-[#5e6c84] py-2">Loading requirements...</div>
              ) : needs.length === 0 ? (
                <div className="text-xs text-[#5e6c84] italic py-2">
                  No pending requests for this client.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {needs.map((n) => (
                    <div
                      key={n._id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-[#fafbfc] border border-[#dfe1e6] rounded p-2.5 shadow-sm hover:bg-[#f4f5f7] transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold uppercase text-[#42526e]">
                            {n.category}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-[9px] font-bold uppercase",
                              n.status === "received"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800",
                            )}
                          >
                            {n.status}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#172b4d]">{n.title}</p>
                        {n.description && (
                          <p className="text-[11px] text-[#5e6c84] mt-0.5">
                            {n.description}
                          </p>
                        )}
                        {n.dueDate && (
                          <p className="text-[10px] text-[#5e6c84] font-medium mt-0.5">
                            Due: {new Date(n.dueDate).toLocaleDateString()}
                          </p>
                        )}
                        {n.satisfiedDocUrl && (
                          <div className="mt-1 text-[11px]">
                            <span className="font-semibold text-[#5e6c84]">Doc: </span>
                            <a
                              href={n.satisfiedDocUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#0052cc] hover:underline"
                            >
                              View uploaded file
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={n.status}
                          onChange={(e) =>
                            handlePatchNeed(n._id, { status: e.target.value })
                          }
                          className="h-8 rounded border border-[#dfe1e6] px-2 text-xs bg-white focus:border-[#0052cc] outline-none"
                        >
                          <option value="open">Open</option>
                          <option value="received">Received</option>
                          <option value="not_needed">Not Needed</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveNeed(n._id)}
                          className="h-8 px-2.5 rounded bg-[#ffebe6] text-[#de350b] hover:bg-[#ffbdad] text-xs font-semibold transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Documents Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider">
                  📄 Attachments & Resources
                </h3>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={addDoc}
                    className="text-[#0052cc] text-xs font-bold hover:underline flex items-center gap-0.5"
                  >
                    <Plus size={12} /> Add File
                  </button>
                )}
              </div>

              {docs.length === 0 ? (
                <div className="text-xs text-[#5e6c84] italic py-2">
                  No documents shared with client yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {docs.map((doc, idx) => (
                    <div
                      key={`doc-${idx}`}
                      className="group relative bg-[#ffffff] border border-[#dfe1e6] rounded p-3.5 hover:shadow-sm hover:border-[#b3bac5] transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div
                            className={cn(
                              "p-2 rounded shrink-0",
                              doc.type === "admin_provided"
                                ? "bg-[#deebff] text-[#0747a6]"
                                : "bg-[#e3fcef] text-[#006644]",
                            )}
                          >
                            <FileText size={18} />
                          </div>
                          <div className="overflow-hidden min-w-0">
                            <input
                              value={doc.name}
                              onChange={(e) => updateDoc(idx, "name", e.target.value)}
                              placeholder="Attachment Name"
                              className="block w-full bg-transparent border-none p-0 text-xs font-semibold text-[#172b4d] focus:ring-0 outline-none truncate"
                            />
                            <p className="text-[9px] text-[#5e6c84] font-bold uppercase tracking-wider mt-0.5">
                              {doc.type === "admin_provided"
                                ? "ADMIN SHARED"
                                : "CLIENT UPLOADED"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-[#5e6c84] hover:text-[#0052cc]"
                            >
                              <Download size={14} />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* File URL Input */}
                      <div className="mt-3 pt-2 border-t border-[#f4f5f7] flex items-center justify-between gap-2">
                        <div className="flex-1 flex items-center gap-1.5 bg-[#f4f5f7] rounded px-2 py-1 text-xs">
                          <LinkIcon size={12} className="text-[#8993a4]" />
                          <input
                            value={doc.url}
                            onChange={(e) => updateDoc(idx, "url", e.target.value)}
                            placeholder="URL Link to document..."
                            className="w-full bg-transparent border-none p-0 text-xs text-[#42526e] focus:ring-0 outline-none truncate"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDoc(idx)}
                          className="p-1 rounded text-[#5e6c84] hover:text-red-600 hover:bg-[#ffebe6] transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Milestones & Deadlines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Milestones */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider">
                    🏁 Project Milestones
                  </h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={addMilestone}
                      className="text-[#0052cc] text-xs font-bold hover:underline"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {milestones.length === 0 ? (
                  <div className="text-xs text-[#5e6c84] italic">
                    No milestones defined.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {milestones.map((m, idx) => (
                      <div
                        key={`ms-${idx}`}
                        className="flex items-center gap-1.5 bg-[#fafbfc] border border-[#dfe1e6] rounded p-2"
                      >
                        <input
                          value={m.label}
                          onChange={(e) => updateMilestone(idx, "label", e.target.value)}
                          placeholder="Milestone title..."
                          className="h-8 flex-1 min-w-[120px] rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                        />
                        <select
                          value={m.status}
                          onChange={(e) => updateMilestone(idx, "status", e.target.value)}
                          className="h-8 rounded border border-[#dfe1e6] px-2 text-xs bg-white cursor-pointer"
                        >
                          <option value="pending">Pending</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={m.percentage}
                            onChange={(e) =>
                              updateMilestone(idx, "percentage", Number(e.target.value))
                            }
                            className="h-8 w-[50px] rounded border border-[#dfe1e6] px-1 text-xs text-center focus:border-[#0052cc] outline-none"
                          />
                          <span className="text-xs text-[#5e6c84] font-medium">%</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMilestone(idx)}
                          className="text-red-500 p-1 hover:bg-[#ffebe6] rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deadlines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider">
                    📅 Key Deadlines
                  </h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={addDeadline}
                      className="text-[#0052cc] text-xs font-bold hover:underline"
                    >
                      + Add
                    </button>
                  )}
                </div>
                {deadlines.length === 0 ? (
                  <div className="text-xs text-[#5e6c84] italic">No deadlines set.</div>
                ) : (
                  <div className="space-y-1.5">
                    {deadlines.map((d, idx) => (
                      <div
                        key={`dl-${idx}`}
                        className="flex items-center gap-1.5 bg-[#fafbfc] border border-[#dfe1e6] rounded p-2"
                      >
                        <input
                          value={d.label}
                          onChange={(e) => updateDeadline(idx, "label", e.target.value)}
                          placeholder="Deadline label..."
                          className="h-8 flex-1 min-w-[120px] rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                        />
                        <input
                          type="date"
                          value={
                            d.date ? new Date(d.date).toISOString().split("T")[0] : ""
                          }
                          onChange={(e) => updateDeadline(idx, "date", e.target.value)}
                          className="h-8 w-[130px] rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeDeadline(idx)}
                          className="text-red-500 p-1 hover:bg-[#ffebe6] rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Save Buttons */}
            {isAdmin && (
              <div className="pt-2 border-t border-[#f4f5f7] flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveConfig(false)}
                  className="bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-60 transition"
                >
                  {saving ? "Saving Requirements..." : "Save Requirements & Files"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Settings & Security */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-1.5">
                  Domain Mapping
                </label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="h-9 w-full rounded border border-[#dfe1e6] px-2.5 text-xs bg-white focus:border-[#0052cc] outline-none"
                >
                  <option value="">Use system default domain</option>
                  {PORTAL_DOMAIN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-1.5">
                  Linked PM board (Backlog Issues)
                </label>
                <select
                  value={pmId}
                  onChange={(e) => setPmId(e.target.value)}
                  className="h-9 w-full rounded border border-[#dfe1e6] px-2.5 text-xs bg-white focus:border-[#0052cc] outline-none"
                >
                  <option value="">No Project board linked</option>
                  {pmProjects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.key})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#5e6c84] leading-relaxed mt-1">
                  Connect issues created by client on the portal to this project board.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-1.5">
                Scope Summary
              </label>
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="Write a clear statement of work / scope outline to be visible on the client's home dashboard portal..."
                className="w-full min-h-[90px] rounded border border-[#dfe1e6] p-2.5 text-xs focus:border-[#0052cc] outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#f4f5f7]">
              <div>
                <label className="block text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-1.5">
                  Google Workspace Login
                </label>
                <div className="flex items-center justify-between border border-[#dfe1e6] rounded p-2.5 bg-[#fafbfc]">
                  <span className="text-xs text-[#172b4d] font-medium">
                    Require Google Auth
                  </span>
                  <button
                    type="button"
                    onClick={() => setGoogleLogin(!googleLogin)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-bold transition",
                      googleLogin
                        ? "bg-[#e3fcef] text-[#006644]"
                        : "bg-[#f4f5f7] text-[#42526e]",
                    )}
                  >
                    {googleLogin ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-1.5">
                  Portal Password Settings
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder={
                      portalPasswordEnabled
                        ? "Password active (type to override)"
                        : "Set security password"
                    }
                    className="h-9 flex-1 rounded border border-[#dfe1e6] px-2.5 text-xs focus:border-[#0052cc] outline-none"
                  />
                  <button
                    type="button"
                    onClick={randomPassword}
                    className="h-9 px-2.5 rounded border border-[#dfe1e6] bg-[#f4f5f7] hover:bg-[#ebecf0] text-[#344563] text-xs font-semibold transition"
                  >
                    Generate
                  </button>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-[#f4f5f7] flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveConfig(false)}
                  className="bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-60 transition"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveConfig(true)}
                  className="border border-[#dfe1e6] hover:bg-[#fafbfc] text-[#344563] text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-60 transition"
                >
                  Save Scope Only
                </button>
                {portalPasswordEnabled && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveConfig(false, true)}
                    className="border border-red-200 hover:bg-red-50 text-[#de350b] text-xs font-semibold px-3 py-1.5 rounded disabled:opacity-60 transition"
                  >
                    Remove Password Lock
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Access Control & Auditing */}
        {activeTab === "access" && (
          <div className="space-y-4">
            {canAssign && (
              <div className="bg-[#f4f5f7] border border-[#dfe1e6] rounded p-3 flex flex-wrap items-center gap-2.5">
                <div className="flex-1 min-w-[200px]">
                  <select
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="h-9 w-full rounded border border-[#dfe1e6] px-2 text-xs bg-white focus:border-[#0052cc] outline-none"
                  >
                    <option value="">Choose employee to assign...</option>
                    {portalUsers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.firstName} {u.lastName} {u.email ? `(${u.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="h-9 rounded border border-[#dfe1e6] px-2 text-xs bg-white focus:border-[#0052cc] outline-none"
                >
                  <option value="viewer">Viewer</option>
                  <option value="manager">Manager</option>
                  <option value="portal_admin">Portal Admin</option>
                </select>
                <button
                  type="button"
                  onClick={handleAssignEmployee}
                  disabled={!selectedEmployee}
                  className="h-9 px-3 rounded bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold disabled:opacity-60 transition"
                >
                  Assign Access
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Assigned Table */}
              <div className="border border-[#dfe1e6] rounded p-3 bg-white">
                <h4 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>Assigned Employees ({assignments.length})</span>
                  <button
                    type="button"
                    onClick={fetchAssignments}
                    className="text-[10px] text-[#0052cc] hover:underline"
                  >
                    Refresh
                  </button>
                </h4>

                {loadingAssignments ? (
                  <div className="text-xs text-[#5e6c84]">Loading assignments...</div>
                ) : assignments.length === 0 ? (
                  <div className="text-xs text-[#5e6c84] italic">
                    No employees assigned access.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {assignments.map((a) => (
                      <div
                        key={`${dealId}-${a.employeeId}`}
                        className="flex items-center justify-between gap-2 border-b border-[#f4f5f7] pb-2 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#172b4d]">
                            {a.employeeName}
                          </p>
                          <p className="text-[11px] text-[#5e6c84]">
                            {a.employeeEmail || "—"} &middot;{" "}
                            <span className="font-bold capitalize">{a.role}</span>
                          </p>
                        </div>
                        {canAssign && (
                          <button
                            type="button"
                            className="bg-[#ffebe6] hover:bg-[#ffbdad] text-[#de350b] text-[10px] font-bold px-2 py-1 rounded transition"
                            onClick={() => handleRevokeEmployee(a.employeeId)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Access Audit Logs */}
              <div className="border border-[#dfe1e6] rounded p-3 bg-white">
                <h4 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>Access Audit Logs</span>
                  <button
                    type="button"
                    onClick={fetchLogs}
                    className="text-[10px] text-[#0052cc] hover:underline"
                  >
                    Refresh
                  </button>
                </h4>

                {loadingLogs ? (
                  <div className="text-xs text-[#5e6c84]">Loading audit log data...</div>
                ) : logs.length === 0 ? (
                  <div className="text-xs text-[#5e6c84] italic">
                    No access events recorded.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {logs.map((l) => (
                      <div
                        key={l._id}
                        className="text-xs border-b border-[#f4f5f7] pb-1.5 last:border-0 last:pb-0"
                      >
                        <p className="text-[#172b4d] font-semibold">
                          {l.employeeName} &middot;{" "}
                          <span className="text-[#5e6c84] font-medium">{l.action}</span>
                        </p>
                        <p className="text-[10px] text-[#5e6c84] mt-0.5">
                          {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Chat & Updates */}
        {activeTab === "chat" && (
          <div className="space-y-4">
            {/* Feed Updates Panel */}
            <div className="border border-[#dfe1e6] rounded p-3.5 bg-white">
              <h4 className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider mb-3">
                📢 Broadcast Updates Feed
              </h4>

              {(isAdmin ||
                portal.myPortalRole === "manager" ||
                portal.myPortalRole === "portal_admin") && (
                <div className="space-y-2 mb-4 bg-[#f4f5f7] border border-[#dfe1e6] rounded p-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={updateTitle}
                      onChange={(e) => setUpdateTitle(e.target.value)}
                      placeholder="Title of update (e.g., Weekly Summary #4)"
                      className="h-9 flex-1 min-w-[200px] rounded border border-[#dfe1e6] px-2.5 text-xs focus:border-[#0052cc] outline-none"
                    />
                    <select
                      value={updateCadence}
                      onChange={(e) => setUpdateCadence(e.target.value as any)}
                      className="h-9 rounded border border-[#dfe1e6] px-2.5 text-xs bg-white outline-none"
                    >
                      <option value="daily">Daily Cadence</option>
                      <option value="weekly">Weekly Cadence</option>
                      <option value="general">General Broadcast</option>
                    </select>
                    <button
                      type="button"
                      onClick={handlePostUpdate}
                      className="h-9 px-3 rounded bg-[#0052cc] text-white text-xs font-semibold hover:bg-[#0065ff] transition"
                    >
                      Post
                    </button>
                    <button
                      type="button"
                      onClick={handlePostDailyUpdateQuick}
                      className="h-9 px-3 rounded border border-[#dfe1e6] hover:bg-[#ebecf0] text-[#344563] text-xs font-semibold transition"
                    >
                      Post Daily
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateDailyDraftFromTickets}
                      className="h-9 px-3 rounded border border-[#dfe1e6] hover:bg-[#ebecf0] text-[#344563] text-xs font-semibold transition"
                    >
                      Auto Draft
                    </button>
                    <button
                      type="button"
                      onClick={handleDraftUpdateWithAi}
                      disabled={aiDrafting}
                      className="h-9 px-3 rounded border border-[#dfe1e6] hover:bg-[#ebecf0] text-[#344563] text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      {aiDrafting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      AI Draft
                    </button>
                  </div>
                  <input
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    placeholder="Provide specific guidelines or focus areas for AI generator (optional)..."
                    className="h-9 w-full rounded border border-[#dfe1e6] px-2 text-xs focus:border-[#0052cc] outline-none"
                  />
                  <textarea
                    value={updateBody}
                    onChange={(e) => setUpdateBody(e.target.value)}
                    placeholder="Write body of update message here..."
                    className="w-full min-h-[70px] rounded border border-[#dfe1e6] p-2 text-xs focus:border-[#0052cc] outline-none"
                  />
                </div>
              )}

              {/* Updates Feed list */}
              {loadingUpdates ? (
                <div className="text-xs text-[#5e6c84] py-1">Loading updates feed...</div>
              ) : updates.length === 0 ? (
                <div className="text-xs text-[#5e6c84] italic py-1">
                  No updates posted for this portal.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {updates.map((u) => (
                    <div
                      key={u._id}
                      className="rounded border border-[#dfe1e6] p-3 bg-[#fafbfc] relative hover:bg-[#f4f5f7] transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[#172b4d]">
                          {u.title} &middot;{" "}
                          <span className="text-[#5e6c84] font-semibold text-[10px] uppercase">
                            {u.cadence}
                          </span>
                        </p>
                        {(isAdmin ||
                          portal.myPortalRole === "manager" ||
                          portal.myPortalRole === "portal_admin") && (
                          <button
                            type="button"
                            className="bg-[#ffebe6] text-[#de350b] text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-[#ffbdad]"
                            onClick={() => handleRemoveUpdate(u._id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-xs text-[#42526e] leading-relaxed">
                        {u.body}
                      </p>
                      <p className="mt-2 text-[10px] text-[#5e6c84] font-medium">
                        {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}{" "}
                        &middot; Post by {u.createdByName || "Team"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat Tab (Embedded inside) */}
            <div className="border border-[#dfe1e6] rounded overflow-hidden">
              <PortalChatTab dealId={dealId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Internal chat component (from previous implementations but restyled slightly to match Jira's clean style)
function PortalChatTab({ dealId }: { dealId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const socket = useRealtime(`deal-chat:${dealId}`);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}/portal-messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMessages();
  }, [dealId]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (msg: any) => {
      setMessages((prev) => {
        if (prev.some((m) => String(m._id || m.id) === String(msg._id || msg.id))) {
          return prev;
        }
        return [...prev, msg];
      });
    };
    socket.on("deal-chat:message", handleNewMessage);
    return () => {
      socket.off("deal-chat:message", handleNewMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = inputText.trim();
    if (!txt) return;
    setSending(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}/portal-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: txt }),
      });
      if (res.ok) {
        const saved = await res.json();
        setMessages((prev) => [...prev, saved]);
        setInputText("");
      } else {
        toast.error("Failed to send message");
      }
    } catch (err) {
      toast.error("Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[350px] bg-[#fafbfc]">
      <div className="px-3 py-2 bg-[#f4f5f7] border-b border-[#dfe1e6] flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#5e6c84] uppercase tracking-wider">
          💬 Portal Support Chat
        </span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchMessages();
          }}
          className="text-[10px] text-[#0052cc] font-bold hover:underline"
        >
          {loading ? "Syncing..." : "Sync"}
        </button>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-[#5e6c84]">
            Loading chat messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-[#5e6c84] text-center p-4">
            <span className="font-semibold text-[#172b4d]">No conversations yet</span>
            <span className="mt-0.5">
              Send a message to client. They'll receive it in their portal.
            </span>
          </div>
        ) : (
          messages.map((m) => {
            const isAdminMsg = m.senderType === "admin";
            return (
              <div
                key={m._id || m.id}
                className={cn(
                  "flex gap-2 max-w-[85%] animate-in fade-in duration-200",
                  isAdminMsg ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0 border",
                    isAdminMsg
                      ? "bg-[#0052cc] border-[#0052cc] text-white"
                      : "bg-[#e3fcef] border-[#a1e6c4] text-[#006644]",
                  )}
                >
                  {isAdminMsg ? "A" : "C"}
                </div>
                <div className="space-y-0.5">
                  <div
                    className={cn(
                      "rounded p-2 text-xs border shadow-none leading-relaxed",
                      isAdminMsg
                        ? "bg-[#deebff] text-[#0747a6] border-[#b3d4ff] rounded-tr-none"
                        : "bg-white text-[#172b4d] border-[#dfe1e6] rounded-tl-none",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1 text-[9px] text-[#5e6c84] font-medium px-1",
                      isAdminMsg ? "justify-end" : "justify-start",
                    )}
                  >
                    <span>{m.senderName || (isAdminMsg ? "Admin" : "Client")}</span>
                    <span>&middot;</span>
                    <span>
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="p-2 bg-white border-t border-[#dfe1e6] flex gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your message to the client here..."
          disabled={sending}
          className="flex-1 h-8 px-2.5 border border-[#dfe1e6] rounded text-xs outline-none focus:border-[#0052cc] focus:ring-0 min-w-0"
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="h-8 px-3 rounded bg-[#0052cc] hover:bg-[#0065ff] text-white text-xs font-semibold transition"
        >
          Send
        </button>
      </form>
    </div>
  );
}
