"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, GitMerge, Loader2, RefreshCw } from "lucide-react";
import {
  backfillAssociations,
  fetchAssociationTypes,
  type CrmAssociationTypeDef,
} from "@/portals/crm/lib/custom-objects/custom-objects-api";
import { CrmButton } from "@/components/crm/ui";

export default function AssociationsSettingsPage() {
  const [types, setTypes] = useState<CrmAssociationTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAssociationTypes();
        if (!cancelled) setTypes(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runBackfill = async () => {
    setBackfilling(true);
    setResult(null);
    setError(null);
    try {
      const MAX_LOOPS = 500;
      let loop = 0;
      let totalScanned = 0;
      let totalUpserted = 0;
      let totalErrors = 0;
      let module: string | undefined;
      let afterId: string | undefined;
      let hasMore = true;

      while (hasMore && loop < MAX_LOOPS) {
        loop += 1;
        const res = await backfillAssociations({
          batchSize: 500,
          maxBatches: 40,
          module,
          afterId,
        });
        totalScanned += res.scanned;
        totalUpserted += res.upserted;
        totalErrors += res.errors;
        hasMore = res.hasMore;
        module = res.nextModule;
        afterId = res.nextAfterId;

        setResult(
          `Progress: scanned ${totalScanned} · upserted ${totalUpserted} · ${totalErrors} errors` +
            (hasMore
              ? ` · resuming ${module ?? "next module"}${afterId ? ` @ ${afterId.slice(0, 8)}…` : ""}`
              : " · complete"),
        );

        if (res.done || !hasMore) break;
      }

      if (loop >= MAX_LOOPS && hasMore) {
        setResult(
          (prev) =>
            `${prev ?? ""} · stopped after ${MAX_LOOPS} batches (resume by clicking again)`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link
            href="/crm/settings"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--hs-link)] transition-colors"
          >
            <ChevronLeft size={14} /> Settings
          </Link>
          <h1 className="text-[22px] font-semibold text-[var(--text-main)] flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary-light)] text-[var(--primary)]">
              <GitMerge size={20} />
            </span>
            Associations
          </h1>
          <p className="text-sm text-[var(--primary-muted)] mt-1 max-w-2xl">
            First-class association edges (HubSpot-style) dual-written alongside existing
            associated* arrays. Existing record panels keep working; new edges also land in
            the <code className="text-xs">crm_associations</code> collection.
          </p>
        </div>
        <CrmButton
          variant="secondary"
          leftIcon={
            backfilling ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )
          }
          disabled={backfilling}
          onClick={runBackfill}
        >
          {backfilling ? "Backfilling…" : "Backfill from arrays"}
        </CrmButton>
      </div>

      {error && (
        <div className="rounded-md border border-[var(--error)]/30 bg-[var(--error)]/5 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-md border border-[var(--border-color)] bg-[var(--primary-light)] px-4 py-3 text-sm text-[var(--primary)]">
          {result}
        </div>
      )}

      <div className="rounded-md border border-[var(--border-color)] bg-card overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-surface-dim/40">
          <h2 className="text-sm font-semibold text-[var(--text-main)]">
            Built-in association types
          </h2>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border-color)]">
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">From → To</th>
                  <th className="px-4 py-2.5 font-semibold">Labels</th>
                  <th className="px-4 py-2.5 font-semibold">Legacy fields</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr
                    key={t.key}
                    className="border-b border-[var(--border-color)] last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-main)]">
                      {t.key}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {t.fromType} → {t.toType}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {t.label} / {t.inverseLabel}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">
                      {t.legacyFromField}
                      {t.legacyToField ? ` ↔ ${t.legacyToField}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-md border border-[var(--border-color)] bg-card p-4 text-sm text-[var(--text-muted)] space-y-2">
        <p className="font-semibold text-[var(--text-main)]">API</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <code>GET /crm/associations?objectType=&amp;objectId=</code> — list edges for a
            record
          </li>
          <li>
            <code>POST /crm/associations</code> — create edge (also updates legacy arrays)
          </li>
          <li>
            <code>DELETE /crm/associations</code> — soft-delete edge (also pulls legacy arrays)
          </li>
          <li>
            <code>POST /crm/associations/backfill</code> — import existing arrays into the
            collection
          </li>
        </ul>
      </div>
    </div>
  );
}
