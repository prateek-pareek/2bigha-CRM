"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { CRM_API_URL } from "@/lib/crm/config";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type SyncResult = {
  scanned: number;
  domainsProcessed: number;
  organizationsCreated: number;
  organizationsReused: number;
  contactsLinked: number;
  contactsAlreadyLinked: number;
  skippedPublicDomain: number;
  skippedNoEmail: number;
  errors: string[];
};

export default function DomainCompaniesSettingsPage() {
  const { hasAccess, isLoaded } = usePermissions();
  const canManage =
    hasAccess("admin:manage") ||
    (hasAccess("organizations:write") && hasAccess("contacts:write"));

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<SyncResult | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const run = useCallback(async (dryRun: boolean) => {
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      if (dryRun) {
        const res = await fetch(
          `${CRM_API_URL}/crm/admin/domain-companies/preview`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          toast.error("Preview failed");
          return;
        }
        const data = await res.json();
        setPreview(data);
        toast.success("Preview ready");
      } else {
        const res = await fetch(
          `${CRM_API_URL}/crm/admin/domain-companies/sync`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          },
        );
        if (!res.ok) {
          toast.error("Sync failed");
          return;
        }
        const data = await res.json();
        setResult(data);
        toast.success(
          `Linked ${data.contactsLinked} contacts · created ${data.organizationsCreated} companies`,
        );
      }
    } catch {
      toast.error(dryRun ? "Preview failed" : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="flex items-center gap-2 text-slate-600">
          <ShieldAlert className="h-4 w-4" />
          You need admin or contacts + organizations write access.
        </p>
      </div>
    );
  }

  const stats = result || preview;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div className="flex items-start gap-3">
        <Link
          href="/crm/settings"
          className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Building2 className="h-6 w-6 text-slate-700" />
            Domain → company sync
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Contacts with the same corporate email domain (e.g.{" "}
            <code className="rounded bg-slate-100 px-1">@acme.com</code>) are
            linked to one company. Public domains like Gmail, Outlook, Yahoo,
            Zoho mail are skipped. New contacts do this automatically; use sync
            below for existing data.
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Extract domain from contact email (skip gmail.com, outlook.com,
            yahoo.com, zoho.in, google.com, …)
          </li>
          <li>
            Find or create a company with website{" "}
            <code className="rounded bg-slate-100 px-1">https://domain</code>
          </li>
          <li>
            Associate every contact on that domain with the company
            (bidirectional)
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void run(true)}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={() => void run(false)}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Run sync on existing contacts
          </Button>
        </div>
      </section>

      {stats && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {result ? "Last sync" : "Preview"} results
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Contacts scanned" value={stats.scanned} />
            <Stat label="Domains processed" value={stats.domainsProcessed} />
            <Stat
              label="Companies created"
              value={stats.organizationsCreated}
            />
            <Stat
              label="Companies reused"
              value={stats.organizationsReused}
            />
            <Stat label="Contacts linked" value={stats.contactsLinked} />
            <Stat
              label="Already linked"
              value={stats.contactsAlreadyLinked}
            />
            <Stat
              label="Skipped (public email)"
              value={stats.skippedPublicDomain}
            />
            <Stat label="Skipped (no email)" value={stats.skippedNoEmail} />
          </dl>
          {!!stats.errors?.length && (
            <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-red-600">
              {stats.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
