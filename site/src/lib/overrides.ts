// The reader's overrides in canonical form: every value is the one the model
// uses (clamped as resolveParams clamps it), and none repeats the scenario's
// own value. So "N assumptions changed" counts only real changes, a value
// typed out of range shows as the model applies it, and a scenario switch
// sheds overrides the new scenario already sets.

import { clampParam, describeParams } from './model';
import type { Report, ToggleId } from './report';

const TOGGLE_PREFIX = 'toggles.';

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** The overrides with `key` set to `value`, clamped, or removed when that is the scenario's own value. */
export function withOverride(
  overrides: Record<string, number>,
  key: string,
  value: number,
  scenarioValue: number,
): Record<string, number> {
  const v = clampParam(key, value);
  if (close(v, scenarioValue)) return withoutOverride(overrides, key);
  return { ...overrides, [key]: v };
}

export function withoutOverride(overrides: Record<string, number>, key: string): Record<string, number> {
  return Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== key));
}

/**
 * Overrides already checked for known keys and finite values, made
 * canonical for a scenario: params clamped, and anything equal to the
 * scenario's value (a param, or a toggle as 0 or 1) dropped.
 */
export function canonicalOverrides(
  report: Report,
  scenarioId: string,
  overrides: Record<string, number>,
): Record<string, number> {
  const scenarioValues = new Map(describeParams(report, scenarioId).map((p) => [p.path, p.scenario]));
  const scenarioToggles = { ...report.assumptions.toggles, ...report.assumptions.scenarios[scenarioId]?.toggles };
  let out: Record<string, number> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith(TOGGLE_PREFIX)) {
      const id = key.slice(TOGGLE_PREFIX.length) as ToggleId;
      if ((value > 0) !== scenarioToggles[id]) out[key] = value;
      continue;
    }
    const scenario = scenarioValues.get(key);
    if (scenario !== undefined) out = withOverride(out, key, value, scenario);
  }
  return out;
}
