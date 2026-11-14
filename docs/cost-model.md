# Cost model

How the report turns Ceph's size into tokens and dollars. `data/assumptions.yaml`
holds every parameter named here, `data/calibration.yaml` the measurements they
come from, and `site/src/lib/model.ts` the implementation. This document is the
specification the two must agree with.

## Why this shape

The rgw-go measurement gives four token totals for one port and the size of
what the port produced. The model rests on two measured facts and one
modelling choice:

1. Output tokens per token of surviving code is measured and does not depend
   on how much of radosgw rgw-go covers:
   `overhead H = output tokens ÷ tokens of all surviving Go (product + test + tooling)`.
2. The test ratio is measured:
   `T = (test + tooling Go tokens) ÷ product Go tokens`.
3. The choice: input volume is taken as proportional to output volume, at
   rgw-go's whole-project ratios. Input is not proportional to source size:
   98% of all tokens are cache reads, because an agent re-reads its context
   on every call, so input follows the number of calls. That it follows
   output at a fixed ratio is assumed, not shown: one aggregate cannot show
   proportionality, and rgw-go's own phases differ (cache reads per output
   token 1,081 in phase 1, 1,443 in phase 2). The optimistic and pessimistic
   presets take those two phases' ratios.

The only quantity that needs an assumption about rgw-go's coverage is the
expansion `E`: product Go tokens ÷ the source tokens they replaced. `E`,
`T` and `H` multiply to one calibrated number, output tokens per source
token ported, so every figure is inversely proportional to coverage.

The calibration is computed in bytes with the same bytes-per-token values
the model applies to Ceph. The Go value cancels entirely (`E ∝ 1 ÷ go`,
`H ∝ go`), and an error in the C++ value cancels for C++ features (`E ∝ cpp`,
their tokens `∝ 1 ÷ cpp`), each only if `E` and `H` are recomputed with the
value; `cephest check` fails until they are. The ratios between C++ and the
other languages move the estimate directly.

## Inputs

Per feature `f` from `report.json`: `langs[lang].bytes`, `scope`, `kind`,
`difficulty`.

| Symbol | Param (YAML snake_case → TS camelCase) | Meaning |
|---|---|---|
| `bpt[lang]` | `bytes_per_token.<lang>`, `bytes_per_token.default` | bytes per token of source |
| `D[c]` | `difficulty.{config,glue,standard,hard,extreme}` | difficulty multiplier, normalised to average 1 over what rgw-go ported (see "Difficulty normalisation") |
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
| `σ[cat]` | `long_context_share.{uncached,cache_write,cache_read,output}` | share of each token category that falls in calls over a model's long-context threshold; applied only to models that have long-context prices; 0 in the baseline |
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

## Difficulty normalisation

The difficulty classes are judged relative to each other: config 0.1,
glue 0.5, standard 1, hard 1.5, extreme 2. What rgw-go ported is not all
one class: mapped onto the taxonomy, about 64% of its ported bytes are in
standard features and 35% in hard ones (almost all of it the RADOS store,
the bucket index and the RGW object class), so the relative scale averages 1.1694 over it. Used
as written, the scale would make the model predict 17% more work for
rgw-go than rgw-go measured. Each `D[c]` is therefore the relative value
divided by that mean, so that the model applied to the source rgw-go
ported reproduces rgw-go's measured cost:
`D = {config 0.0855, glue 0.4276, standard 0.8551, hard 1.2827, extreme 1.7103}`.

`calibration.yaml` `ported_mix` records the mapping (a judgement, not a
measurement), the shares, the relative scale and the mean. `cephest check`
fails unless each `D[c]` is its relative value over the mean and
`Σ share[c] × D[c] = 1` over the mix (within 0.5%). To re-rate a class,
change its relative value there and divide again.

## Scenario presets

A preset is the baseline `params` with `overrides` (replace a value), then
`scale` (multiply the baseline value), then its toggles. A path may appear
in one map or the other, never both. Scaling keeps a preset correct when
the baseline is re-measured.

Each preset has a `role` — `low`, `central`, `high` or `reference` — that
says what it stands for: exactly one is `central`, and it is the default;
there is at most one of each other role. The file lists them in the order
the report presents them:

- **optimistic** (`low`) — every feature costs what rgw-go's first
  implementation phase did per line: `overhead`, `cache_read_per_output` and
  `cache_write_per_output` scaled by phase 1's ratio over all phases'
  (0.8710, 0.8652, 0.7291; `calibration.yaml` `phases`); hard and extreme
  code nearer to standard (`D.hard` × 0.8333 and `D.extreme` × 0.75, relative
  1.25 and 1.5); coverage at the top of its range (`E` = 1.2133 at 0.40).
- **calibrated** (`central`) — the baseline. `E`, `T`, `H`, `u`, `w`, `r`
  from rgw-go; `D` as normalised above; `rust_factor 1.15`;
  `wasm_overhead 1.25`; `M = 1`; `σ = 0`; toggles off.
- **pessimistic** (`high`) — every feature costs what rgw-go's latest phase
  does per line: the same three parameters scaled by phase 2's ratio over
  all phases' (1.1971, 1.1555, 1.2691); `D.hard` × 1.3333 and `D.extreme`
  × 1.5 (relative 2 and 3); `wasm_overhead` × 1.2; coverage at the low end
  (`E` = 1.6178 at 0.30); `σ` at rgw-go's measured shares; `include_adjacent`
  on.
- **naive** (`reference`) — a reference point, not an outcome: one pass over
  the source, `T = 0`, `H = 1`, `u = w = r = 0`, `p = 1`, every `D = 1`
  (config included), `rust_factor = wasm_overhead = 1`. Then `out = S × E`
  and `uncached = S`: every headline file is read once and rewritten once.

The phase-derived scales are checked: `calibration.yaml`
`phases.scenario_phase` names the phase each preset takes, and
`cephest check` recomputes the three ratios from the phase table.

### Long-context shares

`σ` is 0 in the baseline. An agent run against a price sheet that surcharges
long prompts would be configured to stay under the threshold; rgw-go's
shares (0.550, 0.748, 0.797, 0.699 of uncached, cache-write, cache-read and
output tokens in calls above 272K) were measured on a harness with a
one-million-token window and no surcharge, and are the pessimistic preset's
upper case. Either way the token volumes are held fixed, which a different
prompt size would not do. Only models with long-context prices (GPT-6
Astra) are affected.

## Identity the implementation must satisfy

With the calibrated preset, target Go, `M = 1`, toggles off, one
`kind = product` feature whose difficulty multiplier is 1 — the average of
`D` over `ported_mix`, which is what rgw-go ported — holding
`S = (RGW source tokens) × coverage` and no test features (so `R = 0`):
`out` equals the measured 45.01M output tokens, and cache read, cache write
and uncached equal 56,213.6M, 1,137.2M and 0.35M, each within 1%.

This is a consistency check, not a validation: it holds for any coverage
and any bytes-per-token values, because the parameters are derived from the
same measurement it reproduces. There is no second port to test the model
against.

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
scenarios:                    # in presentation order; any ids, calibrated required
  <id>:                       # optimistic | calibrated | pessimistic | naive
    label: <string>
    role: low | central | high | reference
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

`calibration.yaml` is free-form for display: the measurement table, the
sizes measured from git, and each derived ratio with its arithmetic in a
comment. The rule is that every number in `assumptions.yaml` that is a copy
or a function of `calibration.yaml`, and every derived figure
`calibration.yaml` records, is recomputed by `cephest check`, which fails,
naming the key and both values, when they differ by more than 0.1%:

| Checked | Recomputed from `calibration.yaml` |
|---|---|
| `params.expansion` | `sizes.rgw_go.product_go.bytes ÷ bpt[go]` ÷ (`sizes.source.by_language` in tokens × `coverage.value`) |
| `params.test_ratio` | (`test_go` + `tooling_go`) ÷ `product_go`, in tokens |
| `params.overhead` | `measurement.port.output` ÷ all three, in tokens |
| `params.{uncached,cache_write,cache_read}_per_output` | `measurement.port` category ÷ output |
| `params.long_cache_write_share` | `measurement_detail.cache_write_ttl_tokens` `long_1h ÷ total` |
| `params.adjacent_uplift.*` | Σ `measurement.adjacent` category (null as 0) ÷ port category |
| `params.difficulty.*` | `ported_mix.relative_difficulty` ÷ `ported_mix.mean_relative_difficulty`; the mean against its shares; `Σ share × D = 1` and the shares' sum (0.5%) |
| scale `overhead`, `cache_read_per_output`, `cache_write_per_output` of each preset in `phases.scenario_phase` | that phase's ratio over all phases' in `phases.rows` (rows in phase order, each row's Go bytes at its end) |
| `overrides.expansion` of each preset in `coverage.scenario_end` | the expansion at that coverage end (`low`, `value` or `high`) |
| `overrides.long_context_share.*` of each preset in `measurement_detail.prompt_size_tokens.long_context_scenarios` | `share_over_threshold`, all four |
| `calibration.yaml` `derived.*`, `phases.derived.*`, `sizes.source.tokens`, `measurement_detail.cache_write_ttl_tokens.long_share` | the same arithmetic from their sources |
| `ported_mix.share_by_difficulty`, `coverage.byte_classification.ported_bytes` | bytes by class in `ported_mix.features` ÷ all; their sum |
| `coverage.byte_classification.ported_share_bytes`, `coverage.value` | ported bytes ÷ `sizes.source.by_language` bytes; `coverage.value` is that share |

A preset that scales a harness parameter, overrides `expansion` or overrides
a long-context share must be named in the matching mapping, so deleting a
mapping entry fails the check rather than switching it off. A divisor that
is zero or negative — a phase that added no Go, a coverage of 0 — is an
error naming the operand, and so is a `scale` on a parameter whose baseline
is 0 (it would stay 0; use `overrides`). `measurement.model_id` must name a
model in `models.yaml`. A missing key is an error naming the key.
