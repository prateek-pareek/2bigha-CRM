"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Phone, Building2, PhoneCall } from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { getCrmAuthToken } from "@/lib/crm/api";
import { CrmPageHeader, CrmButton } from "@/components/crm/ui";
import { contactWhatsappUrl, contactWhatsappWaId } from "@/lib/crm/crm-messaging-links";
import CallLeadModal from "@/components/crm/records/detail/CallLeadModal";
import AddPropertyModal from "@/components/crm/records/detail/AddPropertyModal";
import CallActivityFormModal from "@/components/crm/records/detail/CallActivityFormModal";

type IntentLead = {
  _id: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  phone?: string;
  mobileNo?: string;
  leadOwner?: string;
  leadIntents?: string[];
  leadIntentFollowUpAt?: string;
  createdAt?: string;
};

const INTENT_OPTIONS = ["Buyer", "Seller", "Subscription", "Farm", "Property Management", "Investor"];

export default function LeadIntentListPage() {
  const router = useRouter();
  const [items, setItems] = useState<IntentLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [intentFilter, setIntentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [callLead, setCallLead] = useState<IntentLead | null>(null);
  const [propertyLead, setPropertyLead] = useState<IntentLead | null>(null);
  const [activityLead, setActivityLead] = useState<IntentLead | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getCrmAuthToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (intentFilter) params.set("intent", intentFilter);
      const res = await fetch(`${CRM_API_URL}/crm/lead-intent/list?${params.toString()}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : { items: [], total: 0 };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, page, intentFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const fullName = (l: IntentLead) => `${l.firstName || ""} ${l.lastName || ""}`.trim() || "Unnamed lead";

  return (
    <div className="p-4 sm:p-6">
      <CrmPageHeader
        title="Lead Intent"
        bordered={false}
        breadcrumbs={[{ label: "Home", href: "/crm" }, { label: "Leads", href: "/crm/leads" }, { label: "Intent" }]}
        actions={
          <CrmButton type="button" variant="secondary" onClick={() => router.push("/crm/reports/lead-intent")}>
            Analytics
          </CrmButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setIntentFilter("");
            setPage(1);
          }}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            !intentFilter
              ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
              : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--primary)]/50"
          }`}
        >
          All
        </button>
        {INTENT_OPTIONS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setIntentFilter(label);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              intentFilter === label
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--primary)]/50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-2.5">Lead</th>
              <th className="px-4 py-2.5">Intent</th>
              <th className="px-4 py-2.5">Follow up</th>
              <th className="px-4 py-2.5">Owner</th>
              <th className="px-4 py-2.5 text-right">Quick actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  <Loader2 size={16} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No leads with a recorded intent yet.
                </td>
              </tr>
            ) : (
              items.map((lead) => (
                <tr
                  key={lead._id}
                  className="border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--surface-dim)]"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/crm/leads/${lead._id}`)}
                      className="font-medium text-[var(--text-main)] hover:text-[var(--primary)] hover:underline"
                    >
                      {fullName(lead)}
                    </button>
                    {lead.organization ? (
                      <div className="text-xs text-[var(--text-muted)]">{lead.organization}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(lead.leadIntents || []).map((i) => (
                        <span
                          key={i}
                          className="rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">
                    {lead.leadIntentFollowUpAt ? new Date(lead.leadIntentFollowUpAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{lead.leadOwner || "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="Call"
                        onClick={() => setCallLead(lead)}
                        className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
                      >
                        <Phone size={14} />
                      </button>
                      {contactWhatsappUrl(lead) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const waId = contactWhatsappWaId(lead);
                            if (waId) router.push(`/crm/whatsapp?wa=${waId}`);
                          }}
                          title="WhatsApp"
                          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-emerald-600"
                        >
                          <PhoneCall size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Add Property"
                        onClick={() => setPropertyLead(lead)}
                        className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--primary)]"
                      >
                        <Building2 size={14} />
                      </button>
                      <CrmButton type="button" variant="secondary" onClick={() => setActivityLead(lead)}>
                        Call Activity
                      </CrmButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{total} lead(s)</span>
        <div className="flex items-center gap-2">
          <CrmButton type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </CrmButton>
          <CrmButton
            type="button"
            variant="secondary"
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </CrmButton>
        </div>
      </div>

      <CallLeadModal
        open={!!callLead}
        onClose={() => setCallLead(null)}
        phone={callLead?.mobileNo || callLead?.phone}
        leadId={callLead?._id}
        leadName={callLead ? fullName(callLead) : undefined}
        onSuccess={() => {
          const lead = callLead;
          setCallLead(null);
          if (lead) {
            setActivityLead(lead);
          }
        }}
      />
      <AddPropertyModal
        open={!!propertyLead}
        onClose={() => setPropertyLead(null)}
        leadId={propertyLead?._id}
        leadName={propertyLead ? fullName(propertyLead) : undefined}
        onSuccess={() => setPropertyLead(null)}
      />
      <CallActivityFormModal
        open={!!activityLead}
        onClose={() => setActivityLead(null)}
        leadId={activityLead?._id}
        leadName={activityLead ? fullName(activityLead) : undefined}
        onSuccess={() => void load()}
      />
    </div>
  );
}
