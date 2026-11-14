## Dependencies

Ceph builds on libraries it does not own: vendored submodules such as RocksDB, Seastar and SPDK, and system and Python libraries such as OpenSSL, Boost and Jinja2. A port does not translate them line for line. For each of the {{computed.counts.dependencies | countExact}} dependencies and each target, the data names one strategy:

- **native**: a maintained package in the target's ecosystem, or its standard library, covers what Ceph uses. Costs nothing.
- **bindings**: rely on existing code the port does not rewrite, reached across a language boundary through cgo or FFI. Costs the glue.
- **port**: rewrite the part Ceph needs in the target language. Costs that part.
- **drop**: a rewrite does not carry it, or the target cannot host it. Costs nothing here: what the library did is either redesigned inside code already costed (Seastar's reactor in a Go port of Crimson, say) or lost.

Only bindings and port work is costed. Each such entry states the lines of work it leaves and a difficulty, and enters the model as product code of that size and class. Its tokens use the bytes per line of Ceph's own C++, so each line of dependency work carries the comments and blank lines real source does.

::: dependency-totals

Bindings keep existing code. Used through bindings means a port built to this estimate still relies on existing code that it does not rewrite, reached across a language boundary; which code that is, and what the port replaces, is in each entry's plan on the estimate page. So "ported to Go" here means Ceph's own code in Go, still reaching that code where it uses bindings: for Go that puts cgo on the call path, and, for RocksDB, C++ shims for the interfaces Ceph implements inside it.

::: bindings-by-target

::: if computed.hasSubmoduleOwn

The vendored libraries are large next to that work. Their sizes, each submodule's own code and with the submodules nested inside it, are for context only:

::: submodule-sizes

::: end

Every dependency, its strategy per target and the reasoning behind it are in the [Dependencies section of the estimate page](#/) and in [`data/dependencies.yaml`](https://github.com/jhoblitt/ceph-porting-estimate/blob/main/data/dependencies.yaml).

What was checked, and what was not, is recorded in [`docs/dependency-verification.md`](https://github.com/jhoblitt/ceph-porting-estimate/blob/main/docs/dependency-verification.md). Each named Go module and Rust crate was looked up in its registry for a recent release and for being archived or deprecated; abandoned packages were replaced by maintained ones or left in entries already costed as ports. Not verified: every claim that something builds for WASI; the absence of maintained Go bindings for SPDK and RDMA verbs; whether the pure-Go SQLite's VFS interface fits Ceph's use; and a few judgement calls the verification flagged and left as they were.
