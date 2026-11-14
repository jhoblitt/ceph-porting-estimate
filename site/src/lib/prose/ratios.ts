// Every ratio calibration.yaml records, recomputed here from its operands,
// beside the value the estimate uses. The Calibration page is where a reader
// sees each division with its numbers; `cephest check` holds the data to the
// same arithmetic.

import { countExact, decimal } from '../format';
import type { Report } from '../report';
import type { Calibration } from './calibration';
import { phaseTable } from './phases';

export interface Ratio {
  symbol: string;
  name: string;
  /** The division with its operands, as text. */
  arithmetic: string;
  /** Computed here from the operands. */
  value: number;
  /** The value the estimate uses (a parameter or a scenario's override or scale), when it uses one. */
  used: number | null;
  /** A count of tokens, printed whole as the rest of the page prints it. */
  count?: boolean;
}

const CATS = [
  ['uncached', 'u', 'Uncached input per output token', 'uncached_per_output'],
  ['cache_write', 'w', 'Cache write per output token', 'cache_write_per_output'],
  ['cache_read', 'r', 'Cache read per output token', 'cache_read_per_output'],
] as const;

const ADJ = ['uncached', 'cache_write', 'cache_read', 'output'] as const;

const m = (v: number) => `${decimal(v)}M`;
const n = countExact;

function bpt(report: Report, lang: string): number {
  const t = report.assumptions.bytes_per_token;
  return (Object.hasOwn(t, lang) ? t[lang] : t.default)?.value ?? Number.NaN;
}

export function calibrationRatios(report: Report, c: Calibration): Ratio[] {
  const p = report.assumptions.params;
  const scenarios = report.assumptions.scenarios;
  const port = c.measurement.port;
  const go = bpt(report, 'go');
  const s = c.sizes.rgw_go;
  const product = s.product_go.bytes / go;
  const testTooling = (s.test_go.bytes + s.tooling_go.bytes) / go;
  const surviving = product + testTooling;
  const sourceTokens = Object.values(c.sizes.source.by_language)
    .flatMap((part) => Object.entries(part))
    .reduce((t, [lang, bytes]) => t + bytes / bpt(report, lang), 0);
  const expansionAt = (coverage: number) => product / (sourceTokens * coverage);
  const out: Ratio[] = [];

  for (const [cat, symbol, name, param] of CATS) {
    out.push({ symbol, name, arithmetic: `${m(port[cat])} ÷ ${m(port.output)}`, value: port[cat] / port.output, used: p[param].value });
  }
  out.push({
    symbol: 'T',
    name: 'Test and tooling Go per product Go',
    arithmetic: `(${n(s.test_go.bytes)} + ${n(s.tooling_go.bytes)}) ÷ ${n(s.product_go.bytes)} bytes`,
    value: testTooling / product,
    used: p.test_ratio.value,
  });
  out.push({
    symbol: 'H',
    name: 'Output per token of surviving Go',
    arithmetic: `${m(port.output)} ÷ ${n(surviving)} tokens (product + test + tooling Go bytes ÷ ${decimal(go)})`,
    value: (port.output * 1e6) / surviving,
    used: p.overhead.value,
  });
  out.push({
    symbol: 'S',
    name: 'Source tokens rgw-go ported from',
    arithmetic: `Σ bytes ÷ bytes per token, by language, over ${n(c.sizes.source.total.bytes)} bytes`,
    value: sourceTokens,
    used: null,
    count: true,
  });
  const ported = c.coverage.byte_classification;
  if (ported) {
    out.push({
      symbol: 'coverage',
      name: 'Share of the source ported, by bytes',
      arithmetic: `${n(ported.ported_bytes)} ÷ ${n(c.sizes.source.total.bytes)} bytes`,
      value: ported.ported_bytes / c.sizes.source.total.bytes,
      used: c.coverage.value,
    });
  }
  const end = c.coverage.scenario_end ?? {};
  const scenarioUsing = (which: 'low' | 'value' | 'high') => Object.entries(end).find(([, e]) => e === which)?.[0];
  for (const [which, coverage, label] of [
    ['value', c.coverage.value, 'at the central coverage'],
    ['high', c.coverage.high, 'at the top of the coverage range'],
    ['low', c.coverage.low, 'at the bottom of the coverage range'],
  ] as const) {
    const id = scenarioUsing(which);
    const used = which === 'value' ? p.expansion.value : id ? (scenarios[id]?.overrides?.['expansion'] ?? null) : null;
    out.push({
      symbol: 'E',
      name: `Product Go per source token ported, ${label}`,
      arithmetic: `${n(product)} ÷ (${n(sourceTokens)} × ${decimal(coverage)})`,
      value: expansionAt(coverage),
      used,
    });
  }
  const ttl = c.measurement_detail.cache_write_ttl_tokens;
  out.push({
    symbol: 'λ',
    name: 'Share of cache writes at the longer lifetime',
    arithmetic: `${n(ttl.long_1h)} ÷ ${n(ttl.total)} tokens`,
    value: ttl.long_1h / ttl.total,
    used: p.long_cache_write_share.value,
  });
  for (const cat of ADJ) {
    const sum = c.measurement.adjacent.reduce((t, row) => t + (row[cat] ?? 0), 0);
    out.push({
      symbol: `A[${cat}]`,
      name: `Work around the port per unit of port work, ${cat.replaceAll('_', ' ')}`,
      arithmetic: `${m(sum)} ÷ ${m(port[cat])}`,
      value: sum / port[cat],
      used: p.adjacent_uplift[cat].value,
    });
  }

  const mix = c.ported_mix;
  if (mix) {
    const total = mix.features.reduce((t, f) => t + f.bytes, 0);
    const mean = mix.features.reduce((t, f) => t + (f.bytes / total) * (mix.relative_difficulty[f.difficulty] ?? Number.NaN), 0);
    out.push({
      symbol: 'mean',
      name: 'Relative difficulty averaged over what rgw-go ported',
      arithmetic: `Σ share of ${n(total)} ported bytes × relative class`,
      value: mean,
      used: null,
    });
    for (const [cls, rel] of Object.entries(mix.relative_difficulty)) {
      const q = (p.difficulty as Record<string, { value: number }>)[cls];
      out.push({ symbol: `D[${cls}]`, name: `Difficulty multiplier, ${cls}`, arithmetic: `${decimal(rel)} ÷ ${decimal(mean)}`, value: rel / mean, used: q?.value ?? null });
    }
  }

  const table = phaseTable(c, go);
  const all = table.find((r) => r.phase === 'all');
  for (const [id, phase] of Object.entries(c.phases?.scenario_phase ?? {})) {
    const row = table.find((r) => r.phase === phase);
    const scale = scenarios[id]?.scale ?? {};
    if (!row || !all || row.outputPerGoToken === null || all.outputPerGoToken === null) continue;
    const label = scenarios[id]?.label ?? id;
    out.push(
      {
        symbol: `${label}: H`,
        name: `Overhead scale, phase ${phase} over all phases`,
        arithmetic: `${decimal(row.outputPerGoToken)} ÷ ${decimal(all.outputPerGoToken)} output per Go token`,
        value: row.outputPerGoToken / all.outputPerGoToken,
        used: scale['overhead'] ?? null,
      },
      {
        symbol: `${label}: r`,
        name: `Cache-read scale, phase ${phase} over all phases`,
        arithmetic: `${decimal(row.cacheReadPerOutput)} ÷ ${decimal(all.cacheReadPerOutput)} per output token`,
        value: row.cacheReadPerOutput / all.cacheReadPerOutput,
        used: scale['cache_read_per_output'] ?? null,
      },
      {
        symbol: `${label}: w`,
        name: `Cache-write scale, phase ${phase} over all phases`,
        arithmetic: `${decimal(row.cacheWritePerOutput)} ÷ ${decimal(all.cacheWritePerOutput)} per output token`,
        value: row.cacheWritePerOutput / all.cacheWritePerOutput,
        used: scale['cache_write_per_output'] ?? null,
      },
    );
  }
  return out;
}
