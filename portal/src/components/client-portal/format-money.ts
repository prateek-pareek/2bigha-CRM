export function formatMoney(amount: number, currency: string) {
  const code = (currency || 'INR').trim() || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString('en-IN')}`;
  }
}
