"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Key,
  Mail,
  Send,
  ExternalLink,
  ShieldCheck,
  GripVertical,
} from 'lucide-react';
import {
  fetchEmailIntelligenceSettings,
  saveEmailIntelligenceSettings,
  findEmailFromLinkedIn,
  verifyEmailAddress,
  primaryEmailFromFinderResult,
  formatVerificationLabel,
  type EmailProviderSettings,
  type FreeApiAccess,
} from '@/lib/crm/email-intelligence';

function freeApiBadge(access: FreeApiAccess): {
  label: string;
  className: string;
} {
  switch (access) {
    case 'included':
      return {
        label: 'Free API included',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'trial':
      return {
        label: 'Trial API credits',
        className: 'bg-amber-100 text-amber-900 border-amber-200',
      };
    case 'paid_only':
      return {
        label: 'Paid plan for API',
        className: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    default:
      return {
        label: 'API access varies',
        className: 'bg-slate-100 text-slate-700 border-[var(--border-color)]',
      };
  }
}

type ProviderFormState = {
  enabled: boolean;
  apiKey: string;
  apiSecret: string;
  webhookUrl: string;
  hasApiSecret: boolean;
  capabilities: { linkedinFinder: boolean; emailVerifier: boolean };
  priority: number;
};

function toFormState(p: EmailProviderSettings): ProviderFormState {
  return {
    enabled: p.enabled,
    apiKey: p.apiKey,
    apiSecret: '',
    webhookUrl: p.webhookUrl || '',
    hasApiSecret: p.hasApiSecret,
    capabilities: { ...p.capabilities },
    priority: p.priority,
  };
}

export default function EmailIntelligenceSettingsPage() {
  const [providers, setProviders] = useState<EmailProviderSettings[]>([]);
  const [forms, setForms] = useState<Record<string, ProviderFormState>>({});
  const [loading, setLoading] = useState(false);
  const [testLinkedInUrl, setTestLinkedInUrl] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testFinderResult, setTestFinderResult] = useState<string | null>(null);
  const [testVerifyResult, setTestVerifyResult] = useState<string | null>(null);
  const [testingFinder, setTestingFinder] = useState(false);
  const [testingVerify, setTestingVerify] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchEmailIntelligenceSettings();
    if (!data?.providers) return;
    setProviders(data.providers);
    const next: Record<string, ProviderFormState> = {};
    for (const p of data.providers) next[p.id] = toFormState(p);
    setForms(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateForm = (id: string, patch: Partial<ProviderFormState>) => {
    setForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTestFinderResult(null);
    setTestVerifyResult(null);
    try {
      const payload: Parameters<typeof saveEmailIntelligenceSettings>[0]['providers'] =
        {};
      for (const p of providers) {
        const f = forms[p.id];
        if (!f) continue;
        payload[p.id] = {
          enabled: f.enabled,
          apiKey: f.apiKey.trim(),
          apiSecret: f.apiSecret.trim() || undefined,
          webhookUrl: f.webhookUrl.trim() || undefined,
          capabilities: f.capabilities,
          priority: f.priority,
        };
      }
      await saveEmailIntelligenceSettings({ providers: payload });
      await load();
      alert('Email intelligence settings saved.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTestFinder = async () => {
    if (!testLinkedInUrl.trim()) {
      alert('Enter a LinkedIn profile URL.');
      return;
    }
    setTestingFinder(true);
    setTestFinderResult(null);
    try {
      const result = await findEmailFromLinkedIn(testLinkedInUrl.trim());
      const email = primaryEmailFromFinderResult(result);
      setTestFinderResult(
        email ? `Found: ${email}` : 'Lookup completed (no email in response).',
      );
    } catch (err) {
      setTestFinderResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingFinder(false);
    }
  };

  const handleTestVerify = async () => {
    if (!testEmail.trim()) {
      alert('Enter an email address.');
      return;
    }
    setTestingVerify(true);
    setTestVerifyResult(null);
    try {
      const result = await verifyEmailAddress(testEmail.trim());
      setTestVerifyResult(
        `${result.email} — ${formatVerificationLabel(result)} (via ${result.provider})`,
      );
    } catch (err) {
      setTestVerifyResult(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingVerify(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div className="flex items-center gap-4">
        <Link
          href="/crm/settings/integrations"
          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-text-muted hover:text-text-main"
        >
          <ChevronLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium text-text-main tracking-tight">
            Email intelligence
          </h1>
          <p className="text-text-muted font-medium">
            Enable multiple providers and failover by priority. Only providers marked{' '}
            <strong className="font-bold text-emerald-700">Free API included</strong> or{' '}
            <strong className="font-bold text-amber-800">Trial API</strong> work reliably on
            free-tier keys for CRM automation.
          </p>
          <p className="text-xs text-text-muted mt-2">
            Suggested priorities: Tomba (10) · Prospeo (20) LinkedIn · Anymail (25) trial ·
            Clearout (30) verify · Hunter (40) · Clay (50, paid API)
          </p>
        </div>
        <Link
          href="/crm/email-finder"
          className="shrink-0 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
        >
          <Mail size={14} />
          Open finder tool
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {providers.map((def) => {
          const f = forms[def.id];
          if (!f) return null;
          const apiBadge = freeApiBadge(def.freeApiAccess ?? 'unknown');
          return (
            <div
              key={def.id}
              className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-8 shadow-sm space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-text-main uppercase tracking-tight">
                      {def.name}
                    </h2>
                    <span
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${apiBadge.className}`}
                    >
                      {apiBadge.label}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1 max-w-xl">{def.description}</p>
                  <p
                    className={`text-xs font-semibold mt-2 ${
                      def.freeApiAccess === 'paid_only'
                        ? 'text-rose-700'
                        : def.freeApiAccess === 'trial'
                          ? 'text-amber-800'
                          : 'text-emerald-700'
                    }`}
                  >
                    Credits: {def.freeTierHint}
                  </p>
                  {def.freeApiAccess === 'paid_only' && (
                    <p className="text-xs text-rose-600 mt-1 max-w-xl">
                      CRM API calls may fail on a free Clay account. Use Tomba, Prospeo, Clearout,
                      or Anymail for free-tier automation.
                    </p>
                  )}
                  {def.freeApiAccess === 'unknown' && def.id === 'hunter' && (
                    <p className="text-xs text-slate-600 mt-1 max-w-xl">
                      Hunter&apos;s help center lists API on the free plan, but many accounts only
                      get extension access. Test your key below before relying on failover.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-3 px-4 py-2 bg-surface-dim rounded-[var(--radius-md)] cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-[var(--border-color)] text-primary focus:ring-[var(--primary)]"
                    checked={f.enabled}
                    onChange={(e) => updateForm(def.id, { enabled: e.target.checked })}
                  />
                  <span className="text-xs font-black text-text-main">
                    Provider on
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <GripVertical size={16} className="text-text-muted" />
                <label className="text-xs font-black text-text-muted">
                  Priority
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="w-20 px-3 py-2 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold"
                  value={f.priority}
                  onChange={(e) =>
                    updateForm(def.id, { priority: Number(e.target.value) || 10 })
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-4 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-surface-dim/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.capabilities.linkedinFinder}
                    disabled={!def.supportedCapabilities.includes('linkedinFinder')}
                    onChange={(e) =>
                      updateForm(def.id, {
                        capabilities: {
                          ...f.capabilities,
                          linkedinFinder: e.target.checked,
                        },
                      })
                    }
                  />
                  <div>
                    <span className="text-sm font-bold text-text-main flex items-center gap-2">
                      <Mail size={14} /> LinkedIn finder
                    </span>
                    <span className="text-xs text-text-muted block">Find email from profile URL</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-4 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-surface-dim/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.capabilities.emailVerifier}
                    disabled={!def.supportedCapabilities.includes('emailVerifier')}
                    onChange={(e) =>
                      updateForm(def.id, {
                        capabilities: {
                          ...f.capabilities,
                          emailVerifier: e.target.checked,
                        },
                      })
                    }
                  />
                  <div>
                    <span className="text-sm font-bold text-text-main flex items-center gap-2">
                      <ShieldCheck size={14} /> Email verifier
                    </span>
                    <span className="text-xs text-text-muted block">Check deliverability</span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-muted px-1">
                    API key
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                    <input
                      type="password"
                      className="w-full pl-12 pr-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold"
                      placeholder={
                        def.id === 'hunter'
                          ? 'Hunter API key...'
                          : def.id === 'prospeo'
                            ? 'Prospeo X-KEY...'
                            : def.id === 'clay'
                              ? 'Clay API key...'
                              : def.id === 'clearout'
                                ? 'Clearout API token...'
                                : def.id === 'anymail'
                                  ? 'Anymail Finder API key...'
                                  : 'ta_xxxx...'
                      }
                      value={f.apiKey}
                      onChange={(e) => updateForm(def.id, { apiKey: e.target.value })}
                    />
                  </div>
                </div>
                {def.requiresApiSecret ? (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-text-muted px-1">
                      API secret
                    </label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                      <input
                        type="password"
                        className="w-full pl-12 pr-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold"
                        placeholder={f.hasApiSecret ? 'Leave blank to keep current' : 'ts_xxxx...'}
                        value={f.apiSecret}
                        onChange={(e) => updateForm(def.id, { apiSecret: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted px-1">
                    This provider only needs an API key (no secret).
                  </p>
                )}
                {def.id === 'clay' && (
                  <div className="space-y-2">
                    <label className="text-xs font-black text-text-muted px-1">
                      Table webhook URL (optional)
                    </label>
                    <input
                      type="url"
                      className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold"
                      placeholder="https://api.clay.com/v1/webhooks/..."
                      value={f.webhookUrl}
                      onChange={(e) => updateForm(def.id, { webhookUrl: e.target.value })}
                    />
                    <p className="text-xs text-text-muted px-1">
                      Optional: also sends rows to your Clay table for waterfall enrichments built in Clay.
                    </p>
                  </div>
                )}
              </div>

              <a
                href={def.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                Provider docs <ExternalLink size={12} />
              </a>
            </div>
          );
        })}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-text-main hover:bg-black text-white py-4 rounded-[var(--radius-md)] text-xs font-semibold disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save all providers'}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 border border-emerald-100 rounded-[var(--crm-radius-ui)] p-6">
          <h3 className="text-sm font-black text-emerald-900 uppercase mb-3">Test LinkedIn finder</h3>
          <div className="flex flex-col gap-3">
            <input
              type="url"
              placeholder="https://www.linkedin.com/in/..."
              className="px-4 py-3 bg-card border border-emerald-200 rounded-[var(--radius-md)] text-sm font-bold"
              value={testLinkedInUrl}
              onChange={(e) => setTestLinkedInUrl(e.target.value)}
            />
            <button
              type="button"
              onClick={handleTestFinder}
              disabled={testingFinder}
              className="bg-emerald-600 text-white py-3 rounded-[var(--radius-md)] text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {testingFinder ? 'Looking up...' : <><Send size={14} /> Run finder test</>}
            </button>
          </div>
          {testFinderResult && (
            <p className="mt-3 text-sm font-bold text-emerald-900 break-all">{testFinderResult}</p>
          )}
        </div>

        <div className="bg-sky-50 border border-sky-100 rounded-[var(--crm-radius-ui)] p-6">
          <h3 className="text-sm font-black text-sky-900 uppercase mb-3">Test email verifier</h3>
          <div className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="person@company.com"
              className="px-4 py-3 bg-card border border-sky-200 rounded-[var(--radius-md)] text-sm font-bold"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <button
              type="button"
              onClick={handleTestVerify}
              disabled={testingVerify}
              className="bg-sky-600 text-white py-3 rounded-[var(--radius-md)] text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {testingVerify ? 'Verifying...' : <><ShieldCheck size={14} /> Run verify test</>}
            </button>
          </div>
          {testVerifyResult && (
            <p className="mt-3 text-sm font-bold text-sky-900 break-all">{testVerifyResult}</p>
          )}
        </div>
      </div>
    </div>
  );
}
