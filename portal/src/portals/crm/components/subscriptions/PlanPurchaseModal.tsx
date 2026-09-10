"use client";

import React, { useState, useEffect } from "react";
import { X, Sparkles, CheckCircle2, Loader2, CreditCard, UserCheck, ShieldCheck, ExternalLink } from "lucide-react";
import api from "@/lib/crm/api";
import { createPmOrder, verifyPmPayment } from "../../lib/subscriptions/backend-api";
import type { RazorpayOrderPayload } from "../../lib/subscriptions/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay script failed"));
    document.body.appendChild(script);
  });
}

interface PlanPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planId: number;
  planVariantId?: number;
  billingCycle: string;
  price: number;
  originalPrice?: number;
  gstPercent?: number;
  isPmPlan?: boolean;
}

export default function PlanPurchaseModal({
  isOpen,
  onClose,
  planName,
  planId,
  planVariantId,
  billingCycle,
  price,
  gstPercent = 18,
  isPmPlan = false,
}: PlanPurchaseModalProps) {
  const [leads, setLeads] = useState<Array<{ _id: string; firstName?: string; lastName?: string; clientName?: string; email?: string; mobileNo?: string; phone?: string }>>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [order, setOrder] = useState<RazorpayOrderPayload | null>(null);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual payment fields if user has payment ID / signature from Razorpay dashboard or webhook
  const [manualPaymentId, setManualPaymentId] = useState("");
  const [manualSignature, setManualSignature] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingLeads(true);
      setError(null);
      setOrder(null);
      setVerifySuccess(false);
      setShowManualForm(false);
      api.get<{ data?: any[]; docs?: any[]; result?: any[] }>("/crm/leads?limit=50")
        .then((res) => {
          const list = res.data?.data || res.data?.docs || res.data?.result || (Array.isArray(res.data) ? res.data : []);
          setLeads(list);
          if (list.length > 0) {
            setSelectedLeadId(list[0]._id);
          }
        })
        .catch((err) => console.error("Failed to load leads:", err))
        .finally(() => setLoadingLeads(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const gstAmount = Math.round((price * gstPercent) / 100);
  const totalPrice = price + gstAmount;

  const filteredLeads = leads.filter((l) => {
    const term = searchTerm.toLowerCase();
    const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || l.clientName || "";
    return (
      name.toLowerCase().includes(term) ||
      (l.email && l.email.toLowerCase().includes(term)) ||
      (l.mobileNo && l.mobileNo.includes(term)) ||
      (l.phone && l.phone.includes(term))
    );
  });

  const handleCreateOrder = async () => {
    if (!selectedLeadId) {
      setError("Please select a lead to assign this plan order.");
      return;
    }
    setCreatingOrder(true);
    setError(null);
    try {
      const res = await createPmOrder({
        leadId: selectedLeadId,
        planId,
        planVariantId: planVariantId || 1,
        billingCycle,
      });
      if (res) {
        setOrder(res);
      } else {
        setError("Failed to create order.");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Error creating plan order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const openRazorpayCheckout = async () => {
    if (!order || !selectedLeadId) return;
    setVerifyingPayment(true);
    setError(null);
    const rzpOrderId = order.razorpayOrderId || order.orderId;
    const keyId = order.keyId;

    try {
      await loadRazorpayScript();
      if (!window.Razorpay || !keyId) {
        setShowManualForm(true);
        setError("Razorpay SDK key is unavailable. Enter real payment credentials below or verify in 2bigha admin.");
        setVerifyingPayment(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency || "INR",
        order_id: rzpOrderId,
        name: "2bigha Property Management",
        description: `Plan: ${planName} (${billingCycle})`,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verified = await verifyPmPayment({
              leadId: selectedLeadId,
              planId,
              billingCycle,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (verified?.success) {
              setVerifySuccess(true);
            } else {
              setError(verified?.message || "Payment signature verification failed.");
            }
          } catch (err: any) {
            setError(err?.response?.data?.message || err?.message || "Payment verification failed.");
          } finally {
            setVerifyingPayment(false);
          }
        },
        modal: {
          ondismiss: () => {
            setVerifyingPayment(false);
          },
        },
      });
      rzp.open();
    } catch (e: any) {
      setShowManualForm(true);
      setError(e?.message || "Could not launch Razorpay checkout window.");
      setVerifyingPayment(false);
    }
  };

  const handleManualVerify = async () => {
    if (!order || !selectedLeadId || !manualPaymentId.trim() || !manualSignature.trim()) {
      setError("Please enter both Payment ID and Signature.");
      return;
    }
    setVerifyingPayment(true);
    setError(null);
    try {
      const res = await verifyPmPayment({
        leadId: selectedLeadId,
        planId,
        billingCycle,
        razorpayOrderId: order.razorpayOrderId || order.orderId,
        razorpayPaymentId: manualPaymentId.trim(),
        razorpaySignature: manualSignature.trim(),
      });
      if (res?.success) {
        setVerifySuccess(true);
      } else {
        setError(res?.message || "Invalid payment signature.");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Error verifying payment signature.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 text-[var(--text-main)] shadow-xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-primary/10 rounded-lg border border-primary/20 text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-main)]">Upgrade Plan: {planName}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isPmPlan ? "Property Management Service Plan" : "Marketplace Subscription Tier"} · {billingCycle}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-600 dark:text-red-400 leading-relaxed">
            {error}
          </div>
        )}

        {!order ? (
          <div className="space-y-4 mb-5">
            {/* Price Breakdown */}
            <div className="bg-[var(--surface-dim)] border border-[var(--border-color)] rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center text-[var(--text-muted)]">
                <span>Base Price:</span>
                <span className="font-medium text-[var(--text-main)]">₹{price.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center text-[var(--text-muted)]">
                <span>GST ({gstPercent}%):</span>
                <span className="font-medium text-[var(--text-main)]">+ ₹{gstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="pt-2 border-t border-[var(--border-color)] flex justify-between items-center text-sm font-bold text-[var(--text-main)]">
                <span>Total Amount:</span>
                <span className="text-[var(--primary)] text-base">₹{totalPrice.toLocaleString("en-IN")}</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] italic pt-1 border-t border-dashed border-[var(--border-color)]">
                Note: In 2bigha test environment, staging plan orders are generated with test amount (e.g. ₹1.18) for test payment verification.
              </p>
            </div>

            {/* Target Lead Selection */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                Assign Plan to Lead
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search lead by name, email, or phone..."
                className="w-full bg-[var(--surface-base)] border border-[var(--border-color)] rounded-lg p-2 text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] mb-2"
              />

              {loadingLeads ? (
                <div className="py-6 flex justify-center text-xs text-[var(--text-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading leads...
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1 bg-[var(--surface-dim)] p-1.5 rounded-lg border border-[var(--border-color)]">
                  {filteredLeads.length === 0 ? (
                    <div className="py-3 text-center text-xs text-[var(--text-muted)]">No matching leads found.</div>
                  ) : (
                    filteredLeads.map((l) => {
                      const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || l.clientName || "Unnamed Lead";
                      const isSelected = selectedLeadId === l._id;
                      return (
                        <button
                          key={l._id}
                          type="button"
                          onClick={() => setSelectedLeadId(l._id)}
                          className={`w-full text-left p-2 rounded text-xs flex items-center justify-between transition-colors ${
                            isSelected
                              ? "bg-red-500/10 text-red-600 dark:text-red-400 font-semibold border border-red-500/30"
                              : "text-[var(--text-main)] hover:bg-[var(--surface-base)]"
                          }`}
                        >
                          <div>
                            <div>{name}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{l.email || l.mobileNo || l.phone || l._id}</div>
                          </div>
                          {isSelected && <UserCheck className="w-4 h-4 shrink-0 text-red-500" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-5">
            <div className="bg-[var(--surface-dim)] border border-[var(--border-color)] rounded-lg p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm mb-1">
                <CheckCircle2 className="w-4 h-4" /> Order Created
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Order ID:</span>
                <span className="font-mono text-[var(--text-main)]">{order.orderId}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Razorpay Order:</span>
                <span className="font-mono text-[var(--text-main)]">{order.razorpayOrderId}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Total Amount:</span>
                <span className="font-bold text-[var(--text-main)]">₹{(order.amount / 100).toLocaleString("en-IN")}</span>
              </div>
            </div>

            {verifySuccess ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Payment verified & subscription plan activated!</span>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={openRazorpayCheckout}
                  disabled={verifyingPayment}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {verifyingPayment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  Pay with Razorpay Checkout
                </button>

                {showManualForm ? (
                  <div className="p-3 bg-[var(--surface-dim)] border border-[var(--border-color)] rounded-lg space-y-2 text-xs">
                    <div className="font-semibold text-[var(--text-main)]">Verify via Razorpay Signature:</div>
                    <input
                      type="text"
                      value={manualPaymentId}
                      onChange={(e) => setManualPaymentId(e.target.value)}
                      placeholder="Razorpay Payment ID (pay_...)"
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-color)] rounded p-2 text-xs text-[var(--text-main)]"
                    />
                    <input
                      type="text"
                      value={manualSignature}
                      onChange={(e) => setManualSignature(e.target.value)}
                      placeholder="Razorpay Signature (HMAC SHA256)"
                      className="w-full bg-[var(--surface-base)] border border-[var(--border-color)] rounded p-2 text-xs text-[var(--text-main)]"
                    />
                    <button
                      type="button"
                      onClick={handleManualVerify}
                      disabled={verifyingPayment}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium"
                    >
                      Submit Verification
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowManualForm(true)}
                    className="text-[11px] text-[var(--text-muted)] hover:underline block text-center w-full"
                  >
                    Enter Razorpay Payment Signature Manually
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--surface-dim)] hover:bg-[var(--surface-hover)] rounded-md border border-[var(--border-color)] transition-colors"
          >
            {order ? "Close" : "Cancel"}
          </button>
          {!order && (
            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={creatingOrder || !selectedLeadId}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-md flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
            >
              {creatingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Create Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
