// What each target language's figure stands on, in the reader's words, with
// its factor read from the params in effect. Go is the language the measured
// port was written in; Rust and WASM are factors on it that nothing measured.

import { paramValue } from './format';
import type { Params } from './model';
import { TARGET_LABELS, type Target } from './report';

export interface TargetText {
  name: string;
  /** How the figure is reached from another target's, e.g. "Rust × 1.25, illustrative"; none for Go. */
  basis?: string;
  /** What the figure leaves out or rests on, for a note beside it. */
  note?: string;
  /** Drawn behind the others: a figure for an attempt, not for a defined deliverable. */
  secondary: boolean;
}

export function targetText(target: Target, params: Params): TargetText {
  const name = TARGET_LABELS[target];
  switch (target) {
    case 'go':
      return { name, secondary: false };
    case 'rust': {
      const f = paramValue(params.rustFactor);
      return {
        name,
        basis: `Go × ${f}, assumed`,
        note:
          `Each Ceph feature costs its Go figure × ${f}; dependency work is costed for each target on its own, ` +
          'by how that target gets the library. The factor is an assumption: no Rust port was measured.',
        secondary: false,
      };
    }
    case 'wasm': {
      const f = paramValue(params.wasmOverhead);
      return {
        name,
        basis: `Rust × ${f}, illustrative`,
        note:
          `A Rust port built for WASI where it can be: each Ceph feature costs its Rust figure × ${f}, an assumption, ` +
          'and dependency work is costed for each target on its own, by how that target gets the library. ' +
          'WASI has no parallel threads, block devices, process execution or kernel interfaces, so the parts of Ceph ' +
          'that need them have no WASI form, and the host-side code that would stand in for them is not costed. ' +
          'Read this as the price of the attempt, not of a working system.',
        secondary: true,
      };
    }
  }
}
