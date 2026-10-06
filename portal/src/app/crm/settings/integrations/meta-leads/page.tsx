"use client";

import { useState, useEffect } from 'react';
import { Share2, ChevronLeft, Send, Key, Copy, Check, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { CRM_API_URL } from '@/lib/crm/config';

type LeadForm = { id: string; name: string; status?: string };

export default function MetaLeadAdsIntegrationPage() {
  const [config, setConfig] = useState({
    pageId: '',
    pageAccessToken: '',
    appSecret: '',
    formIds: [] as string[],
    sourceLabel: '2Bigha CRM',
    isActive: false,
    pixelId: '',
    eventDataSetId: '',
    capiAccessToken: '',
    capiEnabled: false,
  });
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingForms, setSyncingForms] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingCapi, setTestingCapi] = useState(false);
  const [capiTestResult, setCapiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${CRM_API_URL}/webhooks/meta-leadgen`;

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text);
          setConfig((prev) => ({ ...prev, ...data, formIds: Array.isArray(data.formIds) ? data.formIds : [] }));
          if (Array.isArray(data.forms)) setForms(data.forms);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Meta Lead Ads config:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTestResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      if (res.ok) alert('Settings saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestResult({ success: true, message: `Connected to page "${data.pageName || config.pageId}"` });
      } else {
        setTestResult({ success: false, message: data.error || 'Connection test failed' });
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const [syncingLeads, setSyncingLeads] = useState(false);
  const [syncLeadsResult, setSyncLeadsResult] = useState<string | null>(null);

  const handleSyncLeads = async () => {
    setSyncingLeads(true);
    setSyncLeadsResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyncLeadsResult(`Synced successfully: ${data.created ?? 0} new lead(s) created from Meta.`);
      } else {
        setSyncLeadsResult(data.error || 'Failed to sync leads');
      }
    } catch (err) {
      setSyncLeadsResult('Sync failed due to network error');
    } finally {
      setSyncingLeads(false);
    }
  };

  const handleSyncForms = async () => {
    setSyncingForms(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen/forms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setForms(Array.isArray(data.forms) ? data.forms : []);
      else alert(data.error || 'Failed to load lead forms');
    } catch (err) {
      console.error('Failed to sync forms:', err);
    } finally {
      setSyncingForms(false);
    }
  };

  const toggleForm = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      formIds: prev.formIds.includes(id)
        ? prev.formIds.filter((f) => f !== id)
        : [...prev.formIds, id],
    }));
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestCapi = async () => {
    setTestingCapi(true);
    setCapiTestResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/meta-leadgen/test-capi`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCapiTestResult({ success: true, message: data.message || 'CAPI test event sent successfully' });
      } else {
        setCapiTestResult({ success: false, message: data.error || 'CAPI connection test failed' });
      }
    } catch (err) {
      setCapiTestResult({ success: false, message: 'CAPI connection test failed' });
    } finally {
      setTestingCapi(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div className="flex items-center gap-4">
        <Link href="/crm/settings/integrations" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-text-muted hover:text-text-main">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-medium text-text-main tracking-tight">Meta Lead Ads</h1>
          <p className="text-text-muted font-medium">Automatically create CRM leads from Facebook &amp; Instagram Lead Ads forms.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-text-muted px-1">Webhook URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  className="flex-1 px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-mono text-text-main outline-none"
                  value={webhookUrl}
                />
                <button
                  type="button"
                  onClick={copyWebhookUrl}
                  className="p-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] hover:bg-slate-100 transition-colors"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-text-muted" />}
                </button>
              </div>
              <p className="px-1 text-[11px] text-text-muted">
                Paste this into your Meta App&apos;s Webhooks → Page subscription, subscribed to the{' '}
                <code className="font-mono">leadgen</code> field. Use the Verify Token you set as{' '}
                <code className="font-mono">META_LEAD_ADS_WEBHOOK_VERIFY_TOKEN</code> on the API server.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-muted px-1">Facebook Page ID</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                    placeholder="1234567890..."
                    value={config.pageId}
                    onChange={(e) => setConfig({ ...config, pageId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-muted px-1">Source label</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                    placeholder="2Bigha CRM"
                    value={config.sourceLabel}
                    onChange={(e) => setConfig({ ...config, sourceLabel: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-text-muted px-1">Page Access Token</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="password"
                    className="w-full pl-12 pr-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                    placeholder="EAAB... (long-lived Page token)"
                    value={config.pageAccessToken}
                    onChange={(e) => setConfig({ ...config, pageAccessToken: e.target.value })}
                  />
                </div>
                <p className="px-1 text-[11px] text-text-muted">
                  Graph API Explorer → select your app &amp; the Page → generate a token, then exchange it
                  for a long-lived one. Needs the <code className="font-mono">pages_show_list</code> and{' '}
                  <code className="font-mono">leads_retrieval</code> permissions.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-text-muted px-1">App Secret</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="password"
                    className="w-full pl-12 pr-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                    placeholder="From Meta App Dashboard → Settings → Basic"
                    value={config.appSecret}
                    onChange={(e) => setConfig({ ...config, appSecret: e.target.value })}
                  />
                </div>
                <p className="px-1 text-[11px] text-text-muted">
                  Used to verify that inbound webhook events genuinely came from Meta. Strongly
                  recommended — without it, the webhook accepts any POST unverified.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-black text-text-muted">Lead forms to sync</label>
                  <button
                    type="button"
                    onClick={handleSyncForms}
                    disabled={syncingForms || !config.pageAccessToken || !config.pageId}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-primary hover:opacity-70 transition-opacity disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={syncingForms ? 'animate-spin' : ''} />
                    {syncingForms ? 'Loading…' : 'Load forms'}
                  </button>
                </div>
                {forms.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {forms.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-3 px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-[var(--border-color)] text-primary focus:ring-[var(--primary)]"
                          checked={config.formIds.includes(f.id)}
                          onChange={() => toggleForm(f.id)}
                        />
                        <span className="text-sm font-bold text-text-main flex-1">{f.name || f.id}</span>
                        {f.status && <span className="text-[10px] uppercase font-bold text-text-muted">{f.status}</span>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 text-[11px] text-text-muted">
                    Leave empty to sync leads from every form on this page, or load the page&apos;s forms
                    above and pick specific ones.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-text-main hover:bg-black text-white py-4 rounded-[var(--radius-md)] text-xs font-semibold transition-all shadow-lg shadow-slate-900/10 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </button>
              <label className="flex items-center gap-3 px-6 py-4 bg-surface-dim rounded-[var(--radius-md)] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded-lg border-[var(--border-color)] text-primary focus:ring-[var(--primary)]"
                  checked={config.isActive}
                  onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
                />
                <span className="text-xs font-black text-text-main leading-none">Enabled</span>
              </label>
            </div>
          </form>

          <div className="bg-emerald-50 border border-emerald-100 rounded-[var(--crm-radius-ui)] p-8">
            <h3 className="text-lg font-black text-emerald-900 mb-2 uppercase tracking-tight">Test &amp; Sync</h3>
            <p className="text-emerald-700 text-sm font-medium mb-6">Verify your connection and pull the latest leads from Meta immediately.</p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-[var(--radius-md)] text-xs font-semibold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {testing ? 'Testing...' : <><Send size={16} /> Test Connection</>}
              </button>
              <button
                type="button"
                onClick={handleSyncLeads}
                disabled={syncingLeads || !config.pageAccessToken}
                className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-[var(--radius-md)] text-xs font-semibold transition-all shadow-lg shadow-slate-900/20 disabled:opacity-50 flex items-center gap-2"
              >
                {syncingLeads ? 'Syncing...' : <><RefreshCw size={16} className={syncingLeads ? 'animate-spin' : ''} /> Sync Leads Now</>}
              </button>
            </div>
            {testResult && (
              <p className={`text-sm font-semibold mt-4 ${testResult.success ? 'text-emerald-700' : 'text-rose-600'}`}>
                {testResult.message}
              </p>
            )}
            {syncLeadsResult && (
              <p className="text-sm font-semibold mt-3 text-slate-800 bg-white/70 p-3 rounded border border-emerald-200">
                {syncLeadsResult}
              </p>
            )}
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-[var(--crm-radius-ui)] p-8">
            <h3 className="text-lg font-black text-indigo-900 mb-2 uppercase tracking-tight">Conversions API (CAPI)</h3>
            <p className="text-indigo-700 text-sm font-medium mb-6">Send lead events back to Meta for ad optimization &amp; attribution tracking.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-indigo-800 px-1">Pixel ID</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-indigo-500/15 outline-none transition-all"
                    placeholder="1006574812313887"
                    value={config.pixelId}
                    onChange={(e) => setConfig({ ...config, pixelId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-indigo-800 px-1">Event Data Set ID</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-indigo-500/15 outline-none transition-all"
                    placeholder="1054825264020188"
                    value={config.eventDataSetId}
                    onChange={(e) => setConfig({ ...config, eventDataSetId: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-indigo-800 px-1">CAPI Access Token <span className="font-medium text-indigo-500">(optional — falls back to Page Access Token)</span></label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                  <input
                    type="password"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-indigo-200 rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-indigo-500/15 outline-none transition-all"
                    placeholder="System User token with ads_management permission"
                    value={config.capiAccessToken}
                    onChange={(e) => setConfig({ ...config, capiAccessToken: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-3 px-4 py-3 bg-white rounded-[var(--radius-md)] cursor-pointer border border-indigo-200">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded-lg border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    checked={config.capiEnabled}
                    onChange={(e) => setConfig({ ...config, capiEnabled: e.target.checked })}
                  />
                  <span className="text-xs font-black text-indigo-900 leading-none">Enable CAPI Events</span>
                </label>
                <button
                  type="button"
                  onClick={handleTestCapi}
                  disabled={testingCapi || !config.pixelId}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-[var(--radius-md)] text-xs font-semibold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {testingCapi ? 'Testing...' : <><Send size={14} /> Test CAPI</>}
                </button>
              </div>
              {capiTestResult && (
                <p className={`text-sm font-semibold ${capiTestResult.success ? 'text-indigo-700' : 'text-rose-600'}`}>
                  {capiTestResult.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-primary rounded-[var(--crm-radius-ui)] p-8 text-white shadow-xl shadow-primary/20">
            <Share2 size={40} className="mb-6 opacity-40" />
            <h3 className="text-xl font-black uppercase tracking-tight mb-2">Instant Lead Capture</h3>
            <p className="text-blue-100 text-sm font-medium leading-relaxed">
              The moment a prospect submits a Facebook or Instagram Lead Ads form, a matching CRM Lead is
              created automatically — no manual export/import.
            </p>
          </div>

          <div className="bg-text-main rounded-[var(--crm-radius-ui)] p-8 text-white">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-4">Setup Steps</h3>
            <ul className="space-y-4">
              {[
                'Create a Meta App (developers.facebook.com) with the Webhooks + Facebook Login for Business products',
                'Generate a long-lived Page Access Token with leads_retrieval permission',
                'Add the Webhook URL above under Webhooks → Page, subscribed to "leadgen"',
                'Paste the Page ID, Access Token & App Secret here, then enable',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-3 text-sm font-bold">
                  <div className="w-6 h-6 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-xs text-primary/70">{i + 1}</div>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
