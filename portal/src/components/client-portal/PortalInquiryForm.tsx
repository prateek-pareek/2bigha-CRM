'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { CRM_API_URL } from '@/lib/api/config';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';

export function PortalInquiryForm({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setFormError('Please fill in all fields.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${CRM_API_URL}/portal/${token}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={cn(HS_PANEL, 'p-10 text-center')}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a] shadow-sm">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="mb-1 text-sm font-bold tracking-tight text-[var(--text-main)]">Message sent</h3>
        <p className="text-xs font-bold uppercase leading-relaxed tracking-widest text-[var(--text-muted)]">
          We&apos;ll get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(HS_PANEL, 'p-6')}>
      <h3 className="mb-8 text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--text-muted)] underline decoration-[#ffb7a1] underline-offset-4">
        Send us a message
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 ml-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            className="w-full rounded-md border border-[var(--border-color)] bg-white px-4 py-3 text-xs font-semibold text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:border-[var(--hs-link)] focus:shadow-[0_0_0_3px_rgba(0,145,174,0.2)]"
          />
        </div>
        <div>
          <label className="mb-2 ml-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Your email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@example.com"
            className="w-full rounded-md border border-[var(--border-color)] bg-white px-4 py-3 text-xs font-semibold text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:border-[var(--hs-link)] focus:shadow-[0_0_0_3px_rgba(0,145,174,0.2)]"
          />
        </div>
        <div>
          <label className="mb-2 ml-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            How can we help?
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Detailed message..."
            rows={3}
            className="w-full resize-none rounded-md border border-[var(--border-color)] bg-white px-4 py-3 text-xs font-semibold text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)]/40 focus:border-[var(--hs-link)] focus:shadow-[0_0_0_3px_rgba(0,145,174,0.2)]"
          />
        </div>
        {formError ? (
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#dc2626]">{formError}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="group flex w-full items-center justify-center gap-3 rounded-md bg-[var(--hs-link)] py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-[0_2px_8px_rgba(255,122,89,0.35)] transition-all hover:bg-[var(--hs-link-hover)] disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin text-white" />
          ) : (
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          )}
          {submitting ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </div>
  );
}
