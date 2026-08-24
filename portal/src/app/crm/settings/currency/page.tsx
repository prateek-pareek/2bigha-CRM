"use client";

import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CRM_API_URL } from '@/lib/crm/config';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';

interface CurrencyRate {
  code: string;
  symbol: string;
  rateToInr: number;
}

const COMMON_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
];

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : '';
}

export default function CurrencySettingsPage() {
  const router = useRouter();
  const { canViewCrmRevenue, isLoaded } = usePermissions();
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newRate, setNewRate] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!canViewCrmRevenue) {
      router.replace('/crm/settings');
      return;
    }
    fetchRates();
  }, [isLoaded, canViewCrmRevenue, router]);

  if (isLoaded && !canViewCrmRevenue) {
    return null;
  }

  const fetchRates = async () => {
    setFetching(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/currency`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await res.json();
      setRates(d.currencyRates ?? [{ code: 'USD', symbol: '$', rateToInr: d.usdToInr ?? 83 }]);
    } catch {
      toast.error('Failed to load currency rates');
    } finally {
      setFetching(false);
    }
  };

  const startEdit = (r: CurrencyRate) => {
    setEditingCode(r.code);
    setEditValue(String(r.rateToInr));
  };

  const cancelEdit = () => { setEditingCode(null); setEditValue(''); };

  const saveEdit = async (r: CurrencyRate) => {
    const val = parseFloat(editValue);
    if (!val || val <= 0) { toast.error('Enter a valid rate'); return; }
    setSavingCode(r.code);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/currency/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ code: r.code, symbol: r.symbol, rateToInr: val }),
      });
      if (res.ok) {
        const d = await res.json();
        setRates(d.currencyRates);
        setEditingCode(null);
        toast.success(`${r.code} rate updated to ₹${val}`);
      } else toast.error('Failed to update rate');
    } catch { toast.error('Network error'); }
    finally { setSavingCode(null); }
  };

  const deleteRate = async (code: string) => {
    setDeletingCode(code);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/currency/rates/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setRates(d.currencyRates);
        toast.success(`${code} removed`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Failed to remove');
      }
    } catch { toast.error('Network error'); }
    finally { setDeletingCode(null); }
  };

  const handleQuickSelect = (cur: typeof COMMON_CURRENCIES[0]) => {
    setNewCode(cur.code);
    setNewSymbol(cur.symbol);
  };

  const addCurrency = async () => {
    if (!newCode.trim()) { toast.error('Enter a currency code'); return; }
    if (!newSymbol.trim()) { toast.error('Enter a symbol'); return; }
    const val = parseFloat(newRate);
    if (!val || val <= 0) { toast.error('Enter a valid rate'); return; }
    setAdding(true);
    try {
      const res = await fetch(`${CRM_API_URL}/crm/settings/currency/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ code: newCode.trim().toUpperCase(), symbol: newSymbol.trim(), rateToInr: val }),
      });
      if (res.ok) {
        const d = await res.json();
        setRates(d.currencyRates);
        setNewCode(''); setNewSymbol(''); setNewRate('');
        setShowAddForm(false);
        toast.success(`${newCode.toUpperCase()} added`);
      } else toast.error('Failed to add currency');
    } catch { toast.error('Network error'); }
    finally { setAdding(false); }
  };

  const existingCodes = new Set(rates.map((r) => r.code));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/crm/settings"
          className="p-2 hover:bg-slate-100 rounded-[var(--radius-md)] transition-colors text-text-muted"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Currency & Exchange Rates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rates are used for USD ↔ INR revenue conversions across the CRM.
          </p>
        </div>
      </div>

      {/* Rates list */}
      <div className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--surface-dim)]/60 flex items-center justify-between">
          <p className="text-xs font-semibold text-text-muted">
            Configured Rates → INR (₹)
          </p>
          <button
            onClick={() => { setShowAddForm(true); setEditingCode(null); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={14} /> Add Currency
          </button>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center gap-2 py-14 text-text-muted text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {rates.map((r) => (
              <div key={r.code} className="flex items-center gap-4 px-6 py-4">
                {/* Currency badge */}
                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-green-50 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-green-600">{r.symbol}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-main">{r.code}</p>
                  <p className="text-xs text-text-muted">
                    {COMMON_CURRENCIES.find((c) => c.code === r.code)?.name ?? 'Custom currency'}
                  </p>
                </div>

                {/* Rate display / edit */}
                {editingCode === r.code ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center h-9 bg-white border border-[var(--border-color)] rounded-[var(--radius-md)] overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
                      <span className="px-2.5 text-xs font-medium text-text-muted border-r border-[var(--border-color)] h-full flex items-center bg-[var(--surface-dim)] shrink-0">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(r); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-24 h-full px-2.5 text-sm font-semibold text-text-main outline-none bg-transparent"
                      />
                    </div>
                    <button
                      onClick={() => saveEdit(r)}
                      disabled={savingCode === r.code}
                      className="p-2 rounded-[var(--radius-md)] bg-green-50 hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                    >
                      {savingCode === r.code ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button onClick={cancelEdit} className="p-2 rounded-[var(--radius-md)] hover:bg-slate-100 text-text-muted transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-text-main">
                      1 {r.code} = <span className="text-green-600">₹{r.rateToInr}</span>
                    </span>
                    <button
                      onClick={() => startEdit(r)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-text-muted hover:text-text-main transition-colors"
                      title="Edit rate"
                    >
                      <Pencil size={13} />
                    </button>
                    {r.code !== 'USD' && (
                      <button
                        onClick={() => deleteRate(r.code)}
                        disabled={deletingCode === r.code}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-text-muted hover:text-rose-500 transition-colors disabled:opacity-50"
                        title="Remove currency"
                      >
                        {deletingCode === r.code ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {rates.length === 0 && !fetching && (
              <div className="py-12 text-center text-text-muted text-sm">
                No currencies configured yet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add currency form */}
      {showAddForm && (
        <div className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-50 rounded-[var(--radius-md)]"><DollarSign size={16} className="text-green-600" /></div>
              <h3 className="font-bold text-text-main">Add Currency</h3>
            </div>
            <button onClick={() => setShowAddForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-text-muted transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Quick select common currencies */}
          <div>
            <p className="text-xs font-semibold text-text-muted mb-2">Quick select</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_CURRENCIES.filter((c) => !existingCodes.has(c.code)).map((c) => (
                <button
                  key={c.code}
                  onClick={() => handleQuickSelect(c)}
                  className={`px-3 py-1.5 rounded-[var(--radius-md)] border text-xs font-semibold transition-colors ${
                    newCode === c.code
                      ? 'bg-[var(--hs-link)] border-[var(--hs-link)] text-white'
                      : 'bg-white border-[var(--border-color)] text-text-main hover:border-[var(--hs-link)] hover:text-[var(--hs-link)]'
                  }`}
                >
                  {c.symbol} {c.code}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Code</label>
              <input
                type="text"
                maxLength={5}
                placeholder="EUR"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-semibold text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Symbol</label>
              <input
                type="text"
                maxLength={4}
                placeholder="€"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-semibold text-text-main outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-muted">Rate (₹)</label>
              <div className="flex items-center h-10 bg-white border border-[var(--border-color)] rounded-[var(--radius-md)] overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
                <span className="px-2.5 text-sm font-medium text-text-muted border-r border-[var(--border-color)] h-full flex items-center bg-[var(--surface-dim)] shrink-0">₹</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="89"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCurrency()}
                  className="flex-1 h-full px-2.5 text-sm font-semibold text-text-main outline-none bg-transparent min-w-0"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border-color)] text-sm font-semibold text-text-muted hover:bg-[var(--surface-dim)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addCurrency}
              disabled={adding}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-[var(--radius-md)] bg-[var(--hs-link)] hover:bg-[var(--hs-link-hover)] text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {adding ? 'Adding…' : 'Add Currency'}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted leading-relaxed px-1">
        USD is the base currency and cannot be removed. These global rates apply across the CRM.
      </p>
    </div>
  );
}
