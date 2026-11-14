## From measurement to parameters

Each calibrated parameter is one division. The input ratios divide each input category of the port row above by its output; the overhead divides that output by the Go measured in git; the test ratio and the expansion divide sizes measured in git; the adjacent-work uplifts divide the adjacent rows by the port row; and the cache-lifetime split, the long-context shares and the phase table that the scenarios' phase scales divide come from the second aggregation described under [Prompt sizes and cache lifetimes](#/calibration?section=prompt-sizes-and-cache-lifetimes) and in [Gaps](#/calibration?section=gaps). Tokens of Go are bytes ÷ {{assumptions.bytes_per_token.go.value | decimal}}, the Go bytes-per-token assumption.

::: derived-ratios

::: if computed.backTestLateReadSlight

The {{computed.role.low.label}} and {{computed.role.high.label}} scenarios' overhead scales divide a phase's output per Go token by the all-phases one. Phase {{computed.backTest.late | countExact}}'s Go is read slightly before its tokens end ([The measurement](#/calibration?section=the-measurement)), which leaves phase {{computed.backTest.late | countExact}}'s rate, and to a lesser degree the all-phases rate, if anything slightly high: so the {{computed.role.high.label}} scenario's overhead scale leans slightly high and the {{computed.role.low.label}} scenario's slightly low. Their cache scales are per output token and do not depend on Go.

::: end
::: if computed.backTestLateReadFar

The {{computed.role.low.label}} and {{computed.role.high.label}} scenarios' overhead scales divide a phase's output per Go token by the all-phases one. Phase {{computed.backTest.late | countExact}}'s Go is read {{computed.backTestLateRead.days | cardinal}} days before its tokens end ([The measurement](#/calibration?section=the-measurement)), which leaves phase {{computed.backTest.late | countExact}}'s rate, and to a lesser degree the all-phases rate, if anything high: so the {{computed.role.high.label}} scenario's overhead scale leans high and the {{computed.role.low.label}} scenario's low. Their cache scales are per output token and do not depend on Go.

::: end

Three choices behind those divisions:

- **The overhead counts all surviving Go.** `H` divides output by product, test and tooling Go together, because the port wrote all three. It does not depend on how much of radosgw rgw-go covers. Test data, Markdown plans and the other Go in the repository are left out, so the plans, registers and rewritten drafts the session produced are paid for inside `H` rather than counted as code.
- **The test ratio includes tooling.** `T` counts test and tooling Go together per token of product Go. The tooling, under `hack/`, is an s3-tests harness, a citation checker and benchmarks: code a port writes to verify itself, not code it ships.
- **The input ratios use the port row only.** The work around the port has its own uplift, measured as the adjacent rows over the port row (a dash counted as zero, an approximate value used as given), and applied only when that switch is on.

### The expansion depends on coverage

`E` is the only parameter that needs to know how much of radosgw rgw-go replaced. The RGW source at {{calibration.sizes.source.tag}} is {{calibration.sizes.source.tokens | countExact}} tokens by the same bytes-per-token values the model applies to Ceph; rgw-go's product code replaces an estimated share of it. Fewer source tokens replaced means more Go per source token, so the lower the coverage, the higher `E` and every figure under the central scenario:

::: expansion-by-coverage
