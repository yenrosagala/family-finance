// Currency/amount formatting in Indonesian style: dot as thousands separator
// (e.g. 1500000 -> "1.500.000"). Amounts are whole rupiah (no forced decimals).
export function formatMoney(value: number | null | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const negative = n < 0;
  const abs = Math.abs(Math.round(n));
  const str = abs.toLocaleString('en-US').replace(/,/g, '.');
  return negative ? `-${str}` : str;
}

// Short label for progress/percentage values (e.g. 0.5 -> "50%").
export function formatPercent(ratio: number | null | undefined): string {
  const r = typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 0;
  return `${Math.round(Math.max(0, Math.min(1, r)) * 100)}%`;
}
