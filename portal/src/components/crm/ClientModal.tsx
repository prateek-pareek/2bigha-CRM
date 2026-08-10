"use client";

import { useState, useEffect, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/CrmJiraPortal";
import { Loader2, Save, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/api/config";
import { invalidateCrmForEntityType } from "@/lib/crm/invalidate-on-mutation";
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from "@/lib/crm/phone-country-codes";
import CrmSlidePanelShell from "@/components/crm/CrmSlidePanelShell";
import CrmMultiEmailListField from "@/components/crm/CrmMultiEmailListField";
import { parseAdditionalEmailsFromForm } from "@/lib/crm/crm-additional-emails";
import { CRM_HS_CONTROL_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/crm-form-primitives";
import { usePermissions } from "@/hooks/usePermissions";

const LBL = 'block text-xs font-semibold text-[var(--text-muted)] mb-1';
const INP = 'w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all';
const SEL = 'w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  client?: any;
}

export default function ClientModal({ isOpen, onClose, onSuccess, client }: ClientModalProps) {
  const { user, hasAccess } = usePermissions();
  const isAdmin = hasAccess("admin") || user?.role === "ADMIN";
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [crmUsers, setCrmUsers] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [addingField, setAddingField] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    countryCode: "+91",
    organization: "",
    status: "active",
    assignedTo: [] as string[],
  });

  useEffect(() => {
    if (isOpen) {
      fetchOrganizations();
      fetchCrmUsers();
      fetchCustomFields();
      if (client) {
        const fullPhone = client.phone || "";
        const assigned = Array.isArray(client.assignedTo)
          ? client.assignedTo
              .map((u: any) => (typeof u === "string" ? u : u?._id))
              .filter(Boolean)
          : [];
        setFormData({
          name: client.name || "",
          email: client.email || "",
          phone: getNationalDigitsFromPhone(fullPhone),
          countryCode: getDefaultCountryCodeFromPhone(fullPhone),
          organization: client.organization?._id || client.organization || "",
          status: client.status || "active",
          assignedTo: assigned,
        });
      } else {
        setFormData({
          name: "",
          email: "",
          phone: "",
          countryCode: "+91",
          organization: "",
          status: "active",
          assignedTo: [],
        });
      }
    }
  }, [isOpen, client]);

  const fetchOrganizations = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm/organizations/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
      }
    } catch (error) {
      console.error("Fetch organizations error:", error);
    }
  };

  const fetchCrmUsers = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/crm-users/list/crm-portal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCrmUsers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Fetch CRM users error:", error);
    }
  };

  const fetchCustomFields = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${CRM_API_URL}/custom-fields?module=clients`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setCustomFields(await res.json());
    } catch (error) {
      console.error("Fetch custom fields error:", error);
    }
  };

  const handleAddNewField = async () => {
    if (!newFieldName.trim()) {
      toast.error("Enter a property name");
      return;
    }
    setAddingField(true);
    const token = localStorage.getItem("token");
    try {
      const key = newFieldName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      const optionsPayload =
        newFieldType === "select" || newFieldType === "multiselect" ? ["Option A", "Option B"] : [];
      const res = await fetch(`${CRM_API_URL}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newFieldName.trim(),
          key,
          type: newFieldType,
          module: "clients",
          required: false,
          options: optionsPayload,
        }),
      });
      if (res.ok) {
        toast.success(`"${newFieldName.trim()}" added`);
        setNewFieldName("");
        setNewFieldType("text");
        setShowAddField(false);
        await fetchCustomFields();
      } else {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        toast.error(err.message || "Failed to add field");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setAddingField(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem("token");
    const rawFormData = new FormData(e.target as HTMLFormElement);

    try {
      const method = client ? "PUT" : "POST";
      const url = client ? `${CRM_API_URL}/crm/clients/${client._id}` : `${CRM_API_URL}/crm/clients`;

      const payload: any = { ...formData };
      if (payload.countryCode && payload.phone) {
        payload.phone = `${payload.countryCode} ${payload.phone}`.trim();
      }
      delete payload.countryCode;
      if (!payload.organization || payload.organization === "" || payload.organization === "Select Organization...") {
        payload.organization = null;
      }
      if (!Array.isArray(payload.assignedTo)) payload.assignedTo = [];

      const customData: Record<string, string | string[]> = {};
      customFields.forEach((f) => {
        const key = `cf_${f.key}`;
        if (f.type === "multiselect") {
          const values = rawFormData
            .getAll(key)
            .filter((x) => x != null && String(x).trim() !== "") as string[];
          if (values.length > 0) customData[f.key] = values;
        } else {
          const value = rawFormData.get(key);
          if (value != null && String(value).trim() !== "") customData[f.key] = String(value).trim();
        }
      });
      payload.customFields = Object.keys(customData).length > 0 ? customData : undefined;
      const additionalEmails = parseAdditionalEmailsFromForm(rawFormData, payload.email);
      payload.additionalEmails = additionalEmails.length ? additionalEmails : undefined;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        invalidateCrmForEntityType("client");
        toast.success(client ? "Client updated" : "Client created");
        if (saveAndAddAnother && !client) {
          // Reset form for next entry
          setFormData({
            name: "",
            email: "",
            phone: "",
            countryCode: "+91",
            organization: "",
            status: "active",
            assignedTo: [],
          });
          formRef.current?.reset();
          onSuccess();
        } else {
          onSuccess();
          onClose();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.message === "string" ? data.message : "Operation failed");
      }
    } catch (error) {
      console.error("Client mutation error:", error);
      toast.error("Something went wrong. Check if the email is already in use.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const title = client ? "Edit client" : "Create client";
  const subtitle = "Name, email, phone, company, and status — same look as create lead.";
  const existingCustom = (client?.customFields || {}) as Record<string, any>;

  const panel = (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      headerTone="hubspot"
      footer={
        !client ? (
          <div className="flex items-center gap-3">
            <button
              form="client-form"
              type="submit"
              disabled={loading}
              onClick={() => setSaveAndAddAnother(true)}
              className="flex-1 py-2.5 border border-[var(--border-color)] bg-white text-[var(--text-main)] rounded-md text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--background)] transition-colors disabled:opacity-50"
            >
              {loading && saveAndAddAnother ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading && saveAndAddAnother ? "Saving…" : "Create & Add Another"}
            </button>
            <button
              form="client-form"
              type="submit"
              disabled={loading}
              onClick={() => setSaveAndAddAnother(false)}
              className="flex-1 py-2.5 bg-[var(--hs-link)] text-white rounded-md text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
            >
              {loading && !saveAndAddAnother ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
              {loading && !saveAndAddAnother ? "Saving…" : "Create"}
            </button>
          </div>
        ) : (
          <button
            form="client-form"
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[var(--hs-link)] text-white rounded-md text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {loading ? "Saving…" : "Save"}
          </button>
        )
      }
    >
      <div className="min-h-full">
        <form id="client-form" ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <p className="text-sm text-[var(--primary-muted)] font-normal leading-snug">
            Required fields are marked with an asterisk. Email must be unique per client.
          </p>

          <div>
            <label className={LBL}>Full name <span className="text-[#f2545b]">*</span></label>
            <input
              required
              className={INP}
              placeholder="e.g. Jane Smith"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div>
            <label className={LBL}>Email <span className="text-[#f2545b]">*</span></label>
            <input
              type="email"
              required
              className={INP}
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="pt-1">
            <CrmMultiEmailListField
              key={`addl-${client?._id || "new"}-${(client?.additionalEmails || []).join(",")}`}
              initialEmails={Array.isArray(client?.additionalEmails) ? client.additionalEmails : []}
              visualVariant="hubspot"
            />
          </div>

          <div>
            <label className={LBL}>Phone number</label>
            <div className="relative flex items-center">
              <select
                value={formData.countryCode}
                onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                className="absolute left-0 z-10 w-[7rem] h-9 bg-white text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[3px]"
              >
                {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                className={`${INP} pl-[7.5rem]`}
                placeholder="9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, "") })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Organization</label>
              <select className={SEL} value={formData.organization} onChange={(e) => setFormData({ ...formData, organization: e.target.value })}>
                <option value="">Select organization…</option>
                {organizations.map((org) => (
                  <option key={org._id} value={org._id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LBL}>Status</label>
              <select className={`${SEL} capitalize`} value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="prospective">Prospective</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className={LBL}>Assigned CRM users</label>
            <div className="rounded-md border border-[var(--border-color)] bg-white p-2 max-h-40 overflow-y-auto space-y-1">
              {crmUsers.length === 0 ? (
                <p className="text-xs text-[var(--primary-muted)] px-1 py-1">No CRM users available.</p>
              ) : (
                crmUsers.map((u) => {
                  const id = String(u?._id || "");
                  const selected = formData.assignedTo.includes(id);
                  const name = `${String(u?.firstName || "").trim()} ${String(u?.lastName || "").trim()}`.trim() || String(u?.email || "User");
                  return (
                    <label key={id} className="flex items-center gap-2 px-1 py-1 text-xs text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          setFormData((prev) => ({
                            ...prev,
                            assignedTo: e.target.checked
                              ? Array.from(new Set([...prev.assignedTo, id]))
                              : prev.assignedTo.filter((x) => x !== id),
                          }));
                        }}
                      />
                      <span>{name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--primary-muted)]">
              Only assigned users can see this client (unless they have CRM client manager permissions).
            </p>
          </div>

          {customFields.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-[var(--surface-dim)]">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-[0.12em]">
                Custom properties
              </p>
              {customFields.map((field) => {
                const value = existingCustom[field.key];
                const required = !!field.required;
                return (
                  <div key={field._id}>
                    <label className={LBL}>
                      {field.name}
                      {required ? <span className="text-[#f2545b] ml-0.5">*</span> : null}
                    </label>
                    {field.type === "select" ? (
                      <select
                        name={`cf_${field.key}`}
                        defaultValue={typeof value === "string" ? value : ""}
                        required={required}
                        className={SEL}
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((o: string) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "multiselect" ? (
                      <div className="rounded-md border border-[var(--border-color)] bg-white p-2.5 max-h-40 overflow-y-auto space-y-1">
                        {(field.options || []).map((o: string) => {
                          const selected = Array.isArray(value) && value.includes(o);
                          return (
                            <label key={o} className="flex items-center gap-2 text-xs text-[var(--text-main)]">
                              <input type="checkbox" name={`cf_${field.key}`} value={o} defaultChecked={selected} />
                              <span>{o}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : field.type === "textarea" ? (
                      <textarea
                        name={`cf_${field.key}`}
                        required={required}
                        defaultValue={typeof value === "string" ? value : ""}
                        className={`${INP} h-auto min-h-[90px] py-2 resize-y`}
                      />
                    ) : (
                      <input
                        name={`cf_${field.key}`}
                        type={field.type === "url" ? "url" : field.type || "text"}
                        required={required}
                        defaultValue={
                          typeof value === "string" || typeof value === "number" ? String(value) : ""
                        }
                        className={INP}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="pt-4 border-t border-[var(--surface-dim)]">
              {!showAddField ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddField(true);
                    setTimeout(() => document.getElementById("new-client-field-input")?.focus(), 50);
                  }}
                  className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--hs-link)] hover:bg-[var(--background)] py-3 rounded-md flex items-center justify-center gap-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-all"
                >
                  <Plus size={14} /> Add custom property
                </button>
              ) : (
                <div className="p-4 bg-[var(--background)] rounded-md border border-[var(--border-color)] space-y-3">
                  <p className="text-xs font-semibold text-[var(--text-main)]">New custom property</p>
                  <input
                    id="new-client-field-input"
                    type="text"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNewField()}
                    placeholder="e.g. Billing city"
                    className={CRM_HS_CONTROL_CLASS}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value)}
                    className={`${CRM_HS_CONTROL_CLASS} appearance-none cursor-pointer`}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="url">URL (link)</option>
                    <option value="select">Dropdown (single)</option>
                    <option value="multiselect">Dropdown (multi)</option>
                    <option value="textarea">Textarea</option>
                  </select>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddField(false);
                        setNewFieldName("");
                      }}
                      className="flex-1 py-2 rounded-md border border-[var(--border-color)] bg-white hover:bg-[var(--background)] text-sm font-semibold text-[var(--text-main)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNewField}
                      disabled={addingField || !newFieldName.trim()}
                      className="flex-1 py-2 rounded-md bg-[var(--hs-link)] text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-[var(--hs-link-hover)]"
                    >
                      {addingField ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {addingField ? "Adding…" : "Add property"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
