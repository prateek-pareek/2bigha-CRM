"use client";

import { useState, useRef } from "react";
import { CrmJiraPortal } from "@/components/crm/CrmJiraPortal";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { CRM_API_URL } from "@/lib/api/config";
import { invalidateCrmForEntityType } from "@/lib/crm/invalidate-on-mutation";
import {
  CRM_PHONE_COUNTRY_OPTIONS,
  getDefaultCountryCodeFromPhone,
  getNationalDigitsFromPhone,
} from "@/lib/crm/phone-country-codes";
import CrmSlidePanelShell from "@/components/crm/CrmSlidePanelShell";
import { usePermissions } from "@/hooks/usePermissions";

const LBL = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const INP =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--primary-muted)] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all";
const SEL =
  "w-full h-9 bg-white border border-[var(--border-color)] rounded-md px-3 text-sm text-[var(--text-main)] outline-none cursor-pointer focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/30 transition-all appearance-none";

const EMPLOYEE_OPTIONS = ["", "1-10", "11-50", "51-200", "201-500", "500+"];

interface OrgCreatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrgCreatePanel({ isOpen, onClose, onSuccess }: OrgCreatePanelProps) {
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
      title="Create organization"
      subtitle="Fill in the details below to add a new organization."
      headerTone="hubspot"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              saveAndAddAnotherRef.current = true;
              formRef.current?.requestSubmit();
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border-color)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--background)] transition-colors disabled:opacity-50"
          >
            {loading && saveAndAddAnotherRef.current ? <Loader2 size={15} className="animate-spin" /> : null}
            {loading && saveAndAddAnotherRef.current ? "Saving…" : "Create & Add Another"}
          </button>
          <button
            form="org-create-form"
            type="submit"
            disabled={loading}
            onClick={() => { saveAndAddAnotherRef.current = false; }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--hs-link)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--hs-link-hover)] transition-colors shadow-sm disabled:opacity-50"
          >
            {loading && !saveAndAddAnotherRef.current ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {loading && !saveAndAddAnotherRef.current ? "Creating…" : "Create Org"}
          </button>
        </div>
      }
    >
      <form id="org-create-form" ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        {/* Organization name */}
        <div>
          <label className={LBL}>Organization name <span className="text-[#f2545b]">*</span></label>
          <input name="name" type="text" required placeholder="Acme Corp" className={INP} />
        </div>

        {/* Website */}
        <div>
          <label className={LBL}>Website</label>
          <input name="website" type="url" placeholder="https://…" className={INP} />
        </div>

        {/* Annual revenue */}
        {canViewCrmRevenue ? (
        <div>
          <label className={LBL}>Annual revenue</label>
          <input name="annualRevenue" type="number" placeholder="0.00" className={INP} />
        </div>
        ) : null}

        {/* Territory + No. of employees */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Territory</label>
            <input name="territory" type="text" className={INP} />
          </div>
          <div>
            <label className={LBL}>No. of employees</label>
            <select name="noOfEmployees" className={SEL}>
              {EMPLOYEE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === "" ? "—" : o}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Industry */}
        <div>
          <label className={LBL}>Industry</label>
          <input name="industry" type="text" className={INP} />
        </div>

        {/* Phone */}
        <div>
          <label className={LBL}>Phone</label>
          <div className="relative flex items-center">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="absolute left-0 z-10 w-[7rem] h-9 bg-white text-xs text-[var(--text-main)] outline-none cursor-pointer border-r border-[var(--border-color)] pl-2 pr-1 appearance-none rounded-l-[3px]"
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

        {/* Email */}
        <div>
          <label className={LBL}>Email</label>
          <input name="email" type="email" placeholder="contact@example.com" className={INP} />
        </div>

        {/* Address */}
        <div>
          <label className={LBL}>Address</label>
          <input name="address" type="text" className={INP} />
        </div>
      </form>
    </CrmSlidePanelShell>
  );

  return <CrmJiraPortal>{panel}</CrmJiraPortal>;
}
