"use client";

import React, { useState, useEffect } from "react";
import { X, ArrowUpCircle, CheckCircle2, Loader2, CreditCard } from "lucide-react";
import {
  fetchPMPlans,
  fetchProrationPreview,
  createPmUpgradeOrder,
} from "../../lib/subscriptions/backend-api";
import type {
  PMPlanCatalogItem,
  PMPlanVariant,
  ProrationPreviewResult,
  RazorpayOrderPayload,
} from "../../lib/subscriptions/types";

interface UpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  userPropertyId: string;
  currentPlanName?: string;
  onSuccess?: () => void;
}

export default function UpgradePlanModal({
  isOpen,
  onClose,
  leadId,
  userPropertyId,
  currentPlanName,
  onSuccess,
}: UpgradePlanModalProps) {
  const [plans, setPlans] = useState<PMPlanCatalogItem[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<PMPlanVariant | null>(null);
  const [preview, setPreview] = useState<ProrationPreviewResult | null>(null);
  const [order, setOrder] = useState<RazorpayOrderPayload | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoadingPlans(true);
      setError(null);
      setPreview(null);
      setOrder(null);
      setSelectedVariant(null);
      fetchPMPlans()
        .then((data) => setPlans(data || []))
        .catch((err) => setError("Failed to load PM plan catalog."))
        .finally(() => setLoadingPlans(false));
    }
  }, [isOpen]);

  const handleSelectVariant = async (variant: PMPlanVariant) => {
    setSelectedVariant(variant);
    setPreview(null);
    setOrder(null);
    setError(null);
    setLoadingPreview(true);
    try {
      const prev = await fetchProrationPreview(userPropertyId, variant.id);
      setPreview(prev);
    } catch (e: any) {
      setError("Could not calculate upgrade proration preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreateUpgradeOrder = async () => {
    if (!selectedVariant) return;
    setLoadingOrder(true);
    setError(null);
    try {
      const res = await createPmUpgradeOrder({
        leadId,
        userPropertyId,
        targetVariantId: selectedVariant.id,
      });
      if (res) {
        setOrder(res);
        if (onSuccess) onSuccess();
      } else {
        setError("Failed to create upgrade checkout order.");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Error creating upgrade order.");
    } finally {
      setLoadingOrder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-white shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-indigo-400 mb-4">
          <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <ArrowUpCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Upgrade PM Subscription</h3>
            <p className="text-xs text-slate-400">
              {currentPlanName ? `Current Plan: ${currentPlanName}` : `Property ID: ${userPropertyId}`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Select Target Plan */}
        {!order && (
          <div className="space-y-4 mb-5">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              1. Select Upgrade Target Plan
            </h4>

            {loadingPlans ? (
              <div className="py-8 flex justify-center text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans...
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {plans.flatMap((p) => p.variants || []).map((variant) => {
                  const isSelected = selectedVariant?.id === variant.id;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => handleSelectVariant(variant)}
                      className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? "bg-indigo-600/15 border-indigo-500 text-white"
                          : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm text-white">{variant.planName}</div>
                        <div className="text-xs text-slate-400">
                          {variant.billingCycle} · {variant.visitsPerCycle} Visits / Cycle
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-indigo-300">
                          ₹{variant.price.toLocaleString("en-IN")}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400 ml-auto mt-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Proration Calculation Preview */}
        {selectedVariant && !order && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 mb-5 space-y-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              2. Mid-Cycle Proration Breakdown
            </h4>

            {loadingPreview ? (
              <div className="py-4 flex items-center justify-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculating prorated cost...
              </div>
            ) : preview ? (
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Upgrade Tier Cost:</span>
                  <span>₹{preview.upgradeCost.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Unused Credit Deduction:</span>
                  <span>- ₹{preview.creditRemaining.toLocaleString("en-IN")}</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between font-semibold text-sm text-white">
                  <span>Net Amount Payable:</span>
                  <span className="text-indigo-400">
                    ₹{preview.netAmountDue.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">Click a plan above to view proration details.</div>
            )}
          </div>
        )}

        {/* Step 3: Order Generated Success View */}
        {order && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-5 h-5" /> Upgrade Order Created Successfully!
            </div>
            <div className="text-xs text-slate-300 space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono">
              <div>Order ID: {order.orderId}</div>
              <div>Razorpay Order: {order.razorpayOrderId}</div>
              <div>Total Amount: ₹{(order.amount / 100).toLocaleString("en-IN")}</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Share the Razorpay checkout order link or payment link with the lead to complete upgrade payment.
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {order ? "Done" : "Cancel"}
          </button>
          {!order && (
            <button
              onClick={handleCreateUpgradeOrder}
              disabled={!selectedVariant || loadingOrder || loadingPreview}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {loadingOrder ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              Generate Upgrade Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
