/** Deal pricing: fixed-price project vs monthly payment engagement. */

export type DealPricingType = 'fixed' | 'monthly';

export function normalizeDealPricingType(
  value?: string | null,
): DealPricingType {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  return v === 'monthly' || v === 'retainer' || v === 'recurring'
    ? 'monthly'
    : 'fixed';
}

/** Months of engagement for monthly deals (default 12). Fixed deals return 1. */
export function dealContractMonths(deal: {
  pricingType?: string | null;
  contractMonths?: number | null;
}): number {
  if (normalizeDealPricingType(deal.pricingType) !== 'monthly') return 1;
  const m = Number(deal.contractMonths);
  if (!Number.isFinite(m) || m <= 0) return 12;
  return Math.min(60, Math.max(1, Math.round(m)));
}

/** Total contract value used for pipeline / weighted forecast. */
export function dealContractValue(deal: {
  dealValue?: number | null;
  pricingType?: string | null;
  contractMonths?: number | null;
}): number {
  const amount = Number(deal.dealValue) || 0;
  return amount * dealContractMonths(deal);
}
