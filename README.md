# ceph-porting-estimate

[![ci](https://github.com/jhoblitt/ceph-porting-estimate/actions/workflows/ci.yml/badge.svg)](https://github.com/jhoblitt/ceph-porting-estimate/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jhoblitt/ceph-porting-estimate/badge)](https://scorecard.dev/viewer/?uri=github.com/jhoblitt/ceph-porting-estimate)

Token and cost estimate for porting [Ceph](https://github.com/ceph/ceph) to Go,
Rust and WASM. A Go tool, `cephest`, counts the source lines of a pinned Ceph
commit and rolls them up, with hand-curated feature, dependency, price and
assumption data, into one `report.json`; a static site renders it and runs the
cost model in the browser, published on GitHub Pages.

## Install

The report will be published at <https://jhoblitt.github.io/ceph-porting-estimate/>.

The `cephest` tool that produces its data builds from this checkout:

```sh
go build -o bin/cephest ./cmd/cephest
```

## Usage

`cephest` has three subcommands: `count` counts source lines per file in a
Ceph checkout, `check` validates the hand-edited data files, and `rollup`
combines both into the report's `report.json`. Run `cephest --help` for
flags.

`count` reads the commit through git objects only, so the checkout's working
tree may be dirty, and counts each submodule whose pinned commit is present
under `.git/modules`:

```sh
cephest count --repo ~/github/ceph --rev <sha> --out data/generated/sloc.json
```

Lines are classified as code, comment or blank by the language rules of
[scc](https://github.com/boyter/scc) v3.7.0; which language a file is, and
so its bucket in `sloc.json`, is `cephest`'s own table.

`check` validates the data directory against `<data>/generated/sloc.json` and
reports every problem it finds; `rollup` runs the same checks and writes the
report only when they pass. `--data` defaults to `data`:

```sh
cephest check
cephest rollup --out site/src/generated/report.json
```

The taxonomy is `data/taxonomy.yaml` and every `data/taxonomy/*.yaml`, read
in that order. Any of them may hold a `groups:` list (`id`, `name`,
`description`) and a `components:` list; every component names its `group:`,
the report presents components under their groups, and `check` rejects a
group that is undefined, defined twice or used by no component. Each
file in `sloc.json` belongs to the feature whose matching
[doublestar](https://github.com/bmatcuk/doublestar) glob is the most
specific:

1. The longest literal prefix, the text before the glob's first
   metacharacter, wins.
2. Among equal prefixes, the most literal characters win: everything that
   is not glob syntax, where `*`, `?`, a `[...]` class and a `**/` segment
   count nothing and a `{a,b}` alternation counts its shortest alternative.
   `src/common/*Formatter*` (20) beats `src/common/**` (11).
3. Globs of two features still equal on both are an error naming the file,
   the features, the prefix and the score. One feature's globs may overlap.

A file no glob matches lands in `unclassified`, which `check` lists and
rejects above 1% of code lines.

## Data

Everything the estimate rests on is under `data/`; the formulas that turn
it into tokens and dollars are [`docs/cost-model.md`](docs/cost-model.md).

| File | What it holds |
|---|---|
| `taxonomy/*.yaml` | The groups, and the components and features that claim Ceph's files by glob, each with a scope, kind and difficulty |
| `dependencies.yaml` | Each library Ceph leans on, and per target what a port does about it and the lines of work that leaves |
| `models.yaml` | Each model's list prices per million tokens, with the page and date they were read |
| `assumptions.yaml` | The pinned Ceph commit (`ceph.rev`), bytes per token by language, the cost model's parameters and the scenario presets |
| `calibration.yaml` | The rgw-go measurements the calibrated parameters are derived from |
| `generated/sloc.json` | Lines and bytes per file at the pinned commit, written by `cephest count` and never edited by hand |

Every quantity in `assumptions.yaml` carries a `source` and a `reason`, and
`check` rejects one that lacks either. Derived tokens and dollars are never
committed: the site computes them in the browser from the rolled-up
`report.json`, which is build output.

The scenario presets in `assumptions.yaml` are listed in the order the
report presents them, and each has a `role`: `low`, `central`, `high` or
`reference`. `check` requires one `central` scenario, which must be
`default_scenario`, at most one of each other role, and a scenario named
`calibrated`; there may be any number of others.

`calibration.yaml` is free-form for display, but every number in
`assumptions.yaml` that is a copy or a function of it is checked: `check`
recomputes the calibrated parameters, the difficulty scale, the scenario
values taken from rgw-go (the phase-derived scales, the expansion at a
coverage end and the long-context shares) and every figure
`calibration.yaml` records as a function of other figures in the data, and
fails, naming the key and both values, on any that has drifted. The counts
and reports it takes as given are listed in
[`docs/cost-model.md`](docs/cost-model.md). A scenario that copies one of
these values must be named in the matching mapping in
`calibration.yaml` (`phases.scenario_phase`,
`coverage.scenario_end`, `long_context_scenarios`), or `check` fails.
After changing coverage, a bytes-per-token value, a relative difficulty, a
phase row or rgw-go's prompt-size shares, recompute every value `check`
names, in both files, until it passes;
[`docs/cost-model.md`](docs/cost-model.md) lists each rule.

After any edit, validate the data; CI runs the same check, and `go test`
fails on invalid data too:

```sh
make data-check     # go run ./cmd/cephest check
```

To add or move a feature, edit its component's file under `data/taxonomy/`
and run `make data-check`: it reports a glob that matches nothing, a tie
between two features and code no feature claims.

To re-pin to a newer Ceph commit, count it, update `ceph.rev` in
`assumptions.yaml` to the same SHA, run `make data-check`, and fix what it
reports, usually new files to classify:

```sh
go run ./cmd/cephest count --repo ~/github/ceph --rev <sha> --out data/generated/sloc.json
```

`params.sloc_equivalent_bytes_per_line` in `assumptions.yaml` is derived
from `sloc.json`, as the bytes per code line of C++ in headline features
of kind `product`; `check` recomputes it and fails until it is updated
after a re-pin.
Submodule sizes are counted only for submodules whose pinned commit is
present locally under `.git/modules`; any other is recorded as unavailable.

## Development

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/);
commitlint enforces this on every pull request. Every GitHub Action is pinned
to a commit SHA: run `pinact run` after editing a workflow and `actionlint`
before committing it. `make check` is the local gate, `make tools` installs
the pinned linter, and that pin lives in the `Makefile`.

## Site

The report is a Vite, Svelte and TypeScript site under `site/`, built with
the Node version in `.nvmrc`. It reads one generated file,
`site/src/generated/report.json`, which `cephest rollup` writes from
`data/`.

```sh
make site-install   # npm ci --ignore-scripts
make site-build     # cephest rollup, then vite build into site/dist
make site-test      # typecheck and unit tests
```

`site-build` and `site-test` install the dependencies first when
`node_modules` is missing or older than the lockfile, so `make site-build`
works from a clean checkout with Go and Node on `PATH`.

To work on the site without the Go side, `make site-dev-data` copies the
test fixture into place; then run `npm run dev` in `site/` for a live
server, or `npm run build` and `npm run preview` to serve the built site
under its Pages base path, `/ceph-porting-estimate/`. A build takes its
version from `APP_VERSION`; without it the footer reads `dev`.

## License

[Apache-2.0](LICENSE)
