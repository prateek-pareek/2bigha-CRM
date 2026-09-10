"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { FormDefinition } from "@/lib/crm/forms";
import { CRM_BTN_ICON } from "@/lib/crm/ui";
import { CRM_HS_CONTROL_CLASS as INP_CLASS, CRM_HS_LABEL_CLASS } from "@/components/crm/records/forms/crm-form-primitives";

const LBL = CRM_HS_LABEL_CLASS;

function getPortalOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || "";
}

export default function FormEmbedTab({ form }: { form: FormDefinition }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = useMemo(getPortalOrigin, []);
  const hostedUrl = `${origin}/forms/${form._id}`;
  const iframeSnippet = `<iframe src="${hostedUrl}" style="width:100%;border:0;min-height:640px" title="${form.name.replace(/"/g, "'")}"></iframe>`;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)] mb-1">Hosted form link</p>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Use this as your Meta or Google Ads landing page URL, or share it directly.
          </p>
          <label className={LBL}>Public URL</label>
          <div className="flex items-center gap-2">
            <input readOnly className={`${INP_CLASS} font-mono text-xs`} value={hostedUrl} />
            <button
              type="button"
              onClick={() => copy(hostedUrl, "url")}
              className={CRM_BTN_ICON}
              title="Copy link"
            >
              {copied === "url" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
            <a
              href={hostedUrl}
              target="_blank"
              rel="noreferrer"
              className={CRM_BTN_ICON}
              title="Open"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--text-main)] mb-1">Embed on your website</p>
          <p className="text-xs text-[var(--text-muted)] mb-2">Paste this iframe snippet into any page&apos;s HTML.</p>
          <div className="relative">
            <pre className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background)] p-3 pr-12 text-xs font-mono text-[var(--text-main)] overflow-x-auto whitespace-pre-wrap break-all">
              {iframeSnippet}
            </pre>
            <button
              type="button"
              onClick={() => copy(iframeSnippet, "iframe")}
              className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--card-bg)] hover:bg-[var(--background)] transition-colors"
              title="Copy snippet"
            >
              {copied === "iframe" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {!form.isActive && (
          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-[var(--radius-md)] px-3 py-2">
            This form is inactive — the hosted link and embed will show a &quot;not found&quot; message until you
            activate it (toggle at the top of the page).
          </p>
        )}
      </div>

      <div className="rounded-[var(--crm-radius-ui)] border border-[var(--border-color)] bg-[var(--background)] overflow-hidden min-h-[420px]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Preview</p>
          <a
            href={hostedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
          >
            Open in new tab <ExternalLink size={11} />
          </a>
        </div>
        {form.isActive ? (
          <iframe
            src={hostedUrl}
            title={`${form.name} preview`}
            className="w-full h-[560px] bg-white"
          />
        ) : (
          <p className="text-sm text-[var(--text-muted)] p-8 text-center">
            Activate the form to preview the hosted page here.
          </p>
        )}
      </div>
    </div>
  );
}
