"use client";

import { useState } from "react";
import { Search, Loader2, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { CrmSectionCard, CrmStatusBadge } from "@/components/crm/ui";
import { fetchPMOrderStatus } from "../../lib/subscriptions/backend-api";
import type { PMOrderStatus } from "../../lib/subscriptions/types";
import Link from "next/link";

export default function OrderDiagnosticTool() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PMOrderStatus | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await fetchPMOrderStatus(orderId.trim());
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const getStatusTone = (status: string): "neutral" | "success" | "warning" | "info" => {
    const s = status.toUpperCase();
    if (s === "SUCCESS" || s === "COMPLETED") return "success";
    if (s === "PROCESSING" || s === "INITIATED" || s === "PENDING") return "warning";
    return "neutral"; 
  };

  return (
    <CrmSectionCard title="Payment Diagnostic Tool" bodyClassName="p-4 space-y-4">
      <div className="text-sm text-[var(--text-muted)] mb-3">
        Enter a Razorpay Order ID to check its real-time payment and property binding status.
      </div>
      
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <input
            type="text"
            className="block w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-dim)] py-2 pl-9 pr-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:border-[var(--brand-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-main)]"
            placeholder="e.g. order_O123456789"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !orderId.trim()}
          className="inline-flex items-center justify-center rounded-md bg-[var(--brand-main)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-main-hover)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check Status"}
        </button>
      </form>

      {hasSearched && !loading && !result && (
        <div className="mt-4 rounded-md border border-dashed border-[var(--border-color)] bg-[var(--surface-dim)] p-6 text-center text-sm text-[var(--text-muted)]">
          No order found for <span className="font-mono text-[var(--text-main)]">{orderId}</span>.
        </div>
      )}

      {result && !loading && (
        <div className="mt-4 rounded-md border border-[var(--border-color)] bg-[var(--surface-base)] p-4 shadow-sm transition-all">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--text-main)] text-sm">Order ID:</span>
              <span className="font-mono text-sm text-[var(--text-muted)]">{result.orderId}</span>
            </div>
            <CrmStatusBadge tone={getStatusTone(result.status)}>{result.status}</CrmStatusBadge>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1">
                Property Binding Status
              </span>
              {result.userPropertyId ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-500 font-medium">✓ Bound successfully</span>
                  <span className="text-[var(--text-muted)]">•</span>
                  <Link 
                    href={`/crm/property-listings/${result.userPropertyId}`}
                    className="inline-flex items-center gap-1 text-[var(--brand-main)] hover:underline font-medium"
                  >
                    View Property <LinkIcon size={12} />
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500 font-medium">
                  <AlertTriangle size={14} />
                  <span>Not bound to any property</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </CrmSectionCard>
  );
}
