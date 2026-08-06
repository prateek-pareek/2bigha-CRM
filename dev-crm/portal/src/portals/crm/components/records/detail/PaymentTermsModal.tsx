"use client";

import { useState, useEffect } from 'react';
import { X, DollarSign, Loader2, Save, Trash2, Plus } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { DatePickerField } from '@/components/ui/date-picker';
import { crmModalChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

const fieldClass =
  'w-full h-8 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm font-normal text-[var(--text-main)] outline-none focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)]/30';
const labelClass = 'text-xs font-semibold text-[var(--text-muted)]';

interface PaymentTermsModalProps {
 isOpen: boolean;
 onClose: () => void;
 dealId: string;
}

export default function PaymentTermsModal({ isOpen, onClose, dealId }: PaymentTermsModalProps) {
 const [terms, setTerms] = useState<any[]>([]);
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (isOpen) fetchTerms();
 }, [isOpen, dealId]);

 const fetchTerms = async () => {
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/crm/payment-terms/deal/${dealId}`, {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 if (res.ok) setTerms(await res.json());
 } catch (error) {
 console.error('Fetch terms error:', error);
 }
 };

 const handleAddTerm = () => {
 setTerms([...terms, { title: '', amount: 0, dueDate: new Date().toISOString().split('T')[0], status: 'Pending', isNew: true }]);
 };

 const handleSave = async (term: any) => {
 const token = localStorage.getItem('token');
 setSaving(true);
 try {
 const method = term._id ? 'PUT' : 'POST';
 const url = term._id ? `${CRM_API_URL}/crm/payment-terms/${term._id}` : `${CRM_API_URL}/crm/payment-terms`;
 const payload = { ...term, deal: dealId };

 const res = await fetch(url, {
 method,
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify(payload)
 });
 if (res.ok) fetchTerms();
 } catch (error) {
 console.error('Save term error:', error);
 } finally {
 setSaving(false);
 }
 };

 const handleDelete = async (id: string) => {
 if (!confirm('Delete this payment term?')) return;
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/crm/payment-terms/${id}`, {
 method: 'DELETE',
 headers: { 'Authorization': `Bearer ${token}` }
 });
 if (res.ok) fetchTerms();
 } catch (error) {
 console.error('Delete term error:', error);
 }
 };

 if (!isOpen) return null;

 return (
 <div className={cn(crmModalChrome.overlay, 'z-50 flex items-center justify-center p-4')}>
 <div className={crmModalChrome.backdrop} onClick={onClose} />
 <div className={cn(crmModalChrome.centerShell, 'max-w-3xl max-h-[min(90vh,56rem)] crm-modal flex flex-col')}>
 <div className={crmModalChrome.centerHeader}>
 <div className="min-w-0 flex-1">
 <h2 className={crmModalChrome.centerTitle}>Payment schedule</h2>
 <p className={crmModalChrome.centerLead}>Manage payment milestones for this deal.</p>
 </div>
 <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
 <X size={16} strokeWidth={1.75} />
 </button>
 </div>

 <div className={cn(crmModalChrome.centerBody, 'space-y-4')}>
 {terms.map((term, idx) => (
 <div key={term._id || idx} className="grid grid-cols-12 items-end gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-dim)] p-4">
 <div className="col-span-4 space-y-1">
 <label className={labelClass}>Title</label>
 <input
 className={fieldClass}
 value={term.title}
 onChange={(e) => {
 const newTerms = [...terms];
 newTerms[idx].title = e.target.value;
 setTerms(newTerms);
 }}
 />
 </div>
 <div className="col-span-3 space-y-1">
 <label className={labelClass}>Amount</label>
 <div className="relative">
 <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
 <input
 type="number"
 className={cn(fieldClass, 'pl-7')}
 value={term.amount}
 onChange={(e) => {
 const newTerms = [...terms];
 newTerms[idx].amount = Number(e.target.value);
 setTerms(newTerms);
 }}
 />
 </div>
 </div>
 <div className="col-span-3 space-y-1">
 <label className={labelClass}>Due date</label>
 <DatePickerField
 value={String(term.dueDate || '').split('T')[0]}
 onChange={(v) => {
 const newTerms = [...terms];
 newTerms[idx].dueDate = v;
 setTerms(newTerms);
 }}
 buttonClassName="h-8 w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white px-3 text-sm font-normal"
 />
 </div>
 <div className="col-span-2 flex items-center gap-1.5">
 <button
 type="button"
 onClick={() => handleSave(term)}
 disabled={saving}
 className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
 >
 <Save size={14} strokeWidth={1.75} />
 </button>
 {term._id && (
 <button
 type="button"
 onClick={() => handleDelete(term._id)}
 className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[var(--error-light)] hover:text-[var(--error)]"
 >
 <Trash2 size={14} strokeWidth={1.75} />
 </button>
 )}
 </div>
 </div>
 ))}

 <button
 type="button"
 onClick={handleAddTerm}
 className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-color)] py-5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-light)]/40 hover:text-[var(--primary)]"
 >
 <Plus size={18} strokeWidth={1.75} />
 Add payment milestone
 </button>
 </div>
 </div>
 </div>
 );
}
