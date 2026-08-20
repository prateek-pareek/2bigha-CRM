"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Briefcase, User, Users, Plus, X, Loader2, Search, Scale } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  fetchLegalCase,
  fetchLegalCases,
  linkLegalCaseLead,
  unlinkLegalCaseLead,
  type LegalCase,
} from '@/lib/crm/legal-cases-api';
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

function dealLabel(d: AnyRec) {
  return d.title || "Deal";
}

function orgLabel(o: AnyRec) {
  return o.name || "Company";
}

function contactLabel(c: AnyRec) {
  const n = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  return n || c.email || "Contact";
}

/** Link other leads, deals, companies, and contacts to this lead. */
export default function LeadAssociationsPanel({
  leadId,
  lead,
  onUpdated,
}: {
  leadId: string;
  lead: Record<string, unknown>;
  onUpdated: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, AnyRec[]> | null>(null);

  const relatedLeads = ((lead?.associatedLeads as AnyRec[]) || []).filter(
    (l) => String(l._id) !== String(leadId),
  );
  const deals = (lead?.associatedDeals as AnyRec[]) || [];
  const orgs = (lead?.associatedOrganizations as AnyRec[]) || [];
  const people = (lead?.associatedContacts as AnyRec[]) || [];

  // `associatedLegalCases` comes back as raw ids (the Lead read path doesn't populate
  // this cross-module link), so fetch each case's summary for display.
  const legalCaseIds = ((lead?.associatedLegalCases as (string | { _id: string })[]) || []).map((x) =>
    String((x as { _id?: string })?._id || x),
  );
  const [legalCases, setLegalCases] = useState<LegalCase[]>([]);
  const [legalCasesLoading, setLegalCasesLoading] = useState(false);
  const [legalBusyId, setLegalBusyId] = useState<string | null>(null);
  const [legalAddOpen, setLegalAddOpen] = useState(false);
  const [legalQ, setLegalQ] = useState("");
  const [legalResults, setLegalResults] = useState<LegalCase[] | null>(null);
  const [legalSearching, setLegalSearching] = useState(false);

  useEffect(() => {
    if (legalCaseIds.length === 0) {
      setLegalCases([]);
      return;
    }
    let cancelled = false;
    setLegalCasesLoading(true);
    Promise.all(legalCaseIds.map((id) => fetchLegalCase(id)))
      .then((rows) => {
        if (!cancelled) setLegalCases(rows.filter((r): r is LegalCase => Boolean(r)));
      })
      .finally(() => {
        if (!cancelled) setLegalCasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the id list changes
  }, [legalCaseIds.join(",")]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (legalQ.trim().length < 2) {
        setLegalResults(null);
        return;
      }
      setLegalSearching(true);
      fetchLegalCases({ search: legalQ.trim(), limit: 8 })
        .then((res) => setLegalResults(res.data))
        .catch(() => setLegalResults(null))
        .finally(() => setLegalSearching(false));
    }, 320);
    return () => clearTimeout(t);
  }, [legalQ]);

  const linkLegalCase = async (caseId: string) => {
    if (legalCaseIds.includes(caseId)) {
      toast.message("Already linked");
      return;
    }
    setLegalBusyId(caseId);
    try {
      await linkLegalCaseLead(caseId, leadId);
      toast.success("Legal case linked");
      onUpdated();
      setLegalAddOpen(false);
      setLegalQ("");
      setLegalResults(null);
    } catch (err: any) {
      toast.error(err?.message || "Could not link legal case");
    } finally {
      setLegalBusyId(null);
    }
  };

  const unlinkLegalCase = async (caseId: string) => {
    setLegalBusyId(caseId);
    try {
      await unlinkLegalCaseLead(caseId, leadId);
      toast.success("Legal case unlinked");
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Could not unlink legal case");
    } finally {
      setLegalBusyId(null);
    }
  };

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

  const idsFor = (field: string) => ((lead[field] as AnyRec[]) || []).map((x) => String(x._id || x));

  const patchAssociations = async (body: Record<string, string[]>) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/leads/${leadId}`, {
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
    if (field === "associatedLeads" && id === leadId) {
      toast.message("Cannot remove this lead from itself.");
      return;
    }
    const next = idsFor(field).filter((x) => x !== id);
    void patchAssociations({ [field]: next });
  };

  const addExisting = (field: string, id: string) => {
    if (field === "associatedLeads" && id === leadId) {
      toast.error("Cannot associate a lead with itself");
      return;
    }
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
  }: {
    href: string;
    title: string;
    subtitle?: string;
    onRemove: () => void;
  }) => {
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
    return (
      <div
        className="crm-kanban-card group !mt-0 !p-3 flex items-center gap-2"
        style={{ ["--crm-stage-accent" as string]: "#2f80ed" }}
      >
        <div className="crm-kanban-avatar crm-kanban-avatar--sm shrink-0" aria-hidden>
          {initials}
        </div>
        <Link href={href} className="flex-1 min-w-0 no-underline">
          <p className="crm-kanban-card-title truncate text-sm">{title}</p>
          {subtitle ? <p className="crm-kanban-card-subtitle">{subtitle}</p> : null}
        </Link>
        <button
          type="button"
          onClick={onRemove}
          className="crm-kanban-card-action shrink-0 hover:!text-rose-600"
          title="Remove association"
        >
          <X size={14} />
        </button>
      </div>
    );
  };

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
        Link other leads, deals, companies, or contacts when the same person or account spans multiple records.
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
                    {results.leads!
                      .filter((l) => String(l._id) !== String(leadId))
                      .map((l) => (
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
              {(results.deals?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-text-muted mb-1.5">Deals</p>
                  <ul className="space-y-1">
                    {results.deals!.map((d) => (
                      <li key={d._id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border"
                          onClick={() => addExisting("associatedDeals", d._id)}
                        >
                          {dealLabel(d)}
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
                !(results.leads?.length || results.deals?.length || results.organizations?.length || results.contacts?.length) && (
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
            Related leads
          </div>
          {relatedLeads.length === 0 ? (
            <p className="text-xs text-text-muted italic">No other leads linked</p>
          ) : (
            <div className="space-y-2">
              {relatedLeads.map((l) => (
                <Row
                  key={l._id}
                  href={`/crm/leads/${l._id}`}
                  title={leadLabel(l)}
                  subtitle={l.email}
                  onRemove={() => remove("associatedLeads", l._id)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-muted">
            <Briefcase size={12} />
            Deals
          </div>
          {deals.length === 0 ? (
            <p className="text-xs text-text-muted italic">No deals linked</p>
          ) : (
            <div className="space-y-2">
              {deals.map((d) => (
                <Row
                  key={d._id}
                  href={`/crm/deals/${d._id}`}
                  title={dealLabel(d)}
                  subtitle={d.stage}
                  onRemove={() => remove("associatedDeals", d._id)}
                />
              ))}
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

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
              <Scale size={12} />
              Legal cases
            </div>
            <button
              type="button"
              onClick={() => setLegalAddOpen((o) => !o)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {legalAddOpen ? "Close" : "Link case"}
            </button>
          </div>

          {legalAddOpen && (
            <div className="mb-3 p-3 rounded-[var(--radius-md)] border border-border bg-surface-dim/30 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                <input
                  className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] border border-border bg-card text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="Search legal cases…"
                  value={legalQ}
                  onChange={(e) => setLegalQ(e.target.value)}
                />
                {legalSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" size={14} />
                )}
              </div>
              {legalResults && legalQ.trim().length >= 2 && (
                <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
                  {legalResults.length === 0 ? (
                    <p className="text-xs text-text-muted py-1">No matches — try another title.</p>
                  ) : (
                    legalResults.map((lc) => (
                      <li key={lc._id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border disabled:opacity-50"
                          disabled={legalBusyId === lc._id}
                          onClick={() => linkLegalCase(lc._id)}
                        >
                          {lc.title}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}

          {legalCasesLoading ? (
            <p className="text-xs text-text-muted italic">Loading…</p>
          ) : legalCases.length === 0 ? (
            <p className="text-xs text-text-muted italic">No legal cases linked</p>
          ) : (
            <div className="space-y-2">
              {legalCases.map((lc) => (
                <Row
                  key={lc._id}
                  href={`/crm/legal/${lc._id}`}
                  title={lc.title}
                  subtitle={lc.stage}
                  onRemove={() => unlinkLegalCase(lc._id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
