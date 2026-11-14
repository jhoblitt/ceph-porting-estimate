// Scenario roles (assumptions.yaml `role`: low, central, high, reference).
// report.ts does not type the key yet; this reads it narrowly so the prose
// can be written for any number of scenarios by role rather than by id.

import type { Report, Scenario } from '../report';

export const ROLES = ['low', 'central', 'high', 'reference'] as const;
export type Role = (typeof ROLES)[number];

export function roleOf(scenario: Scenario): Role | undefined {
  const role = (scenario as { role?: unknown }).role;
  return typeof role === 'string' && (ROLES as readonly string[]).includes(role) ? (role as Role) : undefined;
}

/** The id of the scenario with this role, or undefined when the report has none. */
export function scenarioWithRole(report: Report, role: Role): string | undefined {
  return Object.entries(report.assumptions.scenarios).find(([, s]) => roleOf(s) === role)?.[0];
}
