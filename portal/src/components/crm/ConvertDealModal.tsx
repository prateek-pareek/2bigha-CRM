"use client";

import { useState } from 'react';
import { X, UserCheck, Loader2, CheckCircle2 } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { invalidateCrmForEntityType } from '@/lib/crm/invalidate-on-mutation';
import { crmModalChrome } from '@/lib/pm/jira-ui';

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
    'Authorization': `Bearer ${token}`
   }
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
 <div className={`${crmModalChrome.centerShell} max-w-md crm-jira-modal`}>
  {success ? (
    <div className="flex flex-col items-center space-y-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[3px] bg-[#e3fcef] text-[#00875a]">
        <CheckCircle2 size={32} strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="text-base font-medium text-[#172b4d]">Convert success</h3>
        <p className="mt-2 text-sm text-[#5e6c84]">The deal has been converted into a client record.</p>
      </div>
    </div>
  ) : (
    <>
 <div className={crmModalChrome.centerHeader}>
 <div className="min-w-0 flex-1">
 <h2 className={crmModalChrome.centerTitle}>Convert to client</h2>
 <p className={crmModalChrome.centerLead}>Transform deal &quot;{dealTitle}&quot; into a permanent client record.</p>
 </div>
 <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
 <X size={16} strokeWidth={1.75} />
 </button>
 </div>

 <div className="flex flex-col items-center space-y-4 px-5 py-6 text-center">
 <div className="flex h-14 w-14 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-[#deebff] text-[#0c66e4]">
 <UserCheck size={28} strokeWidth={1.75} />
 </div>
 <div>
 <h3 className="text-sm font-medium text-[#172b4d]">Ready to convert?</h3>
 <p className="mx-auto mt-2 max-w-[280px] text-sm text-[#5e6c84]">
 This will create a new client record and mark the deal as won. Timeline activities will be carried over.
 </p>
 </div>
 </div>

 <div className={`${crmModalChrome.centerFooter} gap-2`}>
 <button
 type="button"
 onClick={onClose}
 className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] border border-[#dfe1e6] bg-white px-3 text-sm font-medium text-[#42526e] hover:bg-[#f4f5f7]"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleConvert}
 disabled={loading}
 className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-[3px] bg-[#0c66e4] px-3 text-sm font-medium text-white hover:bg-[#0055cc] disabled:opacity-70"
 >
 {loading ? <Loader2 size={16} className="animate-spin" /> : null}
 {loading ? 'Converting…' : 'Convert now'}
 </button>
 </div>
    </>
  )}
 </div>
 </div>
 );
}
