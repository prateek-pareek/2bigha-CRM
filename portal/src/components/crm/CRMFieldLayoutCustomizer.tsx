"use client";

import { useState, useEffect, useMemo } from 'react';
import { CrmJiraPortal } from '@/components/crm/CrmJiraPortal';
import { crmModalChrome } from '@/lib/pm/jira-ui';
import { X, GripVertical, Eye, EyeOff } from 'lucide-react';
import {
  type CrmModuleKey,
  type CrmFieldContext,
  type CrmFieldDef,
  saveFieldLayout,
  mergeOrderWithCustomFields,
  getFieldDefsForModule,
} from '@/lib/crm/crm-field-layout';

interface CRMFieldLayoutCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  module: CrmModuleKey;
  context: CrmFieldContext;
  customFieldKeys: { key: string; label: string }[];
  title?: string;
  onSaved?: () => void;
}

function defsForModule(module: CrmModuleKey, context: CrmFieldContext): CrmFieldDef[] {
  const raw = getFieldDefsForModule(module);
  if (context === 'form') return raw.filter((d) => !d.recordOnly);
  return raw;
}

export default function CRMFieldLayoutCustomizer({
  isOpen,
  onClose,
  module,
  context,
  customFieldKeys,
  title,
  onSaved,
}: CRMFieldLayoutCustomizerProps) {
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const cfKeyList = useMemo(() => customFieldKeys.map((c) => c.key), [customFieldKeys]);

  useEffect(() => {
    if (!isOpen) return;
    const merged = mergeOrderWithCustomFields(module, context, cfKeyList);
    setOrder(merged.order);
    setHidden(merged.hidden);
  }, [isOpen, module, context, cfKeyList]);

  const defs = defsForModule(module, context);
  const pinned = useMemo(() => new Set(defs.filter((d) => d.pinned).map((d) => d.key)), [defs]);

  const labelFor = (key: string) => {
    if (key.startsWith('cf:')) {
      const k = key.slice(3);
      const cf = customFieldKeys.find((c) => c.key === k);
      return cf?.label || k;
    }
    return defs.find((d) => d.key === key)?.label || getFieldDefsForModule(module).find((d) => d.key === key)?.label || key;
  };

  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('crm-layout-key', key);
  };

  const handleDrop = (e: React.DragEvent, dropKey: string) => {
    e.preventDefault();
    setDragOverKey(null);
    const fromKey = e.dataTransfer.getData('crm-layout-key');
    if (!fromKey || fromKey === dropKey) return;
    const fromIdx = order.indexOf(fromKey);
    const dropIdx = order.indexOf(dropKey);
    if (fromIdx === -1 || dropIdx === -1) return;
    const next = [...order];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(dropIdx, 0, moved);
    setOrder(next);
  };

  const toggle = (key: string) => {
    if (pinned.has(key)) return;
    setHidden((h) => (h.includes(key) ? h.filter((x) => x !== key) : [...h, key]));
  };

  const handleSave = () => {
    saveFieldLayout(module, context, { order, hidden });
    onSaved?.();
    onClose();
  };

  if (!isOpen) return null;

  const heading = title || (context === 'form' ? 'Customize form fields' : 'Customize record view');

  const content = (
    <div className={`${crmModalChrome.overlay} z-[10001] flex items-center justify-center p-4`}>
      <div className={crmModalChrome.backdrop} onClick={onClose} />
      <div className={`${crmModalChrome.centerShell} max-w-md max-h-[85vh] crm-jira-modal`}>
        <div className={crmModalChrome.centerHeader}>
          <div className="min-w-0 flex-1">
            <h2 className={crmModalChrome.centerTitle}>{heading}</h2>
            <p className={crmModalChrome.centerLead}>Drag to reorder · toggle eye to show/hide</p>
          </div>
          <button type="button" onClick={onClose} className={crmModalChrome.closeBtn} aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className={`${crmModalChrome.centerBody} space-y-1 px-4 py-3`}>
          {order.map((key) => {
            const isPinned = pinned.has(key);
            const isHidden = hidden.includes(key) && !isPinned;
            return (
              <div
                key={key}
                draggable
                onDragStart={(e) => handleDragStart(e, key)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverKey(key); }}
                onDrop={(e) => handleDrop(e, key)}
                onDragEnd={() => setDragOverKey(null)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border transition-all cursor-grab active:cursor-grabbing ${
                  dragOverKey === key
                    ? 'border-[var(--hs-link)] bg-[#fff1ee]'
                    : 'border-[var(--surface-dim)] bg-[var(--background)] hover:border-[var(--border-color)] hover:bg-white'
                }`}
              >
                <GripVertical size={14} className="text-[var(--primary-muted)] shrink-0" />
                <span className={`flex-1 text-sm font-medium truncate ${isHidden ? 'text-[var(--primary-muted)]' : 'text-[var(--text-main)]'}`}>
                  {labelFor(key)}
                </span>
                {key.startsWith('cf:') && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--primary-muted)] shrink-0 bg-[var(--surface-dim)] px-1.5 py-0.5 rounded-sm">
                    custom
                  </span>
                )}
                {isPinned ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--hs-link)] shrink-0 bg-[#fff1ee] px-1.5 py-0.5 rounded-sm">
                    pinned
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    title={isHidden ? 'Show field' : 'Hide field'}
                    className={`shrink-0 p-1.5 rounded-md transition-colors ${
                      isHidden
                        ? 'text-[var(--primary-muted)] hover:bg-[var(--surface-dim)]'
                        : 'text-[var(--text-main)] hover:bg-[var(--surface-dim)]'
                    }`}
                  >
                    {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>
            );
          })}
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
            onClick={handleSave}
            className="inline-flex h-8 flex-1 items-center justify-center rounded-[3px] bg-[#0c66e4] px-3 text-sm font-medium text-white hover:bg-[#0055cc]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  return <CrmJiraPortal>{content}</CrmJiraPortal>;
}
