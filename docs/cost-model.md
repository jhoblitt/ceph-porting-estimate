# Cost model

How the report turns Ceph's size into tokens and dollars. `data/assumptions.yaml`
holds every parameter named here, `data/calibration.yaml` the measurements they
come from, and `site/src/lib/model.ts` the implementation. This document is the
specification the two must agree with.

## Why this shape

The rgw-go measurement gives four token totals for one port and the size of
what the port produced. Three facts follow, and the model is built on them:

1. Output tokens per token of surviving code is measured and does not depend
   on how much of radosgw rgw-go covers:
   `overhead H = output tokens ÷ tokens of all surviving Go (product + test + tooling)`.
2. The test ratio is measured:
   `T = (test + tooling Go tokens) ÷ product Go tokens`.
3. Input is not proportional to source size. 98% of all tokens are cache
   reads: an agent re-reads its context on every call. Input volume follows
   the number of calls, which output volume tracks. So each input category is
   a measured ratio to output tokens.

The only quantity that needs an assumption about rgw-go's coverage is the
expansion `E`: product Go tokens ÷ the source tokens they replaced.

The calibration is self-consistent in bytes: `E` is computed with the same
bytes-per-token values the model applies to Ceph, so an error in the C++
bytes-per-token value cancels for C++ features. Only the ratios between
languages matter.

## Inputs

Per feature `f` from `report.json`: `langs[lang].bytes`, `scope`, `kind`,
`difficulty`.

| Symbol | Param (YAML snake_case → TS camelCase) | Meaning |
|---|---|---|
| `bpt[lang]` | `bytes_per_token.<lang>`, `bytes_per_token.default` | bytes per token of source |
| `D[c]` | `difficulty.{config,glue,standard,hard,extreme}` | difficulty multiplier |
| `F[t]` | go = 1; rust = `rust_factor`; wasm = `rust_factor × wasm_overhead` | target effort factor |
| `E` | `expansion` | target product-code tokens per source token |
| `T` | `test_ratio` | test tokens per product token in the finished port |
| `H` | `overhead` | output tokens emitted per token of surviving code |
| `u, w, r` | `uncached_per_output`, `cache_write_per_output`, `cache_read_per_output` | input tokens per output token |
| `p` | `source_read_passes` | uncached reads of the source per unit of work, on top of `u`; 0 in the baseline, where the measured ratios already hold all input |
| `M[m]` | `model_efficiency.<model>` | tokens the model needs relative to the calibration model |
| `C` | `clean_break_discount`, applied when toggle `clean_break` is on | discount for keeping no on-disk or wire compatibility |
| `A[cat]` | `adjacent_uplift.{uncached,cache_write,cache_read,output}`, applied when toggle `include_adjacent` is on | adjacent work as a fraction of the port |
| `λ` | `long_cache_write_share` | share of cache writes at the long TTL |
| `σ[cat]` | `long_context_share.{uncached,cache_write,cache_read,output}` | share of each token category that falls in calls over a model's long-context threshold; applied only to models that have long-context prices |
| `B` | `sloc_equivalent_bytes_per_line` | bytes per line of dependency work |

## Formulas

```
S_f      = Σ_lang bytes_f,lang ÷ bpt[lang]                 source tokens; lang `binary` is skipped
class(f) = config if kind = config, else f.difficulty
W_f      = S_f × D[class(f)] × F[target]                   work, in source-token equivalents

R        = Σ S over headline kind=test ÷ Σ S over headline kind=product
T_new    = max(0, T − R)                                   tests still to be written

code_f   = W_f × E
out_f    = code_f × (1 + T_new) × H × M × C                kind = product
out_f    = code_f × H × M × C                              kind = test or config

uncached_f   = out_f × u + W_f × p
cacheWrite_f = out_f × w
cacheRead_f  = out_f × r
with include_adjacent: each of the four categories × (1 + A[category])
```

`R` uses raw source tokens (no difficulty or target weighting) and is
computed once over the headline scope, dependencies excluded.

Scope: `not-ported` features cost zero. `shown` features are computed and
displayed but excluded from every headline total. `headline` features and
dependency work make up the headline.

Dependencies: each dependency whose strategy for the selected target is
`bindings` or `port` becomes a feature under a component `dependencies`, with
`kind = product`, its own `difficulty`, and
`S = sloc_equivalent × B ÷ bpt[cpp]` (`B` is bytes per code line of Ceph's C++, so each line of dependency work carries the comments and blanks real source does). `native` and `drop` cost zero.

## Dollars

For model `m` with prices `P` (USD per million tokens):

```
blend(x, cat) = (1 − s) × P.x + s × P.long_context.x      s = σ[cat] if m has long_context, else 0
cw_price = (1 − λ) × blend(cache_write_short, cache_write) + λ × blend(cache_write_long, cache_write)
usd = ( uncached × blend(input, uncached) + cacheWrite × cw_price
      + cacheRead × blend(cache_read, cache_read) + output × blend(output, output) ) ÷ 1e6
```

Every model is priced on the same token volumes; `M` is the only per-model
volume adjustment. That is the comparison's premise — the same work pattern
on a different price sheet — and the methods page says so.

## Scenario presets

A preset is the baseline `params` with `overrides` (replace a value) and
`scale` (multiply the baseline value). A path may appear in one or the
other, never both. Scaling keeps a preset correct when the baseline is
re-measured.

- **calibrated** — the baseline. `E`, `T`, `H`, `u`, `w`, `r` from rgw-go;
  `D = {config 0.1, glue 0.5, standard 1, hard 1.5, extreme 2}`;
  `rust_factor 1.15`; `wasm_overhead 1.25`; `M = 1`; toggles off.
- **naive** — one pass over the source: `T = 0`, `H = 1`, `u = w = r = 0`,
  `p = 1`, every `D = 1` (config included), `rust_factor = wasm_overhead = 1`.
  Then `out = S × E` and `uncached = S`: every headline file is read once
  and rewritten once.
- **pessimistic** — calibrated with `D.hard = 2`, `D.extreme = 3`,
  `overhead` scaled by 1.25, `include_adjacent` on.

## Identity the implementation must satisfy

With the calibrated preset, target Go, `M = 1`, toggles off, one
`kind = product`, `difficulty = standard` feature holding
`S = (RGW source tokens) × coverage` and no test features (so `R = 0`):
`out` equals the measured 45.01M output tokens, and cache read, cache write
and uncached equal 56,213.6M, 1,137.2M and 0.35M, each within 1%.

## YAML shapes

Every number that is an assumption or a measurement is a quantity:

```yaml
{ value: <number>, measured: <bool>, source: <URL | file | "assumption">, reason: <one line> }
```

```yaml
# assumptions.yaml
ceph: { repo: ceph/ceph, rev: <40-hex sha> }
bytes_per_token: { default: <quantity>, <lang>: <quantity>, ... }
params:
  expansion: <quantity>
  test_ratio: <quantity>
  overhead: <quantity>
  uncached_per_output: <quantity>
  cache_write_per_output: <quantity>
  cache_read_per_output: <quantity>
  source_read_passes: <quantity>
  difficulty: { config: <quantity>, glue: ..., standard: ..., hard: ..., extreme: ... }
  rust_factor: <quantity>
  wasm_overhead: <quantity>
  clean_break_discount: <quantity>
  long_cache_write_share: <quantity>
  long_context_share: { uncached: <quantity>, cache_write: ..., cache_read: ..., output: ... }
  model_efficiency: { <model id>: <quantity>, ... }   # one per model in models.yaml
  sloc_equivalent_bytes_per_line: <quantity>
  adjacent_uplift: { uncached: <quantity>, cache_write: ..., cache_read: ..., output: ... }
toggles: { include_adjacent: false, clean_break: false }
scenarios:
  <id>:                       # naive | calibrated | pessimistic
    label: <string>
    description: <one or two lines>
    overrides: { <dotted param path>: <number> }      # replaces the baseline, e.g. difficulty.hard: 2
    scale: { <dotted param path>: <factor> }          # multiplies the baseline, e.g. overhead: 1.25
    toggles: { <toggle>: <bool> }
default_scenario: calibrated

# models.yaml
models:
  - id: <model id>                                     # e.g. opus-5-5
    name, vendor, source (URL), read_on (YYYY-MM-DD)
    usd_per_mtok: { input, cache_write_short, cache_write_long, cache_read, output }
    cache_write_ttl: { short: "5m", long: "1h" }       # labels shown in the UI
    long_context: null | { threshold_tokens, input, cache_write_short, cache_write_long, cache_read, output }
```

`calibration.yaml` is free-form: the measurement table, the sizes measured
from git, and each derived ratio with its arithmetic in a comment.
