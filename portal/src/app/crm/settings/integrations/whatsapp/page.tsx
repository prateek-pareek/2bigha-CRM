"use client";

import { useState, useEffect } from 'react';
import { Share2, CheckCircle2, ChevronLeft, Send, Key } from 'lucide-react';
import Link from 'next/link';
import { CRM_API_URL } from '@/lib/crm/config';

type Provider = 'meta' | 'aisensy';

export default function WhatsAppIntegrationPage() {
  const [config, setConfig] = useState({
    provider: 'meta' as Provider,
    apiKey: '',
    phoneNumberId: '',
    businessAccountId: '',
    sourceLabel: '2Bigha CRM',
    appSecret: '',
    aisensyProjectId: '',
    aisensyProjectApiPassword: '',
    isActive: false,
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/whatsapp`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const text = await res.text();
        if (text) {
          const data = JSON.parse(text);
          setConfig((prev) => ({ ...prev, ...data, provider: data.provider === 'aisensy' ? 'aisensy' : 'meta' }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp config:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/whatsapp`, {
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
    if (!testPhone) return alert('Enter a phone number for testing');
    setTesting(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${CRM_API_URL}/crm/integrations/whatsapp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone: testPhone }),
      });
      if (res.ok) alert('Test message sent!');
      else alert('Failed to send test message');
    } catch (err) {
      console.error('Test error:', err);
    } finally {
      setTesting(false);
    }
  };

  const isMeta = config.provider === 'meta';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 animate-in fade-in duration-500 pb-8 md:pb-10">
      <div className="flex items-center gap-4">
        <Link href="/crm/settings/integrations" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-text-muted hover:text-text-main">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-medium text-text-main tracking-tight">WhatsApp</h1>
          <p className="text-text-muted font-medium">Configure your WhatsApp Business integration.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-card border border-[var(--border-color)] rounded-[var(--crm-radius-ui)] p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-text-muted px-1">Provider</label>
              <div className="grid grid-cols-2 gap-3">
                {(['meta', 'aisensy'] as Provider[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setConfig({ ...config, provider: p })}
                    className={`flex items-center justify-between rounded-[var(--radius-md)] border px-4 py-3 text-left transition-all ${
                      config.provider === p
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/15'
                        : 'border-[var(--border-color)] bg-surface-dim hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-text-main">
                        {p === 'meta' ? 'Meta Cloud API' : 'AiSensy'}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {p === 'meta' ? 'Direct WhatsApp Business API' : 'aisensy.com — WhatsApp BSP'}
                      </p>
                    </div>
                    {config.provider === p && <CheckCircle2 size={18} className="text-emerald-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-text-muted px-1">
                  {isMeta ? 'API Access Token' : 'AiSensy API Key'}
                </label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    type="password"
                    className="w-full pl-12 pr-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                    placeholder={isMeta ? 'EAAB...' : 'Copy from AiSensy → Manage'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  />
                </div>
              </div>

              {isMeta ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-text-muted px-1">Phone Number ID</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                        placeholder="1234567890..."
                        value={config.phoneNumberId}
                        onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-text-muted px-1">Business Account ID</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                        placeholder="0987654321..."
                        value={config.businessAccountId}
                        onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
                      />
                    </div>
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
                      Used to verify that inbound webhook messages genuinely came from Meta. Strongly
                      recommended — without it, the webhook accepts any POST unverified.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-text-muted px-1">Source label</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                      placeholder="2Bigha CRM"
                      value={config.sourceLabel}
                      onChange={(e) => setConfig({ ...config, sourceLabel: e.target.value })}
                    />
                    <p className="px-1 text-[11px] text-text-muted">
                      Sent as AiSensy&apos;s attribution tag on every campaign send. Templates &amp; their
                      approval still happen manually in the AiSensy dashboard — map each one to a campaign
                      under WhatsApp → Templates.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-text-muted px-1">Project ID (optional)</label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                        placeholder="From AiSensy project Settings → API"
                        value={config.aisensyProjectId}
                        onChange={(e) => setConfig({ ...config, aisensyProjectId: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-text-muted px-1">Project API Password (optional)</label>
                      <input
                        type="password"
                        className="w-full px-4 py-3 bg-surface-dim border border-[var(--border-color)] rounded-[var(--radius-md)] text-sm font-bold text-text-main focus:ring-4 focus:ring-[var(--primary)]/15 outline-none transition-all"
                        placeholder="Separate from the Campaign API key above"
                        value={config.aisensyProjectApiPassword}
                        onChange={(e) => setConfig({ ...config, aisensyProjectApiPassword: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="px-1 text-[11px] text-text-muted">
                    Enables free-text replies from the WhatsApp inbox (AiSensy&apos;s Project API — a
                    different credential pair than the Campaign API key above). Leave blank to keep
                    replies template-only.
                  </p>
                </>
              )}
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

          {(isMeta || (config.aisensyProjectId && config.aisensyProjectApiPassword)) && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-[var(--crm-radius-ui)] p-8">
              <h3 className="text-lg font-black text-emerald-900 mb-2 uppercase tracking-tight">Test Integration</h3>
              <p className="text-emerald-700 text-sm font-medium mb-6">Send a test message to verify your credentials are correct.</p>
              <div className="flex gap-4">
                <input
                  type="tel"
                  placeholder="Phone with country code (e.g. 91...)"
                  className="flex-1 px-4 py-3 bg-card border border-emerald-200 rounded-[var(--radius-md)] text-sm font-bold text-emerald-900 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder:text-emerald-300"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-[var(--radius-md)] text-xs font-semibold transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {testing ? 'Sending...' : <><Send size={16} /> Send Test</>}
                </button>
              </div>
              {!isMeta && (
                <p className="text-emerald-700/80 text-[11px] font-medium mt-4">
                  Note: this only works within WhatsApp&apos;s 24h customer-service window (the recipient
                  must have messaged your number recently) — that&apos;s a WhatsApp platform rule.
                </p>
              )}
            </div>
          )}

          {!isMeta && !(config.aisensyProjectId && config.aisensyProjectApiPassword) && (
            <div className="bg-amber-50 border border-amber-100 rounded-[var(--crm-radius-ui)] p-8">
              <h3 className="text-lg font-black text-amber-900 mb-2 uppercase tracking-tight">Test send needs Project API credentials</h3>
              <p className="text-amber-800 text-sm font-medium">
                Without a Project ID + Project API Password above, AiSensy only supports
                campaign/template-scoped sends — there&apos;s no generic test-message endpoint. Add those
                two fields to enable a test send here, or map a template to a campaign under WhatsApp →
                Templates and send it from the WhatsApp inbox or a Campaign instead.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-primary rounded-[var(--crm-radius-ui)] p-8 text-white shadow-xl shadow-primary/20">
            <Share2 size={40} className="mb-6 opacity-40" />
            <h3 className="text-xl font-black uppercase tracking-tight mb-2">Automated Notifications</h3>
            <p className="text-blue-100 text-sm font-medium leading-relaxed">Broadcast project status changes or new lead assignments direct to your team or clients via WhatsApp.</p>
          </div>

          <div className="bg-text-main rounded-[var(--crm-radius-ui)] p-8 text-white">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-4">
              {isMeta ? 'Meta Setup Tips' : 'AiSensy Setup Tips'}
            </h3>
            <ul className="space-y-4">
              {(isMeta
                ? ['Verify business on Meta', 'Create a WhatsApp App', 'Generate Permanent Token', 'Configure Webhooks']
                : [
                    'Copy the API key from AiSensy → Manage',
                    'Create & approve templates in AiSensy',
                    'Attach each template to a Campaign',
                    'Map the campaign name on this template under WhatsApp → Templates',
                  ]
              ).map((tip, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-bold">
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-primary/70">{i + 1}</div>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
