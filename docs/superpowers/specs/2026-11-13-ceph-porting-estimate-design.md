# Ceph porting estimate — design

Date: 2026-11-13. Status: approved by the owner 2026-11-14.

## Intent

Answer one question with numbers a reader can inspect and adjust: what would
it cost, in LLM tokens and in 2026 US dollars, to port all of ceph/ceph to
another language with an agentic coding model?

The answer is published as an interactive report on GitHub Pages from the
public repository `jhoblitt/ceph-porting-estimate`.

## Goals

- SLOC for ceph/ceph at one pinned commit of `main`, broken down by major
  component and, inside each component, by feature.
- A token estimate for porting each feature, split into uncached input,
  cache write, cache read and output tokens.
- A dollar estimate from list prices as of 2026-11-13, for every combination
  of target (Go, Rust, WASM) and model (Claude Fable 5.2, Claude Opus 5.5,
  GPT-6 Astra).
- A report that looks like a modern website and lets the reader drill from
  the whole repository down to a single feature.
- Sources a person can read and edit by hand.
- Every merge to `main` releases a semantic version and deploys the site;
  the footer shows that version and links to the repository.

## Non-goals

- Porting any Ceph code.
- Engineering-time, calendar or staffing estimates. The report may show
  rgw-go's elapsed time as context, never as a prediction.
- A precise figure. The analysis is "reasonable, not extreme": the output is
  a range with its assumptions exposed.
- Per-file accuracy. The smallest unit is a feature (a set of path globs).

## Anti-goals

- A single confident dollar figure with the assumptions hidden.
- Derived numbers (tokens, dollars) committed to the repository, where they
  can drift from the inputs that produced them.
- Prices or multipliers that a reader cannot trace to a source or to a
  stated assumption.

## Decisions made by the owner

- **WASM** means a Rust port constrained to build for WASM/WASI. Its cost is
  the Rust cost plus an overhead for what WASI lacks or restricts (threads,
  async I/O, sockets, raw block devices).
- **Headline scope** is first-party `src/` plus the `qa/` integration
  suites. Everything else is counted and shown but outside the headline.
- **Vendored dependencies** (rocksdb, spdk, boost, seastar, arrow, …) are
  not ported line for line. Each gets a per-target strategy: replace with a
  standard package at no cost, write bindings, port, or drop. Only the
  binding or porting work is costed. Removing or replacing a dependency is
  allowed where appropriate.
- **`qa/`**: Python tasks and shell workunits are ported at normal cost;
  suite YAML is carried over as low-cost configuration. A harness to run
  them (teuthology) lives outside ceph/ceph and is not costed; the report
  says so.
- **rgw-go's `tokens.md` spend file is not used.** Calibration rests on the
  token aggregates the rgw-go session supplied and on line and PR counts.
- **Cost model** is scenario presets plus sliders.
- **Output** is tokens by category, and dollars at today's list prices.
- **Repository** is public. The owner granted permission to create it, open
  and merge PRs, manage its configuration, and run and change its CI.
- **Versioning and deploy** follow `jhoblitt/tmelevation`.
- **Kimi K3** (Moonshot AI) was added to the model matrix by the owner on 2026-11-14.

## Decisions made by the builder (open to correction)

- **Snapshot**: ceph `main` at one commit SHA, recorded in the data and
  shown in the report.
- **Dashboard frontend** (Angular/TypeScript) is counted and shown, and is
  outside the headline: the owner did not select it, and a browser UI has no
  sensible Go or Rust port.
- **Docs, packaging and build files** (`doc/`, `debian/`, cmake, …) are
  counted and shown as "not ported".
- **Counts are committed, one row per file.** A Go tool counts SLOC from a
  local ceph checkout and writes one row per file (path, language, lines by
  kind, bytes); that file is committed. Features are rolled up from it at
  build time, so a taxonomy edit never leaves stale totals behind and CI can
  check every glob without cloning ceph. CI also checks that the counts
  carry the SHA the data declares.
- **Calibration is a fixed snapshot** of rgw-go at `239f789` (2026-11-13),
  not a feed. The share of `src/rgw` that rgw-go covers at that commit is
  itself an assumption, stated as a range on the calibration page, because
  rgw-go is mid-phase-2 and excludes a published list of features.
- **Rust and WASM are extrapolated** from the Go measurements through the
  expansion and target factors, and labelled modelled. rgw-rs is a small
  spike and is mentioned as context only.
- **Existing tests are ported once, not twice.** `src/test` and `qa/` are
  test code: they are costed as code to port, with no test ratio applied to
  them. The test ratio is the total volume of target-language tests per
  line of product code; ported tests count toward it, and only the
  shortfall is costed as new tests.
- **Tokens are derived from bytes**, not from a tokenizer: each language has
  a bytes-per-token ratio stated as an assumption. No API key is needed and
  the method is the same for all three models.
- **The cost model runs in the browser**, in one tested module, so sliders
  recompute everything live. Nothing derived is committed.
- **Site stack**: Vite + Svelte + TypeScript, D3 for the hierarchy chart.
- **Report sections**: the interactive estimate, a methods page, and an
  rgw-go calibration page.

## Constraints

- GitHub Pages serves static files only. All computation is at build time
  (counting) or in the browser (costing).
- Go is the default language for tooling; the browser side is TypeScript.
- Shell in the repository is thin glue only.
- Workflows follow the github-conventions canon (pinned actions,
  least-privilege permissions, timeouts, concurrency, actionlint,
  commitlint, dependabot).
- Pricing must be traceable: every price carries its source URL and the date
  it was read.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| A (chosen) | YAML sources, Go counter, committed counts, Svelte site with the cost model in the browser | Live sliders and drill-down; hand-editable sources; needs a Node build in CI |
| B | Hugo/Markdown with pre-rendered tables | Simplest pipeline; every scenario must be pre-computed, so no real sliders and weak drill-down |
| C | No-build vanilla JS + D3, as tmelevation does | No toolchain; a zoomable hierarchy across 3 targets × 3 models × scenarios becomes unwieldy without components and types |

The owner left the source format and stack to the builder. A was chosen
because the sliders the owner asked for need the model to run client-side,
and typed components keep that manageable.

## Source data (hand-edited YAML under `data/`)

- **`taxonomy.yaml`** — the component → feature tree. Each feature has a
  name, a one-line description, path globs into the ceph tree, a scope class
  (headline, shown-only, not-ported) and a difficulty class. Globs are
  matched most-specific first; every counted file lands in exactly one
  feature, and a file no glob claims lands in its component's "other"
  bucket, so nothing is silently dropped.
- **`dependencies.yaml`** — one entry per vendored or system dependency:
  what Ceph uses it for, and for each target a strategy (native package,
  bindings, port, drop) with a SLOC-equivalent for the work that strategy
  leaves.
- **`models.yaml`** — per model: input, cache-write, cache-read and output
  prices per million tokens, any long-context surcharge, the source URL and
  the date read.
- **`assumptions.yaml`** — bytes-per-token by language; code expansion by
  target; the WASM overhead; difficulty multipliers by class; and the
  scenario presets.
- **`calibration.yaml`** — the rgw-go measurements the calibrated preset is
  derived from, with their provenance.

Prices read on 2026-11-13, per million tokens:

| Model | Input | Cache write | Cache read | Output | Source |
|---|---|---|---|---|---|
| Claude Fable 5.2 | $8 | $10 (5 min) / $16 (1 h) | $0.20 | $40 | platform.claude.com/docs/en/about-claude/pricing |
| Claude Opus 5.5 | $4 | $5 (5 min) / $8 (1 h) | $0.20 | $20 | same |
| GPT-6 Astra | $10 | $12.50 / $25 | $1 | $50 | developers.openai.com/api/docs/pricing |

GPT-6 Astra bills prompts over 272K input tokens at $20 input, $2 cached
and $75 output. The model carries the share of traffic above that threshold
as an assumption. The Astra cache-write columns must be re-read against the
page's column headers when `models.yaml` is written.

## Generated data

`data/generated/sloc.json`, written by the Go counter and committed: the
ceph SHA and commit date, then one row per file with its language, code
lines, comment lines, blank lines and bytes. The site build rolls the rows
up to features and ships only the rolled-up data to the browser. Submodule contents are
counted separately, per dependency, so the dependency view can show how
large each one is next to the work its strategy costs.

## The cost model

[`docs/cost-model.md`](../../cost-model.md) is the current specification of
the cost model and supersedes the formulas in this section.

Per feature, target and model:

1. **Source tokens** = bytes ÷ bytes-per-token for the language.
2. **Work units** = source tokens × difficulty multiplier × target factor
   (the WASM overhead applies here).
3. **Output tokens** = work units × target code expansion × (1 + test
   ratio) × an output-overhead factor (rework, plans, reviews: output
   tokens emitted per token of code that survives).
4. **Input tokens** = output tokens × three ratios: cache read, cache write
   and uncached input per output token. Agentic work re-reads its context
   on every call, so input scales with the number of calls, which output
   volume tracks; the rgw-go measurement gives these ratios directly.
5. **Model efficiency** — a per-model factor for how many tokens the same
   work takes (more rework rounds on a weaker model). Defaults to 1.0 for
   all three; it is an exposed assumption, not a benchmark claim.
6. **Dollars** = each token category × its price.

Dependency work enters as extra features whose size is the SLOC-equivalent
from `dependencies.yaml` for the selected target.

Scenario presets set the multipliers in steps 3–5:

- **Naive** — one pass: read the source once, write the target once. A
  lower bound.
- **Calibrated** — rgw-go as measured: tests exceeding product code about
  1.3 : 1, implement → review → fix rounds, plans and docs, and the
  measured token split if the rgw-go session can supply one. rgw-go is
  byte-compatible with radosgw's on-RADOS formats, coexists with C++
  daemons and verifies against two Ceph releases, so this preset already
  carries those costs. Where a multiplier has no measurement behind it, the
  report says so.
- **Pessimistic** — calibrated, with what rgw-go did not face: higher
  difficulty for the core daemons (OSD, BlueStore, Crimson, MDS, the
  messenger) than for a gateway, no mature binding to lean on, and a larger
  allowance for upstream-defect triage and cluster-test flakes.

A separate **compatibility** control scales the calibrated cost down for a
clean-break port that keeps no on-disk or wire compatibility. Its default
discount has no measurement behind it and is labelled as such.

Sliders expose the main multipliers; moving one marks the scenario as
custom.

## The report

One page, three levels of drill-down, plus two prose pages.

```
┌──────────────────────────────────────────────────────────────┐
│ Ceph porting estimate         ceph@ec322a5 · 2026-11-13      │
│ Target [Go|Rust|WASM]  Model [Fable|Opus|Astra]  Scenario ▾  │
├──────────────────────────────────────────────────────────────┤
│  2.9M SLOC      41B tokens       $1.2M        (illustrative) │
│  ── 3×3 target × model matrix of total cost ──               │
├──────────────────────────────────────────────────────────────┤
│ ┌── zoomable treemap: area = SLOC, colour = $ ─────────────┐ │
│ │ osd        │ rgw          │ mds     │ mon   │ librbd …   │ │
│ └──────────────────────────────────────────────────────────┘ │
│ breadcrumb: ceph › rgw › multisite                           │
│ table: feature | SLOC | in | cache | out | $   (sortable)    │
├──────────────────────────────────────────────────────────────┤
│ Assumptions (sliders)   Dependencies (strategy per target)   │
├──────────────────────────────────────────────────────────────┤
│ v1.2.3 · github.com/jhoblitt/ceph-porting-estimate           │
└──────────────────────────────────────────────────────────────┘
```

- Clicking a component zooms the treemap and filters the table to its
  features; clicking a feature opens its detail: languages, paths, the token
  breakdown and the multipliers applied.
- Target, model, scenario and the drill-down path live in the URL, so a
  view can be linked.
- Light and dark themes; usable on a phone.
- The **methods** page states every assumption and its source. The
  **calibration** page presents the rgw-go data and how the calibrated
  preset follows from it.

## Repository, release and deploy

Modelled on `jhoblitt/tmelevation`:

- PRs run CI: Go tests and lint for the counter, unit tests for the cost
  model, a data check (YAML validates against its schema, the committed
  counts match the declared SHA, every glob matches at least one file), and
  a site build. Commitlint enforces conventional commits.
- A push to `main` runs semantic-release, which tags `vX.Y.Z` and publishes
  a GitHub Release. Data and docs changes are user-visible content, so
  `docs` and `refactor` commits also cut a patch release.
- The release calls the deploy workflow with the new tag. Deploy builds the
  site from that tag, injects the version, and publishes to Pages.
- `main` is protected by a ruleset; changes land by PR.

## Verification

- Counter: unit tests on fixtures; a total cross-checked against an
  independent line count of the same checkout.
- Cost model: unit tests with hand-computed cases; an invariant that the
  feature rows sum to the headline figures.
- Site: a build in CI; a browser smoke test that the page loads, drills
  down and recomputes on a slider change.

## Left to the builder

- The exact taxonomy: which components and features, and their globs.
- The default value of every multiplier, each with a stated reason.
- Per-dependency strategies for each target.
- Visual design: palette, type, chart details.
- The counter's implementation (a library or its own line classifier).

## Calibration measurement

Supplied by the rgw-go session on 2026-11-13, aggregated by script from
Claude Code transcripts (2026-09-25 to 2026-11-13), in millions of tokens:

| Scope | Calls | Uncached in | Cache write | Cache read | Output |
|---|---|---|---|---|---|
| The port: controller + 984 subagents | 163,109 | 0.35 | 1,137.2 | 56,213.6 | 45.01 |
| — controller | 15,574 | 0.04 | 82.8 | 7,881.0 | 14.60 |
| — implementation (411) | 99,341 | 0.20 | 785.2 | 37,650.4 | 22.27 |
| — review (475) | 35,605 | 0.08 | 171.4 | 6,733.0 | 5.79 |
| — research, planning, triage (47) | 4,712 | 0.02 | 31.9 | 1,451.6 | 1.36 |
| — upstream-defect triage (39) | 5,410 | 0.01 | 23.6 | 1,558.4 | 0.73 |
| — unclassified (12) | 2,467 | 0.01 | 42.3 | 939.3 | 0.25 |
| Adjacent: defect reproduction | 24,559 | 0.05 | 114.4 | 4,788.2 | 9.36 |
| Adjacent: security-review hook | ~6,700 | — | ~61 | ~217 | ~4.2 |
| Adjacent: upstream PR servicing | 509 | — | 2.1 | 74.9 | 0.26 |
| Adjacent: feasibility study | 1,250 | — | 4.1 | 286.1 | 0.62 |

98% of the port's calls ran on Opus 5.5. It produced 124,396 lines of
product Go and 311,194 lines including tests and tooling, against a source
of about 298k lines (`src/rgw` plus the RGW object classes at v19.2.7), of
which rgw-go covers a subset. 268 tasks took 455 review passes (1.70 per
task).

About 98% of all tokens are cache reads, so cache-read price and the
cache-read-per-output ratio dominate the dollar figure. The calibrated
preset takes its ratios from the port row; a toggle adds the adjacent
rows. Known gaps: compaction and advisor calls may be absent from
transcripts, server-side web tools are not counted, and role assignment is
by keyword.
