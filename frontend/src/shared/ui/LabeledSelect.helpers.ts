/**
 * Coerces the HeroUI single-select value into the controlled string value
 * expected by feature filter hooks, preserving each caller's fallback.
 */
export function coerceLabeledSelectValue(value: unknown, fallbackValue: string): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value;
  }

  return fallbackValue;
}

/**
 * Coerces HeroUI multiple-select values into stable strings so legacy numeric
 * option ids do not leak number values into feature filter state.
 */
export function coerceLabeledSelectValues(value: unknown): readonly string[] {
  const values = Array.isArray(value) ? value : [value ?? ''];

  return values.map(String);
}
