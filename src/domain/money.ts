/** Avoid floating point representation noise while accepting at most centavo precision. */
export function hasCentavoPrecision(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7;
}
