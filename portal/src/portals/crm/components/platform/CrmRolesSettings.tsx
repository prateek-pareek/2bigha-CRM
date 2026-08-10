"use client";


import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/crm/api";
import { Button } from "@/components/ui/button";
import {
  getStoredUser,
  canManageCustomRoles,
} from "@/lib/suite/auth";
import {
  CRM_MODULE_EXTRA_PERMS,
  CRM_PERMISSION_MODULES,
  CRM_PM_MODULE_ACTIONS,
} from "@/lib/permissions/registry";

type RoleDoc = {
  _id: string;
  name: string;
  description?: string;
  isActive?: boolean;
  permissions: string[];
  crmPermissions: string[];
  pmPermissions: string[];
  permittedTools: string[];
  dataScopes?: string[];
  fieldPermissions?: string[];
};

const TABS = ["crm", "data"] as const;
type Tab = (typeof TABS)[number];


const CRM_PM_ACTIONS = CRM_PM_MODULE_ACTIONS;
type CrmPmAction = (typeof CRM_PM_ACTIONS)[number];
const CRM_PM_ACTION_LABEL: Record<CrmPmAction, string> = {
  read: "View",
  write: "Create",
  edit: "Edit",
  delete: "Delete",
};

const CRM_MODULES = CRM_PERMISSION_MODULES.map((m) => ({
  id: m.id,
  label: m.label,
}));

export function CrmRolesSettings() {
  const user = getStoredUser();
  const canManage = canManageCustomRoles(user);
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("crm");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    isActive: true,
    permissions: [] as string[],
    crmPermissions: [] as string[],
    pmPermissions: [] as string[],
    permittedTools: [] as string[],
    dataScopes: [] as string[],
    fieldPermissions: [] as string[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/crm-users/roles");
      setRoles(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load roles:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => roles.find((r) => r._id === selectedId) || null,
    [roles, selectedId],
  );

  const openRole = (r: RoleDoc) => {
    setSelectedId(r._id);
    setForm({
      name: r.name || "",
      description: r.description || "",
      isActive: r.isActive !== false,
      permissions: r.permissions || [],
      crmPermissions: r.crmPermissions || [],
      pmPermissions: r.pmPermissions || [],
      permittedTools: r.permittedTools || [],
      dataScopes: r.dataScopes || [],
      fieldPermissions: r.fieldPermissions || [],
    });
  };

  const resetForm = () => {
    setSelectedId(null);
    setForm({
      name: "",
      description: "",
      isActive: true,
      permissions: [],
      crmPermissions: [],
      pmPermissions: [],
      permittedTools: [],
      dataScopes: [],
      fieldPermissions: [],
    });
  };

  const setModuleAction = (
    scope: "permissions" | "crmPermissions" | "pmPermissions",
    moduleId: string,
    action: string,
  ) => {
    setForm((prev) => {
      const current = [...prev[scope]];
      const key = `${moduleId}:${action}`;
      const has = current.includes(key);
      let next = current;

      if (has) {
        if (action === "read") {
          next = current.filter((x) => !x.startsWith(`${moduleId}:`));
        } else {
          next = current.filter((x) => x !== key);
        }
      } else {
        next = [...current];
        if (action !== "read" && !next.includes(`${moduleId}:read`)) {
          next.push(`${moduleId}:read`);
        }
        next.push(key);
      }

      return { ...prev, [scope]: next };
    });
  };

  const toggleCrmFlatPermission = (perm: string) => {
    setForm((prev) => {
      const cur = [...prev.crmPermissions];
      const has = cur.includes(perm);
      const next = has ? cur.filter((x) => x !== perm) : [...cur, perm];
      if (!has) {
        const mod = perm.split(":")[0];
        if (mod && !next.some((x) => x === `${mod}:read`)) {
          next.push(`${mod}:read`);
        }
      }
      return { ...prev, crmPermissions: next };
    });
  };

  const setAllModuleActions = (
    scope: "permissions" | "crmPermissions" | "pmPermissions",
    moduleId: string,
    actions: readonly string[],
  ) => {
    setForm((prev) => {
      const filtered = prev[scope].filter((x) => !x.startsWith(`${moduleId}:`));
      return {
        ...prev,
        [scope]: [...filtered, ...actions.map((a) => `${moduleId}:${a}`)],
      };
    });
  };

  const clearModuleActions = (
    scope: "permissions" | "crmPermissions" | "pmPermissions",
    moduleId: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      [scope]: prev[scope].filter((x) => !x.startsWith(`${moduleId}:`)),
    }));
  };

  const updateCsvList = (
    key: "dataScopes" | "fieldPermissions" | "permittedTools",
    value: string,
  ) => {
    const next = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const saveRole = async () => {
    if (!canManage) return;
    if (!form.name.trim()) {
      alert("Role name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        isActive: form.isActive,
        permissions: [],
        crmPermissions: form.crmPermissions,
        pmPermissions: [],
        permittedTools: ["CRM"],
        dataScopes: form.dataScopes,
        fieldPermissions: form.fieldPermissions,
      };
      if (selectedId) {
        await api.put(`/crm-users/roles/${selectedId}`, payload);
      } else {
        await api.post("/crm-users/roles", payload);
      }
      await load();
      resetForm();
    } catch (e) {
      console.error("Failed to save role:", e);
      alert("Failed to save role.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async () => {
    if (!canManage || !selectedId) return;
    if (!confirm("Delete this custom role?")) return;
    setSaving(true);
    try {
      await api.delete(`/crm-users/roles/${selectedId}`);
      await load();
      resetForm();
    } catch (e) {
      console.error("Failed to delete role:", e);
      alert("Failed to delete role.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8 md:pb-10">
      <div>
        <h1 className="text-xl font-medium text-text-main tracking-tight">CRM Role Templates</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Reusable CRM roles with module, data-scope, and field-level permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-[3px] border border-border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Custom Roles</p>
            <Button size="sm" variant="outline" onClick={resetForm} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-text-muted" /></div>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {roles.map((r) => (
                <button
                  key={r._id}
                  onClick={() => openRole(r)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                    selectedId === r._id
                      ? "border-primary bg-primary-light/40"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-semibold text-text-main">{r.name}</p>
                  <p className="text-xs text-text-muted line-clamp-1">{r.description || "No description"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[3px] border border-border bg-white p-4 lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Role name"
              className="h-9 rounded-lg border border-border px-3 text-sm"
            />
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description"
              className="h-9 rounded-lg border border-border px-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-dim/30 p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide ${
                  activeTab === t ? "bg-white border border-border text-text-main" : "text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {activeTab === "crm" && (
            <div className="space-y-2">
              {CRM_MODULES.map((mod) => {
                const hasAny =
                  CRM_PM_ACTIONS.some((a) =>
                    form.crmPermissions.includes(`${mod.id}:${a}`),
                  ) ||
                  (CRM_MODULE_EXTRA_PERMS[mod.id] || []).some((x) =>
                    form.crmPermissions.includes(x.perm),
                  );
                return (
                  <div
                    key={mod.id}
                    className={`rounded-lg border p-3 ${
                      hasAny ? "border-primary/40 bg-primary-light/20" : "border-border"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-main">{mod.label}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setAllModuleActions("crmPermissions", mod.id, CRM_PM_ACTIONS)}
                          className="rounded border border-border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text-main"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => clearModuleActions("crmPermissions", mod.id)}
                          className="rounded border border-border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-red-600"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CRM_PM_ACTIONS.map((action) => {
                        const key = `${mod.id}:${action}`;
                        const on = form.crmPermissions.includes(key);
                        return (
                          <button
                            type="button"
                            key={key}
                            onClick={() => setModuleAction("crmPermissions", mod.id, action)}
                            className={`rounded border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                              on
                                ? "border-primary bg-primary text-white"
                                : "border-border bg-surface-dim/40 text-text-muted hover:border-primary/40 hover:text-text-main"
                            }`}
                          >
                            {CRM_PM_ACTION_LABEL[action]}
                          </button>
                        );
                      })}
                    </div>
                    {(CRM_MODULE_EXTRA_PERMS[mod.id] || []).length > 0 ? (
                      <div className="mt-2 border-t border-border/60 pt-2">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          Extra permissions
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(CRM_MODULE_EXTRA_PERMS[mod.id] || []).map((x) => {
                            const on = form.crmPermissions.includes(x.perm);
                            return (
                              <button
                                type="button"
                                key={x.perm}
                                onClick={() => toggleCrmFlatPermission(x.perm)}
                                className={`max-w-full rounded border px-2.5 py-1 text-left text-[11px] font-semibold leading-snug ${
                                  on
                                    ? "border-primary bg-primary text-white"
                                    : "border-border bg-surface-dim/40 text-text-muted hover:border-primary/40 hover:text-text-main"
                                }`}
                              >
                                {x.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {activeTab === "data" && (
            <div className="space-y-3">
              <textarea
                value={form.dataScopes.join(", ")}
                onChange={(e) => updateCsvList("dataScopes", e.target.value)}
                placeholder="Data scopes CSV (e.g. clients:read:all, leads:read:all)"
                className="h-24 w-full rounded-lg border border-border p-3 text-sm"
              />
              <textarea
                value={form.fieldPermissions.join(", ")}
                onChange={(e) => updateCsvList("fieldPermissions", e.target.value)}
                placeholder="Field permissions CSV (e.g. payroll.bankName:read, payroll.accountNumber:deny)"
                className="h-24 w-full rounded-lg border border-border p-3 text-sm"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            {selectedId && (
              <Button size="sm" variant="outline" onClick={deleteRole} disabled={saving} className="gap-1.5 text-red-600 border-red-200">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            <Button size="sm" variant="default" onClick={saveRole} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save role
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

