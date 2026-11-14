## What could make this wrong

Each item carries its effect on the headline for {{computed.target.name}} on {{computed.model.name}} under the {{computed.scenario.label}} scenario, {{computed.quotedHeadline | usd}}: the cost model run again with that one thing changed. Sized items come first, largest effect first; then the items the model cannot size, each with the way it pushes; bytes per token comes last.

::: if computed.smallestIsLast

Its effect is also the smallest of the sized items.

::: end

The estimate is conditional on every component port succeeding. Nothing here is evidence that one would, and no figure on this page prices a port that fails.

::: limitations

**On balance.** Of the sized items, {{computed.limitationCounts.raises | cardinal}} can only raise the figure and {{computed.limitationCounts.lowers | cardinal}} can only lower it.

::: if computed.hasUnsized

{{computed.unsized | text}}

::: end

::: if computed.judgement.made

In this report's judgement the figure is more likely too low than too high. The measured evidence for that is thin: one port, and a test of the calibration rather than of the estimate ([How to check this estimate](#/methods?section=how-to-check-this-estimate)). rgw-go's output per byte of Go added has risen from phase to phase so far, {{computed.judgement.rates | text}}, and the central scenario reflects the average so far, {{computed.judgement.average | rate}} on the phase table's basis (that table gives output per Go token; these rates per byte are its rates divided by {{assumptions.bytes_per_token.go.value | ratio}}, the Go bytes-per-token value). The work still to be done has only to run above that average, not as high as phase {{computed.judgement.latest | countExact}}, for rgw-go's finished rate to end above it; then, with input per output token no lower than measured and the other calibrated parameters as measured, this figure is too low.

::: end
::: if computed.judgement.readSlight

By the session's account phase {{computed.judgement.latest | countExact}} is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue; its Go is also read slightly before its tokens end ([The measurement](#/calibration?section=the-measurement)). That is why this is a judgement, not a finding.

::: end
::: if computed.judgement.readFar

By the session's account phase {{computed.judgement.latest | countExact}} is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue; its Go is also read {{computed.judgement.readDays | cardinal}} days before its tokens end ([The measurement](#/calibration?section=the-measurement)). That is why this is a judgement, not a finding.

::: end
::: if computed.judgement.readOnTime

By the session's account phase {{computed.judgement.latest | countExact}} is unfinished and more review-heavy, and it builds a different kind of feature, so the rise may not continue. That is why this is a judgement, not a finding.

::: end
::: if computed.judgement.lowers

The sized items that can only lower the figure are choices a port could make.

::: end
::: if computed.judgement.hasRanges

{{computed.judgement.ranges | text}}

::: end
::: if computed.judgement.hasAgainst

{{computed.judgement.against | text}}

::: end
::: if not computed.judgement.made

On these items alone the figure could be too low or too high; this report does not judge which is more likely.

::: end
