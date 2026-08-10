/** Field keys that expose money / commercial amounts in CRM. */
export const CRM_REVENUE_FIELD_KEYS = [
  'dealValue',
  'expectedDealValue',
  'dealValueINR',
  'dealValueUSD',
  'annualRevenue',
  'pricingType',
  'contractMonths',
  'currency',
  'exchangeRate',
  'amount',
  'pipelineValue',
  'grossValueINR',
  'weightedValueINR',
  'grossValue',
  'weightedValue',
  'forecastedRevenue',
  'revenue',
  'amount',
  'totalInvested',
  'totalReturned',
  'netReturn',
  'roiPercent',
  'invested',
  'returned',
  'independentInvested',
  'dealLinkedInvested',
  'salaryInvested',
  'profit',
  'resourceDailyRate',
  'monthlyGross',
  'dailyRate',
] as const;

export type CrmRevenueFieldKey = (typeof CRM_REVENUE_FIELD_KEYS)[number];

const REVENUE_KEY_SET = new Set<string>(CRM_REVENUE_FIELD_KEYS);

export function isCrmRevenueFieldKey(key: string): boolean {
  return REVENUE_KEY_SET.has(key);
}

export function filterOutCrmRevenueFields<T extends { key: string }>(
  items: T[],
  canView: boolean,
): T[] {
  if (canView) return items;
  return items.filter((item) => !isCrmRevenueFieldKey(item.key));
}

export function filterOutCrmRevenueKeys(
  keys: string[],
  canView: boolean,
): string[] {
  if (canView) return keys;
  return keys.filter((k) => !isCrmRevenueFieldKey(k));
}
