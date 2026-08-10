"use client";

import Link from "next/link";
import { Building2, X } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from "sonner";

type AnyOrg = { _id: string; name?: string; industry?: string };

function primaryOrgNameFromContact(contact: Record<string, unknown>): string {
  const o = contact.organization;
  if (typeof o === "object" && o !== null && "name" in o && (o as { name?: string }).name) {
    return String((o as { name: string }).name);
  }
  if (typeof o === "string") return o;
  return "";
}

/** Primary company on lead/contact record — sidebar card (not in main properties grid). */
export function CRMLeadCompanySidebarCard({
  lead,
  show,
}: {
  lead: Record<string, unknown>;
  show: boolean;
}) {
  if (!show) return null;

  const raw = lead.organization;
  const name =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "name" in raw
        ? String((raw as { name?: string }).name || "")
        : "";

  const href = name ? `/crm/organizations?search=${encodeURIComponent(name)}` : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-1.5">
        <Building2 size={14} className="text-primary shrink-0" />
        Company
      </h3>
      {name && href ? (
        <Link
          href={href}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-2 break-words"
        >
          <Building2 size={14} className="text-text-muted shrink-0" />
          {name}
        </Link>
      ) : (
        <p className="text-xs font-medium text-text-muted">—</p>
      )}
    </div>
  );
}

function OrgRow({
  href,
  title,
  subtitle,
  onRemove,
}: {
  href: string;
  title: string;
  subtitle?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 group rounded-lg border border-border bg-surface-raised px-3 py-2">
      <Link href={href} className="flex-1 min-w-0">
        <p className="text-xs font-bold text-text-primary truncate hover:text-primary">{title}</p>
        {subtitle ? <p className="text-[11px] font-medium text-text-muted truncate">{subtitle}</p> : null}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Remove association"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function orgLabel(o: AnyOrg) {
  return o.name || "Company";
}

/** Primary company + associated organization records — sidebar (contact detail). */
export function CRMContactCompanySidebarCard({
  contact,
  contactId,
  showPrimaryField,
  onUpdated,
}: {
  contact: Record<string, unknown>;
  contactId: string;
  showPrimaryField: boolean;
  onUpdated: () => void;
}) {
  const primary = primaryOrgNameFromContact(contact);
  const orgs = (contact.associatedOrganizations as AnyOrg[]) || [];

  const primaryHref = primary
    ? `/crm/organizations?search=${encodeURIComponent(primary)}`
    : undefined;

  const idsForOrgs = () => (orgs || []).map((x) => String(x._id || x));

  const removeOrg = (id: string) => {
    const next = idsForOrgs().filter((x) => x !== id);
    const token = localStorage.getItem("token");
    void fetch(`${CRM_API_URL}/crm/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ associatedOrganizations: next }),
    })
      .then((res) => {
        if (!res.ok) {
          toast.error("Could not update associations");
          return;
        }
        toast.success("Associations updated");
        onUpdated();
      })
      .catch(() => toast.error("Could not update associations"));
  };

  if (!showPrimaryField && orgs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--crm-shadow-card)]">
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3.5 flex items-center gap-1.5">
        <Building2 size={14} className="text-primary shrink-0" />
        Company
      </h3>

      {showPrimaryField ? (
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">On record</p>
          {primary && primaryHref ? (
            <Link
              href={primaryHref}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-2 break-words"
            >
              <Building2 size={14} className="text-text-muted shrink-0" />
              {primary}
            </Link>
          ) : (
            <p className="text-xs font-medium text-text-muted">—</p>
          )}
        </div>
      ) : null}

      {orgs.length > 0 ? (
        <div>
          {showPrimaryField ? (
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Associated companies</p>
          ) : (
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Linked companies</p>
          )}
          <div className="space-y-2">
            {orgs.map((o) => (
              <OrgRow
                key={o._id}
                href={`/crm/organizations/${o._id}`}
                title={orgLabel(o)}
                subtitle={o.industry}
                onRemove={() => removeOrg(o._id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
