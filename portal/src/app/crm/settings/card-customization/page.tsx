"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Layout,
  Save,
  CheckCircle2,
  User,
  Building2,
  Briefcase,
  DollarSign,
  Tag,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import "@/app/crm/crm-hubspot.css";
import {
  CARD_CUSTOMIZATION_KEY,
  CRM_CARD_BUILTIN_FIELDS,
  CRM_CARD_DEFAULT_FIELDS,
  CRM_CARD_ENTITY_META,
  type CrmCardEntityId,
  type CrmCardFieldDef,
  fetchCrmCardCustomFieldDefs,
  formatCrmCardFieldLabel,
  getCrmCardFieldIcon,
  mergeCrmCardAvailableFields,
  saveCrmCardCustomizations,
} from '@/lib/crm/card-customization';

const ENTITY_ICONS: Record<CrmCardEntityId, typeof User> = {
  leads: User,
  deals: DollarSign,
  contacts: Briefcase,
  clients: Building2,
};

const ENTITY_IDS = Object.keys(CRM_CARD_ENTITY_META) as CrmCardEntityId[];

const MAX_CARD_FIELDS = 3;

export default function CardCustomizationPage() {
  const router = useRouter();
  const [activeEntityId, setActiveEntityId] = useState<CrmCardEntityId>('leads');
  const [selectedFields, setSelectedFields] = useState<Record<CrmCardEntityId, string[]>>(() => ({
    ...CRM_CARD_DEFAULT_FIELDS,
  }));
  const [customFieldsByEntity, setCustomFieldsByEntity] = useState<
    Partial<Record<CrmCardEntityId, CrmCardFieldDef[]>>
  >({});
  const [loadingFields, setLoadingFields] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(CARD_CUSTOMIZATION_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Partial<Record<CrmCardEntityId, string[]>>;
        setSelectedFields((prev) => ({ ...CRM_CARD_DEFAULT_FIELDS, ...prev, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadCustomFields = useCallback(async (entityId: CrmCardEntityId) => {
    if (customFieldsByEntity[entityId]) return;
    setLoadingFields(true);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const defs = await fetchCrmCardCustomFieldDefs(entityId, token);
    setCustomFieldsByEntity((prev) => ({ ...prev, [entityId]: defs }));
    setLoadingFields(false);
  }, [customFieldsByEntity]);

  useEffect(() => {
    void loadCustomFields(activeEntityId);
  }, [activeEntityId, loadCustomFields]);

  const availableFields = useMemo(
    () =>
      mergeCrmCardAvailableFields(
        activeEntityId,
        customFieldsByEntity[activeEntityId] || [],
      ),
    [activeEntityId, customFieldsByEntity],
  );

  const builtInCount = CRM_CARD_BUILTIN_FIELDS[activeEntityId].length;
  const customCount = (customFieldsByEntity[activeEntityId] || []).length;

  const activeMeta = CRM_CARD_ENTITY_META[activeEntityId];

  const toggleField = (entityId: CrmCardEntityId, field: string) => {
    setSelectedFields((prev) => {
      const current = prev[entityId] || [];
      if (current.includes(field)) {
        return { ...prev, [entityId]: current.filter((f) => f !== field) };
      }
      if (current.length >= MAX_CARD_FIELDS) return prev;
      return { ...prev, [entityId]: [...current, field] };
    });
  };

  const handleSave = () => {
    saveCrmCardCustomizations(selectedFields);
    setSaved(true);
    toast.success('Card layout applied to all board views!');
    setTimeout(() => setSaved(false), 3000);
  };

  const mockPreviewValue = (key: string, label: string): string => {
    if (key.startsWith('cf_')) return `Sample ${label}`;
    if (key === 'dealValue' || key === 'amount' || key === 'dealValueINR') return '₹12,500';
    if (key === 'status' || key === 'stage') return 'Negotiation';
    if (key === 'probability') return '85%';
    if (key === 'expectedClosureDate' || key === 'closeDate' || key === 'createdAt') {
      return 'Aug 24, 2026';
    }
    if (key === 'email') return 'example@mathionix.com';
    if (key === 'organization' || key === 'account') return 'Example Corporation';
    if (key === 'phone') return '+91 98765 43210';
    if (key === 'website') return 'https://example.com';
    if (key === 'industry') return 'Technology';
    return '—';
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)]"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <Layout className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">Card Designer</h1>
              <p className="text-xs text-[var(--primary-muted)]">
                Personalize records for Board &amp; Kanban views
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all',
              saved ? 'bg-emerald-500' : 'bg-[var(--hs-link)] hover:bg-[#e8674a]',
            )}
          >
            {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Apply Changes'}
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-5 xl:col-span-8">
              <div className="flex flex-wrap gap-1 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-1">
                {ENTITY_IDS.map((id) => {
                  const Icon = ENTITY_ICONS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveEntityId(id)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-all',
                        activeEntityId === id
                          ? 'bg-[var(--hs-link)] text-white shadow-sm'
                          : 'text-[var(--text-muted)] hover:bg-white hover:text-[var(--text-main)]',
                      )}
                    >
                      <Icon size={13} />
                      {CRM_CARD_ENTITY_META[id].name}
                    </button>
                  );
                })}
              </div>

              <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                    Available Properties
                  </p>
                  <span className="text-xs text-[var(--primary-muted)]">
                    {builtInCount} standard · {customCount} custom
                  </span>
                  <span className="ml-auto text-xs text-[var(--primary-muted)]">
                    Select up to <strong className="text-[var(--text-main)]">3 fields</strong> for the card footer
                  </span>
                </div>

                {loadingFields && !customFieldsByEntity[activeEntityId] ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading custom fields…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                    {availableFields.map((f) => {
                      const isSelected = selectedFields[activeEntityId]?.includes(f.key);
                      const count = selectedFields[activeEntityId]?.length || 0;
                      const Icon = f.icon || getCrmCardFieldIcon(f.key);
                      const isDisabled = !isSelected && count >= MAX_CARD_FIELDS;
                      const isLegacy = f.key.includes('legacy');

                      return (
                        <button
                          key={f.key}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleField(activeEntityId, f.key)}
                          className={cn(
                            'group flex items-center justify-between rounded-md border p-3.5 text-left transition-all',
                            isSelected
                              ? 'border-[var(--hs-link)] bg-[#fff8f6] ring-1 ring-[var(--hs-link)]/20'
                              : isDisabled
                                ? 'cursor-not-allowed border-[var(--surface-dim)] bg-[var(--background)] opacity-40'
                                : 'border-[var(--surface-dim)] bg-white hover:border-[var(--hs-link)]/50 hover:bg-[#fff8f6]',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                                isSelected
                                  ? 'bg-[var(--hs-link)] text-white'
                                  : 'bg-[var(--background)] text-[var(--primary-muted)] group-hover:bg-[#fff3ef] group-hover:text-[var(--hs-link)]',
                              )}
                            >
                              <Icon size={14} />
                            </div>
                            <div className="min-w-0">
                              <span
                                className={cn(
                                  'block truncate text-sm font-medium',
                                  isSelected ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]',
                                )}
                              >
                                {f.label}
                              </span>
                              {f.key.startsWith('cf_') && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary-muted)]">
                                  Custom field
                                </span>
                              )}
                              {isLegacy && (
                                <span className="text-[10px] text-amber-600">Saved from older layout</span>
                              )}
                            </div>
                          </div>
                          <div
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                              isSelected
                                ? 'border-[var(--hs-link)] bg-[var(--hs-link)]'
                                : 'border-[var(--border-color)] group-hover:border-[var(--hs-link)]/50',
                            )}
                          >
                            {isSelected && (
                              <CheckCircle2 size={11} className="text-white" strokeWidth={3} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!loadingFields && availableFields.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                    No properties available for this module.
                  </p>
                )}
              </div>
            </div>

            <div className="xl:col-span-4">
              <div className="sticky top-6 overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
                <div className="flex items-center gap-2 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--hs-link)]" />
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                    Live Preview
                  </p>
                </div>

                <div className="p-5">
                  <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
                    <div className="flex items-center gap-3 border-b border-[var(--surface-dim)] px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--hs-link)] text-xs font-bold text-white">
                        {activeMeta.mockData.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                          {activeMeta.mockData.primary}
                        </p>
                        <p className="truncate text-xs text-[var(--primary-muted)]">
                          {activeMeta.mockData.secondary}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      {selectedFields[activeEntityId]?.length ? (
                        <div className="space-y-2">
                          {selectedFields[activeEntityId].map((key, i) => {
                            const def = availableFields.find((f) => f.key === key);
                            const Icon = getCrmCardFieldIcon(key);
                            const label = def?.label || formatCrmCardFieldLabel(key);
                            return (
                              <div
                                key={key + i}
                                className="flex items-center gap-2.5"
                                style={{ opacity: 1 - i * 0.15 }}
                              >
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--background)] text-[var(--primary-muted)]">
                                  <Icon size={11} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[9px] font-semibold text-[#b0c4d8]">
                                    {label}
                                  </p>
                                  <p className="truncate text-xs font-medium text-[var(--text-main)]">
                                    {mockPreviewValue(key, label)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center rounded-md border border-dashed border-[var(--border-color)] py-6">
                          <p className="text-xs text-[#b0c4d8]">No fields selected</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-center text-xs leading-relaxed text-[var(--primary-muted)]">
                    Standard and custom properties from your CRM module appear here. Kanban boards for leads and deals use these footer fields today.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
