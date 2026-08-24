"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Share2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Bell,
  ChevronLeft,
  Info,
  ChevronDown,
  Check,
  Search,
  Plug,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { CRM_API_URL } from '@/lib/crm/config';

interface ChannelWebhook {
  _id: string;
  name: string;
  module: string;
  config: { webhookUrl: string };
  isActive: boolean;
}

type TeamsDmStatus = {
  botReady: boolean;
  teamsWebhookUrlConfigured: boolean;
};

type CatalogItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  configurePath: string;
  connectPath: string;
  accentColor: string;
  availability: 'live' | 'coming_soon';
  capabilities: string[];
  connectionStatus: 'connected' | 'disconnected' | 'coming_soon' | 'error';
  connectedAt?: string | null;
  detail?: string | null;
};

const INP =
  'w-full h-9 rounded-md border border-[var(--border-color)] bg-white px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[#b0c4d8] focus:border-[var(--hs-link)] focus:ring-1 focus:ring-[var(--hs-link)]/20 transition-all';
const LBL =
  'block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  communication: 'Communication',
  email: 'Email',
  productivity: 'Productivity',
  payments: 'Payments',
  analytics: 'Analytics',
  automation: 'Automation',
};

function SimpleSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition-all ${
          open
            ? 'border-[var(--hs-link)] bg-[#fff8f6] ring-1 ring-[var(--hs-link)]/20'
            : 'border-[var(--border-color)] bg-white text-[var(--text-main)] hover:border-[var(--hs-link)]/60 hover:bg-[#fff8f6]'
        }`}
      >
        <span className="text-[var(--text-main)]">{selected?.label}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? 'rotate-180 text-[var(--hs-link)]' : 'text-[#b0c4d8]'}`}
        />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.10)]">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-[#fff3ef] hover:text-[#b94b36] ${
                o.value === value
                  ? 'bg-[#fff3ef] font-medium text-[#b94b36]'
                  : 'text-[var(--text-main)]'
              }`}
            >
              {o.label}
              {o.value === value && <Check size={12} className="text-[var(--hs-link)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CatalogItem['connectionStatus'] }) {
  if (status === 'connected') {
    return (
      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Connected
      </span>
    );
  }
  if (status === 'coming_soon') {
    return (
      <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Coming soon
      </span>
    );
  }
  return (
    <span className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      Available
    </span>
  );
}

export default function IntegrationsPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [integrations, setIntegrations] = useState<ChannelWebhook[]>([]);
  const [slackIntegrations, setSlackIntegrations] = useState<ChannelWebhook[]>([]);
  const [teamsDm, setTeamsDm] = useState<TeamsDmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingSlack, setIsAddingSlack] = useState(false);
  const [newIntegration, setNewIntegration] = useState({
    module: 'leads',
    webhookUrl: '',
  });
  const [newSlackIntegration, setNewSlackIntegration] = useState({
    module: 'all',
    webhookUrl: '',
  });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const teamsSectionRef = useRef<HTMLDivElement>(null);
  const slackSectionRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [catalogRes, teamsRes, dmRes, slackRes] = await Promise.all([
        fetch(`${CRM_API_URL}/crm/integrations/catalog`, { headers }),
        fetch(`${CRM_API_URL}/crm/integrations/teams`, { headers }),
        fetch(`${CRM_API_URL}/crm/integrations/teams-dm-status`, { headers }),
        fetch(`${CRM_API_URL}/crm/integrations/slack`, { headers }),
      ]);
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        setCatalog(Array.isArray(data?.items) ? data.items : []);
      }
      if (teamsRes.ok) setIntegrations(await teamsRes.json());
      if (dmRes.ok) setTeamsDm(await dmRes.json());
      else setTeamsDm(null);
      if (slackRes.ok) setSlackIntegrations(await slackRes.json());
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#microsoft-teams') {
      teamsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (window.location.hash === '#slack') {
      slackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [catalog, query, category]);

  const connectedCount = catalog.filter((i) => i.connectionStatus === 'connected').length;
  const liveCount = catalog.filter((i) => i.availability === 'live').length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module: newIntegration.module,
          config: { webhookUrl: newIntegration.webhookUrl },
        }),
      });
      if (res.ok) {
        setIsAdding(false);
        setNewIntegration({ module: 'leads', webhookUrl: '' });
        fetchAll();
      }
    } catch (err) {
      console.error('Failed to add integration:', err);
    }
  };

  const handleAddSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/slack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          module: newSlackIntegration.module,
          config: { webhookUrl: newSlackIntegration.webhookUrl },
        }),
      });
      if (res.ok) {
        setIsAddingSlack(false);
        setNewSlackIntegration({ module: 'all', webhookUrl: '' });
        await fetchAll();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(error?.message || 'Could not connect Slack');
      }
    } catch (err) {
      console.error('Failed to add Slack integration:', err);
    }
  };

  const removeSlack = async (id: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${CRM_API_URL}/crm/integrations/slack/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) await fetchAll();
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm('Disconnect this integration?')) return;
    setDisconnecting(providerId);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/integrations/catalog/${providerId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) await fetchAll();
      else {
        const err = await res.json().catch(() => ({}));
        alert(err?.message || 'Could not disconnect');
      }
    } catch (err) {
      console.error('Disconnect failed:', err);
    } finally {
      setDisconnecting(null);
    }
  };

  const onConnectClick = (item: CatalogItem) => {
    if (item.id === 'microsoft-teams') {
      teamsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsAdding(true);
      return;
    }
    if (item.id === 'slack') {
      slackSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsAddingSlack(true);
      return;
    }
    window.location.href = item.connectPath;
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/crm/settings"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-color)] bg-white text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-dim)]"
            >
              <ChevronLeft size={16} />
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--hs-link)]/10">
              <Plug className="h-4 w-4 text-[var(--hs-link)]" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[var(--text-main)]">
                Integrations
              </h1>
              <p className="text-xs text-[var(--primary-muted)]">
                Connect software to 2Bigha CRM — {connectedCount} connected ·{' '}
                {liveCount} live apps
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {/* Search + category */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--primary-muted)]"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search integrations…"
                className={`${INP} pl-9`}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    category === key
                      ? 'bg-[var(--hs-link)] text-white'
                      : 'border border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:bg-[#fff8f6]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-md border border-[var(--surface-dim)] bg-[var(--surface-dim)]"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--primary-muted)]">
              No integrations match your filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => {
                const isComingSoon = item.connectionStatus === 'coming_soon';
                const isConnected = item.connectionStatus === 'connected';
                return (
                  <div
                    key={item.id}
                    id={item.id}
                    className="flex flex-col overflow-hidden rounded-md border border-[var(--border-color)] bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${item.accentColor}18` }}
                        >
                          <Share2 size={16} style={{ color: item.accentColor }} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                            {item.name}
                          </p>
                          <p className="text-xs capitalize text-[var(--primary-muted)]">
                            {item.authType.replace('_', ' ')} · {item.category}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={item.connectionStatus} />
                    </div>

                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                        {item.description}
                      </p>
                      {item.detail && (
                        <p className="text-xs text-[var(--primary-muted)]">{item.detail}</p>
                      )}

                      <div className="mt-auto flex flex-wrap gap-2 pt-1">
                        {isComingSoon ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                            <Clock size={12} />
                            Phase 2+
                          </span>
                        ) : isConnected ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onConnectClick(item)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--hs-link)] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e8674a] transition-colors"
                            >
                              Manage
                              <ExternalLink size={12} />
                            </button>
                            {item.id !== 'microsoft-teams' && (
                              <button
                                type="button"
                                disabled={disconnecting === item.id}
                                onClick={() => handleDisconnect(item.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
                              >
                                {disconnecting === item.id ? '…' : 'Disconnect'}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onConnectClick(item)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--hs-link)] px-3 py-2 text-xs font-semibold text-white hover:bg-[#e8674a] transition-colors"
                          >
                            <Plug size={12} />
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Teams DM status banner */}
          {teamsDm && (
            <div className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white">
              <div className="flex items-center gap-2 border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#4B53BC]/10">
                  <MessageSquare size={13} className="text-[#4B53BC]" />
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                  Teams Bot — Proactive Messages
                </p>
                <span className="ml-2 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  CRM + PM
                </span>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  The same server configuration powers CRM workflow{' '}
                  <strong className="text-[var(--text-main)]">Notify via Teams</strong> and
                  PM task DMs. Set{' '}
                  <code className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-main)]">
                    TEAMS_CLIENT_ID
                  </code>{' '}
                  /{' '}
                  <code className="rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-main)]">
                    TEAMS_CLIENT_SECRET
                  </code>{' '}
                  on the API host.
                </p>
                <div className="flex items-center gap-2">
                  {teamsDm.botReady ? (
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle size={14} className="shrink-0 text-amber-500" />
                  )}
                  <span className="text-sm font-medium text-[var(--text-main)]">
                    Bot Framework App
                  </span>
                  <span
                    className={`text-xs ${teamsDm.botReady ? 'text-emerald-600' : 'text-amber-600'}`}
                  >
                    {teamsDm.botReady ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-3 py-2.5">
                  <Info size={13} className="mt-0.5 shrink-0 text-[var(--primary-muted)]" />
                  <p className="text-xs text-[var(--primary-muted)]">
                    In PM, open{' '}
                    <span className="font-semibold text-[var(--text-main)]">Integrations</span>{' '}
                    in the sidebar (admin) for the same status.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Microsoft Teams webhook manager */}
          <div
            ref={teamsSectionRef}
            id="microsoft-teams"
            className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white"
          >
            <div className="flex items-center justify-between border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#4B53BC]/10">
                  <MessageSquare size={16} className="text-[#4B53BC]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">
                    Microsoft Teams — Channel webhooks
                  </p>
                  <p className="text-xs text-[var(--primary-muted)]">
                    Add Incoming Webhook URLs per CRM module
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {loading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-md bg-[var(--surface-dim)]"
                    />
                  ))}
                </div>
              ) : integrations.length > 0 ? (
                <div className="space-y-2">
                  {integrations.map((integration) => (
                    <div
                      key={integration._id}
                      className="flex items-center justify-between rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <Bell size={11} className="shrink-0 text-[var(--primary-muted)]" />
                          <span className="text-xs font-semibold capitalize text-[var(--text-main)]">
                            {integration.module} channel
                          </span>
                        </div>
                        <code className="block truncate font-mono text-xs text-[var(--primary-muted)]">
                          {integration.config.webhookUrl}
                        </code>
                      </div>
                      <button
                        type="button"
                        className="ml-3 shrink-0 rounded-md p-1.5 text-[var(--primary-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500"
                        aria-label="Remove webhook"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : !isAdding ? (
                <p className="text-xs text-[#b0c4d8]">No webhooks configured yet.</p>
              ) : null}

              {isAdding ? (
                <form
                  onSubmit={handleAdd}
                  className="space-y-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-4"
                >
                  <div>
                    <label className={LBL}>Trigger Module</label>
                    <SimpleSelect
                      value={newIntegration.module}
                      onChange={(v) =>
                        setNewIntegration({ ...newIntegration, module: v })
                      }
                      options={[
                        { value: 'leads', label: 'Leads' },
                        { value: 'contacts', label: 'Contacts' },
                        { value: 'all', label: 'Global (All Modules)' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className={LBL}>Webhook URL</label>
                    <input
                      type="url"
                      className={INP}
                      placeholder="https://outlook.office.com/webhook/..."
                      value={newIntegration.webhookUrl}
                      onChange={(e) =>
                        setNewIntegration({
                          ...newIntegration,
                          webhookUrl: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      className="flex-1 rounded-md bg-[var(--hs-link)] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#e8674a]"
                    >
                      Enable
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="flex-1 rounded-md border border-[var(--border-color)] bg-white py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--background)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border-color)] py-2.5 text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--hs-link)]/50 hover:bg-[#fff8f6] hover:text-[var(--hs-link)]"
                >
                  <Plus size={14} />
                  Add Webhook
                </button>
              )}
            </div>
          </div>

          {/* Slack Incoming Webhook manager */}
          <div
            ref={slackSectionRef}
            id="slack"
            className="overflow-hidden rounded-md border border-[var(--border-color)] bg-white"
          >
            <div className="flex items-center justify-between border-b border-[var(--surface-dim)] bg-[var(--surface-dim)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#4A154B]/10">
                  <MessageSquare size={16} className="text-[#4A154B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">
                    Slack — Channel webhooks
                  </p>
                  <p className="text-xs text-[var(--primary-muted)]">
                    Send calendar reminders and CRM alerts to Slack
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {slackIntegrations.length > 0 ? (
                <div className="space-y-2">
                  {slackIntegrations.map((integration) => (
                    <div
                      key={integration._id}
                      className="flex items-center justify-between rounded-md border border-[var(--surface-dim)] bg-[var(--background)] px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <Bell size={11} className="shrink-0 text-[#4A154B]" />
                          <span className="text-xs font-semibold capitalize text-[var(--text-main)]">
                            {integration.module} channel
                          </span>
                        </div>
                        <code className="block truncate font-mono text-xs text-[var(--primary-muted)]">
                          Slack Incoming Webhook configured
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeSlack(integration._id)}
                        className="ml-3 shrink-0 rounded-md p-1.5 text-[var(--primary-muted)] transition-colors hover:bg-rose-50 hover:text-rose-500"
                        aria-label="Remove Slack webhook"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : !isAddingSlack ? (
                <p className="text-xs text-[#b0c4d8]">No Slack webhooks configured yet.</p>
              ) : null}

              {isAddingSlack ? (
                <form
                  onSubmit={handleAddSlack}
                  className="space-y-3 rounded-md border border-[var(--surface-dim)] bg-[var(--background)] p-4"
                >
                  <div>
                    <label className={LBL}>Trigger Module</label>
                    <SimpleSelect
                      value={newSlackIntegration.module}
                      onChange={(v) =>
                        setNewSlackIntegration({ ...newSlackIntegration, module: v })
                      }
                      options={[
                        { value: 'crm', label: 'CRM reminders' },
                        { value: 'leads', label: 'Leads' },
                        { value: 'contacts', label: 'Contacts' },
                        { value: 'all', label: 'Global (All Modules)' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className={LBL}>Slack Incoming Webhook URL</label>
                    <input
                      type="url"
                      className={INP}
                      placeholder="https://hooks.slack.com/services/..."
                      value={newSlackIntegration.webhookUrl}
                      onChange={(e) =>
                        setNewSlackIntegration({
                          ...newSlackIntegration,
                          webhookUrl: e.target.value,
                        })
                      }
                      required
                    />
                    <p className="mt-1 text-xs text-[var(--primary-muted)]">
                      Create an Incoming Webhook in your Slack app and select its destination channel.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      className="flex-1 rounded-md bg-[#4A154B] py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
                    >
                      Connect Slack
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSlack(false)}
                      className="flex-1 rounded-md border border-[var(--border-color)] bg-white py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--background)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingSlack(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-[var(--border-color)] py-2.5 text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[#4A154B]/50 hover:bg-[#4A154B]/5 hover:text-[#4A154B]"
                >
                  <Plus size={14} />
                  Add Slack Webhook
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
