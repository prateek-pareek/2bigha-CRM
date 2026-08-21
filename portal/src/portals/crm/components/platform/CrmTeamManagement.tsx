"use client";

import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, UserPlus, Trash2, Check, X, Mail, User as UserIcon, Lock, Search, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CRM_PERMISSION_MODULES,
  CRM_PM_MODULE_ACTIONS,
} from "@/lib/permissions/registry";
import clsx from "clsx";

/** CRM RBAC uses read / write / edit / delete (API decorators); UI labels align with HRMS where applicable. */
const CRM_GRANULAR_MODULE_ACTIONS = CRM_PM_MODULE_ACTIONS;
const CRM_ACTION_LABEL: Record<(typeof CRM_GRANULAR_MODULE_ACTIONS)[number], string> = {
    read: "View",
    write: "Create",
    edit: "Edit",
    delete: "Delete",
};
const CRM_DATA_SCOPE_MODULES = new Set(["clients", "leads", "deals", "contacts"]);

interface StaffUser {
    _id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    permittedTools: string[];
    crmPermissions?: string[];
    pmPermissions?: string[];
    pmProjects?: string[];
    pmSpaces?: string[];
    accessibleEmailAccounts?: string[];
    salesWorkspaceAccessibleEmployees?: string[];
    roleId?: string | { _id: string; name: string };
    useRoleOverrides?: boolean;
    password?: string;
    /** Manager/Team Lead this user reports to — "my team" = self + everyone reporting to me. */
    reportsTo?: string | { _id: string; firstName?: string; lastName?: string; email?: string } | null;
}

export type CrmTeamManagementVariant = "employees" | "settings";

interface CrmTeamManagementProps {
    /** Where the component is shown — copy adapts slightly (e.g. Employees vs Control Center). */
    variant?: CrmTeamManagementVariant;
}

type PermissionEditorTab = "role" | "crm" | "mail" | "sales-data" | "data";

export function CrmTeamManagement({ variant = "settings" }: CrmTeamManagementProps) {
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [activePermissionTab, setActivePermissionTab] = useState<PermissionEditorTab>("role");

    const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);

    const [crmPortalUsers, setCrmPortalUsers] = useState<any[]>([]);
    const [loadingCrmPortalUsers, setLoadingCrmPortalUsers] = useState(false);
    const [customRoles, setCustomRoles] = useState<Array<{ _id: string; name: string }>>([]);
    const [showAddMember, setShowAddMember] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newMember, setNewMember] = useState({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "Sales Rep",
    });

    const crmModules = CRM_PERMISSION_MODULES.map((m) => ({
        id: m.id,
        label: m.label,
    }));

    const stripCrmModulePerms = (perms: string[], modId: string) =>
        perms.filter((p) => !p.startsWith(`${modId}:`));

    const allGranularKeysForCrmModule = (modId: string) =>
        CRM_GRANULAR_MODULE_ACTIONS.map((a) => `${modId}:${a}`);

    /** Map old Staff keys / sidebar drift onto current CRM permission ids. */
    const migrateLegacyCrmPermissionKeys = (perms: string[]): string[] => {
        let next = [...perms];
        const legacyActivityMods = ["notes", "tasks", "calls"];
        const actions = new Set<string>();
        for (const mod of legacyActivityMods) {
            for (const a of CRM_GRANULAR_MODULE_ACTIONS) {
                if (next.includes(`${mod}:${a}`)) actions.add(a);
            }
        }
        next = next.filter(
            (p) => !legacyActivityMods.some((m) => p.startsWith(`${m}:`)),
        );
        for (const a of actions) {
            const k = `activities:${a}`;
            if (!next.includes(k)) next.push(k);
        }
        const reportKeys = next.filter((p) => p.startsWith("reports:"));
        next = next.filter((p) => !p.startsWith("reports:"));
        for (const p of reportKeys) {
            const a = p.split(":")[1];
            if (a && CRM_GRANULAR_MODULE_ACTIONS.includes(a as (typeof CRM_GRANULAR_MODULE_ACTIONS)[number])) {
                const dk = `dashboard:${a}`;
                if (!next.includes(dk)) next.push(dk);
            }
        }
        return next;
    };

    const toggleSalesWorkspaceEmployee = (empId: string) => {
        if (!editingUser) return;
        const current = editingUser.salesWorkspaceAccessibleEmployees || [];
        const next = current.includes(empId)
            ? current.filter((id) => id !== empId)
            : [...current, empId];
        setEditingUser({ ...editingUser, salesWorkspaceAccessibleEmployees: next });
    };

    const openAccessEditor = async (u: StaffUser) => {
        setActivePermissionTab("role");
        setEditingUser({
            ...u,
            crmPermissions: migrateLegacyCrmPermissionKeys(u.crmPermissions || []),
        });
        // `reportsTo` lives on the HRMS User record, not the CRMUser record this page
        // otherwise edits — CRMUser and User share the same _id, so this is a safe lookup.
        try {
            const res = await api.get(`/users/${u._id}`);
            const reportsTo = res.data?.reportsTo;
            setEditingUser((prev) => (prev && prev._id === u._id ? { ...prev, reportsTo } : prev));
        } catch (err) {
            console.error("Failed to fetch reportsTo:", err);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await api.get("/crm-users");
            setUsers(res.data);
        } catch (err) {
            console.error("Failed to fetch staff:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmailAccounts = async () => {
        setLoadingAccounts(true);
        try {
            const res = await api.get("/crm/inbox-accounts");
            setEmailAccounts(res.data || []);
        } catch (err) {
            console.error("Failed to fetch email accounts:", err);
        } finally {
            setLoadingAccounts(false);
        }
    };

    const fetchCrmPortalUsers = async () => {
        setLoadingCrmPortalUsers(true);
        try {
            const res = await api.get("/crm-users/list/crm-portal");
            setCrmPortalUsers(res.data || []);
        } catch (err) {
            console.error("Failed to fetch CRM portal users:", err);
        } finally {
            setLoadingCrmPortalUsers(false);
        }
    };

    const fetchCustomRoles = async () => {
        try {
            const res = await api.get("/crm-users/roles");
            setCustomRoles(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Failed to fetch custom roles:", err);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchEmailAccounts();
        fetchCrmPortalUsers();
        fetchCustomRoles();
    }, []);

    const filteredUsers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) => {
            const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().toLowerCase();
            const email = (u.email ?? "").toLowerCase();
            const role = (u.role ?? "").toLowerCase();
            if (name.includes(q) || email.includes(q) || role.includes(q)) return true;
            const toolsHaystack = (u.permittedTools || []).join(" ").toLowerCase();
            if (toolsHaystack.includes(q)) return true;
            const crmHaystack = (u.crmPermissions || []).join(" ").toLowerCase();
            return crmHaystack.includes(q);
        });
    }, [users, searchQuery]);

    const handleUpdateUser = async (user: StaffUser) => {
        setSaving(true);
        try {
            const updatePayload = {
                role: user.role,
                roleId:
                    typeof user.roleId === "object"
                        ? user.roleId?._id
                        : user.roleId || undefined,
                useRoleOverrides: user.useRoleOverrides !== false,
                permissions: [],
                permittedTools: ["CRM"],
                crmPermissions: user.crmPermissions || [],
                pmPermissions: [],
                pmProjects: [],
                pmSpaces: [],
                accessibleEmailAccounts: user.accessibleEmailAccounts || [],
                salesWorkspaceAccessibleEmployees: user.salesWorkspaceAccessibleEmployees || [],
            };
            await api.put(`/crm-users/${user._id}`, updatePayload);
            // `reportsTo` lives on the HRMS User record (CRMUser and User share the same
            // _id), so it's a separate call rather than part of the /crm-users payload.
            await api.patch(`/users/${user._id}`, {
                reportsTo:
                    typeof user.reportsTo === "object" && user.reportsTo
                        ? user.reportsTo._id
                        : user.reportsTo || null,
            });
            setEditingUser(null);
            fetchUsers();
        } catch (err) {
            console.error("Failed to update user:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        try {
            await api.delete(`/crm-users/${id}`);
            fetchUsers();
        } catch (err) {
            console.error("Failed to delete user:", err);
        }
    };

    const handleCreateMember = async () => {
        setCreating(true);
        try {
            await api.post("/crm-users", {
                ...newMember,
                permittedTools: ["CRM"],
                permissions: [],
                crmPermissions: ["dashboard:read", "leads:read", "deals:read", "contacts:read"],
            });
            setShowAddMember(false);
            setNewMember({
                firstName: "",
                lastName: "",
                email: "",
                password: "",
                role: "Sales Rep",
            });
            fetchUsers();
        } catch (err) {
            console.error("Failed to create CRM user:", err);
            alert("Failed to add team member. Check email format (@mathionix.com) and password length.");
        } finally {
            setCreating(false);
        }
    };

    const applyPreset = (preset: 'admin' | 'manager' | 'viewer' | 'executive') => {
        if (!editingUser) return;
        let newCrmPermissions = [...(editingUser.crmPermissions || [])];
        let newRole = editingUser.role;
        const fullCrm = () =>
            crmModules.flatMap((m) => allGranularKeysForCrmModule(m.id));

        if (preset === 'admin') {
            newRole = 'Admin';
            newCrmPermissions = fullCrm();
        } else if (preset === 'manager') {
            newRole = 'Manager';
            newCrmPermissions = [];
            ['leads', 'clients', 'deals', 'contacts', 'activities', 'inbox', 'dashboard'].forEach((m) => {
                ['read', 'write', 'edit'].forEach((a) => newCrmPermissions.push(`${m}:${a}`));
                if (m === 'inbox') newCrmPermissions.push('inbox:connect');
            });
        } else if (preset === 'executive') {
            newRole = 'Executive';
            newCrmPermissions = crmModules.map((m) => `${m.id}:read`);
        } else {
            newRole = 'Viewer';
            newCrmPermissions = crmModules.map((m) => `${m.id}:read`);
        }

        setEditingUser({
            ...editingUser,
            role: newRole,
            permissions: [],
            crmPermissions: newCrmPermissions,
            pmPermissions: [],
            permittedTools: ['CRM'],
        });
    };

    const handleSystemRoleChange = (role: string) => {
        if (!editingUser) return;
        const roleLower = role.toLowerCase().replace(/[\s-_]/g, '');
        if (roleLower === 'admin' || roleLower === 'administrator') return applyPreset('admin');
        if (roleLower === 'manager') return applyPreset('manager');
        if (roleLower === 'executive') return applyPreset('executive');
        if (roleLower === 'viewer') return applyPreset('viewer');
        setEditingUser({ ...editingUser, role, permittedTools: ['CRM'] });
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
            <Loader2 className="animate-spin text-primary" size={36} />
            <p className="text-sm font-medium">Loading portal users…</p>
        </div>
    );

    const roleColor = (role: string) => {
        const r = role.toLowerCase();
        if (r === 'admin' || r === 'administrator') return 'bg-primary/10 text-primary border-primary/20';
        if (r === 'director') return 'bg-slate-900/10 text-slate-800 border-slate-300';
        if (r === 'sub admin') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
        if (r === 'manager') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (r === 'project manager') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (r === 'executive') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (r === 'viewer') return 'bg-surface-dim text-text-muted border-border';
        return 'bg-surface-dim text-text-muted border-border';
    };

    const toolColor = (t: string) => {
        if (t === 'HRMS') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (t === 'CRM') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
        if (t === 'PM') return 'bg-violet-50 text-violet-700 border-violet-200';
        if (t === 'SOCIAL') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
        if (t === 'ACCOUNTING') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (t === 'VAULT') return 'bg-orange-50 text-orange-700 border-orange-200';
        return 'bg-surface-dim text-text-muted border-border';
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold text-text-main tracking-tight">
                        CRM Team & Permissions
                    </h2>
                    <p className="mt-0.5 text-xs text-text-muted max-w-2xl leading-relaxed">
                        Add CRM users, assign roles, and configure module-level CRM permissions.
                    </p>
                </div>
                <Button onClick={() => setShowAddMember(true)} className="gap-2 shrink-0">
                    <UserPlus className="h-4 w-4" />
                    Add team member
                </Button>
            </div>

            {showAddMember && (
                <div className="rounded-[3px] border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-text-main">New CRM team member</h3>
                        <button type="button" onClick={() => setShowAddMember(false)} className="text-text-muted hover:text-text-main">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input className="h-9 rounded-md border border-border px-3 text-sm" placeholder="First name" value={newMember.firstName} onChange={(e) => setNewMember((m) => ({ ...m, firstName: e.target.value }))} />
                        <input className="h-9 rounded-md border border-border px-3 text-sm" placeholder="Last name" value={newMember.lastName} onChange={(e) => setNewMember((m) => ({ ...m, lastName: e.target.value }))} />
                        <input className="h-9 rounded-md border border-border px-3 text-sm md:col-span-2" placeholder="Email (@mathionix.com)" value={newMember.email} onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))} />
                        <input type="password" className="h-9 rounded-md border border-border px-3 text-sm md:col-span-2" placeholder="Temporary password (min 6 chars)" value={newMember.password} onChange={(e) => setNewMember((m) => ({ ...m, password: e.target.value }))} />
                        <select className="h-9 rounded-md border border-border px-3 text-sm md:col-span-2" value={newMember.role} onChange={(e) => setNewMember((m) => ({ ...m, role: e.target.value }))}>
                            {['Admin', 'Manager', 'Executive', 'Sales Rep', 'Viewer'].map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowAddMember(false)}>Cancel</Button>
                        <Button onClick={handleCreateMember} disabled={creating || !newMember.email || !newMember.password || !newMember.firstName}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create user"}
                        </Button>
                    </div>
                </div>
            )}

            <div className="rounded-[3px] border border-border bg-card shadow-sm overflow-hidden">
                <div className="border-b border-border px-4 py-3 sm:px-5 bg-surface-dim/30">
                    <div className="relative max-w-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Search className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                        </div>
                        <input
                            type="search"
                            className={clsx(
                                "block w-full rounded-[3px] border border-border/60 bg-card py-2 pl-9 text-sm text-text-main placeholder:text-text-muted/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/20 outline-none transition-all",
                                searchQuery.trim() ? "pr-9" : "pr-3",
                            )}
                            placeholder="Search by name, email, role, or permission…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Search portal users"
                        />
                        {searchQuery.trim() ? (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-main"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    {filteredUsers.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[3px] bg-surface-dim">
                                <UserIcon className="h-5 w-5 text-text-muted" />
                            </div>
                            <p className="text-sm font-semibold text-text-main">
                                {users.length === 0 ? "No portal accounts yet" : "No matches found"}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                                {users.length === 0
                                    ? "Invite or add staff from the directory to create logins."
                                    : "Try different keywords or clear the search."}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-border bg-surface-dim/40">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-muted">User</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-muted">Role</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-muted">CRM Permissions</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-text-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {filteredUsers.map((user) => (
                                    <tr key={user._id} onClick={() => openAccessEditor(user)} className="hover:bg-primary/[0.03] transition-colors cursor-pointer group">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-[3px] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm shrink-0 ring-1 ring-primary/10">
                                                    {(user.firstName?.[0] ?? "?").toUpperCase()}{(user.lastName?.[0] ?? "").toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-text-main text-sm truncate">
                                                        {user.firstName} {user.lastName}
                                                    </div>
                                                    <div className="text-xs text-text-muted truncate">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${roleColor(user.role)}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'administrator' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-primary font-semibold">
                                                    <Shield className="h-3 w-3" /> Full access
                                                </span>
                                            ) : (user.crmPermissions?.length ?? 0) > 0 ? (
                                                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-semibold">
                                                    {user.crmPermissions!.length} permission{user.crmPermissions!.length === 1 ? "" : "s"}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-text-muted italic">No permissions set</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); openAccessEditor(user); }}
                                                    className="h-8 w-8 p-0 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10"
                                                    title="Manage Permissions"
                                                >
                                                    <Shield className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setUserToDelete(user._id);
                                                    }}
                                                    className="h-8 w-8 p-0 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50"
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Access Control Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.18)] w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-[var(--border-color)] animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Modal Header */}
                        <div className="px-6 py-3.5 border-b border-[var(--surface-dim)] flex items-center justify-between bg-[#fafbfc] shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-9 w-9 rounded-full bg-[var(--hs-link)]/15 flex items-center justify-center text-[#b94b36] font-bold text-sm ring-2 ring-[var(--hs-link)]/20 shrink-0">
                                    {(editingUser.firstName?.[0] ?? "?").toUpperCase()}{(editingUser.lastName?.[0] ?? "").toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-semibold text-[var(--text-main)] text-sm flex items-center gap-2">
                                        <Shield className="h-3.5 w-3.5 text-[var(--hs-link)] shrink-0" />
                                        {editingUser.firstName} {editingUser.lastName}
                                    </h3>
                                    <p className="text-xs text-[var(--primary-muted)] truncate">{editingUser.email}</p>
                                </div>
                            </div>
                            <button onClick={() => setEditingUser(null)} className="h-8 w-8 flex items-center justify-center rounded-md text-[var(--primary-muted)] hover:text-[var(--text-main)] hover:bg-[var(--background)] transition-colors shrink-0">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* LEFT PANEL */}
                            <div className="w-[290px] shrink-0 border-r border-[var(--surface-dim)] bg-[#fafbfc] overflow-y-auto p-5 space-y-5">
                                <div className="space-y-5 flex flex-col">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                                            Quick Presets
                                        </label>
                                        <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3 space-y-2.5">
                                            <p className="text-xs text-[var(--primary-muted)]">Bulk-apply CRM module permissions</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    { key: 'admin' as const, label: 'Super Admin', cls: 'bg-[var(--hs-link)] text-white hover:bg-[var(--hs-link-hover)]' },
                                                    { key: 'manager' as const, label: 'Manager', cls: 'bg-blue-600 text-white hover:bg-blue-700' },
                                                    { key: 'executive' as const, label: 'Executive', cls: 'bg-amber-500 text-white hover:bg-amber-600' },
                                                    { key: 'viewer' as const, label: 'Viewer', cls: 'bg-white text-[var(--text-muted)] border border-[var(--border-color)] hover:border-[var(--text-muted)]' },
                                                ].map(({ key, label, cls }) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => applyPreset(key)}
                                                        className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${cls}`}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">System Role</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {['Admin', 'Manager', 'Executive', 'Sales Rep', 'Viewer'].map((role) => (
                                                <button
                                                    key={role}
                                                    onClick={() => handleSystemRoleChange(role)}
                                                    className={`px-2.5 py-2 rounded-md border transition-all text-xs text-left font-medium flex items-center justify-between gap-1 ${editingUser.role === role
                                                        ? "bg-[var(--text-main)] border-[var(--text-main)] text-white"
                                                        : "bg-white border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--text-main)]/50 hover:text-[var(--text-main)]"
                                                        }`}
                                                >
                                                    <span className="truncate">{role}</span>
                                                    {editingUser.role === role && <Check className="h-3 w-3 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">Product Access</label>
                                        <div className="rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs font-semibold text-indigo-800">
                                            CRM (enabled for all team members)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT PANEL — permissions */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
                                <div className="sticky top-0 z-20 bg-white pb-3">
                                    <div className="flex flex-wrap gap-1 rounded-md border border-[var(--surface-dim)] bg-[#fafbfc] p-1">
                                        {[
                                            { key: "role", label: "Role & Access" },
                                            { key: "crm", label: "CRM Permissions" },
                                            { key: "mail", label: "Mail" },
                                            { key: "sales-data", label: "Sales Data" },
                                            { key: "data", label: "Data Scope" },
                                        ].map((tab) => (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setActivePermissionTab(tab.key as PermissionEditorTab)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${activePermissionTab === tab.key
                                                        ? "bg-[var(--text-main)] text-white shadow-sm"
                                                        : "text-[var(--primary-muted)] hover:text-[var(--text-main)] hover:bg-white"
                                                    }`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {activePermissionTab === "role" && (
                                    <div className="rounded-md border border-[var(--surface-dim)] bg-[#fafbfc] p-4 space-y-3">
                                        <div className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                                            Role Assignment
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                            Use the left panel to set <span className="font-semibold text-[var(--text-main)]">System Role</span> and quick presets.
                                            Then use CRM Permissions, Mail, Sales Data, and Data Scope tabs for fine-grained access.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3">
                                                <span className="text-[var(--primary-muted)]">Current Role</span>
                                                <p className="font-semibold text-[var(--text-main)] mt-1">{editingUser.role || "Not set"}</p>
                                            </div>
                                            <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3">
                                                <span className="text-[var(--primary-muted)]">Product</span>
                                                <p className="font-semibold text-[var(--text-main)] mt-1">CRM</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3 space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                                                    Custom Role Template
                                                </label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-[var(--border-color)] bg-white px-2 text-xs text-[var(--text-main)]"
                                                    value={
                                                        typeof editingUser.roleId === "object"
                                                            ? editingUser.roleId?._id
                                                            : editingUser.roleId || ""
                                                    }
                                                    onChange={(e) =>
                                                        setEditingUser({
                                                            ...editingUser,
                                                            roleId: e.target.value || undefined,
                                                        })
                                                    }
                                                >
                                                    <option value="">No custom role</option>
                                                    {customRoles.map((r) => (
                                                        <option key={r._id} value={r._id}>
                                                            {r.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3 space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                                                    Reports To
                                                </label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-[var(--border-color)] bg-white px-2 text-xs text-[var(--text-main)]"
                                                    value={
                                                        typeof editingUser.reportsTo === "object" && editingUser.reportsTo
                                                            ? editingUser.reportsTo._id
                                                            : editingUser.reportsTo || ""
                                                    }
                                                    onChange={(e) =>
                                                        setEditingUser({
                                                            ...editingUser,
                                                            reportsTo: e.target.value || null,
                                                        })
                                                    }
                                                >
                                                    <option value="">No manager (top of hierarchy)</option>
                                                    {users
                                                        .filter((u) => u._id !== editingUser._id)
                                                        .map((u) => (
                                                            <option key={u._id} value={u._id}>
                                                                {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email}
                                                            </option>
                                                        ))}
                                                </select>
                                                <p className="text-[11px] text-[var(--primary-muted)]">
                                                    "My team" for Team Lead/Manager roles = this user + everyone reporting to them.
                                                </p>
                                            </div>
                                            <div className="rounded-md border border-[var(--surface-dim)] bg-white p-3 space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                                                    Permission Mode
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setEditingUser({
                                                            ...editingUser,
                                                            useRoleOverrides: editingUser.useRoleOverrides === false ? true : false,
                                                        })
                                                    }
                                                    className={`h-9 w-full rounded-md border text-xs font-semibold transition-all ${editingUser.useRoleOverrides === false
                                                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                                            : "bg-amber-50 border-amber-300 text-amber-700"
                                                        }`}
                                                >
                                                    {editingUser.useRoleOverrides === false
                                                        ? "Using role template permissions"
                                                        : "Using manual user overrides"}
                                                </button>
                                                <p className="text-xs text-[var(--primary-muted)]">
                                                    Role template mode auto-applies permissions from selected custom role.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* CRM Permissions */}
                                {activePermissionTab === "crm" && (
                                    <div className="pt-5 border-t border-[var(--surface-dim)]">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">CRM Permissions</label>
                                            </div>
                                            <span className="text-xs text-[var(--primary-muted)] italic">CRM tool only</span>
                                        </div>

                                        {editingUser.role.toLowerCase() === 'admin' || editingUser.role.toLowerCase() === 'administrator' ? (
                                            <div className="p-4 bg-indigo-50/60 rounded-md border border-indigo-100 flex items-center gap-3">
                                                <Shield className="h-5 w-5 text-indigo-400 shrink-0" />
                                                <div>
                                                    <p className="text-xs font-semibold text-indigo-900">Full Administrator Access</p>
                                                    <p className="text-xs text-indigo-600/70">Root privileges — all CRM modules accessible regardless of settings.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <p className="text-xs text-[var(--primary-muted)] leading-relaxed mb-2">
                                                    <span className="font-semibold text-[var(--text-main)]">View</span> is required to open the area; <span className="font-semibold text-[var(--text-main)]">Create</span> maps to API <code className="text-[9px] bg-[var(--background)] px-1 rounded">:write</code>.
                                                    For data-level RBAC modules, <span className="font-semibold text-[var(--text-main)]">Read All Data</span> allows viewing all records; otherwise users only see assigned/owned records.
                                                </p>
                                                {crmModules.map((mod) => {
                                                    const crmPerms = editingUser.crmPermissions || [];
                                                    const readAllKey = `${mod.id}:read:all`;
                                                    const hasReadAllData = crmPerms.includes(readAllKey);
                                                    const supportsDataScope = CRM_DATA_SCOPE_MODULES.has(mod.id);

                                                    const toggleCrmAction = (action: (typeof CRM_GRANULAR_MODULE_ACTIONS)[number]) => {
                                                        const key = `${mod.id}:${action}`;
                                                        const p = [...(editingUser.crmPermissions || [])];
                                                        if (p.includes(key)) {
                                                            if (action === "read") {
                                                                setEditingUser({ ...editingUser, crmPermissions: stripCrmModulePerms(p, mod.id) });
                                                            } else {
                                                                setEditingUser({ ...editingUser, crmPermissions: p.filter((x) => x !== key) });
                                                            }
                                                        } else {
                                                            if (action !== "read" && !p.includes(`${mod.id}:read`)) p.push(`${mod.id}:read`);
                                                            p.push(key);
                                                            setEditingUser({ ...editingUser, crmPermissions: p });
                                                        }
                                                    };

                                                    const hasAny = CRM_GRANULAR_MODULE_ACTIONS.some(a => crmPerms.includes(`${mod.id}:${a}`));
                                                    return (
                                                        <div key={mod.id} className={`rounded-md border p-3 transition-all ${hasAny ? "border-indigo-200 bg-indigo-50/30" : "border-[var(--surface-dim)] bg-white hover:border-indigo-100"}`}>
                                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                                <span className="text-xs font-semibold text-[var(--text-main)] truncate">{mod.label}</span>
                                                                <div className="flex gap-1 shrink-0">
                                                                    <button type="button"
                                                                        onClick={() => setEditingUser({ ...editingUser, crmPermissions: [...(editingUser.crmPermissions || []).filter(x => !x.startsWith(`${mod.id}:`)), ...allGranularKeysForCrmModule(mod.id)] })}
                                                                        className="px-2 py-0.5 rounded-md border border-[var(--border-color)] text-[9px] font-bold uppercase tracking-wide text-[var(--primary-muted)] hover:border-indigo-300 hover:text-indigo-700 transition-colors">All</button>
                                                                    <button type="button"
                                                                        onClick={() => setEditingUser({ ...editingUser, crmPermissions: stripCrmModulePerms(editingUser.crmPermissions || [], mod.id) })}
                                                                        className="px-2 py-0.5 rounded-md border border-[var(--border-color)] text-[9px] font-bold uppercase tracking-wide text-[var(--primary-muted)] hover:border-red-300 hover:text-red-500 transition-colors">Clear</button>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {CRM_GRANULAR_MODULE_ACTIONS.map((action) => {
                                                                    const key = `${mod.id}:${action}`;
                                                                    const on = crmPerms.includes(key);
                                                                    return (
                                                                        <button key={key} type="button" onClick={() => toggleCrmAction(action)}
                                                                            className={`px-2.5 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wide transition-all ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-[var(--background)] border-[var(--border-color)] text-[var(--primary-muted)] hover:border-indigo-200 hover:text-indigo-700"}`}>
                                                                            {CRM_ACTION_LABEL[action]}
                                                                        </button>
                                                                    );
                                                                })}
                                                                {mod.id === 'inbox' && (() => {
                                                                    const connectKey = 'inbox:connect';
                                                                    const connectOn = crmPerms.includes(connectKey);
                                                                    return (
                                                                        <button key={connectKey} type="button"
                                                                            onClick={() => {
                                                                                const p = [...(editingUser.crmPermissions || [])];
                                                                                setEditingUser({ ...editingUser, crmPermissions: connectOn ? p.filter(x => x !== connectKey) : [...p, connectKey] });
                                                                            }}
                                                                            className={`px-2.5 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wide transition-all ${connectOn ? "bg-emerald-600 border-emerald-600 text-white" : "bg-[var(--background)] border-[var(--border-color)] text-[var(--primary-muted)] hover:border-emerald-200 hover:text-emerald-700"}`}
                                                                            title="Allow this employee to connect their own email account in CRM Inbox">
                                                                            Connect
                                                                        </button>
                                                                    );
                                                                })()}
                                                                {supportsDataScope && (
                                                                    <button
                                                                        key={readAllKey}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const p = [...(editingUser.crmPermissions || [])];
                                                                            if (hasReadAllData) {
                                                                                setEditingUser({
                                                                                    ...editingUser,
                                                                                    crmPermissions: p.filter((x) => x !== readAllKey),
                                                                                });
                                                                                return;
                                                                            }
                                                                            if (!p.includes(`${mod.id}:read`)) p.push(`${mod.id}:read`);
                                                                            p.push(readAllKey);
                                                                            setEditingUser({ ...editingUser, crmPermissions: p });
                                                                        }}
                                                                        className={`px-2.5 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wide transition-all ${hasReadAllData ? "bg-sky-600 border-sky-600 text-white" : "bg-[var(--background)] border-[var(--border-color)] text-[var(--primary-muted)] hover:border-sky-200 hover:text-sky-700"}`}
                                                                        title="Allow viewing all records for this CRM module (data-level scope bypass)"
                                                                    >
                                                                        Read All Data
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activePermissionTab === "mail" && (
                                    <div className="pt-5 border-t border-[var(--surface-dim)] space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                                                    Mail Account Access
                                                </label>
                                            </div>
                                            <span className="text-xs text-[var(--primary-muted)] italic">CRM Inbox visibility</span>
                                        </div>
                                        <p className="text-xs text-[var(--primary-muted)] leading-relaxed">
                                            Select which connected email inboxes this user can access.
                                        </p>
                                        <div className="rounded-md border border-[var(--surface-dim)] bg-white p-2 space-y-1">
                                            {loadingAccounts ? (
                                                <div className="flex justify-center py-3">
                                                    <Loader2 className="h-4 w-4 animate-spin text-[var(--primary-muted)]" />
                                                </div>
                                            ) : emailAccounts.length === 0 ? (
                                                <p className="text-xs text-[var(--primary-muted)] italic px-2 py-1.5">No email accounts connected.</p>
                                            ) : (
                                                <div className="space-y-1">
                                                    {emailAccounts.map((acc) => {
                                                        const isChecked = (editingUser.accessibleEmailAccounts || []).includes(acc._id);
                                                        return (
                                                            <button
                                                                key={acc._id}
                                                                onClick={() => {
                                                                    const current = [...(editingUser.accessibleEmailAccounts || [])];
                                                                    if (current.includes(acc._id)) {
                                                                        setEditingUser({ ...editingUser, accessibleEmailAccounts: current.filter(id => id !== acc._id) });
                                                                    } else {
                                                                        setEditingUser({ ...editingUser, accessibleEmailAccounts: [...current, acc._id] });
                                                                    }
                                                                }}
                                                                className={`w-full px-3 py-2 rounded-md border transition-all text-xs text-left flex items-center justify-between ${isChecked
                                                                        ? "bg-[#eaf3ff] border-[#7dc4f6] text-[#0b4fa6] font-medium"
                                                                        : "bg-white border-[var(--surface-dim)] text-[var(--text-muted)] hover:border-[var(--border-color)] hover:text-[var(--text-main)]"
                                                                    }`}
                                                            >
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="truncate">{acc.displayName || acc.email}</span>
                                                                    {acc.displayName && <span className="text-xs opacity-60 truncate">{acc.email}</span>}
                                                                </div>
                                                                {isChecked
                                                                    ? <Check className="h-3.5 w-3.5 shrink-0 text-[#0b4fa6]" />
                                                                    : <div className="h-3.5 w-3.5 rounded border border-[var(--border-color)] shrink-0" />
                                                                }
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activePermissionTab === "sales-data" && (
                                    <div className="pt-5 border-t border-[var(--surface-dim)] space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                                                    Sales Workspace Data Access
                                                </label>
                                            </div>
                                            <span className="text-xs text-[var(--primary-muted)] italic">CRM record visibility</span>
                                        </div>
                                        <p className="text-xs text-[var(--primary-muted)] leading-relaxed">
                                            Select employees whose data this user can view in <span className="font-semibold text-[var(--text-main)]">Sales Workspace</span>. Default is own data only.
                                        </p>
                                        {(editingUser.role.toLowerCase() === 'admin' || (editingUser.permittedTools || []).includes('CRM')) ? (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        className={cn(
                                                            "w-full justify-between rounded-md h-9 border-[var(--border-color)] hover:border-[var(--hs-link)]/60 hover:bg-[#fff8f6] transition-all px-3 text-xs",
                                                            (editingUser.salesWorkspaceAccessibleEmployees || []).length > 0 ? "text-[var(--text-main)] font-medium" : "text-[var(--primary-muted)] font-normal"
                                                        )}
                                                        disabled={editingUser.role.toLowerCase() === 'admin'}
                                                    >
                                                        <div className="flex items-center gap-2 truncate">
                                                            <UserIcon className="h-3.5 w-3.5 opacity-50" />
                                                            {editingUser.role.toLowerCase() === 'admin' ? (
                                                                "Admin has access to all employees"
                                                            ) : (editingUser.salesWorkspaceAccessibleEmployees || []).length > 0 ? (
                                                                `${(editingUser.salesWorkspaceAccessibleEmployees || []).length} employee(s) selected`
                                                            ) : (
                                                                "Select authorized employees..."
                                                            )}
                                                        </div>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 bg-white border border-[var(--border-color)] shadow-[0_6px_20px_rgba(0,0,0,0.10)] rounded-md z-[100]" align="start">
                                                    <Command className="rounded-md overflow-hidden">
                                                        <CommandInput placeholder="Search employees..." className="h-9 text-xs border-none focus:ring-0" />
                                                        <CommandList className="max-h-[240px] overflow-y-auto">
                                                            <CommandEmpty className="p-4 text-xs text-[var(--primary-muted)] text-center italic">No CRM users found.</CommandEmpty>
                                                            <CommandGroup>
                                                                {crmPortalUsers
                                                                    .filter(u => u._id !== editingUser._id)
                                                                    .map((u) => {
                                                                        const isActive = (editingUser.salesWorkspaceAccessibleEmployees || []).includes(u._id);
                                                                        const displayName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown';
                                                                        return (
                                                                            <CommandItem
                                                                                key={u._id}
                                                                                value={displayName}
                                                                                onSelect={() => toggleSalesWorkspaceEmployee(u._id)}
                                                                                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-xs hover:bg-[#fff3ef] rounded-md transition-colors"
                                                                            >
                                                                                <div className={cn(
                                                                                    "h-4 w-4 rounded border flex items-center justify-center transition-all shrink-0",
                                                                                    isActive ? "bg-[var(--hs-link)] border-[var(--hs-link)]" : "border-[var(--border-color)] bg-white"
                                                                                )}>
                                                                                    {isActive && <Check className="h-2.5 w-2.5 text-white stroke-[3.5px]" />}
                                                                                </div>
                                                                                <div className="flex flex-col min-w-0">
                                                                                    <span className={cn("truncate", isActive && "font-semibold text-[var(--text-main)]")}>{displayName}</span>
                                                                                    {u.email && <span className="text-xs text-[var(--primary-muted)] truncate">{u.email}</span>}
                                                                                </div>
                                                                            </CommandItem>
                                                                        );
                                                                    })}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        ) : (
                                            <div className="p-3 bg-[#fffbf0] border border-[#f5c26b]/30 rounded-md text-xs text-[#a57c00] flex items-center gap-2">
                                                <Lock className="h-3 w-3 shrink-0" />
                                                Grant CRM tool access first to manage data visibility.
                                            </div>
                                        )}

                                        {(editingUser.salesWorkspaceAccessibleEmployees || []).length > 0 && editingUser.role.toLowerCase() !== 'admin' && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(editingUser.salesWorkspaceAccessibleEmployees || []).map(empId => {
                                                    const u = crmPortalUsers.find(x => x._id === empId);
                                                    if (!u) return null;
                                                    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
                                                    return (
                                                        <div key={empId} className="flex items-center gap-1.5 bg-[#fff3ef] text-[#b94b36] px-2 py-1 rounded-md text-xs font-semibold border border-[var(--hs-link)]/20">
                                                            <span className="truncate max-w-[100px]">{name}</span>
                                                            <X className="h-3 w-3 cursor-pointer hover:text-[var(--hs-link-hover)] transition-colors" onClick={() => toggleSalesWorkspaceEmployee(empId)} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activePermissionTab === "data" && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                                                <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.15em]">
                                                    Data-Level Access
                                                </label>
                                            </div>
                                            <span className="text-xs text-[var(--primary-muted)] italic">Record visibility controls</span>
                                        </div>
                                        <div className="rounded-md border border-[var(--surface-dim)] bg-[#fafbfc] p-3">
                                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                                Turn on <span className="font-semibold text-[var(--text-main)]">Read All Data</span> only for users who should see all records.
                                                If this is off, users see only assigned/owned data for the selected CRM modules.
                                            </p>
                                        </div>
                                        {(["clients", "leads", "deals", "contacts"] as const).map((modId) => {
                                            const key = `${modId}:read:all`;
                                            const crmPerms = editingUser.crmPermissions || [];
                                            const enabled = crmPerms.includes(key);
                                            return (
                                                <div key={modId} className="rounded-md border border-[var(--surface-dim)] bg-white p-3 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-xs font-semibold text-[var(--text-main)] uppercase">{modId}</p>
                                                        <p className="text-xs text-[var(--primary-muted)]">
                                                            {enabled ? "All records visible" : "Only assigned / owned records visible"}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const p = [...(editingUser.crmPermissions || [])];
                                                            if (enabled) {
                                                                setEditingUser({
                                                                    ...editingUser,
                                                                    crmPermissions: p.filter((x) => x !== key),
                                                                });
                                                                return;
                                                            }
                                                            if (!p.includes(`${modId}:read`)) p.push(`${modId}:read`);
                                                            p.push(key);
                                                            setEditingUser({ ...editingUser, crmPermissions: p });
                                                        }}
                                                        className={`px-3 py-1.5 rounded-md border text-xs font-bold uppercase tracking-wide transition-all ${enabled
                                                                ? "bg-sky-600 border-sky-600 text-white"
                                                                : "bg-white border-[var(--border-color)] text-[var(--text-muted)] hover:border-sky-200 hover:text-sky-700"
                                                            }`}
                                                    >
                                                        {enabled ? "Enabled" : "Enable"}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-[var(--surface-dim)] bg-[#fafbfc]">
                            <button type="button" onClick={() => setEditingUser(null)}
                                className="px-4 py-2 rounded-md border border-[var(--border-color)] text-sm font-medium text-[var(--text-muted)] bg-white hover:border-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                                Cancel
                            </button>
                            <button type="button" onClick={() => handleUpdateUser(editingUser)} disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold hover:bg-[var(--hs-link-hover)] transition-colors disabled:opacity-60 shadow-sm">
                                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Save changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={!!userToDelete}
                onOpenChange={(open) => !open && setUserToDelete(null)}
                title="Delete Staff Member"
                description="Are you sure you want to delete this staff member? This action cannot be undone."
                onConfirm={() => {
                    if (userToDelete) {
                        handleDeleteUser(userToDelete);
                        setUserToDelete(null);
                    }
                }}
            />
        </div>
    );
}
