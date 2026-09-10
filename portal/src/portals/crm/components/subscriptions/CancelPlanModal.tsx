"use client";

import React, { useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { cancelPmPlan } from "../../lib/subscriptions/backend-api";

interface CancelPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  userPropertyId: string;
  planName?: string;
  onSuccess?: () => void;
}

export default function CancelPlanModal({
  isOpen,
  onClose,
  leadId,
  userPropertyId,
  planName,
  onSuccess,
}: CancelPlanModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCancel = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cancelPmPlan({
        leadId,
        userPropertyId,
        reason: reason.trim() || undefined,
      });
      if (res?.success) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError(res?.message || "Failed to cancel subscription.");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Error cancelling subscription.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-red-400 mb-4">
          <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Cancel Subscription</h3>
            <p className="text-xs text-slate-400">
              {planName ? `Plan: ${planName}` : `Property ID: ${userPropertyId}`}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-4 leading-relaxed">
          Are you sure you want to cancel this Property Management subscription? This action will disable visit quotas and stop service tracking on 2bigha.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Reason for Cancellation (Optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Customer churn, refund requested, duplicate order, etc."
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Keep Active
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}
