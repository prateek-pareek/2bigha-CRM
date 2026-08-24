"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Building2, User, Users, Plus, X, Loader2, Search } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AnyRec = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  name?: string;
  stage?: string;
  industry?: string;
};

function leadLabel(l: AnyRec) {
  const n = `${l.firstName || ""} ${l.lastName || ""}`.trim();
  return n || l.email || "Lead";
}

function orgLabel(o: AnyRec) {
  return o.name || "Company";
}

function contactLabel(c: AnyRec) {
  const n = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  return n || c.email || "Contact";
}

/** Link leads, companies, and contacts to a client (same pattern as contacts). */
export default function ClientAssociationsPanel({
  clientId,
  client,
  onUpdated,
}: {
  clientId: string;
  client: Record<string, unknown>;
  onUpdated: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, AnyRec[]> | null>(null);

  const sourceLeadId = useMemo(() => {
    const s = client?.sourceLead;
    if (!s) return null;
    if (typeof s === "object" && s !== null && "_id" in s) return String((s as { _id: string })._id);
    return String(s);
  }, [client?.sourceLead]);

  const leads = useMemo(() => {
    const raw = (client?.associatedLeads as AnyRec[]) || [];
    const sl = client?.sourceLead;
    if (!sl) return raw;
    const sid =
      typeof sl === "object" && sl !== null && "_id" in sl ? String((sl as { _id: string })._id) : String(sl);
    if (raw.some((l) => String(l._id) === sid)) return raw;
    const asLead =
      typeof sl === "object" && sl !== null && "_id" in sl
        ? (sl as AnyRec)
        : ({ _id: sid, firstName: "", lastName: "" } as AnyRec);
    return [asLead, ...raw];
  }, [client?.associatedLeads, client?.sourceLead]);

  const sortedLeads = useMemo(() => {
    if (!sourceLeadId) return leads;
    return [...leads].sort((a, b) => {
      const aSrc = String(a._id) === sourceLeadId ? -1 : 0;
      const bSrc = String(b._id) === sourceLeadId ? -1 : 0;
      return aSrc - bSrc;
    });
  }, [leads, sourceLeadId]);

  const orgs = (client?.associatedOrganizations as AnyRec[]) || [];
  const people = (client?.associatedContacts as AnyRec[]) || [];

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) {
        setResults(null);
        return;
      }
      const run = async () => {
        setSearching(true);
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`${CRM_API_URL}/crm/search?q=${encodeURIComponent(q.trim())}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setResults(await res.json());
        } catch {
          setResults(null);
        } finally {
          setSearching(false);
        }
      };
      void run();
    }, 320);
    return () => clearTimeout(t);
  }, [q]);

  const idsFor = (field: string) => ((client[field] as AnyRec[]) || []).map((x) => String(x._id || x));

  const patchAssociations = async (body: Record<string, string[]>) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Could not update associations");
      return;
    }
    toast.success("Associations updated");
    onUpdated();
    setAddOpen(false);
    setQ("");
    setResults(null);
  };

  const remove = (field: string, id: string) => {
    if (field === "associatedLeads" && sourceLeadId && id === sourceLeadId) {
      toast.message("This lead is the original source for this client and stays linked.");
      return;
    }
    const next = idsFor(field).filter((x) => x !== id);
    void patchAssociations({ [field]: next });
  };

  const addExisting = (field: string, id: string) => {
    const cur = idsFor(field);
    if (cur.includes(id)) {
      toast.message("Already associated");
      return;
    }
    void patchAssociations({ [field]: [...cur, id] });
  };

  const Row = ({
    href,
    title,
    subtitle,
    onRemove,
    canRemove = true,
    badge,
  }: {
    href: string;
    title: string;
    subtitle?: string;
    onRemove: () => void;
    canRemove?: boolean;
    badge?: string;
  }) => (
    <div className="flex items-center gap-2 group rounded-[var(--radius-md)] border border-border/80 bg-surface-dim/20 px-3 py-2">
      <Link href={href} className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <p className="text-sm font-semibold text-text-main truncate hover:text-primary">{title}</p>
          {badge ? (
            <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-primary bg-[var(--primary-light)] px-1.5 py-0.5 rounded-md border border-primary/20">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="text-xs text-text-muted truncate">{subtitle}</p> : null}
      </Link>
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
          title="Remove association"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-[var(--crm-radius-ui)] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-text-muted">Associated records</h3>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold uppercase tracking-wide border transition-colors",
            addOpen ? "bg-primary text-white border-primary" : "bg-surface-dim text-text-main border-border hover:border-primary/40",
          )}
        >
          <Plus size={14} />
          Link record
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4 leading-relaxed">
        Link related leads, companies, or contacts. Email engagement can include activity on linked records.
      </p>

      {addOpen && (
        <div className="mb-5 p-4 rounded-[var(--radius-md)] border border-border bg-surface-dim/30 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              className="w-full pl-10 pr-3 py-2.5 rounded-[var(--radius-md)] border border-border bg-card text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Search CRM to link…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" size={16} />}
          </div>
          {results && q.trim().length >= 2 && (
            <div className="max-h-56 overflow-y-auto space-y-3 text-sm">
              {(results.leads?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1.5">Leads</p>
                  <ul className="space-y-1">
                    {results.leads!.map((l) => (
                      <li key={l._id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border"
                          onClick={() => addExisting("associatedLeads", l._id)}
                        >
                          {leadLabel(l)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(results.organizations?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1.5">Companies</p>
                  <ul className="space-y-1">
                    {results.organizations!.map((o) => (
                      <li key={o._id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border"
                          onClick={() => addExisting("associatedOrganizations", o._id)}
                        >
                          {orgLabel(o)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(results.contacts?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1.5">Contacts</p>
                  <ul className="space-y-1">
                    {results.contacts!.map((c) => (
                      <li key={c._id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border"
                          onClick={() => addExisting("associatedContacts", c._id)}
                        >
                          {contactLabel(c)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!searching &&
                q.trim().length >= 2 &&
                !(results.leads?.length || results.organizations?.length || results.contacts?.length) && (
                  <p className="text-xs text-text-muted py-2">No matches — try another name or email.</p>
                )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-muted">
            <User size={12} />
            Leads
          </div>
          {sortedLeads.length === 0 ? (
            <p className="text-xs text-text-muted italic">No leads linked</p>
          ) : (
            <div className="space-y-2">
              {sortedLeads.map((l) => {
                const isSource = Boolean(sourceLeadId && String(l._id) === sourceLeadId);
                return (
                  <Row
                    key={l._id}
                    href={`/crm/leads/${l._id}`}
                    title={leadLabel(l)}
                    subtitle={l.email}
                    badge={isSource ? "Source" : undefined}
                    canRemove={!isSource}
                    onRemove={() => remove("associatedLeads", l._id)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-muted">
            <Building2 size={12} />
            Companies
          </div>
          {orgs.length === 0 ? (
            <p className="text-xs text-text-muted italic">No companies linked</p>
          ) : (
            <div className="space-y-2">
              {orgs.map((o) => (
                <Row
                  key={o._id}
                  href={`/crm/organizations/${o._id}`}
                  title={orgLabel(o)}
                  subtitle={o.industry}
                  onRemove={() => remove("associatedOrganizations", o._id)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-muted">
            <Users size={12} />
            Contacts
          </div>
          {people.length === 0 ? (
            <p className="text-xs text-text-muted italic">No contacts linked</p>
          ) : (
            <div className="space-y-2">
              {people.map((c) => (
                <Row
                  key={c._id}
                  href={`/crm/contacts/${c._id}`}
                  title={contactLabel(c)}
                  subtitle={c.email}
                  onRemove={() => remove("associatedContacts", c._id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
