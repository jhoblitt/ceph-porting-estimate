## Scope

Every counted line sits in one of three scopes, and only the first makes the headline.

**Headline: first-party code under `src/` and `qa/`.** The daemons and their libraries, the command-line tools, the Python manager modules and deployment tools, the dashboard's Python backend, Ceph's own tests and the `qa/` integration suites: {{computed.lines.headline | countExact}} lines of code. Dependency work joins them in the headline total.

**Shown separately: costed, but kept out of the headline**, {{computed.lines.shown | countExact}} lines:

- the dashboard's Angular frontend and its tests: a browser UI has no sensible Go or Rust port;
- the monitoring mixin (Grafana dashboards, Prometheus alerts, their tests);
- the Java bindings, and the Windows clients (the Dokan CephFS client, the WNBD block driver and their tests);
- example programs;
- optional code whose dependency a port drops: the DPDK network stack and the DAOS storage driver for RGW, both off by default in Ceph's build.

**Not ported, and not costed**, {{computed.lines.notPorted | countExact}} lines: documentation and release notes, packaging and build files, generated files (translation catalogues, the dashboard's API description, rendered dashboards), vendored third-party code inside `src/`, test fixtures and golden data, the in-tree copy of the s3-tests suite (a separate project a port would reuse unchanged), and maintainer and developer tooling.

### What "port to WASM" means

A Rust port constrained to build for WebAssembly with WASI, wherever it can. The WASM column is the Rust estimate times an assumed factor, {{assumptions.params.wasm_overhead.value | multiplier}}, applied to every feature alike: illustrative, not the price of a defined deliverable. An adversarial review of this estimate reports that WASI lacks parallel threads, block devices and process execution; it rated those details plausible rather than confirmed, and no build for WASI was attempted to check them. On that reading, what needs them, an OSD on raw block devices above all, has no WASI form, and several dependencies are dropped for WASM for the same reason ([Dependencies](#/methods?section=dependencies)). The host-side code that would stand in for what WASI cannot host is not costed. Read the column as the price of the attempt, not of a working system.

### How `qa/` is treated

The Python tasks and shell workunits are both costed as test code to port: the tasks under `qa/tasks` at the {{computed.qa.tasks | list}} class, the workunits under `qa/workunits` at the {{computed.qa.workunits | list}} class. The suite YAML under `qa/suites` is carried over as configuration, at the configuration multiplier. Teuthology, the harness that runs the suites, lives outside `ceph/ceph` and is not costed.

### How existing tests are treated

Ceph's own tests (`src/test`, the `qa/` tasks and the tests beside the code) are ported once, like any other code; no test ratio is applied to them. The test ratio is the volume of tests a finished port has per token of product code. Ceph's headline already holds {{computed.tests.existing | ratio}} test tokens per product token against the measured {{computed.tests.target | ratio}}, so only the shortfall, {{computed.tests.toWrite | ratio}} per product token, is costed as new tests. That credit is an assumption: rgw-go reused Ceph's test suites unported and wrote its own tests new ([What could make this wrong](#/methods?section=what-could-make-this-wrong)).
