// Currency/amount formatting in Indonesian style: dot as thousands separator
// (e.g. 1500000 -> "1.500.000"), comma as decimal separator when a fraction
// exists (e.g. 1500.5 -> "1.500,50"). Accepts strings too — Postgres numeric
// columns are often returned as strings, and coercing them avoids amounts
// silently collapsing to zero.
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';
  const negative = n < 0;
  const [intRaw, dec] = Math.abs(n).toFixed(2).split('.');
  const int = Number(intRaw).toLocaleString('en-US').replace(/,/g, '.');
  const formatted = dec === '00' ? int : `${int},${dec}`;
  return negative ? `-${formatted}` : formatted;
}

// Short label for progress/percentage values (e.g. 0.5 -> "50%").
export function formatPercent(ratio: number | null | undefined): string {
  const r = typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 0;
  return `${Math.round(Math.max(0, Math.min(1, r)) * 100)}%`;
}
