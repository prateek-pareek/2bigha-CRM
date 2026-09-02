"use client";

import { useState, useEffect } from "react";
import { UserCheck, User, Phone, MessageSquare } from "lucide-react";
import {
  CrmInput,
  CrmLabel,
  CrmSelect,
} from "@/components/crm/ui";
import type { PropertyListingWizardDraft } from "./Step1LandDetails";

export const COUNTRY_PHONE_CODES = [
  { code: "+91", country: "India", flag: "🇮🇳" },
  { code: "+1", country: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+971", country: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+974", country: "Qatar", flag: "🇶🇦" },
  { code: "+968", country: "Oman", flag: "🇴🇲" },
  { code: "+965", country: "Kuwait", flag: "🇰🇼" },
  { code: "+973", country: "Bahrain", flag: "🇧🇭" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
] as const;

interface Step3ContactDetailsProps {
  draft: PropertyListingWizardDraft;
  onChange: <K extends keyof PropertyListingWizardDraft>(
    key: K,
    value: PropertyListingWizardDraft[K]
  ) => void;
  leadName?: string;
  leadPhone?: string;
  errors?: Record<string, string>;
}

export function Step3ContactDetails({
  draft,
  onChange,
  leadName,
  leadPhone,
  errors = {},
}: Step3ContactDetailsProps) {
  const isFromLead = Boolean(leadName || leadPhone || draft.isLeadContact);
  const [phoneExt, setPhoneExt] = useState("+91");

  useEffect(() => {
    if (draft.phoneNumber) {
      const match = draft.phoneNumber.trim().match(/^(\+\d{1,3})/);
      if (match) {
        setPhoneExt(match[1]);
      }
    }
  }, [draft.phoneNumber]);

  const handlePhoneChange = (val: string, ext: string) => {
    const rawNumber = val.replace(/[^\d]/g, "");
    const formatted = rawNumber ? `${ext} ${rawNumber}` : "";
    onChange("phoneNumber", formatted);
    onChange("whatsappNumber", formatted);
  };

  const getPhoneDigits = (fullVal?: string) => {
    if (!fullVal) return "";
    const clean = fullVal.trim();
    const match = clean.match(/^\+(\d{1,3})\s*(.*)$/);
    if (match && match[2]) {
      return match[2].replace(/[^\d]/g, "");
    }
    const digits = clean.replace(/[^\d]/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
            3
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Contact Details</h2>
            <p className="text-xs text-[var(--text-muted)]">Owner contact information</p>
          </div>
        </div>

        {/* If lead is linked, display the stylized Contact from Lead card */}
        {isFromLead ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10 p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Contact (from Lead)
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 shadow-sm">
                  <UserCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    {draft.ownerName || leadName || "Lead Contact"}
                  </h3>
                  <p className="text-xs font-mono text-[var(--text-muted)]">
                    {draft.phoneNumber || leadPhone || "No phone recorded"}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                Pre-filled from lead
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <CrmLabel htmlFor="listerType">Lister Type *</CrmLabel>
              <CrmSelect
                id="listerType"
                value={
                  ["OWNER", "AGENT", "BUILDER", "COMPANY"].find(
                    (v) => v.toLowerCase() === (draft.listerType || "").toLowerCase()
                  ) || "OWNER"
                }
                onChange={(e) => onChange("listerType", e.target.value)}
              >
                <option value="OWNER">Owner</option>
                <option value="AGENT">Agent</option>
                <option value="BUILDER">Builder</option>
                <option value="COMPANY">Company</option>
              </CrmSelect>
            </div>

            <div>
              <CrmLabel htmlFor="ownerName">Owner Name *</CrmLabel>
              <div className="relative">
                <CrmInput
                  id="ownerName"
                  value={draft.ownerName}
                  onChange={(e) => onChange("ownerName", e.target.value)}
                  placeholder="Enter owner's full name"
                  className={`pl-9 ${errors.ownerName ? "border-rose-500" : ""}`}
                />
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
              {errors.ownerName && <p className="mt-1 text-xs text-rose-500">{errors.ownerName}</p>}
            </div>

            <div>
              <CrmLabel htmlFor="phoneNumber">Phone Number *</CrmLabel>
              <div className="flex gap-2">
                <CrmSelect
                  value={phoneExt}
                  onChange={(e) => {
                    setPhoneExt(e.target.value);
                    handlePhoneChange(getPhoneDigits(draft.phoneNumber), e.target.value);
                  }}
                  className="w-36 shrink-0"
                >
                  {COUNTRY_PHONE_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </CrmSelect>
                <div className="relative flex-1">
                  <CrmInput
                    id="phoneNumber"
                    value={getPhoneDigits(draft.phoneNumber)}
                    onChange={(e) => handlePhoneChange(e.target.value, phoneExt)}
                    placeholder="Enter 10-digit number"
                    className={`pl-9 ${errors.phoneNumber ? "border-rose-500" : ""}`}
                  />
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
              </div>
              {errors.phoneNumber && <p className="mt-1 text-xs text-rose-500">{errors.phoneNumber}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
