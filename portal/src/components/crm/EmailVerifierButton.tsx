"use client";

import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import {
  fetchEmailIntelligenceStatus,
  verifyEmailAddress,
  formatVerificationLabel,
} from '@/lib/crm/email-intelligence';

type Props = {
  email: string;
  disabled?: boolean;
  className?: string;
};

export default function EmailVerifierButton({ email, disabled, className = '' }: Props) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchEmailIntelligenceStatus().then(
      (s) => setAvailable(s.capabilities.emailVerifier.available),
    );
  }, []);

  const normalized = String(email || '').trim();
  if (!available || !normalized.includes('@')) return null;

  const handleVerify = async () => {
    setLoading(true);
    try {
      const result = await verifyEmailAddress(normalized);
      const label = formatVerificationLabel(result);
      alert(
        `Verified via ${result.provider}\n${result.email}\n${label}${result.deliverable ? '\n✓ Likely deliverable' : '\n✗ May not be deliverable'}`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleVerify()}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 ${className}`}
      title="Verify email deliverability"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
      Verify email
    </button>
  );
}
