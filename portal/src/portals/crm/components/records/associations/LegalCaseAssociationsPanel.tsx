"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { User, Users, Plus, X, Loader2, Search } from "lucide-react";
import { CRM_API_URL } from '@/lib/crm/config';
import {
  linkLegalCaseContact,
  linkLegalCaseLead,
  unlinkLegalCaseContact,
  unlinkLegalCaseLead,
} from '@/lib/crm/legal-cases-api';
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AnyRec = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  stage?: string;
};

function personLabel(p: AnyRec) {
  const n = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  return n || p.email || "Untitled";
}

/** Link contacts and leads to this legal case (via the dedicated link endpoints). */
export default function LegalCaseAssociationsPanel({
  caseId,
  legalCase,
  onUpdated,
}: {
  caseId: string;
  legalCase: Record<string, unknown>;
  onUpdated: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, AnyRec[]> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const contacts = (legalCase?.associatedContacts as AnyRec[]) || [];
  const leads = (legalCase?.associatedLeads as AnyRec[]) || [];

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

  const idsFor = (field: string) =>
    ((legalCase[field] as AnyRec[]) || []).map((x) => String(x._id || x));

  const addContact = async (id: string) => {
    if (idsFor("associatedContacts").includes(id)) {
      toast.message("Already linked");
      return;
    }
    setBusyId(id);
    try {
      await linkLegalCaseContact(caseId, id);
      toast.success("Contact linked");
      onUpdated();
      setAddOpen(false);
      setQ("");
      setResults(null);
    } catch (err: any) {
      toast.error(err?.message || "Could not link contact");
    } finally {
      setBusyId(null);
    }
  };

  const removeContact = async (id: string) => {
    setBusyId(id);
    try {
      await unlinkLegalCaseContact(caseId, id);
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Could not unlink contact");
    } finally {
      setBusyId(null);
    }
  };

  const addLead = async (id: string) => {
    if (idsFor("associatedLeads").includes(id)) {
      toast.message("Already linked");
      return;
    }
    setBusyId(id);
    try {
      await linkLegalCaseLead(caseId, id);
      toast.success("Lead linked");
      onUpdated();
      setAddOpen(false);
      setQ("");
      setResults(null);
    } catch (err: any) {
      toast.error(err?.message || "Could not link lead");
    } finally {
      setBusyId(null);
    }
  };

  const removeLead = async (id: string) => {
    setBusyId(id);
    try {
      await unlinkLegalCaseLead(caseId, id);
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Could not unlink lead");
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({
    href,
    title,
    subtitle,
    onRemove,
    busy,
  }: {
    href: string;
    title: string;
    subtitle?: string;
    onRemove: () => void;
    busy?: boolean;
  }) => {
    const initials =
      title
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
          disabled={busy}
          className="crm-kanban-card-action shrink-0 hover:!text-rose-600 disabled:opacity-50"
          title="Remove association"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
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
        Link the contacts and leads connected to this legal case.
      </p>

      {addOpen && (
        <div className="mb-5 p-4 rounded-[var(--radius-md)] border border-border bg-surface-dim/30 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              className="w-full pl-10 pr-3 py-2.5 rounded-[var(--radius-md)] border border-border bg-card text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Search contacts or leads…"
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
                          onClick={() => addLead(l._id)}
                        >
                          {personLabel(l)}
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
                          onClick={() => addContact(c._id)}
                        >
                          {personLabel(c)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!searching &&
                q.trim().length >= 2 &&
                !(results.leads?.length || results.contacts?.length) && (
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
          {leads.length === 0 ? (
            <p className="text-xs text-text-muted italic">No leads linked</p>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => (
                <Row
                  key={l._id}
                  href={`/crm/leads/${l._id}`}
                  title={personLabel(l)}
                  subtitle={l.email}
                  onRemove={() => removeLead(l._id)}
                  busy={busyId === l._id}
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
          {contacts.length === 0 ? (
            <p className="text-xs text-text-muted italic">No contacts linked</p>
          ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <Row
                  key={c._id}
                  href={`/crm/contacts/${c._id}`}
                  title={personLabel(c)}
                  subtitle={c.email}
                  onRemove={() => removeContact(c._id)}
                  busy={busyId === c._id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
