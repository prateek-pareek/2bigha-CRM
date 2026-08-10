"use client";

import { useState, useEffect } from 'react';
import { Columns, Check, Settings2, RotateCcw } from 'lucide-react';
import { crmModalChrome } from '@/lib/crm/chrome';
import { cn } from '@/lib/utils';

interface ColumnCustomizerProps {
 module: string;
 availableColumns: { key: string; label: string }[];
 currentColumns: string[];
 onSave: (columns: string[]) => void;
}

export default function ColumnCustomizer({ module, availableColumns, currentColumns, onSave }: ColumnCustomizerProps) {
 const [isOpen, setIsOpen] = useState(false);
 const [selected, setSelected] = useState<string[]>(currentColumns);

 useEffect(() => {
 setSelected(currentColumns);
 }, [currentColumns]);

 const toggleColumn = (key: string) => {
 if (selected.includes(key)) {
 if (selected.length > 1) {
 setSelected(selected.filter(k => k !== key));
 }
 } else {
 setSelected([...selected, key]);
 }
 };

 const handleSave = () => {
 onSave(selected);
 setIsOpen(false);
 };

 const handleReset = () => {
 setSelected(availableColumns.map(c => c.key));
 };

 return (
 <div className="relative">
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-3 text-sm font-medium text-[var(--text-muted)] shadow-[0_1px_0_rgba(9,30,66,0.13)] hover:bg-[var(--surface-dim)]"
 >
 <Columns size={14} strokeWidth={1.75} />
 Columns
 </button>

 {isOpen && (
 <>
 <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} aria-hidden />
 <div className="crm-modal absolute right-0 z-[70] mt-2 w-72 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white p-4 shadow-[0_4px_8px_rgba(9,30,66,0.15)] animate-in slide-in-from-top-2 duration-200">
 <div className="mb-4 flex items-center justify-between">
 <h3 className="text-xs font-semibold text-[var(--text-muted)]">Customize view</h3>
 <button type="button" onClick={handleReset} className={crmModalChrome.closeBtn} title="Reset to default">
 <RotateCcw size={14} strokeWidth={1.75} />
 </button>
 </div>

 <div className="max-h-64 space-y-0.5 overflow-y-auto custom-scrollbar pr-1">
 {availableColumns.map((col) => {
 const isSelected = selected.includes(col.key);
 return (
 <button
 type="button"
 key={col.key}
 onClick={() => toggleColumn(col.key)}
 className={cn(
   'flex w-full items-center justify-between rounded-[var(--radius-md)] p-2.5 text-sm font-medium transition-colors',
   isSelected ? 'bg-[var(--primary-light)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-dim)]',
 )}
 >
 {col.label}
 {isSelected && <Check size={14} strokeWidth={1.75} />}
 </button>
 );
 })}
 </div>

 <div className="mt-4 flex gap-2 border-t border-[var(--border-color)] pt-4">
 <button
 type="button"
 onClick={() => setIsOpen(false)}
 className="inline-flex h-8 flex-1 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-dim)]"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleSave}
 className="inline-flex h-8 flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-xs font-medium text-white hover:bg-[var(--primary-dark)]"
 >
 Apply
 </button>
 </div>
 </div>
 </>
 )}
 </div>
 );
}
