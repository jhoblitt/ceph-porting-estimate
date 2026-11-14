// How the report prints numbers. The estimate is rough, so the short forms
// carry three significant figures; the exact forms are for a title or a
// tooltip. Every function returns a dash rather than "NaN" or "Infinity".

const MINUS = '−';
const DASH = '—';
/** Below this magnitude a short form says "<0.01" rather than spelling out zeros. */
const TINY = 0.01;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
const significant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `fmt(|n|)` with a typographic minus, a dash for non-finite input, and "<0.01" for tiny values. */
function signed(n: number, fmt: (abs: number) => string, prefix = '', suffix = ''): string {
  if (!Number.isFinite(n)) return DASH;
  const abs = Math.abs(n);
  if (abs === 0) return `${prefix}0${suffix}`;
  if (abs < TINY) return `${n < 0 ? `>${MINUS}` : '<'}${prefix}0.01${suffix}`;
  return `${n < 0 ? MINUS : ''}${prefix}${fmt(abs)}${suffix}`;
}

/** 1.23k, 24.4M, 929B, 1.06T: rounded first, so 999.5 becomes 1k rather than 1000. */
function short(abs: number): string {
  return compact.format(abs).replace('K', 'k');
}

/** Under a dollar, cents as money is written ($0.50); otherwise three significant figures. */
function dollars(abs: number): string {
  const toCents = Math.round(abs * 100) / 100;
  return toCents < 1 ? cents.format(toCents) : short(abs < 1 ? toCents : abs);
}

/** US dollars to three significant figures: $0.50, $689, $18.1k, $299k, $2.16M. */
export function usd(n: number): string {
  return signed(n, dollars, '$');
}

/** US dollars in full: whole dollars from $1,000, cents below. */
export function usdExact(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  const abs = Math.abs(n);
  if (abs === 0) return '$0';
  const body = abs >= 1000 ? whole.format(abs) : cents.format(abs);
  return `${n < 0 ? MINUS : ''}$${body}`;
}

/** A token count to three significant figures: 24.4M, 744M, 929B, 1.06T. */
export function tokens(n: number): string {
  return signed(n, short);
}

/** A count such as lines of code, to three significant figures: 2.07M. */
export function count(n: number): string {
  return signed(n, short);
}

/** A count in full, rounded to a whole number: 2,070,979. */
export function countExact(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  const rounded = Math.round(Math.abs(n));
  if (rounded === 0) return '0';
  return `${n < 0 ? MINUS : ''}${whole.format(rounded)}`;
}

/** A fraction as a percentage to three significant figures: 0.533 → 53.3%. */
export function percent(x: number): string {
  // Scale first so "tiny" means below 0.01%.
  return signed(x * 100, (abs) => significant.format(abs), '', '%');
}

/** A factor: 1.25×, 435×, 7.21k×. */
export function multiplier(x: number): string {
  return signed(x, short, '', '×');
}

const sixSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });

/** A param value as the data gives it, to six significant figures: 10.939, 1,248.91, 0.007776. */
export function decimal(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  if (n === 0) return '0';
  return `${n < 0 ? MINUS : ''}${sixSignificant.format(Math.abs(n))}`;
}

const conjunction = new Intl.ListFormat('en-US', { type: 'conjunction', style: 'long' });

/** Names joined as prose with a serial comma, which keeps "Tests and QA" in one piece: "A, B, and C". */
export function list(items: string[]): string {
  return conjunction.format(items);
}
