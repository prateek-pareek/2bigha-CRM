"use client";

import { useState, useEffect, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Save, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from "@/lib/crm/phone-country-codes";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import CrmMultiEmailListField from "@/components/crm/email/engagement/CrmMultiEmailListField";
import { parseAdditionalEmailsFromForm } from "@/lib/crm/crm-additional-emails";
import {
  CrmFormSection,
  CrmFormGrid,
  CRM_HS_CONTROL_CLASS,
  CRM_HS_LABEL_CLASS,
  CRM_HS_SELECT_CLASS,
} from "@/components/crm/records/forms/crm-form-primitives";
import { CrmButton } from "@/components/crm/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { twobighaClientSyncToastMessage } from "@/lib/crm/twobigha-client-api";

const LBL = CRM_HS_LABEL_CLASS;
const INP = CRM_HS_CONTROL_CLASS;
const SEL = CRM_HS_SELECT_CLASS;

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  client?: any;
}

export default function ClientModal({ isOpen, onClose, onSuccess, client }: ClientModalProps) {
  const { user, hasAccess } = usePermissions();
  const isAdmin = hasAccess("admin") || user?.role === "ADMIN";
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
        const saved = await res.json().catch(() => ({}));
        invalidateCrmForEntityType("client");
        if (client) {
          toast.success("Client updated");
        } else {
          toast.success(twobighaClientSyncToastMessage(saved?.twobighaSyncStatus));
        }
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

  const title = client ? "Edit Client" : "Add New Client";
  const existingCustom = (client?.customFields || {}) as Record<string, any>;

  const panel = (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      headerTone="hubspot"
      maxWidthClass="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <CrmButton variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          {!client ? (
            <>
              <CrmButton
                form="client-form"
                type="submit"
                variant="secondary"
                disabled={loading}
                onClick={() => setSaveAndAddAnother(true)}
              >
                {loading && saveAndAddAnother ? "Saving…" : "Save & Add Another"}
              </CrmButton>
              <CrmButton
                form="client-form"
                type="submit"
                disabled={loading}
                loading={loading && !saveAndAddAnother}
                onClick={() => setSaveAndAddAnother(false)}
                leftIcon={!loading || saveAndAddAnother ? <Save size={15} /> : undefined}
              >
                {loading && !saveAndAddAnother ? "Creating…" : "Create New"}
              </CrmButton>
            </>
          ) : (
            <CrmButton
              form="client-form"
              type="submit"
              disabled={loading}
              loading={loading}
              leftIcon={!loading ? <Save size={15} /> : undefined}
            >
              {loading ? "Saving…" : "Save Changes"}
            </CrmButton>
          )}
        </div>
      }
    >
      <form id="client-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <CrmFormSection title="Basic Info" defaultOpen>
          <CrmFormGrid>
            <div className="sm:col-span-2">
              <label className={LBL}>
                Full name<span className="text-[var(--primary)]">*</span>
              </label>
              <input
                required
                className={INP}
                placeholder="e.g. Jane Smith"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className={LBL}>
                Email<span className="text-[var(--primary)]">*</span>
              </label>
              <input
                type="email"
                required
                className={INP}
                placeholder="email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className={LBL}>Phone number</label>
              <div className="relative flex items-center">
                <select
                  value={formData.countryCode}
                  onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                  className="absolute left-0 z-10 w-[7rem] h-[38px] bg-[var(--card-bg)] text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[var(--radius-md)]"
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
            <div className="sm:col-span-2">
              <CrmMultiEmailListField
                key={`addl-${client?._id || "new"}-${(client?.additionalEmails || []).join(",")}`}
                initialEmails={Array.isArray(client?.additionalEmails) ? client.additionalEmails : []}
                visualVariant="hubspot"
              />
            </div>
          </CrmFormGrid>
        </CrmFormSection>

        <CrmFormSection title="Team Assignment" defaultOpen={false}>
          <CrmFormGrid>
            <div className="sm:col-span-2">
              <label className={LBL}>Assigned CRM users</label>
              <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 max-h-40 overflow-y-auto space-y-1.5 shadow-[var(--crm-shadow-input)]">
                {crmUsers.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] px-1 py-1">No CRM users available.</p>
                ) : (
                  crmUsers.map((u) => {
                    const id = String(u?._id || "");
                    const selected = formData.assignedTo.includes(id);
                    const name = `${String(u?.firstName || "").trim()} ${String(u?.lastName || "").trim()}`.trim() || String(u?.email || "User");
                    return (
                      <label key={id} className="flex items-center gap-2.5 px-1 py-0.5 text-sm text-[var(--text-main)]">
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
                          className="rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]/30"
                        />
                        <span>{name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Only assigned users can see this client (unless they have CRM client manager permissions).
              </p>
            </div>
          </CrmFormGrid>
        </CrmFormSection>

        {customFields.length > 0 && (
          <CrmFormSection title="Additional Info" defaultOpen={false}>
            <CrmFormGrid>
              {customFields.map((field) => {
                const value = existingCustom[field.key];
                const required = !!field.required;
                return (
                  <div key={field._id} className={field.type === "textarea" || field.type === "multiselect" ? "sm:col-span-2" : undefined}>
                    <label className={LBL}>
                      {field.name}
                      {required ? <span className="text-[var(--primary)] ml-0.5">*</span> : null}
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
                      <div className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] p-3 max-h-40 overflow-y-auto space-y-1.5">
                        {(field.options || []).map((o: string) => {
                          const selected = Array.isArray(value) && value.includes(o);
                          return (
                            <label key={o} className="flex items-center gap-2.5 text-sm text-[var(--text-main)]">
                              <input type="checkbox" name={`cf_${field.key}`} value={o} defaultChecked={selected} className="rounded border-[var(--border-color)] text-[var(--primary)]" />
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
                        className={`${INP} h-auto min-h-[90px] py-2.5 resize-y`}
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
            </CrmFormGrid>
          </CrmFormSection>
        )}

        {isAdmin && (
          <div className="pt-1">
            {!showAddField ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddField(true);
                  setTimeout(() => document.getElementById("new-client-field-input")?.focus(), 50);
                }}
                className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--primary)] hover:bg-[var(--background)] py-3 rounded-[var(--radius-md)] flex items-center justify-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-all"
              >
                <Plus size={14} /> Add custom property
              </button>
            ) : (
              <div className="p-4 bg-[var(--background)] rounded-[var(--radius-md)] border border-[var(--border-color)] space-y-3">
                <p className="text-sm font-semibold text-[var(--text-main)]">New custom property</p>
                <input
                  id="new-client-field-input"
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNewField()}
                  placeholder="e.g. Billing city"
                  className={INP}
                />
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  className={SEL}
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
                  <CrmButton
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setShowAddField(false);
                      setNewFieldName("");
                    }}
                  >
                    Cancel
                  </CrmButton>
                  <CrmButton
                    className="flex-1"
                    onClick={handleAddNewField}
                    disabled={addingField || !newFieldName.trim()}
                    loading={addingField}
                    leftIcon={!addingField ? <Check size={13} /> : undefined}
                  >
                    {addingField ? "Adding…" : "Add property"}
                  </CrmButton>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
