"use client";

import { useState, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/shell/CrmJiraPortal";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from "@/lib/crm/shared/invalidate-on-mutation";
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from "@/lib/crm/phone-country-codes";
import CrmSlidePanelShell from "@/components/crm/shell/CrmSlidePanelShell";
import { CrmButton } from "@/components/crm/ui";
import { CrmFormSection, CrmFormGrid } from "@/components/crm/records/forms/crm-form-primitives";
import { usePermissions } from "@/hooks/usePermissions";

const LBL = "mb-1.5 block text-[13px] font-medium text-[var(--text-main)]";
const INP =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all";
const SEL =
  "w-full h-[38px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-md)] px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer shadow-[var(--crm-shadow-input)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/25 transition-all appearance-none";

const EMPLOYEE_OPTIONS = ["", "1-10", "11-50", "51-200", "201-500", "500+"];

interface OrgCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Raise above a parent offcanvas (e.g. Add Lead). */
  zIndexClass?: string;
}

export default function OrgCreatePanel({ isOpen, onClose, onSuccess, zIndexClass }: OrgCreatePanelProps) {
  const { canViewCrmRevenue } = usePermissions();
  const [loading, setLoading] = useState(false);
  const saveAndAddAnotherRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [countryCode, setCountryCode] = useState("+91");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem("token");
    const fd = new FormData(e.currentTarget);

    const phoneNational = fd.get("phone") as string;
    const phone = phoneNational ? `${countryCode} ${phoneNational}`.trim() : "";

    const payload: Record<string, any> = {
      name: fd.get("name"),
      website: fd.get("website") || undefined,
      annualRevenue:
        canViewCrmRevenue && fd.get("annualRevenue")
          ? Number(fd.get("annualRevenue"))
          : undefined,
      territory: fd.get("territory") || undefined,
      noOfEmployees: fd.get("noOfEmployees") || undefined,
      industry: fd.get("industry") || undefined,
      phone: phone || undefined,
      email: fd.get("email") || undefined,
      address: fd.get("address") || undefined,
    };

    // Remove undefined keys
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    try {
      const res = await fetch(`${CRM_API_URL}/crm/organizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        invalidateCrmForEntityType("organization");
        if (saveAndAddAnotherRef.current) {
          formRef.current?.reset();
          setCountryCode("+91");
          toast.success("Organization created");
          onSuccess();
        } else {
          toast.success("Organization created");
          onClose();
          onSuccess();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.message === "string" ? data.message : "Operation failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const panel = (
    <CrmSlidePanelShell
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Company"
      subtitle="Basic company information"
      headerTone="hubspot"
      maxWidthClass="max-w-2xl"
      zIndexClass={zIndexClass}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <CrmButton variant="secondary" onClick={onClose}>
            Cancel
          </CrmButton>
          <CrmButton
            variant="secondary"
            disabled={loading}
            onClick={() => {
              saveAndAddAnotherRef.current = true;
              formRef.current?.requestSubmit();
            }}
          >
            {loading && saveAndAddAnotherRef.current ? "Saving…" : "Save & Add Another"}
          </CrmButton>
          <CrmButton
            form="org-create-form"
            type="submit"
            disabled={loading}
            loading={loading && !saveAndAddAnotherRef.current}
            onClick={() => { saveAndAddAnotherRef.current = false; }}
            leftIcon={!loading || saveAndAddAnotherRef.current ? <Save size={15} /> : undefined}
          >
            {loading && !saveAndAddAnotherRef.current ? "Creating…" : "Create New"}
          </CrmButton>
        </div>
      }
    >
      <form id="org-create-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <CrmFormSection title="Basic Info" defaultOpen>
          <CrmFormGrid>
            <div className="sm:col-span-2">
              <label className={LBL}>Company Name <span className="text-[var(--primary)]">*</span></label>
              <input name="name" type="text" required placeholder="Acme Corp" className={INP} />
            </div>
            <div>
              <label className={LBL}>Website</label>
              <input name="website" type="url" placeholder="https://…" className={INP} />
            </div>
            <div>
              <label className={LBL}>Industry</label>
              <input name="industry" type="text" className={INP} />
            </div>
            {canViewCrmRevenue ? (
              <div>
                <label className={LBL}>Annual Revenue</label>
                <input name="annualRevenue" type="number" placeholder="0.00" className={INP} />
              </div>
            ) : null}
            <div>
              <label className={LBL}>Territory</label>
              <input name="territory" type="text" className={INP} />
            </div>
            <div>
              <label className={LBL}>No. of Employees</label>
              <select name="noOfEmployees" className={SEL}>
                {EMPLOYEE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o === "" ? "—" : o}</option>
                ))}
              </select>
            </div>
          </CrmFormGrid>
        </CrmFormSection>

        <CrmFormSection title="Contact Info" defaultOpen={false}>
          <CrmFormGrid>
            <div>
              <label className={LBL}>Phone</label>
              <div className="relative flex items-center">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="absolute left-0 z-10 w-[7rem] h-[38px] bg-[var(--card-bg)] text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[var(--radius-md)]"
                >
                  {CRM_PHONE_COUNTRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="9876543210"
                  className={`${INP} pl-[7.5rem]`}
                  onChange={(e) => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, "");
                  }}
                />
              </div>
            </div>
            <div>
              <label className={LBL}>Email</label>
              <input name="email" type="email" placeholder="contact@example.com" className={INP} />
            </div>
            <div className="sm:col-span-2">
              <label className={LBL}>Address</label>
              <input name="address" type="text" className={INP} />
            </div>
          </CrmFormGrid>
        </CrmFormSection>
      </form>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
