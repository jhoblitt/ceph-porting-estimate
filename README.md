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

`cephest` has three subcommands, none implemented yet: `count` counts
source lines per file in a Ceph checkout, `check` validates the hand-edited
data files, and `rollup` combines both into the report's `report.json`.
Run `cephest --help` for flags.

## Development

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/);
commitlint enforces this on every pull request. Every GitHub Action is pinned
to a commit SHA: run `pinact run` after editing a workflow and `actionlint`
before committing it. Where a `Makefile` is present, `make check` is the local gate,
`make tools` installs the pinned linter, and that pin lives in the `Makefile`.

## License

[Apache-2.0](LICENSE)
