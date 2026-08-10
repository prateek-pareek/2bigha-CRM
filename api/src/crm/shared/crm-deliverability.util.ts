/** Shared deliverability helpers (warmup ramp, tracking base URL). */

export type EmailDeliverabilityConfig = {
  enforceSendLimits?: boolean;
  maxEmailsPerHourPerAccount?: number;
  maxEmailsPerDayPerAccount?: number;
  enableWarmupRamp?: boolean;
  commercialMailingAddress?: string;
  requireCommercialFooter?: boolean;
  blockHighRiskComposerSends?: boolean;
  emailTrackingEnabled?: boolean;
  optOutFooterStyle?: 'natural' | 'formal';
  enforceHumanOutreachChecks?: boolean;
  minOutreachBodyWords?: number;
  maxOutreachBodyWords?: number;
  maxOutreachParagraphs?: number;
  blockNonHumanOutreachSends?: boolean;
};

/** Strip trailing slash and `/api` so pixel URLs resolve to `{origin}/api/crm/track/...`. */
export function normalizePublicApiBase(raw?: string): string {
  let base = String(raw || '').trim().replace(/\/$/, '');
  if (!base) return '';
  if (/\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, '');
  }
  return base;
}

/**
 * Public origin for CRM email open/click pixels and unsubscribe links.
 * Production: https://apps.mathionix.tech (see docker-compose Traefik + TRACKING_BASE_URL).
 * Local dev: set TRACKING_BASE_URL to the live API so external mail clients can load the pixel.
 */
export function getTrackingPublicBase(): string {
  const candidates = [
    process.env.TRACKING_BASE_URL,
    process.env.CRM_OAUTH_PUBLIC_URL,
    process.env.PUBLIC_API_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];
  for (const c of candidates) {
    const base = normalizePublicApiBase(c);
    if (base) return base;
  }
  return 'http://localhost:4000';
}

/**
 * Gradual daily cap for new mailboxes (days 0–27), aligned with checklist warmup guidance.
 */
export function computeWarmupDailyCap(
  accountCreatedAt: Date | string | undefined,
  configuredMaxPerDay: number,
  enableWarmupRamp: boolean,
): { effectiveMaxPerDay: number; warmupDay: number; warmupActive: boolean } {
  const max = Math.max(1, Math.floor(configuredMaxPerDay || 200));
  if (!enableWarmupRamp) {
    return { effectiveMaxPerDay: max, warmupDay: -1, warmupActive: false };
  }
  const created = accountCreatedAt ? new Date(accountCreatedAt).getTime() : Date.now();
  const warmupDay = Math.max(
    0,
    Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)),
  );
  if (warmupDay >= 28) {
    return { effectiveMaxPerDay: max, warmupDay, warmupActive: false };
  }
  const ramp = [
    20, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120,
    130, 140, 150, 160, 170, 180, 190, 200, 210, 220,
  ];
  const cap = ramp[Math.min(warmupDay, ramp.length - 1)] ?? 20;
  return {
    effectiveMaxPerDay: Math.min(max, cap),
    warmupDay,
    warmupActive: true,
  };
}

export function normalizeDeliverabilityConfig(
  raw?: EmailDeliverabilityConfig | null,
): Required<
  Pick<
    EmailDeliverabilityConfig,
    | 'enforceSendLimits'
    | 'maxEmailsPerHourPerAccount'
    | 'maxEmailsPerDayPerAccount'
    | 'enableWarmupRamp'
    | 'requireCommercialFooter'
    | 'blockHighRiskComposerSends'
    | 'emailTrackingEnabled'
    | 'optOutFooterStyle'
    | 'enforceHumanOutreachChecks'
    | 'minOutreachBodyWords'
    | 'maxOutreachBodyWords'
    | 'maxOutreachParagraphs'
    | 'blockNonHumanOutreachSends'
  >
> & {
  commercialMailingAddress: string;
  optOutFooterStyle: 'natural' | 'formal';
  enforceHumanOutreachChecks: boolean;
  minOutreachBodyWords: number;
  maxOutreachBodyWords: number;
  maxOutreachParagraphs: number;
  blockNonHumanOutreachSends: boolean;
} {
  const enforce = raw?.enforceSendLimits === true;
  const footerStyle = raw?.optOutFooterStyle === 'formal' ? 'formal' : 'natural';
  const minOutreachBodyWords = Math.max(
    20,
    Math.floor(Number(raw?.minOutreachBodyWords ?? 50)),
  );
  const maxOutreachBodyWords = Math.max(
    minOutreachBodyWords + 10,
    Math.floor(Number(raw?.maxOutreachBodyWords ?? 90)),
  );
  const maxOutreachParagraphs = Math.max(
    1,
    Math.floor(Number(raw?.maxOutreachParagraphs ?? 3)),
  );
  return {
    enforceSendLimits: enforce,
    maxEmailsPerHourPerAccount: Math.max(
      1,
      Number(raw?.maxEmailsPerHourPerAccount || 40),
    ),
    maxEmailsPerDayPerAccount: Math.max(
      1,
      Number(raw?.maxEmailsPerDayPerAccount || 200),
    ),
    enableWarmupRamp: raw?.enableWarmupRamp !== false && enforce,
    commercialMailingAddress: String(raw?.commercialMailingAddress || '').trim(),
    requireCommercialFooter: raw?.requireCommercialFooter !== false,
    blockHighRiskComposerSends: raw?.blockHighRiskComposerSends === true,
    emailTrackingEnabled: raw?.emailTrackingEnabled !== false,
    optOutFooterStyle: footerStyle,
    enforceHumanOutreachChecks: raw?.enforceHumanOutreachChecks !== false,
    minOutreachBodyWords,
    maxOutreachBodyWords,
    maxOutreachParagraphs,
    blockNonHumanOutreachSends: raw?.blockNonHumanOutreachSends === true,
  };
}
