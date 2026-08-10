"use client";

const SPLIT_MODES = [
  { value: "round_robin", label: "Round robin (spread load evenly)" },
  { value: "random", label: "Random (each send picks a mailbox)" },
  { value: "sticky_entity", label: "Sticky per record (same contact always gets same mailbox)" },
] as const;

function labelForAccount(acc: { _id: string; email: string; displayName?: string }) {
  return acc.displayName ? `${acc.displayName} · ${acc.email}` : acc.email;
}

export default function WorkflowSendEmailActionFields({
  row,
  onChange,
  emailTemplates,
  inboxAccounts,
  variant = "form",
}: {
  row: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  emailTemplates: { _id: string; name: string }[];
  inboxAccounts: { _id: string; email: string; displayName?: string }[];
  variant?: "form" | "canvas";
}) {
  const split = row.mailboxSplit as { mode?: string; accountIds?: string[] } | undefined;
  const splitIds = Array.isArray(split?.accountIds) ? split!.accountIds : [];
  const useSplit = splitIds.length >= 2 && !!split?.mode;
  const sendMode = row.sendMode === "ai_draft" ? "ai_draft" : "template";
  const retryOnSendFail = row.retryOnSendFail === true;
  const fallbackIds = Array.isArray(row.fallbackInboxAccountIds)
    ? (row.fallbackInboxAccountIds as string[])
    : [];
  const jitter = row.sendJitterSecondsMax != null ? Number(row.sendJitterSecondsMax) : 0;

  const isForm = variant === "form";
  const focusRing = "focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/35";
  const sel = isForm
    ? `border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm shadow-sm ${focusRing}`
    : "nodrag nopan w-full rounded-lg border border-[var(--border-color)] py-1 px-1 text-[9px] font-semibold";
  const lab = isForm ? "text-xs font-semibold text-slate-600" : "text-[8px] font-bold text-slate-600";
  const hint = isForm ? "text-xs text-slate-500" : "text-[8px] text-slate-500 leading-tight";
  const numCls = isForm
    ? `border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full max-w-[200px] shadow-sm ${focusRing}`
    : "nodrag nopan w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-[9px]";

  const toggleSplit = (next: boolean) => {
    if (next) {
      const firstTwo = inboxAccounts.slice(0, 2).map((a) => a._id);
      onChange({
        inboxAccountId: undefined,
        mailboxSplit: {
          mode: "round_robin",
          accountIds: firstTwo.length >= 2 ? firstTwo : [],
        },
      });
    } else {
      onChange({ mailboxSplit: undefined });
    }
  };

  const toggleAccount = (id: string, checked: boolean) => {
    const set = new Set(splitIds);
    if (checked) set.add(id);
    else set.delete(id);
    const nextIds = [...set];
    onChange({
      mailboxSplit: {
        mode: (split?.mode as string) || "round_robin",
        accountIds: nextIds,
      },
    });
  };

  const toggleFallbackAccount = (id: string, checked: boolean) => {
    const set = new Set(fallbackIds);
    if (checked) set.add(id);
    else set.delete(id);
    onChange({ fallbackInboxAccountIds: [...set] });
  };

  return (
    <div className={isForm ? "grid gap-3" : "mt-1 space-y-1"}>
      <label className="block">
        <span className={lab}>Email content mode</span>
        <select
          className={`${sel} ${isForm ? "mt-0.5 w-full" : ""}`}
          value={sendMode}
          onChange={(e) =>
            onChange({
              sendMode: e.target.value,
              templateId: e.target.value === "template" ? row.templateId : undefined,
            })
          }
        >
          <option value="template">Use saved template</option>
          <option value="ai_draft">Auto draft with AI</option>
        </select>
      </label>

      {sendMode === "template" ? (
        <label className="block">
          <span className={lab}>Template</span>
          <select
            className={`${sel} ${isForm ? "mt-0.5 w-full" : ""}`}
            value={String(row.templateId ?? "")}
            onChange={(e) => onChange({ templateId: e.target.value })}
          >
            <option value="">{isForm ? "— Select email template —" : "— Email template —"}</option>
            {emailTemplates.map((tpl) => (
              <option key={tpl._id} value={tpl._id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block">
          <span className={lab}>AI drafting instructions (optional)</span>
          <textarea
            className={isForm ? "mt-0.5 min-h-[72px] w-full rounded-[var(--radius-md)] border border-[var(--border-color)] bg-white px-2 py-1.5 text-sm" : "nodrag nopan min-h-[48px] w-full rounded-lg border border-[var(--border-color)] px-1 py-0.5 text-[9px]"}
            placeholder="Optional guidance for automated AI drafting..."
            value={String(row.aiInstructions ?? "")}
            onChange={(e) => onChange({ aiInstructions: e.target.value || undefined })}
          />
          <p className={`mt-0.5 ${hint}`}>
            AI drafts from CRM context and pipeline type (IT consulting or freelancer), then sends automatically.
          </p>
        </label>
      )}

      <div className={isForm ? "grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)]/70 bg-[var(--surface-dim)]/30 p-3" : "flex flex-col gap-0.5"}>
        <span className={lab}>Sender</span>
        <select
          className={isForm ? "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full bg-white" : numCls}
          value={useSplit ? "split" : "single"}
          onChange={(e) => toggleSplit(e.target.value === "split")}
        >
          <option value="single">Single mailbox</option>
          <option value="split" disabled={inboxAccounts.length < 2}>
            Split across mailboxes (2+)
          </option>
        </select>
      </div>

      {!useSplit && (
        <label className={isForm ? "block rounded-[var(--radius-md)] border border-[var(--border-color)]/70 bg-[var(--surface-dim)]/30 p-3" : "block"}>
          <span className={lab}>Send from mailbox</span>
          <select
            className={isForm ? "mt-0.5 w-full border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm bg-white" : numCls}
            value={String(row.inboxAccountId ?? "")}
            onChange={(e) => onChange({ inboxAccountId: e.target.value || undefined })}
          >
            <option value="">{isForm ? "Default (first connected mailbox)" : "Default mailbox"}</option>
            {inboxAccounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {labelForAccount(acc)}
              </option>
            ))}
          </select>
        </label>
      )}

      {useSplit && (
        <div className={isForm ? "grid gap-2 rounded-[var(--radius-md)] border border-violet-100/80 bg-gradient-to-br from-violet-50/40 to-slate-50/30 p-3" : "rounded border border-[var(--border-color)] bg-[var(--surface-dim)]/80 px-1 py-1"}>
          <span className={lab}>Split mode</span>
          <select
            className={isForm ? "border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm" : numCls}
            value={split?.mode || "round_robin"}
            onChange={(e) =>
              onChange({
                mailboxSplit: {
                  mode: e.target.value,
                  accountIds: splitIds,
                },
              })
            }
          >
            {SPLIT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className={lab}>Mailboxes in pool (pick 2+)</span>
          <div className={isForm ? "flex flex-col gap-1.5 max-h-36 overflow-y-auto" : "flex flex-col gap-0.5 max-h-28 overflow-y-auto"}>
            {inboxAccounts.map((acc) => (
              <label
                key={acc._id}
                className={isForm ? "flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-slate-700 hover:bg-white" : "flex items-center gap-1 text-[8px] text-slate-700"}
              >
                <input
                  type="checkbox"
                  className="nodrag nopan rounded border-slate-300"
                  checked={splitIds.includes(acc._id)}
                  onChange={(e) => toggleAccount(acc._id, e.target.checked)}
                />
                {labelForAccount(acc)}
              </label>
            ))}
          </div>
          {splitIds.length < 2 && (
            <p className={isForm ? "text-xs text-amber-700" : "text-[8px] text-amber-700"}>
              Select at least two mailboxes for split mode.
            </p>
          )}
        </div>
      )}

      <label className={isForm ? "block rounded-[var(--radius-md)] border border-[var(--border-color)]/70 bg-[var(--surface-dim)]/30 px-3 py-2.5" : "block"}>
        <span className={lab}>Send jitter (seconds)</span>
        <input
          type="number"
          min={0}
          max={3600}
          className={isForm ? "mt-0.5 border border-[var(--border-color)] rounded-[var(--radius-md)] px-2 py-1.5 text-sm w-full max-w-[220px] bg-white" : numCls}
          placeholder="0"
          value={jitter > 0 ? jitter : ""}
          onChange={(e) => {
            const v = e.target.value === "" ? 0 : Math.min(3600, Math.max(0, parseInt(e.target.value, 10) || 0));
            onChange({ sendJitterSecondsMax: v > 0 ? v : undefined });
          }}
        />
        <p className={`mt-0.5 ${hint}`}>
          Random delay 0…N seconds before this send spreads bursts (helps deliverability). 0 = send immediately.
        </p>
      </label>

      <div className={isForm ? "rounded-[var(--radius-md)] border border-[var(--border-color)]/70 bg-[var(--surface-dim)]/40 px-3 py-2.5" : "rounded border border-[var(--border-color)] px-1 py-1"}>
        <label className={isForm ? "flex items-center gap-2 text-xs text-slate-700 font-semibold" : "flex items-center gap-1 text-[8px] text-slate-700 font-bold"}>
          <input
            type="checkbox"
            checked={retryOnSendFail}
            onChange={(e) => onChange({ retryOnSendFail: e.target.checked })}
          />
          Retry if send fails (fallback mailboxes)
        </label>
        {retryOnSendFail && (
          <div className={isForm ? "mt-2 space-y-1.5 max-h-36 overflow-y-auto" : "mt-1 space-y-0.5 max-h-24 overflow-y-auto"}>
            {inboxAccounts.map((acc) => (
              <label
                key={acc._id}
                className={isForm ? "flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-slate-700 hover:bg-white" : "flex items-center gap-1 text-[8px] text-slate-700"}
              >
                <input
                  type="checkbox"
                  className="nodrag nopan rounded border-slate-300"
                  checked={fallbackIds.includes(acc._id)}
                  onChange={(e) => toggleFallbackAccount(acc._id, e.target.checked)}
                />
                {labelForAccount(acc)}
              </label>
            ))}
            <p className={isForm ? "text-xs text-slate-500" : "text-[8px] text-slate-500"}>
              Order: primary sender first, then selected fallbacks.
            </p>
          </div>
        )}
      </div>

      {inboxAccounts.length === 0 && (
        <p className={isForm ? "text-xs text-amber-700" : "text-[8px] text-amber-700"}>
          No mailboxes loaded — connect accounts under CRM → Inbox.
        </p>
      )}

      <details className={isForm ? "rounded-[var(--radius-md)] border border-[var(--border-color)]/70 bg-[var(--surface-dim)]/30 px-3 py-2 shadow-sm" : "rounded border border-[var(--border-color)] px-1 py-0.5"}>
        <summary className={isForm ? "cursor-pointer text-xs font-semibold text-slate-700" : "cursor-pointer text-[8px] font-bold text-slate-700"}>
          Deliverability checklist
        </summary>
        <ul className={`mt-2 list-disc pl-4 space-y-1 ${isForm ? "text-xs text-slate-600" : "text-[8px] text-slate-600"}`}>
          <li>Authenticate your domain (SPF, DKIM, DMARC) in Microsoft 365 or your DNS host.</li>
          <li>Warm up new mailboxes: start with low volume, increase gradually; avoid sudden spikes.</li>
          <li>Use split mailboxes or jitter so many contacts are not emailed from one address in one minute.</li>
          <li>Keep lists clean: remove hard bounces and unsubscribes; do not buy cold lists.</li>
          <li>Use clear subject lines and a recognizable from-name; avoid spam trigger stuffing.</li>
          <li>Let recipients reply — engagement improves inbox placement.</li>
        </ul>
      </details>

      {isForm && (
        <>
          <p className="text-xs text-slate-500">
            Every Send email step has its own mailbox or split pool. Add one step per branch and configure senders separately when needed.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-600 rounded-md bg-[var(--surface-dim)] px-2 py-1">
            <input
              type="checkbox"
              checked={row.enforceRecipientMatch !== false}
              onChange={(e) => onChange({ enforceRecipientMatch: e.target.checked })}
            />
            Require recipient to match CRM record email (recommended)
          </label>
          <p className="text-xs text-slate-500">
            Create templates under Settings → Email templates. Merge tags like {"{{firstName}}"} in the template body.
          </p>
        </>
      )}
      {!isForm && (
        <p className={hint}>
          Per-node sender or split. Jitter spreads send time. Merge tags: {"{{firstName}}"}. CRM → Inbox for accounts.
        </p>
      )}
    </div>
  );
}
