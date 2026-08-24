"use client";

import { useState, useEffect } from 'react';
import { Columns, ChevronLeft, Save, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { CRM_API_URL } from '@/lib/crm/config';

const MODULES = [
 { id: 'leads', name: 'Leads', columns: ['Status', 'Source', 'Industry', 'Owner', 'Annual Revenue', 'Email', 'Phone'] },
 { id: 'organizations', name: 'Organizations', columns: ['Industry', 'Location', 'Team Size', 'Revenue', 'Owner'] },
 { id: 'contacts', name: 'Contacts', columns: ['Job Title', 'Organization', 'Email', 'Phone', 'Source'] }
];

export default function ColumnsSettingsPage() {
 const [preferences, setPreferences] = useState<{ [key: string]: string[] }>({});
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState<string | null>(null);

 useEffect(() => {
 fetchAllPreferences();
 }, []);

 const fetchAllPreferences = async () => {
 const token = localStorage.getItem('token');
 const prefs: { [key: string]: string[] } = {};

 try {
 for (const mod of MODULES) {
 const res = await fetch(`${CRM_API_URL}/column-preferences/${mod.id}`, {
 headers: { 'Authorization': `Bearer ${token}` }
 });
 const text = await res.text();
 if (res.ok && text) {
 const data = JSON.parse(text);
 prefs[mod.id] = data?.columns || mod.columns;
 } else {
 prefs[mod.id] = mod.columns;
 }
 }
 setPreferences(prefs);
 } catch (error) {
 console.error('Fetch preferences error:', error);
 } finally {
 setLoading(false);
 }
 };

 const toggleColumn = (moduleId: string, column: string) => {
 setPreferences(prev => {
 const current = prev[moduleId] || [];
 const next = current.includes(column)
 ? current.filter(c => c !== column)
 : [...current, column];
 return { ...prev, [moduleId]: next };
 });
 };

 const handleSave = async (moduleId: string) => {
 setSaving(moduleId);
 const token = localStorage.getItem('token');
 try {
 const res = await fetch(`${CRM_API_URL}/column-preferences/${moduleId}`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${token}`
 },
 body: JSON.stringify({ columns: preferences[moduleId] })
 });
 if (res.ok) {
 setTimeout(() => setSaving(null), 1000);
 }
 } catch (error) {
 console.error('Save preference error:', error);
 setSaving(null);
 }
 };

 return (
 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
 <div className="flex items-center gap-4">
 <Link href="/crm/settings" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
 <ChevronLeft size={20} className="text-gray-500" />
 </Link>
 <div>
 <h1 className="text-2xl font-bold text-gray-900">List Columns</h1>
 <p className="text-sm text-gray-500 font-medium">Customize which properties are visible in your lists.</p>
 </div>
 </div>

 {loading ? (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
 {[1, 2, 3, 4].map(i => (
 <div key={i} className="bg-card h-64 rounded-[var(--crm-radius-ui)] border border-[var(--border-color)]"></div>
 ))}
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {MODULES.map(mod => (
 <div key={mod.id} className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
 <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-surface-dim/50">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-[var(--radius-md)] bg-card border border-[var(--border-color)] flex items-center justify-center text-primary shadow-sm">
 <Columns size={20} />
 </div>
 <h3 className="font-bold text-text-main">{mod.name}</h3>
 </div>
 <button
 onClick={() => handleSave(mod.id)}
 disabled={saving === mod.id}
 className={`flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all ${saving === mod.id ? 'bg-green-50 text-green-600' : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 active:scale-95'}`}
 >
 {saving === mod.id ? (
 <>
 <CheckCircle2 size={14} />
 Saved
 </>
 ) : (
 <>
 <Save size={14} />
 Save
 </>
 )}
 </button>
 </div>
 <div className="p-8 grid grid-cols-1 gap-3 flex-1 overflow-y-auto max-h-64 custom-scrollbar">
 {mod.columns.map(col => {
 const isSelected = preferences[mod.id]?.includes(col);
 return (
 <div
 key={col}
 onClick={() => toggleColumn(mod.id, col)}
 className={`p-3 rounded-[var(--radius-md)] border cursor-pointer transition-all flex items-center justify-between ${isSelected ? 'bg-primary/5 border-blue-100 text-blue-900 font-bold' : 'bg-card border-[var(--border-color)] text-text-muted hover:border-[var(--primary)]/25 hover:bg-surface-dim/50'}`}
 >
 <span className="text-xs">{col}</span>
 <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-blue-600' : 'bg-card border-[var(--border-color)]'}`}>
 {isSelected && <div className="w-1.5 h-3 border-r-2 border-b-2 border-white rotate-45 -mt-0.5" />}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}

