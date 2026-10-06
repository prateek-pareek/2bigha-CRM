"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Receipt,
  Download,
  CreditCard,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  Tag,
} from "lucide-react";
import { CrmButton } from "@/components/crm/ui";
import {
  fetchTwoBighaClientInvoices,
  type LeadInvoice,
} from "@/portals/crm/lib/twobigha-client-api";

interface Props {
  clientId: string;
}

export default function Client2BighaInvoicesTab({ clientId }: Props) {
  const [invoices, setInvoices] = useState<LeadInvoice[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTwoBighaClientInvoices(clientId);
      setInvoices(res.result || []);
      setTotalCount(res.totalCount || 0);
    } catch (err) {
      console.error("Failed to load client invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between p-3.5 bg-card rounded-[var(--crm-radius-ui)] border border-border">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-primary" />
          <span className="text-xs font-bold text-text">Client Billing & Invoices</span>
          <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full font-semibold text-text-muted">
            {totalCount} total
          </span>
        </div>
        <CrmButton variant="ghost" className="!h-8 !px-2.5" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </CrmButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted gap-2">
          <Loader2 size={18} className="animate-spin text-primary" />
          <span className="text-xs">Loading invoices from 2bigha...</span>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-[var(--crm-radius-ui)] border border-dashed border-border">
          <Receipt size={36} className="mx-auto text-text-muted mb-2 opacity-50" />
          <h4 className="text-sm font-semibold text-text">No invoices found</h4>
          <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
            This client does not have any billing or invoice records on 2Bigha.
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-[var(--crm-radius-ui)] border border-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border text-[11px] font-bold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Plan / Cycle</th>
                  <th className="py-3 px-4">Base Amt</th>
                  <th className="py-3 px-4">GST</th>
                  <th className="py-3 px-4">Total Amt</th>
                  <th className="py-3 px-4">Payment Info</th>
                  <th className="py-3 px-4">Issued Date</th>
                  <th className="py-3 px-4">Features</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv, idx) => (
                  <tr key={inv.invoiceNumber || idx} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-primary">
                      {inv.invoiceNumber || `#INV-${inv.id || idx + 1}`}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-text">{inv.planName || "Standard Plan"}</div>
                      <div className="text-[10px] text-text-muted capitalize">{inv.billingCycle || "Monthly"}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-text-muted">
                      ₹{Number(inv.baseAmount || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4 font-mono text-text-muted">
                      ₹{Number(inv.gstAmount || 0).toLocaleString("en-IN")} ({inv.gstPercent || 18}%)
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-text">
                      ₹{Number(inv.totalAmount || (inv.baseAmount || 0) + (inv.gstAmount || 0)).toLocaleString("en-IN")}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={12} className="text-text-muted" />
                        <span className="capitalize text-text font-medium">{inv.paymentMethod || inv.paymentType || "Razorpay"}</span>
                      </div>
                      {inv.razorpayPaymentId && (
                        <div className="text-[10px] font-mono text-text-muted truncate max-w-[120px]" title={inv.razorpayPaymentId}>
                          {inv.razorpayPaymentId}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-text-muted">
                      {inv.issuedAt || inv.startsAt
                        ? new Date(inv.issuedAt || inv.startsAt!).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {inv.features && inv.features.length > 0 ? (
                          inv.features.map((f, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium"
                            >
                              <Tag size={9} />
                              {f.displayText || f.featureKey}: {f.featureValue}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
