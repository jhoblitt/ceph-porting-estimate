# ceph-porting-estimate

[![ci](https://github.com/jhoblitt/ceph-porting-estimate/actions/workflows/ci.yml/badge.svg)](https://github.com/jhoblitt/ceph-porting-estimate/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/jhoblitt/ceph-porting-estimate/badge)](https://scorecard.dev/viewer/?uri=github.com/jhoblitt/ceph-porting-estimate)

Token and cost estimate for porting [Ceph](https://github.com/ceph/ceph) to Go,
Rust and WASM. A Go tool, `cephest`, counts the source lines of a pinned Ceph
commit and rolls them up, with hand-curated feature, dependency, price and
assumption data, into one `report.json`; a static site renders it and runs the
cost model in the browser, published on GitHub Pages.

## Install

The report is published at <https://jhoblitt.github.io/ceph-porting-estimate/>.

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
`check` rejects one that lacks either. It also rejects a parameter, a
scenario override or a scaled value below 0, and a share (the long
cache-write share and the long-context shares) above 1: the browser would
clamp them, and the page would show a figure the data does not say. Every
taxonomy feature needs a `description` and a `why`. Derived tokens and
dollars are never committed: the site computes them in the browser from
the rolled-up `report.json`, which is build output.

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
fails, naming the key and both values, on any that has drifted. Each
feature in `calibration.yaml`'s `ported_mix`, the mix the difficulty scale
is normalised over, must be a headline product feature of the taxonomy at
the taxonomy's own difficulty class, so renaming or re-rating one of them
fails the check until the mix is redone. The counts
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

To re-pin to a newer Ceph commit, follow [Updating](#updating).

## Updating

There are three kinds of update: a new Ceph commit, new prices, and a new
calibration. Each changes files under `data/`, and the unit tests that pin
a value it changes; none changes the code. Whichever you make, you are
finished when all of these hold:

- `make data-check` reports no problem;
- `make check`, `make site-test` and `make site-e2e` pass (`make check`
  also fails while a tracked file has uncommitted changes, so run it after
  committing);
- you have re-read every statement listed for that kind of update under
  [Statements no check covers](#statements-no-check-covers), and corrected
  any the new data has made untrue.

`make data-check` names every value that no longer agrees with the data it
is computed from, with the value it computes; copy that value in (and the
arithmetic in the comment beside it, where there is one) and run it again.
`make site-build`, which `make site-e2e` runs, renders the Methods and
Calibration pages against the new `report.json` and fails when a page
quotes a key the data no longer has, naming the file and the placeholder,
or prints a calibrated figure that disagrees with the parameter the model
uses.

### A new Ceph commit

1. Make the submodules present. `count` sizes a submodule only when the
   commit Ceph pins for it is in the clone's `.git/modules`; any other is
   recorded as unavailable, and the Methods page lists it as not counted.
   In a clone of Ceph checked out at the new commit, run
   `git submodule update --init --recursive`.
2. Count the commit, and set `ceph.rev` in `data/assumptions.yaml` to the
   same SHA:

   ```sh
   go run ./cmd/cephest count --repo ~/github/ceph --rev <sha> --out data/generated/sloc.json
   ```

3. Check the counts against git. The Methods page states that their total
   over text files equals what `git grep -I -c ''` gives at the same
   commit; these two numbers must be equal before you go on:

   ```sh
   git -C ~/github/ceph grep -I -c '' <sha> | awk -F: '{ s += $NF } END { print s }'
   jq '[.files[] | select(.binary | not) | .code + .comment + .blank] | add' data/generated/sloc.json
   ```

4. Run `make data-check` and fix what it reports: new files no glob
   claims (edit `data/taxonomy/`), globs that match nothing, ties between
   features, `params.sloc_equivalent_bytes_per_line` (the bytes per code
   line of headline product C++, recomputed from `sloc.json`), a
   dependency's submodule that has moved, and any `ported_mix` feature the
   taxonomy has renamed or re-rated. A changed `ported_mix` changes the
   difficulty scale, so `check` then names the shares, the mean and the
   `params.difficulty` values to recompute.
5. Re-read the statements marked *Ceph* below.

### New prices

1. In `data/models.yaml`, edit each changed model's `usd_per_mtok` and
   `long_context` prices, set `read_on` to the day you read them, and
   update `source`. When a model's prices come from more than one page,
   `price_sources` says which page gave each price and when; `check`
   requires every price to be listed exactly once there. A new model also
   needs a `params.model_efficiency` entry in `data/assumptions.yaml`.
2. Run `make data-check`. If the measured model's prices changed (the
   model `measurement.model_id` in `data/calibration.yaml` names), it
   names each `derived.sanity_opus_5_5_usd` figure in `calibration.yaml`
   that has moved: the port row's dollars, the same per line of product
   Go, and the review role's share.
3. Regenerate `site/src/lib/__fixtures__/staged.json`, the unit tests'
   copy of the assumptions and the models, with the command in the comment
   at the top of `site/src/lib/model.test.ts`, run from the repository
   root with `data` as the data directory. Then `make site-test`: a test
   that prices the rgw-go-sized port on a model at a fixed figure fails
   when that model's prices change; check that the new figure is the price
   change, and update it.
4. Re-read the statements marked *Prices* below.

### A new calibration

A new measurement of rgw-go further along, or of another port, replaces
the measurements in `data/calibration.yaml`:

- `project`: the port, its repository, the commit measured and the source
  it ports;
- `measurement`: the port row, the roles, the adjacent rows, the tasks and
  review passes, the share of calls on the measured model, the known gaps
  and the notes, with their provenance;
- `measurement_detail`: the second aggregation's calls, cache lifetimes,
  prompt sizes and where cache writes come from;
- `sizes`: the port's Go and the source it ports, counted from git;
- `coverage`: the share of the source ported, its range, the byte
  classification and the session's own estimates;
- `ported_mix.features`: what was ported, mapped onto the taxonomy;
- `phases`: the token and Go rows by phase, and their note.

Then:

1. Run `make data-check` and work through what it names. It recomputes
   every calibrated parameter in `data/assumptions.yaml` (the expansion,
   test ratio, overhead, input ratios, adjacent uplifts, cache-lifetime
   share and difficulty scale), every scenario value taken from the
   calibration (the phase scales, the expansion at a coverage end, the
   long-context shares), and every derived figure `calibration.yaml`
   records; `docs/cost-model.md` lists each rule. A new phase row needs its
   own `phases.derived` block; `phases.scenario_phase`,
   `coverage.scenario_end` and `long_context_scenarios` say which scenario
   takes which phase, coverage end and shares.
2. Regenerate `staged.json` as for new prices, and bring the unit tests
   that pin calibrated values up to date: the expected params in
   `site/src/lib/model.test.ts`, its copy of the ported mix
   (`PORTED_MIX`), and the port row's token totals that the identity test
   expects the model to give back.
3. Run `make site-build`. A page quotes a few calibration keys by name,
   such as `coverage.session_bytes.phase_3_not_started`; the build names
   any the new data no longer has.
4. Re-read the statements marked *Calibration* below, and update the
   reasons in `data/assumptions.yaml` that describe the measurement.

### Statements no check covers

The Methods and Calibration pages compute every figure from the data, and
a unit test (`site/src/lib/prose/content.test.ts`) rejects a digit typed
into their Markdown unless it is on an allowlist there. What the prose
says in words, and the few figures that list allows, are typed by hand,
and nothing checks them against new data. Re-read them after each kind of
update marked, in `site/src/content/` unless the path says otherwise:

| File | What to re-read | When |
|---|---|---|
| `methods/02-what-is-counted.md` | That the counts' total matched `git grep -I -c ''` at the commit (verify it as above); the submodules named | Ceph |
| `methods/03-scope.md` | What each scope holds, the optional code a port drops (DPDK, DAOS, off by default), how `qa/` is treated, and that Teuthology lives outside `ceph/ceph` | Ceph |
| `methods/04-features.md` | The example features, components and groups, and that every file is claimed at this commit | Ceph |
| `methods/05-dependencies.md` | The libraries named, the RocksDB shims, and the summary of what `docs/dependency-verification.md` checked | Ceph |
| `methods/06-cost-model.md` | That Python is the language with the next largest share of the headline after C++ | Ceph |
| `methods/08-prices.md` | The tiers not modelled (batch, flex, fast, regional) | Prices |
| `methods/09-what-could-make-this-wrong.md`, `methods/10-how-to-check.md` | That the latest phase is unfinished, more review-heavy and builds a different kind of feature, attributed to the session's account | Calibration |
| `limitations/*.md` | The two OSDs and Seastar dropped for Go and WASM (`osds`); cgo on BlueStore's metadata path (`bindings`); the manager hosting Python today (`python`); how rgw-go wrote its tests (`tests`); rgw-go as the easy case (`scale-up`); the release floors (`release-floors`); "its ratios were rising" (`unfinished`) | Ceph, Calibration |
| `calibration/01-why.md` | The quotes from rgw-go's `README.md` and `hack/rook/README.md`, at the commit linked beside them (`0010b8b`): re-quote them at a commit after the new measurement, update the links, and update the quoted text in the test's allowlist | Calibration |
| `calibration/02-project.md` | The release floors, how the port is built, what it leaves out, the sibling Rust port, the timeline, the weeks elapsed and the pull requests merged | Calibration |
| `calibration/03-measurement.md` | Which phases the reviewed tasks fall in | Calibration |
| `calibration/05-coverage.md` | The session's account of what rgw-go leaves out, and that only the DAOS driver is shown separately | Calibration, Ceph |
| `calibration/07-prompt-sizes.md` | The harness rgw-go ran on | Calibration |
| `calibration/08-what-drove-cost.md` | The seven things the session named, the cost per call at the FFI boundary among them | Calibration |
| `calibration/09-gaps.md` | Each gap, and which phases were in progress or not started | Calibration |
| `docs/dependency-verification.md` | Dated: what was looked up in which registry, and when; redo it when `data/dependencies.yaml` changes | Ceph |
| `docs/cost-model.md` | The worked figures in its prose (the phase ratios, the normalised difficulty scale, the scenario values, the long-context shares, the identity's token totals) | Prices, Calibration |

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
