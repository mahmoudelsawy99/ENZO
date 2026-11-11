/**
 * Money is calculated in minor units (piasters) so totals do not drift.
 * Stored API amounts stay in major units with two decimal places.
 */
export function toMinor(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const negative = value < 0;
  const [whole, fraction = '00'] = Math.abs(value).toFixed(2).split('.');
  const minor = Number(whole) * 100 + Number(fraction.slice(0, 2));
  return negative ? -minor : minor;
}

export function fromMinor(value: number): number {
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return Number(`${negative ? '-' : ''}${whole}.${fraction}`);
}

export function addMinor(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
