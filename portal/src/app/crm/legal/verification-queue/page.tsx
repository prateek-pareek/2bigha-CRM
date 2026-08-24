"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Scale, ShieldCheck } from "lucide-react";
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
} from "@/components/crm/ui";
import {
  fetchTwoBighaLegalVerificationQueue,
  type LegalVerificationBucket,
  type LegalVerificationProperty,
} from "@/lib/crm/twobigha-legal-verification-api";

const BUCKET_KEY = "crm_legal_verification_queue_bucket_v1";

const BUCKETS: { key: LegalVerificationBucket; label: string; icon: typeof Clock3 }[] = [
  { key: "pending", label: "Pending", icon: Clock3 },
  { key: "verified", label: "Verified", icon: ShieldCheck },
];

function parseBucket(raw: string | null): LegalVerificationBucket {
  return raw === "verified" ? "verified" : "pending";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function TwoBighaLegalVerificationQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full animate-pulse p-6">
          <div className="h-8 w-64 rounded bg-[var(--surface-dim)]" />
        </div>
      }
    >
      <TwoBighaLegalVerificationQueuePageContent />
    </Suspense>
  );
}

function TwoBighaLegalVerificationQueuePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [bucket, setBucket] = useState<LegalVerificationBucket>(() =>
    parseBucket(searchParams.get("bucket")),
  );
  const [rows, setRows] = useState<LegalVerificationProperty[]>([]);
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
    (next: LegalVerificationBucket) => {
      setBucket(next);
      setPage(1);
      try {
        localStorage.setItem(BUCKET_KEY, next);
      } catch {
        /* ignore */
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set("bucket", next);
      router.replace(`/crm/legal/verification-queue?${params.toString()}`);
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTwoBighaLegalVerificationQueue(bucket, { page, limit: pageSize });
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
      toast.error("Failed to load the legal verification queue");
    } finally {
      setLoading(false);
    }
  }, [bucket, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [bucket]);

  const bucketMeta = BUCKETS.find((b) => b.key === bucket)!;

  return (
    <div className="theme-crm-hubspot crm-list-page mx-auto w-full animate-in fade-in duration-500 pb-10">
      <CrmPageHeader
        bordered={false}
        title="2bigha Legal Verification Queue"
        icon={<Scale size={18} />}
        badge={<CrmCountBadge>{total}</CrmCountBadge>}
        description="Live read-through to 2bigha's property legal-verification queue — review only, no verify/reject action here yet. Separate from the subscription-bundled Legal Verification workflow below."
        breadcrumbs={[
          { label: "Home", href: "/crm/workspace/summary" },
          { label: "Legal", href: "/crm/legal" },
          { label: "2bigha Verification Queue" },
        ]}
        actions={<CrmHeaderTools onRefresh={() => void load()} />}
        className="mb-4"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Link
          href="/crm/legal"
          className="font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          ← Legal cases
        </Link>
        <span className="text-[var(--text-muted)]">·</span>
        <Link
          href="/crm/legal/verification"
          className="font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          Subscription legal verification
        </Link>
      </div>

      {!configured && !loading ? (
        <div className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          2bigha isn&apos;t configured on this backend (missing
          TWOBIGHA_API_HOST/KEY/SECRET, or TWOBIGHA_USE_MOCK is set) — the
          legal verification queue has no live data to show until
          credentials are set.
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
          title={`No ${bucketMeta.label.toLowerCase()} verifications`}
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
                <th className="sticky top-0 z-10">Approval status</th>
                <th className="sticky top-0 z-10">Verification</th>
                <th className="sticky top-0 z-10">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const p = row.property;
                const location = [p.city, p.state].filter(Boolean).join(", ") || "—";
                const isVerified = row.verification?.isVerified ?? p.isVerified;
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
                      <CrmListMutedText>{p.approvalStatus || "—"}</CrmListMutedText>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <CrmStatusBadge tone={isVerified ? "success" : "warning"}>
                          {isVerified ? "Verified" : "Not verified"}
                        </CrmStatusBadge>
                        {row.verification?.verificationMessage ? (
                          <span className="text-xs text-[var(--text-muted)]">
                            {row.verification.verificationMessage}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <CrmListMutedText>{formatDate(p.createdAt)}</CrmListMutedText>
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
