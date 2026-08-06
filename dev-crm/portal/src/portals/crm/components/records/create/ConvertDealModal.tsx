"use client";

import { useState } from 'react';
import { X, UserCheck, CheckCircle2 } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { invalidateCrmForEntityType } from '@/lib/crm/shared/invalidate-on-mutation';
import { crmModalChrome } from '@/lib/crm/chrome';
import { CrmButton } from '@/components/crm/ui';

interface ConvertDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealTitle: string;
  onSuccess?: () => void;
}

export default function ConvertDealModal({ isOpen, onClose, dealId, dealTitle, onSuccess }: ConvertDealModalProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleConvert = async () => {
    if (!dealId) {
      alert('Invalid deal ID');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CRM_API_URL}/crm/deals/${dealId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        invalidateCrmForEntityType('deal');
        invalidateCrmForEntityType('client');
        setSuccess(true);
        onSuccess?.();
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 2000);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to convert deal');
      }
    } catch (err) {
      console.error('Fetch error during deal conversion:', err);
      alert('Network error during conversion');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`${crmModalChrome.overlay} z-[999] flex items-center justify-center p-4`}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-md crm-modal`}>
        {success ? (
          <div className="flex flex-col items-center space-y-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--success-light)] text-[var(--success)]">
              <CheckCircle2 size={32} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-[var(--text-main)]">Convert success</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">The deal has been converted into a client record.</p>
            </div>
          </div>
        ) : (
          <>
            <div className={crmModalChrome.centerHeader}>
              <div className="min-w-0 flex-1">
                <h2 className={crmModalChrome.centerTitle}>Convert to client</h2>
                <p className={crmModalChrome.centerLead}>
                  Transform deal &quot;{dealTitle}&quot; into a permanent client record.
                </p>
              </div>
              <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex flex-col items-center space-y-4 px-5 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--primary-light)] text-[var(--primary)]">
                <UserCheck size={28} strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Ready to convert?</h3>
                <p className="mx-auto mt-2 max-w-[280px] text-sm text-[var(--text-muted)]">
                  This will create a new client record and mark the deal as won. Timeline activities will be carried
                  over.
                </p>
              </div>
            </div>

            <div className={`${crmModalChrome.centerFooter} gap-2`}>
              <CrmButton variant="secondary" className="flex-1" onClick={onClose}>
                Cancel
              </CrmButton>
              <CrmButton variant="primary" className="flex-1" loading={loading} onClick={handleConvert}>
                {loading ? 'Converting…' : 'Convert now'}
              </CrmButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
