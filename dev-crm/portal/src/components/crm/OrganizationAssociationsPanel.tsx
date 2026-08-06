"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Briefcase, User, Plus, X, Loader2, Search } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AnyRec = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  stage?: string;
  dealValue?: number;
};

function dealLabel(d: AnyRec) {
  return d.title || "Deal";
}

function contactLabel(c: AnyRec) {
  const n = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  return n || c.email || "Contact";
}

export default function OrganizationAssociationsPanel({
  organizationId,
  org,
  onUpdated,
}: {
  organizationId: string;
  org: Record<string, unknown>;
  onUpdated: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, AnyRec[]> | null>(null);

  const contacts = (org?.associatedContacts as AnyRec[]) || [];
  const deals = (org?.associatedDeals as AnyRec[]) || [];

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

  const idsFor = (field: string) => ((org[field] as AnyRec[]) || []).map((x) => String(x._id || x));

  const patchAssociations = async (body: Record<string, string[]>) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${CRM_API_URL}/crm/organizations/${organizationId}`, {
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
  }: {
    href: string;
    title: string;
    subtitle?: string;
    onRemove: () => void;
  }) => (
    <div className="flex items-center gap-2 group rounded-[3px] border border-border/80 bg-surface-dim/20 px-3 py-2">
      <Link href={href} className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-main truncate hover:text-primary">{title}</p>
        {subtitle ? <p className="text-xs text-text-muted truncate">{subtitle}</p> : null}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
        title="Remove association"
      >
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-[24px] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-xs font-bold text-text-muted">Associated records</h3>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-xs font-bold uppercase tracking-wide border transition-colors",
            addOpen ? "bg-primary text-white border-primary" : "bg-surface-dim text-text-main border-border hover:border-primary/40"
          )}
        >
          <Plus size={14} />
          Link record
        </button>
      </div>
      <p className="text-xs text-text-muted mb-4 leading-relaxed">
        Link contacts and deals to this company. Changes stay in sync with the related contact and deal records.
      </p>

      {addOpen && (
        <div className="mb-5 p-4 rounded-[3px] border border-border bg-surface-dim/30 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              className="w-full pl-10 pr-3 py-2.5 rounded-[3px] border border-border bg-card text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Search contacts or deals…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" size={16} />}
          </div>
          {results && q.trim().length >= 2 && (
            <div className="max-h-56 overflow-y-auto space-y-3 text-sm">
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
                !(results.deals?.length || results.contacts?.length) && (
                  <p className="text-xs text-text-muted py-2">No matches — try another name or title.</p>
                )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-text-muted">
            <User size={12} />
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
                  title={contactLabel(c)}
                  subtitle={c.email}
                  onRemove={() => remove("associatedContacts", c._id)}
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
      </div>
    </div>
  );
}
