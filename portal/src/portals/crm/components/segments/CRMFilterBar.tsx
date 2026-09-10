"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Plus, X, ChevronDown } from 'lucide-react';
import { CRM_API_URL } from '@/lib/crm/config';
import { getCrmAuthToken } from '@/lib/crm/api';
import {
  FilterCriteria,
  FilterProperty,
  getStaticProperties,
  customFieldToFilterProperty,
  OPERATORS,
} from '@/lib/crm/filter-config';
import { DatePickerField } from '@/components/ui/date-picker';
import { FilterValueSelector } from '../records/forms/FilterValueSelector';
import { usePermissions } from '@/hooks/usePermissions';
import { CrmButton } from '@/components/crm/ui';
import { cn } from '@/lib/utils';
import { CRM_TOOLBAR_SELECT } from '@/lib/crm/ui';

interface CRMFilterBarProps {
  module: 'leads' | 'contacts' | 'organizations' | 'activities' | 'inbox' | 'clients' | 'legal';
  filters: FilterCriteria[];
  onChange: (filters: FilterCriteria[]) => void;
  onClear?: () => void;
  onPropertiesReady?: (properties: FilterProperty[]) => void;
  pipelineId?: string;
}

const MODULE_FILTER_LABEL: Record<CRMFilterBarProps['module'], string> = {
  leads: 'leads',
  contacts: 'contacts',
  organizations: 'organizations',
  activities: 'activities',
  inbox: 'inbox',
  clients: 'clients',
  legal: 'legal cases',
};

export default function CRMFilterBar({ module, filters, onChange, onClear, onPropertiesReady, pipelineId }: CRMFilterBarProps) {
  const { canViewCrmRevenue } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const [properties, setProperties] = useState<FilterProperty[]>([]);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const staticProps = getStaticProperties(module, { canViewCrmRevenue });
    setProperties(staticProps);
    onPropertiesReady?.(staticProps);
    const token = getCrmAuthToken();
    fetch(`${CRM_API_URL}/custom-fields?module=${module}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((customFields: any[]) => {
        const list = Array.isArray(customFields) ? customFields : [];
        const cfProps = list.map((cf) => {
          const prop = customFieldToFilterProperty(cf);
          return { ...prop, label: `${prop.label} (custom)` };
        });
        const staticKeys = new Set(staticProps.map((p) => p.key));
        const normalizeLabel = (l: string) => l.trim().toLowerCase();
        const staticLabels = new Set(staticProps.map((p) => normalizeLabel(p.label)));
        const merged = [
          ...staticProps,
          ...cfProps.filter(
            (p) =>
              !staticKeys.has(p.key) &&
              !staticLabels.has(normalizeLabel(p.label.replace(/\s*\(custom\)$/, ''))),
          ),
        ];
        setProperties(merged);
        onPropertiesReady?.(merged);
      })
      .catch(() => {
        setProperties(staticProps);
        onPropertiesReady?.(staticProps);
      });
  }, [module, canViewCrmRevenue]);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({ top: rect.bottom + 8, left });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      const el = event.target as Element;
      if (el?.closest?.('[data-radix-popper-content-wrapper]')) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const addFilter = () => {
    const first = properties[0];
    if (!first) return;
    onChange([...filters, { property: first.key, operator: 'equals', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<FilterCriteria>) => {
    const next = filters.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange(next);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const prop = (key: string) => properties.find((p) => p.key === key);
  const needsValue = (op: string) =>
    !['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'].includes(op);

  const entity = MODULE_FILTER_LABEL[module];
  const filterButtonHint =
    filters.length > 0
      ? `${filters.length} filter${filters.length === 1 ? '' : 's'} on. Click to edit rules or add more.`
      : `Filter ${entity} by any field (owner, stage, dates, custom fields). Click to build filters.`;

  const panel =
    isOpen && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="crm-filter-panel fixed z-[9999] w-[420px] max-w-[95vw] overflow-hidden rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-card shadow-[var(--crm-shadow-raised)]"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="dialog"
            aria-label="Filter by property"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-surface-dim/50 p-4">
              <span className="text-xs font-semibold text-text-muted">Filter by property</span>
              <div className="flex gap-2">
                {filters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange([]);
                      onClear?.();
                    }}
                    className="text-xs font-semibold text-[var(--error)] hover:opacity-80"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={addFilter}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark"
                >
                  <Plus size={12} />
                  Add filter
                </button>
              </div>
            </div>

            <div className="custom-scrollbar max-h-[320px] space-y-3 overflow-y-auto p-4">
              {filters.length === 0 ? (
                <p className="py-4 text-center text-sm font-medium text-text-muted">
                  No filters applied. Click &quot;Add filter&quot; to filter by any property.
                </p>
              ) : (
                filters.map((f, i) => {
                  const p = prop(f.property);
                  const ops = p ? OPERATORS[p.type] : OPERATORS.text;
                  const showValue = needsValue(f.operator);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select
                        value={f.property}
                        onChange={(e) => {
                          const np = prop(e.target.value);
                          updateFilter(i, {
                            property: e.target.value,
                            operator: np ? OPERATORS[np.type][0]?.value || 'equals' : 'equals',
                            value: '',
                          });
                        }}
                        className={cn(CRM_TOOLBAR_SELECT, 'min-w-[140px] flex-1')}
                      >
                        {properties.map((pr) => (
                          <option key={pr.key} value={pr.key}>
                            {pr.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) => updateFilter(i, { operator: e.target.value })}
                        className={cn(CRM_TOOLBAR_SELECT, 'w-[140px]')}
                      >
                        {ops.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {showValue &&
                        (p?.type === 'date' ? (
                          <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                            <div className="no-scrollbar flex gap-1 overflow-x-auto pb-1">
                              {[
                                {
                                  label: 'Today',
                                  getValue: () => new Date().toISOString().split('T')[0],
                                },
                                {
                                  label: 'Yesterday',
                                  getValue: () => {
                                    const d = new Date();
                                    d.setDate(d.getDate() - 1);
                                    return d.toISOString().split('T')[0];
                                  },
                                },
                                {
                                  label: 'Last 7D',
                                  getValue: () => {
                                    const d = new Date();
                                    const start = new Date();
                                    start.setDate(d.getDate() - 7);
                                    return `${start.toISOString().split('T')[0]},${d.toISOString().split('T')[0]}`;
                                  },
                                  operator: 'between',
                                },
                                {
                                  label: 'Last 30D',
                                  getValue: () => {
                                    const d = new Date();
                                    const start = new Date();
                                    start.setDate(d.getDate() - 30);
                                    return `${start.toISOString().split('T')[0]},${d.toISOString().split('T')[0]}`;
                                  },
                                  operator: 'between',
                                },
                              ].map((quick) => (
                                <button
                                  key={quick.label}
                                  type="button"
                                  onClick={() => {
                                    updateFilter(i, {
                                      value: quick.getValue(),
                                      operator: quick.operator || 'equals',
                                    });
                                  }}
                                  className="shrink-0 rounded-lg border border-[var(--border-color)] bg-white px-2 py-1 text-[9px] font-black uppercase text-text-muted transition-all hover:border-primary/30 hover:text-primary"
                                >
                                  {quick.label}
                                </button>
                              ))}
                            </div>
                            {f.operator === 'between' ? (
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <DatePickerField
                                  value={f.value.split(',')[0] || ''}
                                  onChange={(v) => {
                                    const [, end] = f.value.split(',');
                                    updateFilter(i, { value: `${v},${end || ''}` });
                                  }}
                                  placeholder="Start"
                                  disableFuture
                                  className="min-w-0 flex-1"
                                  buttonClassName="h-[38px] w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-input)] px-3 text-xs font-medium"
                                />
                                <span className="hidden text-center text-xs font-bold text-text-muted sm:block">
                                  –
                                </span>
                                <DatePickerField
                                  value={f.value.split(',')[1] || ''}
                                  onChange={(v) => {
                                    const [start] = f.value.split(',');
                                    updateFilter(i, { value: `${start || ''},${v}` });
                                  }}
                                  placeholder="End"
                                  disableFuture
                                  className="min-w-0 flex-1"
                                  buttonClassName="h-[38px] w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-input)] px-3 text-xs font-medium"
                                />
                              </div>
                            ) : (
                              <DatePickerField
                                value={f.value}
                                onChange={(v) => updateFilter(i, { value: v })}
                                placeholder="Select date"
                                disableFuture
                                buttonClassName="h-[38px] w-full justify-start rounded-[var(--radius-md)] border-[var(--border-color)] bg-white shadow-[var(--crm-shadow-input)] px-3 text-sm font-medium"
                              />
                            )}
                          </div>
                        ) : p?.type === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={f.value === 'true' || f.value === 'yes'}
                            onChange={(e) =>
                              updateFilter(i, { value: e.target.checked ? 'true' : 'false' })
                            }
                            className="h-4 w-4 rounded"
                          />
                        ) : (
                          <FilterValueSelector
                            module={module}
                            fieldKey={f.property}
                            value={f.value}
                            pipelineId={pipelineId}
                            knownOptions={p?.options}
                            onChange={(v) => updateFilter(i, { value: v })}
                            operator={f.operator}
                          />
                        ))}
                      <button
                        type="button"
                        onClick={() => removeFilter(i)}
                        className="rounded-lg p-2 text-text-muted transition-all hover:bg-rose-50 hover:text-rose-600"
                        title="Remove filter"
                      >
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0" ref={triggerRef}>
      <CrmButton
        type="button"
        variant="secondary"
        onClick={() => setIsOpen(!isOpen)}
        title={filterButtonHint}
        aria-label={filterButtonHint}
        aria-expanded={isOpen}
        leftIcon={<Filter size={16} strokeWidth={2} aria-hidden />}
        rightIcon={
          <ChevronDown
            size={14}
            className={cn('transition-transform', isOpen && 'rotate-180')}
            aria-hidden
          />
        }
        className={cn(
          'gap-2 overflow-visible px-3',
          filters.length > 0 &&
            'border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--primary-light)]',
        )}
      >
        Filter
        {filters.length > 0 ? (
          <span className="rounded-[6px] bg-[var(--primary)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {filters.length}
          </span>
        ) : null}
      </CrmButton>
      {panel}
    </div>
  );
}
