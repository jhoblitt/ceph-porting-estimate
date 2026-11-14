// rgw-go's phase table (calibration.yaml `phases`) and the checks the
// Methods page builds on it: the back-test (calibrate on an earlier phase,
// predict a later one) and the rates a future observation can be held to.
// Everything is computed from the rows, not copied from `phases.derived`.

import { cardinal } from '../format';
import type { Params, Tokens } from '../model';
import { sumTokens, usdByCategory } from '../model/cost';
import type { Model, Report } from '../report';
import type { Calibration, PhaseRow } from './calibration';
import { scenarioWithRole } from './scenarios';

export interface PhaseFacts {
  phase: number | 'all';
  calls: number;
  /** Tokens, not millions. */
  tokens: Tokens;
  /** Go bytes (product + test) added in the phase; 0 when it added none. */
  goBytesAdded: number;
  /** Output tokens per Go token added, at the Go bytes-per-token value; null when no Go was added. */
  outputPerGoToken: number | null;
  /** Output tokens per Go byte added; null when no Go was added. */
  outputPerGoByte: number | null;
  /** Cache-read tokens per Go byte added; null when no Go was added. */
  cacheReadPerGoByte: number | null;
  cacheReadPerOutput: number;
  cacheWritePerOutput: number;
}

function tokensOf(row: PhaseRow): Tokens {
  return { uncached: row.uncached_tokens, cacheWrite: row.cache_write * 1e6, cacheRead: row.cache_read * 1e6, output: row.output * 1e6 };
}

function facts(phase: number | 'all', calls: number, tokens: Tokens, goBytesAdded: number, bptGo: number): PhaseFacts {
  const perByte = (x: number) => (goBytesAdded > 0 ? x / goBytesAdded : null);
  const outputPerGoByte = perByte(tokens.output);
  return {
    phase,
    calls,
    tokens,
    goBytesAdded,
    outputPerGoToken: outputPerGoByte === null ? null : outputPerGoByte * bptGo,
    outputPerGoByte,
    cacheReadPerGoByte: perByte(tokens.cacheRead),
    cacheReadPerOutput: tokens.cacheRead / tokens.output,
    cacheWritePerOutput: tokens.cacheWrite / tokens.output,
  };
}

/** Each phase in order, then all phases together; the Go added by a phase is its end total less the previous phase's. */
export function phaseTable(c: Calibration, bptGo: number): PhaseFacts[] {
  const rows = [...(c.phases?.rows ?? [])].sort((a, b) => a.phase - b.phase);
  let before = 0;
  const out = rows.map((row) => {
    const atEnd = row.go_bytes.product + row.go_bytes.test;
    const added = atEnd - before;
    before = atEnd;
    return facts(row.phase, row.calls, tokensOf(row), added, bptGo);
  });
  if (out.length === 0) return [];
  const sum = (f: (p: PhaseFacts) => number) => out.reduce((n, p) => n + f(p), 0);
  const tokens: Tokens = {
    uncached: sum((p) => p.tokens.uncached),
    cacheWrite: sum((p) => p.tokens.cacheWrite),
    cacheRead: sum((p) => p.tokens.cacheRead),
    output: sum((p) => p.tokens.output),
  };
  return [...out, facts('all', sum((p) => p.calls), tokens, sum((p) => p.goBytesAdded), bptGo)];
}

/** A phase whose Go the data reads on a day before the day its tokens end. */
export interface EarlyRead {
  phase: number;
  /** Where the Go is read, as the data gives it (`go_bytes_at`). */
  at: string;
  /** When its tokens end, as the data gives it (`ends`). */
  ends: string;
  /** Whole days between the two dates. */
  days: number;
  /** `at` names the commit the size table measures. */
  atSizesCommit: boolean;
}

const DAY = /\d{4}-\d{2}-\d{2}/;
const MS_PER_DAY = 86_400_000;

/**
 * The phases whose Go bytes are read on an earlier day than their tokens'
 * end: the work that produced Go merged in between is in their tokens but
 * that Go is not in their bytes, so their rates per Go byte are, if
 * anything, overstated. A row whose dates cannot be read is left out.
 */
export function goReadEarly(c: Calibration): EarlyRead[] {
  return (c.phases?.rows ?? []).flatMap((row) => {
    const at = row.go_bytes_at.match(DAY)?.[0];
    const ends = row.ends.match(DAY)?.[0];
    if (at === undefined || ends === undefined) return [];
    const days = Math.round((Date.parse(ends) - Date.parse(at)) / MS_PER_DAY);
    if (!(days > 0)) return [];
    return [{ phase: row.phase, at: row.go_bytes_at, ends: row.ends, days, atSizesCommit: row.go_bytes_at.includes(c.project.commit) }];
  });
}

/** What `goReadEarly` found, as the sentences under the phase table; null when every phase's Go is read on the day it ends. */
export function goReadSentence(reads: readonly EarlyRead[]): string | null {
  if (reads.length === 0) return null;
  return reads
    .map((r) => {
      const commit = r.atSizesCommit ? ', the commit the rgw-go size table measures,' : '';
      const later = r.days === 1 ? 'the next day' : `${cardinal(r.days)} days later`;
      const slightly = r.days === 1 ? 'slightly ' : '';
      return (
        `Phase ${r.phase}'s Go is read at ${r.at}${commit} and its tokens run to ${r.ends}, ${later}. ` +
        `The work that produced any Go merged between the two is in phase ${r.phase}'s tokens but that Go is not in its bytes, ` +
        `so phase ${r.phase}'s rates per Go byte are, if anything, ${slightly}overstated.`
      );
    })
    .join(' ');
}

/** The phases the low and high scenarios take their harness scales from (calibration.yaml `phases.scenario_phase`). */
export function scenarioPhases(report: Report, c: Calibration): { early: number; late: number } | null {
  const map = c.phases?.scenario_phase ?? {};
  const low = scenarioWithRole(report, 'low');
  const high = scenarioWithRole(report, 'high');
  const early = low === undefined ? undefined : map[low];
  const late = high === undefined ? undefined : map[high];
  return early === undefined || late === undefined ? null : { early, late };
}

export interface BackTest {
  early: number;
  late: number;
  /** The later phase's tokens predicted from the earlier phase's per-Go-byte rates, and what it used. */
  predicted: Tokens;
  actual: Tokens;
  /** predicted ÷ actual − 1: negative when the earlier phase under-predicts. */
  outputGap: number;
  cacheReadGap: number;
  /** At the measured model's list prices, under the params given. */
  predictedUsd: number;
  actualUsd: number;
  usdGap: number;
  /** The later phase's output per Go byte over the earlier's, less one. */
  outputRateRise: number;
}

/** Calibrate on the earlier phase alone and predict the later one; null when a phase is missing or added no Go. */
export function backTest(table: PhaseFacts[], early: number, late: number, model: Model, params: Params): BackTest | null {
  const a = table.find((p) => p.phase === early);
  const b = table.find((p) => p.phase === late);
  if (!a || !b || a.goBytesAdded <= 0 || b.goBytesAdded <= 0) return null;
  const k = b.goBytesAdded / a.goBytesAdded;
  const predicted: Tokens = {
    uncached: a.tokens.uncached * k,
    cacheWrite: a.tokens.cacheWrite * k,
    cacheRead: a.tokens.cacheRead * k,
    output: a.tokens.output * k,
  };
  const predictedUsd = sumTokens(usdByCategory(model, params, predicted));
  const actualUsd = sumTokens(usdByCategory(model, params, b.tokens));
  return {
    early,
    late,
    predicted,
    actual: b.tokens,
    outputGap: predicted.output / b.tokens.output - 1,
    cacheReadGap: predicted.cacheRead / b.tokens.cacheRead - 1,
    predictedUsd,
    actualUsd,
    usdGap: predictedUsd / actualUsd - 1,
    outputRateRise: (b.outputPerGoByte as number) / (a.outputPerGoByte as number) - 1,
  };
}
