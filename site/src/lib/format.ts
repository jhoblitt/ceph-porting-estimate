// How the report prints numbers. The estimate is rough, so money, tokens and
// percentages carry two significant figures; a count of lines, which is
// exact, carries three, and so do parameters in the assumptions panel
// (`paramValue`). The exact forms, and `decimal` for a parameter as the data
// gives it, are for a title, a tooltip or a factor chain that must multiply
// out. Every function returns a dash rather than "NaN" or "Infinity".

const MINUS = '−';
const DASH = '—';
/** Below this magnitude a short form says "<0.01" rather than spelling out zeros. */
const TINY = 0.01;

const rough = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
const twoSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });
const threeSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
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

/** 1.2k, 24M, 930B, 1.1T: rounded first, so 995 becomes 1k rather than 1000. */
function short(abs: number): string {
  return rough.format(abs).replace('K', 'k');
}

/** 1.23k, 2.07M: as `short`, to three significant figures. */
function short3(abs: number): string {
  return compact.format(abs).replace('K', 'k');
}

/** Under a dollar, cents as money is written ($0.50); otherwise two significant figures. */
function dollars(abs: number): string {
  const toCents = Math.round(abs * 100) / 100;
  return toCents < 1 ? cents.format(toCents) : short(abs < 1 ? toCents : abs);
}

/** US dollars to two significant figures: $0.50, $690, $18k, $270k, $2.2M. */
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

/** A token count to two significant figures: 24M, 740M, 930B, 1.1T. */
export function tokens(n: number): string {
  return signed(n, short);
}

/** A count such as lines of code, to three significant figures: 2.07M. */
export function count(n: number): string {
  return signed(n, short3);
}

/** A count in full, rounded to a whole number: 2,070,979. */
export function countExact(n: number): string {
  if (!Number.isFinite(n)) return DASH;
  const rounded = Math.round(Math.abs(n));
  if (rounded === 0) return '0';
  return `${n < 0 ? MINUS : ''}${whole.format(rounded)}`;
}

/** A fraction as a percentage to two significant figures: 0.533 → 53%, 0.0728 → 7.3%. */
export function percent(x: number): string {
  // Scale first so "tiny" means below 0.01%.
  return signed(x * 100, (abs) => twoSignificant.format(abs), '', '%');
}

/** A factor: 1.25×, 435×, 7.21k×. */
export function multiplier(x: number): string {
  return signed(x, short3, '', '×');
}

/** How many times, for prose ("about 16 times"), to two significant figures: 16, 1.5, 1,200. */
export function times(x: number): string {
  if (!Number.isFinite(x)) return DASH;
  return `${x < 0 ? MINUS : ''}${twoSignificant.format(Math.abs(x))}`;
}

const sixSignificant = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });

function plain(n: number, fmt: Intl.NumberFormat): string {
  if (!Number.isFinite(n)) return DASH;
  if (n === 0) return '0';
  return `${n < 0 ? MINUS : ''}${fmt.format(Math.abs(n))}`;
}

/** A param value as the data gives it, to six significant figures: 10.939, 1,248.91, 0.007776. */
export function decimal(n: number): string {
  return plain(n, sixSignificant);
}

/** A param value in the assumptions panel and the prose around it, to three significant figures: 10.9, 1,250, 0.00778. */
export function paramValue(n: number): string {
  return plain(n, threeSignificant);
}

const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

/**
 * A dollar figure as an order of magnitude in words, for "read this as …":
 * 272,724 → "a few hundred thousand dollars", 45,000 → "tens of thousands
 * of dollars", 1,200,000 → "about a million dollars". It reads the figure
 * as `usd` prints it, rounded to two significant figures, so the words
 * never contradict the figure beside them. Zero, negative and figures
 * beyond the trillions fall back to `usd`.
 */
export function magnitude(value: number): string {
  if (!Number.isFinite(value)) return DASH;
  const n = Number(value.toPrecision(2));
  if (n <= 0) return usd(n);
  if (n < 1) return 'less than a dollar';
  let e = Math.floor(Math.log10(n));
  if (10 ** (e + 1) <= n) e += 1;
  const scale = SCALES[Math.floor(e / 3)];
  if (scale === undefined) return usd(n);
  const place = e % 3;
  const of = scale === '' ? '' : ` ${scale}`;
  if (n / 10 ** e < 1.5) {
    const unit = ['a', 'ten', 'a hundred'][place];
    return `about ${unit}${of} ${scale === '' && place === 0 ? 'dollar' : 'dollars'}`;
  }
  if (place === 0) return `a few${of} dollars`;
  if (place === 1) return scale === '' ? 'tens of dollars' : `tens of ${scale}s of dollars`;
  return `a few hundred${of} dollars`;
}

const conjunction = new Intl.ListFormat('en-US', { type: 'conjunction', style: 'long' });

/** Names joined as prose with a serial comma, which keeps "Tests and QA" in one piece: "A, B, and C". */
export function list(items: string[]): string {
  return conjunction.format(items);
}
