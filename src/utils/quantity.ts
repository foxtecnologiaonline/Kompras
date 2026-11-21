const MAX_DECIMALS = 3;
const MAX_INTEGER_DIGITS = 4;

/**
 * Keeps what the user types in a quantity field valid as they type: digits and
 * at most one decimal separator (comma or dot, shown as a comma), up to 3
 * decimals — enough for weights ("0,485" kg).
 */
export function sanitizeQuantityInput(text: string): string {
  const cleaned = text.replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const [integer, ...rest] = cleaned.split(',');
  const intPart = integer.slice(0, MAX_INTEGER_DIGITS);
  if (rest.length === 0) return intPart;
  return `${intPart},${rest.join('').slice(0, MAX_DECIMALS)}`;
}

/** The typed quantity as a number, or null when it is empty or not above zero. */
export function parseQuantityInput(text: string): number | null {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}
