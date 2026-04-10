/**
 * Convert a decimal amount string to minor units string.
 * e.g. toMinor("45.50", 2) → "4550"
 *
 * All inputs and outputs are strings — no JS number conversion.
 */
export function toMinor(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;

  const dotIndex = abs.indexOf('.');
  let intPart: string;
  let fracPart: string;

  if (dotIndex === -1) {
    intPart = abs;
    fracPart = '';
  } else {
    intPart = abs.slice(0, dotIndex);
    fracPart = abs.slice(dotIndex + 1);
  }

  if (fracPart.length < decimals) {
    fracPart = fracPart.padEnd(decimals, '0');
  } else if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  }

  const combined = intPart + fracPart;
  const stripped = combined.replace(/^0+/, '') || '0';

  return negative && stripped !== '0' ? `-${stripped}` : stripped;
}

/**
 * Convert minor units string to a formatted decimal string.
 * e.g. formatMinor("4550", 2) → "45.50"
 *
 * All inputs and outputs are strings — no JS number conversion.
 */
export function formatMinor(minor: string, decimals: number): string {
  const trimmed = minor.trim();
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;

  if (decimals === 0) {
    return negative && abs !== '0' ? `-${abs}` : abs;
  }

  const padded = abs.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);

  const result = `${intPart}.${fracPart}`;
  return negative && result !== `${'0'.padStart(1, '0')}.${'0'.repeat(decimals)}`
    ? `-${result}`
    : result;
}

/**
 * Negate a minor units string.
 * e.g. negateMinor("4550") → "-4550", negateMinor("-4550") → "4550"
 */
export function negateMinor(minor: string): string {
  const trimmed = minor.trim();
  if (trimmed === '0') return '0';
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}
