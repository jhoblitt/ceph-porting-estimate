## What was measured, and why it matters

The central scenario, the one the estimate page opens on, takes its work pattern from one real port: [rgw-go](https://github.com/{{calibration.project.repo}}), a Go replacement for `radosgw`, Ceph's object gateway, built with an agentic coding model.

::: if computed.interpretation.hasScaleUp

**Scaled up.** The estimate's headline needs {{computed.interpretation.headlineOutput | tokens}} output tokens, about {{computed.interpretation.scaleUp | times}} times the {{computed.interpretation.portOutput | tokens}} that rgw-go's port used ([The measurement](#/calibration?section=the-measurement)); the model takes every kind of input in proportion to output.

::: end

**Of one Ceph component.** The source it ports is `src/rgw` at {{calibration.project.ports.tag}} and the RADOS object classes radosgw calls, {{calibration.sizes.source.total.bytes | countExact}} bytes. This project classifies {{calibration.coverage.value | percent}} of those bytes as ported, within a range of {{calibration.coverage.low | percent}} to {{calibration.coverage.high | percent}} ([Coverage](#/calibration?section=coverage)).

**Unfinished.** rgw-go's README says, at commit [`0010b8b`](https://github.com/jhoblitt/rgw-go/blob/0010b8b309bf4e92f03c1327606a2733a70c8082/README.md), later than the snapshot this page measures:

> Phase 1 of the design spec, the S3 data path, authentication and core admin, has passed its gates, and phase 2, versioning, object lock, lifecycle and bucket configuration, is in progress. Rook's object-store suite, less the tests of features not yet implemented ([hack/rook/README.md](https://github.com/jhoblitt/rgw-go/blob/0010b8b309bf4e92f03c1327606a2733a70c8082/hack/rook/README.md)), passes nightly against the derived image. rgw-go is not ready for production use.

And of Rook's suite, in [`hack/rook/README.md`](https://github.com/jhoblitt/rgw-go/blob/0010b8b309bf4e92f03c1327606a2733a70c8082/hack/rook/README.md) at the same commit:

> The phase 1 subset below has passed every nightly run since 2026-10-12 but one, on 2026-10-24. The full, unpatched suite has not run yet.

The table below says where each of the estimate's parameters comes from, as the data marks it: measured, and on what (rgw-go, or Ceph itself); derived from rgw-go's measurements with an assumption; or assumed.

::: parameter-provenance

::: if not assumptions.params.expansion.measured

The expansion `E` is computed from rgw-go's measured sizes and an estimate of how much of radosgw rgw-go replaced, so it is not a measurement ([Coverage](#/calibration?section=coverage)).

::: end

The [Methods page](#/methods?section=every-parameter) gives each value with its source and reason. If rgw-go is unrepresentative, the whole central scenario moves with it. This page is here so you can judge that.

**Who measured what.** rgw-go and this report have the same owner. The token totals come from a script the rgw-go session ran over its own transcripts; neither the script nor the transcripts are published, so those totals cannot be checked from outside, and this project has not reproduced them. The sizes were measured by this project from git, and anyone can repeat that on the public repository. Coverage is this project's classification of the source by bytes, with the session's own position given in its words under [Coverage](#/calibration?section=coverage). Unless the page says otherwise, everything else it reports about rgw-go is what the rgw-go session reported. The structured figures are in [`data/calibration.yaml`](https://github.com/jhoblitt/ceph-porting-estimate/blob/main/data/calibration.yaml).
