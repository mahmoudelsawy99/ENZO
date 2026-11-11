/**
 * Digits only, with the Egypt country code folded into the local 0-prefix form.
 * 00201012345678, +20 10 1234 5678, and 01012345678 share one normalized value.
 */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('20') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}
