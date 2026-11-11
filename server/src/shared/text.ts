export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function timestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : '';
}
