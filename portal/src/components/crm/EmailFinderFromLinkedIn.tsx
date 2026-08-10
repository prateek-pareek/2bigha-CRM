"use client";

import { useEffect, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import {
  fetchEmailIntelligenceStatus,
  findEmailFromLinkedIn,
  primaryEmailFromFinderResult,
} from '@/lib/crm/email-intelligence';

type Props = {
  linkedinUrl: string;
  existingEmail?: string;
  disabled?: boolean;
  onEmailFound?: (email: string) => void | Promise<void>;
  className?: string;
};

export default function EmailFinderFromLinkedIn({
  linkedinUrl,
  existingEmail,
  disabled,
  onEmailFound,
  className = '',
}: Props) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchEmailIntelligenceStatus().then((s) =>
      setAvailable(s.capabilities.linkedinFinder.available),
    );
  }, []);

  const hasEmail = Boolean(String(existingEmail || '').trim());
  const linkedIn = String(linkedinUrl || '').trim();

  if (!available || !linkedIn || hasEmail) return null;

  const handleFind = async () => {
    setLoading(true);
    try {
      const result = await findEmailFromLinkedIn(linkedIn);
      const email = primaryEmailFromFinderResult(result);
      if (!email) {
        alert('No email found for this LinkedIn profile.');
        return;
      }
      if (onEmailFound && !confirm(`Save ${email} on this record?`)) return;
      await onEmailFound?.(email);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Email finder failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void handleFind()}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#0A66C2]/30 bg-[#0A66C2]/5 text-[#0A66C2] text-xs font-semibold hover:bg-[#0A66C2]/10 disabled:opacity-50 ${className}`}
      title="Find email from LinkedIn via Tomba"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
      Find email
    </button>
  );
}
