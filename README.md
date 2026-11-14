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

## Development

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/);
commitlint enforces this on every pull request. Every GitHub Action is pinned
to a commit SHA: run `pinact run` after editing a workflow and `actionlint`
before committing it. `make check` is the local gate, `make tools` installs
the pinned linter, and that pin lives in the `Makefile`.

## Site

The report is a Vite, Svelte and TypeScript site under `site/`, built with
the Node version in `.nvmrc`. It reads one generated file,
`site/src/generated/report.json`, which `cephest rollup` writes.

```sh
make site-install   # npm ci
make site-build     # cephest rollup, then vite build into site/dist
make site-test      # typecheck and unit tests
```

To work on the site without the Go side, `make site-dev-data` copies the
test fixture into place; then run `npm run dev` in `site/` for a live
server, or `npm run build` and `npm run preview` to serve the built site
under its Pages base path, `/ceph-porting-estimate/`. A build takes its
version from `APP_VERSION`; without it the footer reads `dev`.

## License

[Apache-2.0](LICENSE)
