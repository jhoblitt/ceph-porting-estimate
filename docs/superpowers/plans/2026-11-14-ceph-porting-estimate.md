# Ceph Porting Estimate Implementation Plan

> **Status: historical.** This is the plan as written before the estimate
> was built and its calibration re-anchored. Where it differs from
> [`docs/cost-model.md`](../../cost-model.md), the data under `data/` or the
> published pages, those are authoritative. The largest differences:
>
> - Four scenarios with roles (optimistic, calibrated, pessimistic,
>   naive), not three; the optimistic and pessimistic ones take rgw-go's
>   phase rates and the ends of the coverage range.
> - Four models, not three: Kimi K3 was added.
> - Coverage is this project's classification of the ported source by
>   bytes, with a narrower range than planned, and the difficulty scale is
>   normalised over what rgw-go ported rather than used as written.
> - `assumptions.yaml` holds the cost model's parameters as quantities
>   under `params`, with scenarios that override or scale them, not the
>   per-target shape sketched here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an interactive GitHub Pages report estimating the tokens and
dollars needed to port ceph/ceph to Go, Rust and WASM with three models.

**Architecture:** A Go CLI (`cephest`) counts SLOC per file from a local ceph
checkout into a committed JSON file, validates the hand-edited YAML sources,
and rolls both up into one `report.json`. A Vite + Svelte + TypeScript site
loads `report.json` and runs the cost model in the browser. semantic-release
tags each merge to `main`; the tag deploys to Pages.

**Tech Stack:** Go (per `go-conventions`), YAML, Vite, Svelte 5, TypeScript,
D3 (`d3-hierarchy`, `d3-scale`), Vitest, Playwright, GitHub Actions,
semantic-release.

**Spec:** `docs/superpowers/specs/2026-11-13-ceph-porting-estimate-design.md`

This plan follows the owner's rule that plans carry behaviour and seams, not
code. Code blocks are sketches; behaviour, seams and values bind.

## Global Constraints

- Ceph snapshot: `ec322a5e95ebcb46dec7d6a9d7813a34543c64ad` (`main`), read
  from `<ceph clone>` through git objects, never the working
  tree (it is dirty). Never write to that clone.
- Do not read `<rgw-go clone>/tokens.md`.
- Repository `jhoblitt/ceph-porting-estimate`, public. Pages base path
  `/ceph-porting-estimate/`.
- Any Go work: load `go-conventions:go-conventions` first. Any workflow,
  commit, PR or repo-config work: load `github-conventions:github-conventions`
  first. Their rules bind over this plan's sketches.
- Shell is thin glue; logic lives in Go (tooling) or TypeScript (site).
- No derived tokens or dollars are committed. `report.json` is gitignored.
- Every price and every multiplier in YAML carries `source` (URL or
  "assumption") and, for assumptions, a `reason`. Prices carry `read_on`.
- Conventional commits; `docs` and `refactor` cut patch releases.
- Scratch goes in `$TMPDIR`. Subagents: at most 4 in flight, `model: opus`.
- Each task lands as its own PR, merged once CI is green, except Task 1's
  first commit, which seeds `main`.

## Review Focus

1. A file matched by two features' globs — it must land in exactly one (the
   most specific glob), and `cephest check` must report ties as errors
   (Task 3).
2. A file matched by no glob — it lands in its component's `other` feature
   and totals still equal the per-file sum (Task 3).
3. Binary, generated or lockfile content (`package-lock.json`, `.pkl`,
   `.png`, minified JS) inflating SLOC — excluded or classed `not-ported`,
   and listed on the methods page (Tasks 2, 4).
4. A slider driven to zero or an extreme — totals stay finite and
   non-negative, and feature rows still sum to the headline (Task 7).
5. A shared URL carrying an unknown target, model or feature path — the page
   falls back to defaults rather than rendering blank (Task 8).

---

## File Structure

```
cmd/cephest/            main; subcommands count, check, rollup
internal/count/         git-object reader, language detection, line classifier
internal/data/          YAML types, loading, validation
internal/rollup/        glob matching, feature roll-up, report.json writer
data/taxonomy.yaml      component → feature tree
data/dependencies.yaml  per-dependency strategy per target
data/models.yaml        prices
data/assumptions.yaml   ratios, multipliers, scenario presets
data/calibration.yaml   rgw-go measurements
data/generated/sloc.json   committed per-file counts
site/                   Vite + Svelte app
site/src/lib/model.ts   the cost model (pure functions)
site/src/lib/state.ts   URL-backed selection state
site/src/content/*.md   methods and calibration prose
.github/workflows/      ci, commitlint, workflow-lint, release, deploy, …
```

---

### Task 1: Repository bootstrap

**Files:** repo root scaffolding, `.github/**`, `go.mod`, `Makefile`,
`.golangci.yml`, `README.md`, `LICENSE`, `.commitlintrc.yml`, `.nvmrc`.

- [ ] Run `go-conventions:go-new-project` for module
  `github.com/jhoblitt/ceph-porting-estimate` with one binary, `cephest`,
  whose subcommands `count`, `check` and `rollup` exist and return
  "not implemented".
- [ ] Run `github-conventions:github-new-repo`: visibility **public**;
  license the same as `jhoblitt/tmelevation`; description "Token and cost
  estimate for porting Ceph to Go, Rust and WASM"; homepage the Pages URL.
  The existing `docs/superpowers/` files go in the seed commit.
- [ ] CI (`ci.yml`, callable via `workflow_call`): Go lint + test, plus
  placeholders the later tasks fill (`data-check`, `site`). Commitlint,
  workflow-lint, dependabot (gomod, npm under `/site`, github-actions) and
  the `main` ruleset per the canon. The ruleset requires the CI checks and a
  PR, with no required approvals (single maintainer), and allows squash
  merge only.
- [ ] Verify: `make check` passes locally (unsandboxed); the first PR's CI is
  green.

**Produces:** a `main` that every later task branches from; `make check`.

### Task 2: `cephest count`

**Files:** `internal/count/*`, `cmd/cephest/count.go`, tests beside them,
`data/generated/sloc.json`.

**Behaviour:**
- `cephest count --repo <path> --rev <sha> --out <file>` lists every blob at
  `<rev>` (`git ls-tree -r`), reads content through `git cat-file --batch`,
  and writes one row per file.
- Language comes from extension, then filename, then shebang. Unknown text
  is `other`; binary content (a NUL byte in the first 8 KiB) is recorded
  with `binary: true` and zero lines.
- Lines are classified code / comment / blank per language comment syntax
  (line and block comments; a line with code and a comment is code). Use
  `github.com/boyter/scc/v3/processor` if its API takes in-memory content
  cleanly; otherwise a small table-driven classifier. Record the choice.
- A gitlink (submodule) is not descended into the superproject listing. For
  each one: if the submodule's git dir under `<repo>/.git/modules/…` has the
  gitlink commit, count it and emit one aggregate per language; otherwise
  emit `available: false`. Never fetch.
- Output is deterministic: rows sorted by path, no timestamps other than the
  ceph commit date.

**Produces — `sloc.json`:**

```
{ "repo": "ceph/ceph", "rev": "<sha>", "commit_date": "<RFC3339>",
  "files": [ {"path","lang","code","comment","blank","bytes","binary"} ],
  "submodules": [ {"path","rev","available",
                   "langs": {"<lang>": {"files","code","comment","blank","bytes"}}} ] }
```

**Tests:** a fixture git repo built in `t.TempDir()` with: a C++ file mixing
block and line comments, a Python file with a docstring and `#` comments, a
shell script with no extension (shebang), a binary file, a file with CRLF
endings, an empty file, and a gitlink whose module is absent. Assert exact
per-file counts and that two runs produce identical bytes.

- [ ] Write tests, watch them fail, implement, pass.
- [ ] Run against ceph at the pinned SHA; commit `sloc.json`.
- [ ] Cross-check: the sum of code+comment+blank over text files equals
  `git grep -I -c ''` at the same SHA within 0.5% (trailing-newline
  conventions differ); record both numbers in the PR description.

### Task 3: Data schema, `cephest check`, `cephest rollup`

**Files:** `internal/data/*`, `internal/rollup/*`, `cmd/cephest/{check,rollup}.go`,
skeleton `data/*.yaml` with one real component (`mon`) to exercise the path.

**Seams — YAML shapes:**

```
taxonomy.yaml
  components:
    - id, name, description
      features:
        - id, name, description
          globs: [doublestar patterns relative to the ceph root]
          scope: headline | shown | not-ported
          kind: product | test | config
          difficulty: config | glue | standard | hard | extreme
dependencies.yaml
  dependencies:
    - id, name, used_for, submodule (path or null)
      targets: { go|rust|wasm: { strategy: native|bindings|port|drop,
                                 package, sloc_equivalent, difficulty, note } }
models.yaml
  models: [ { id, name, vendor, source, read_on,
              usd_per_mtok: { input, cache_write_short, cache_write_long,
                              cache_read, output },
              long_context: { threshold_tokens, input, cache_read, output } | null } ]
assumptions.yaml
  bytes_per_token: { <lang>: n }
  targets: { go|rust|wasm: { expansion, factor } }
  difficulty: { config|glue|standard|hard|extreme: n }
  scenarios: { naive|calibrated|pessimistic: { ...Params } }
calibration.yaml   (free-form measurements + derived ratios; see Task 5)
```

**Behaviour:**
- Matching: a file goes to the feature whose matching glob has the longest
  literal prefix; an equal-length tie between two features is a `check`
  error naming both. A file under a component's root that no feature claims
  goes to that component's implicit `other` feature; a file no component
  claims goes to component `unclassified`.
- `cephest check` fails on: schema violations, unknown enum values, a glob
  matching zero files, glob ties, a dependency naming a submodule path not
  in `sloc.json`, a missing `source`/`reason`, `sloc.json.rev` differing
  from the pinned SHA in `assumptions.yaml`, or `unclassified` exceeding 1%
  of code lines.
- `cephest rollup --out site/src/generated/report.json` writes the tree with
  per-feature, per-language `{files, code, comment, blank, bytes}`, the
  dependency list with submodule sizes, models, assumptions, calibration and
  the ceph rev/date. Per-file rows are not shipped.

**Tests:** table-driven matching (specific-beats-general, tie error,
`other`, `unclassified`); every `check` failure above with a minimal bad
fixture; a roll-up invariant that feature sums equal the `sloc.json` total.

- [ ] Tests first, implement, pass; wire `cephest check` into CI's
  `data-check` job.

### Task 4: The taxonomy (the analysis)

**Files:** `data/taxonomy.yaml`, `data/dependencies.yaml`.

This is the analysis the report exists for. Fan out up to 4 read-only
Explore agents (`model: opus`), one per group, each reading ceph at the
pinned SHA via `git -C <ceph clone> show|ls-tree` and
returning a YAML fragment plus a two-line justification per feature:

1. RADOS core: `osd`, `os` (BlueStore, BlueFS, kstore/memstore), `crimson`,
   `mon`, `mgr` (C++), `msg`, `auth`, `crush`, `erasure-code`, `compressor`,
   `kv`, `blk`, `osdc`, `librados`, `neorados`, `cls`, `messages`.
2. Gateways and filesystems: `rgw` (S3 ops, auth, multisite, lifecycle,
   notifications, IAM/STS, Swift, drivers: rados/posix/dbstore/daos/motr/d4n,
   select, Lua, admin), `mds`, `client`, `libcephfs*`, `librbd` (image,
   journal, mirror, cache, migration, crypto, io), `rbd` tools, `nvmeof`.
3. Python and ops: every `src/pybind/mgr/*` module, `cephadm`,
   `ceph-volume`, `python-common`, `pybind` bindings, `ceph-node-proxy`,
   `exporter`, `tools`, `script`, `monitoring`, the dashboard backend and
   frontend.
4. Common and non-product: `common`, `include`, `global`, `log`, `tracing`,
   `src/test` (split by the component it tests), `qa` (Python tasks, shell
   workunits, suite YAML as `kind: config`), `doc`, packaging, cmake, and
   the dependency inventory (every submodule plus system libraries such as
   boost, OpenSSL, liburing, libfmt, lz4/snappy/zlib, RDMA/DPDK).

**Rules for the fragments:**
- 5–15 features per major component; a feature is something a maintainer
  would name ("PG peering", "scrub", "multisite sync"), not a directory.
- Scope: first-party `src/` and `qa/` are `headline`; the dashboard
  frontend, `monitoring`, `java`, `dokan`, examples are `shown`; `doc`,
  packaging, cmake, lockfiles, generated files, corpora are `not-ported`.
- Difficulty baseline: `standard` is RGW request handling (what rgw-go
  measured). `hard`: consensus, peering/recovery, MDS cache and locking,
  the messenger. `extreme`: BlueStore/BlueFS allocators, Crimson/Seastore.
  `glue`: CLI tools, simple mgr modules. `config`: YAML, JSON, templates.
- Dependencies: prefer `native` where a maintained Go/Rust package exists
  (name it); `bindings` where the library is irreplaceable (SPDK, ISA-L
  where no native EC matches); `port` only when neither works; `drop` for
  things a rewrite would not carry (seastar under Go, googletest, breakpad).
  WASM strategies additionally mark what WASI cannot host (SPDK, DPDK,
  raw block I/O) as `drop` with a note. `sloc_equivalent` for `bindings` is
  an estimate of the binding surface, with its reason.

- [ ] Dispatch the four agents; merge fragments; resolve overlaps.
- [ ] `cephest check` passes with `unclassified` under 1%.
- [ ] Spot-check: for the five largest features, list ten matched paths each
  and confirm they belong.

### Task 5: Prices, assumptions, calibration

**Files:** `data/models.yaml`, `data/assumptions.yaml`, `data/calibration.yaml`.

- [ ] `models.yaml`: the three models with the spec's prices. Re-fetch both
  pricing pages; for GPT-6 Astra, map the columns to their headers before
  writing the two cache-write prices and the long-context row.
- [ ] `calibration.yaml`: copy the spec's "Calibration measurement" table
  verbatim, plus rgw-go sizes measured at `239f789` with
  `git -C <rgw-go clone> ls-tree -r -l 239f789` (bytes of
  product Go under `internal/` + `cmd/` excluding `_test.go`; test Go;
  tooling; Markdown) and the source size of `src/rgw` + RGW object classes
  at ceph `v19.2.7` (bytes and lines).
- [ ] Derive, showing the arithmetic in comments:
  - `cache_read_per_output` = 56,213.6 / 45.01 ≈ 1,249
  - `cache_write_per_output` = 1,137.2 / 45.01 ≈ 25.3
  - `uncached_per_output` = 0.35 / 45.01 ≈ 0.0078
  - `coverage` (share of the RGW source that rgw-go ports): default 0.45,
    range 0.30–0.60, an assumption reasoned from `docs/exclusions.md` and
    the unfinished phases.
  - `output_per_source_token` = 45.01M ÷ (source tokens × coverage).
  - Its displayed decomposition: `expansion` (product Go bytes ÷ covered
    source bytes), `test_ratio` (test Go bytes ÷ product Go bytes), and
    `overhead` as the residual.
- [ ] Scenario presets (`Params`, see Task 7):
  - **naive**: `output_per_source_token` = target expansion; uncached input
    per output = 1 ÷ expansion; cache ratios 0; no test ratio.
  - **calibrated**: the derived values; `include_adjacent: false`;
    difficulty `config 0.1, glue 0.5, standard 1, hard 1.5, extreme 2`.
  - **pessimistic**: calibrated with `hard 2, extreme 3`, overhead × 1.25,
    `include_adjacent: true`.
  - Shared: Go factor 1.0; Rust factor 1.15; WASM factor 1.15 × 1.25;
    `clean_break_discount` 0.6 (off by default); `long_cache_write_share`
    0.5; `astra_long_context_share` 0; `model_efficiency` 1.0 each. Every
    one of these is marked `source: assumption` with a one-line reason, and
    the unmeasured ones are flagged `measured: false`.
- [ ] `cephest check` passes.

### Task 6: Site shell

**Files:** `site/` (Vite, Svelte 5, TypeScript, Vitest), `site/src/lib/state.ts`,
layout, theme, header, footer; `Makefile` targets `site-build`, `site-test`;
CI `site` job.

**Behaviour:**
- `make site-build` runs `cephest rollup` then `vite build` with base
  `/ceph-porting-estimate/`.
- Footer: `v<version>` linking to that release, and a link to the repo. The
  version comes from env `APP_VERSION` at build (`dev` when unset), exposed
  as `__APP_VERSION__`.
- Header: ceph short SHA linking to the commit, and its date.
- `state.ts` keeps `{target, model, scenario, path[], overrides{}}` in the
  URL hash and restores it on load; unknown values fall back to defaults
  (`go`, `opus-5-5`, `calibrated`, root).
- Light/dark by `prefers-color-scheme` with a toggle; single-column under
  720 px. Load `dataviz` before choosing the palette.
- Routes: `#/` report, `#/methods`, `#/calibration`.

**Tests (Vitest):** state round-trips through the hash; malformed and
unknown hashes yield defaults.

### Task 7: Cost model

**Files:** `site/src/lib/model.ts`, `site/src/lib/model.test.ts`.

**Seams:**

```
type Params = { outputPerSourceToken, testRatio, overhead, uncachedPerOutput,
  cacheWritePerOutput, cacheReadPerOutput, difficulty: Record<Class, number>,
  targetFactor: Record<Target, number>, expansion: Record<Target, number>,
  includeAdjacent, cleanBreak, cleanBreakDiscount, longCacheWriteShare,
  astraLongContextShare, modelEfficiency: Record<ModelId, number> }
type Tokens = { uncached, cacheWrite, cacheRead, output }
estimateFeature(feature, target, model, params, report): { sloc, sourceTokens, tokens: Tokens, usd }
estimateTree(report, target, model, params): Node   // same shape, recursive, with children
matrix(report, params): Record<Target, Record<ModelId, { tokens, usd }>>
```

**Behaviour:**
- Source tokens = Σ bytes ÷ `bytes_per_token[lang]`.
- `not-ported` features cost zero. `shown` features are computed but
  excluded from headline totals. `kind: config` uses difficulty `config`.
- `kind: test` features are ported at factor 1 with no test ratio. Product
  features carry new-test cost only for the shortfall:
  `max(0, testRatio − existing test tokens ÷ product tokens)`, computed over
  the headline scope.
- Output = source tokens × difficulty × target factor × output-per-source
  × model efficiency × (clean-break discount if on) × (adjacent uplift if
  on, from calibration). Input categories = output × their ratios.
- Dependencies appear as a component `dependencies`, one feature each, sized
  by the selected target's `sloc_equivalent` (zero for `native`/`drop`).
- Dollars: each category × price; cache writes blend short/long by
  `longCacheWriteShare`; Astra blends long-context prices by its share.

**Tests:** a two-feature hand-computed fixture for each scenario and each
price rule; children sum to parents and the tree root equals the matrix
cell; zero and extreme parameters give finite, non-negative results; the
calibrated preset applied to an RGW-sized fixture at `coverage` reproduces
the measured 45.01M output tokens within 1%.

### Task 8: Report views

**Files:** `site/src/components/{Summary,Matrix,Treemap,Breadcrumb,FeatureTable,FeatureDetail,Assumptions,Dependencies}.svelte`.

**Behaviour:**
- Summary tiles: headline SLOC, total tokens, total USD for the selection;
  a line stating what the headline excludes.
- Matrix: 3 × 3 target × model USD; clicking a cell selects it.
- Treemap (`d3-hierarchy`): area = code lines, colour = USD per line;
  click zooms into a component, then a feature opens `FeatureDetail`;
  breadcrumb zooms out; keyboard reachable.
- FeatureTable: rows for the current level — name, SLOC, the four token
  categories, USD, share of total; sortable; row click drills down.
- FeatureDetail: description, languages, globs, link to the path on GitHub
  at the pinned SHA, the multipliers applied, token and USD breakdown.
- Assumptions: scenario picker and sliders for the `Params` fields; a
  changed slider shows "custom" and a reset; unmeasured values carry a
  marker.
- Dependencies: table of dependency × target strategy, package, submodule
  size next to costed size.
- Numbers use compact notation (1.2M, 41B, $1.3M) with exact values in
  tooltips.

**Tests:** Playwright smoke test against `vite preview`: the page loads with
no console errors; clicking a treemap cell updates the breadcrumb and table;
moving a slider changes the headline USD; a hash with an unknown model
loads defaults; the footer shows a version and the repo link. Wire into CI.

### Task 9: Methods and calibration pages

**Files:** `site/src/content/methods.md`, `site/src/content/calibration.md`,
a Markdown-rendering route.

- [ ] Methods: scope and what is excluded; how SLOC is counted; bytes → 
  tokens; the model's formula; each assumption with its value pulled from
  `report.json` (not retyped); price table with sources and dates; known
  limitations (teuthology not costed, Rust/WASM modelled from Go, one
  calibration project, transcript gaps).
- [ ] Calibration: the rgw-go measurement table, what rgw-go covers and
  excludes, the derivation of each ratio, cost drivers rgw-go reported, and
  rgw-go's elapsed time as context only.
- [ ] Every code-behaviour claim is checked against the code or data before
  it is written.

### Task 10: Release and deploy

**Files:** `.releaserc.yml`, `.github/workflows/{release,deploy}.yml`.

- [ ] Mirror `jhoblitt/tmelevation`'s `release.yml`, `deploy.yml` and
  `.releaserc.yml` (read them with `gh api`), dropping its `exec`
  release-notes plugin and substituting this repo's build: set up Go and
  Node, `APP_VERSION=$TAG make site-build`, upload `site/dist`, deploy.
- [ ] Enable Pages with source "GitHub Actions"; allow the `github-pages`
  environment to deploy from `v*` tags.
- [ ] Merge; watch release then deploy with one background watcher.
- [ ] Verify the live site: HTTP 200, footer version equals the latest tag,
  drill-down works (Playwright against the Pages URL).

---

## Self-review notes

- Spec coverage: SLOC by component/feature (2–4); tokens by category and
  dollars for 3 × 3 (5, 7); drill-down site (6, 8); editable sources (3–5);
  auto release and deploy with footer version (6, 10); dependency
  strategies (4, 7, 8); qa/ and test de-duplication (4, 7); calibration
  page (5, 9).
- The spec's cost-model step 3 lists expansion × tests × rework; this plan
  measures their product (`outputPerSourceToken`) and shows the three as a
  decomposition, because only the product is measured.
