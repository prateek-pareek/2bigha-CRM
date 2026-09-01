"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Clock3, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CRM_TOOLBAR_CHIP, CRM_TOOLBAR_CHIP_ACTIVE } from "@/lib/crm/ui";
import { cn } from "@/lib/utils";
import Pagination from "@/components/suite/shell/Pagination";
import {
  CrmCountBadge,
  CrmEmptyState,
  CrmHeaderTools,
  CrmListMutedText,
  CrmPageHeader,
  CrmStatusBadge,
  CrmTable,
  CrmTableShell,
  crmStatusToneFromLabel,
} from "@/components/crm/ui";
import {
  fetchApprovalQueue,
  decidePropertyApproval,
  type ApprovalQueueBucket,
  type ApprovalQueueProperty,
} from "@/lib/crm/property-listings/approval-queue-api";

const BUCKET_KEY = "crm_property_approval_bucket_v1";

const BUCKETS: { key: ApprovalQueueBucket; label: string; icon: typeof Clock3 }[] = [
  { key: "pending", label: "Pending", icon: Clock3 },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", icon: XCircle },
];

function parseBucket(raw: string | null): ApprovalQueueBucket {
  if (raw === "approved" || raw === "rejected") return raw;
  return "pending";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function PropertyApprovalQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <PropertyApprovalQueuePageContent />
    </Suspense>
  );
}

function PropertyApprovalQueuePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [bucket, setBucket] = useState<ApprovalQueueBucket>(() =>
    parseBucket(searchParams.get("bucket")),
  );
  const [rows, setRows] = useState<ApprovalQueueProperty[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const fromUrl = searchParams.get("bucket");
    if (fromUrl) {
      setBucket(parseBucket(fromUrl));
      return;
    }
    try {
      const saved = localStorage.getItem(BUCKET_KEY);
      if (saved) setBucket(parseBucket(saved));
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const changeBucket = useCallback(
    (next: ApprovalQueueBucket) => {
      setBucket(next);
      setPage(1);
      try {
        localStorage.setItem(BUCKET_KEY, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("bucket", next);
      router.replace(`/crm/property-approval?${params.toString()}`);
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchApprovalQueue(bucket, { page, limit: pageSize });
      if (!result) {
        setConfigured(false);
        setRows([]);
        setTotal(0);
        return;
      }
      setConfigured(true);
      setRows(result.data || []);
      setTotal(result.meta?.total ?? result.data?.length ?? 0);
    } catch {
      toast.error("Failed to load the approval queue");
    } finally {
      setLoading(false);
    }
  }, [bucket, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDecide = async (id: string, decision: "Approved" | "Rejected") => {
    let message: string | undefined = undefined;
    if (decision === "Rejected") {
      const reason = prompt("Enter rejection reason (optional):");
      if (reason === null) return; // cancelled
      message = reason.trim() || undefined;
    }

    try {
      await decidePropertyApproval({ id, status: decision, message });
      setRows((prev) => prev.filter((r) => r.property.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success(`Property ${decision.toLowerCase()} successfully!`);
      void load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || `Failed to ${decision.toLowerCase()} property`);
    }
  };

  const bucketMeta = BUCKETS.find((b) => b.key === bucket)!;

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="Property Approval Queue"
        icon={<ClipboardCheck size={18} />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Live moderation approval queue for 2bigha property listings — approve or reject submissions in real time."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Property Approval Queue" },
        ]}
        actions={<CrmHeaderTools onRefresh={() => void load()} />}
        className="mb-4"
      />

      {!configured && !loading ? (
        <div className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          2bigha isn&apos;t configured on this backend (missing
          TWOBIGHA_API_HOST/KEY/SECRET, or TWOBIGHA_USE_MOCK is set) — the
          approval queue has no live data to show until credentials are set.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => changeBucket(b.key)}
            className={cn(CRM_TOOLBAR_CHIP, bucket === b.key && CRM_TOOLBAR_CHIP_ACTIVE)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {loading ? (
        <CrmTableShell>
          <CrmTable>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td>
                    <div className="h-4 w-3/4 rounded-md bg-[var(--surface-dim)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      ) : rows.length === 0 ? (
        <CrmEmptyState
          icon={<bucketMeta.icon className="h-7 w-7" strokeWidth={1.5} />}
          title={`No ${bucketMeta.label.toLowerCase()} properties`}
          description={
            configured
              ? "2bigha returned no properties in this bucket."
              : "Configure 2bigha credentials to see live data here."
          }
        />
      ) : (
        <CrmTableShell>
          <CrmTable>
            <thead>
              <tr>
                <th className="sticky top-0 z-10">Property</th>
                <th className="sticky top-0 z-10">Location</th>
                <th className="sticky top-0 z-10">Price</th>
                <th className="sticky top-0 z-10">Approval status</th>
                <th className="sticky top-0 z-10">Submitted</th>
                <th className="sticky top-0 z-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const p = row.property;
                const location = [p.city, p.state].filter(Boolean).join(", ") || "—";
                return (
                  <tr key={p.id} className="transition-colors">
                    <td>
                      <div className="min-w-0 max-w-[280px]">
                        <p className="truncate text-sm font-medium text-[var(--text-main)]">
                          {p.title || p.propertyName || "Untitled property"}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {p.address || "—"}
                        </p>
                      </div>
                    </td>
                    <td>
                      <CrmListMutedText>{location}</CrmListMutedText>
                    </td>
                    <td>
                      <span className="text-sm font-semibold text-[var(--text-main)]">
                        {p.price != null ? p.price.toLocaleString() : "—"}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <CrmStatusBadge tone={crmStatusToneFromLabel(p.approvalStatus || bucket)}>
                          {p.approvalStatus || bucketMeta.label}
                        </CrmStatusBadge>
                        {p.approvalMessage ? (
                          <span className="text-xs text-[var(--text-muted)]">
                            {p.approvalMessage}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <CrmListMutedText>{formatDate(p.createdAt)}</CrmListMutedText>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {bucket !== "approved" && (
                          <button
                            type="button"
                            onClick={() => handleDecide(p.id, "Approved")}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        )}
                        {bucket !== "rejected" && (
                          <button
                            type="button"
                            onClick={() => handleDecide(p.id, "Rejected")}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400 transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CrmTable>
        </CrmTableShell>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        className="mt-3 rounded-[var(--crm-radius-ui)] border-t-0"
      />
    </div>
  );
}
