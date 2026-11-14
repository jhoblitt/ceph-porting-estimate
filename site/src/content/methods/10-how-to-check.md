## How to check this estimate

The only test the model passes today is a consistency check: given rgw-go's own size it gives back rgw-go's measured tokens, which holds for any coverage because the parameters come from the same measurement. There is no second port to test it against. rgw-go's phases give two checks that are not circular.

### A check that can be made today

::: if computed.hasBackTest

Calibrate on one of rgw-go's phases alone and predict the next, from the phase table on the Calibration page ([The measurement](#/calibration?section=the-measurement)). That table gives output per Go token added; the output rates here are per Go byte, its rates divided by {{assumptions.bytes_per_token.go.value | ratio}}, the Go bytes-per-token value, and the cache-read rates follow from its cache reads per output token. Phase {{computed.backTest.early | countExact}} used {{computed.rates.early.outputPerGoByte | rate}} output tokens and {{computed.rates.early.cacheReadPerGoByte | ratio}} cache-read tokens per byte of Go it added. At those rates, phase {{computed.backTest.late | countExact}}'s Go would have taken:

::: back-test

::: end
::: if computed.backTestUnder

Phase {{computed.backTest.early | countExact}}'s rates under-predict phase {{computed.backTest.late | countExact}}: the prediction is {{computed.backTest.outputGap | signedPercent}} against what was used in output tokens, and {{computed.backTest.usdGap | signedPercent}} in dollars at {{computed.model.name}}'s list prices. By the session's account phase {{computed.backTest.late | countExact}} is unfinished and more review-heavy, and it builds a different kind of feature; the session also reports that the port's ratios rise from phase to phase, and that is why the {{computed.role.high.label}} scenario takes phase {{computed.backTest.late | countExact}}'s rates. A model calibrated on rgw-go's phase {{computed.backTest.early | countExact}} alone would have been too low for the next.

::: end
::: if computed.backTestOver

Phase {{computed.backTest.early | countExact}}'s rates over-predict phase {{computed.backTest.late | countExact}}: the prediction is {{computed.backTest.outputGap | signedPercent}} against what was used in output tokens, and {{computed.backTest.usdGap | signedPercent}} in dollars at {{computed.model.name}}'s list prices. The two phases built different features, and phase {{computed.backTest.late | countExact}} may be unfinished, so the gap says the rates moved between phases, not which way the remaining work will go. A model calibrated on rgw-go's phase {{computed.backTest.early | countExact}} alone would have been too high for the next.

::: end
::: if computed.backTestLateReadSlight

Phase {{computed.backTest.late | countExact}}'s Go is read at {{computed.backTestLateRead.at | text}}, the day before its tokens end at {{computed.backTestLateRead.ends | text}} ([The measurement](#/calibration?section=the-measurement)), so phase {{computed.backTest.late | countExact}}'s rates per Go byte, on which this check rests, are if anything slightly overstated.

::: end
::: if computed.backTestLateReadFar

Phase {{computed.backTest.late | countExact}}'s Go is read at {{computed.backTestLateRead.at | text}}, {{computed.backTestLateRead.days | cardinal}} days before its tokens end at {{computed.backTestLateRead.ends | text}} ([The measurement](#/calibration?section=the-measurement)), so phase {{computed.backTest.late | countExact}}'s rates per Go byte, on which this check rests, are if anything overstated.

::: end
::: if not computed.hasBackTest

The data has no phase table with a low and a high scenario's phases to calibrate on, so this check cannot be made from it.

::: end

### A check that will be possible soon

::: if computed.hasBackTest

No prediction of the remaining work's tokens is made here. The data records the session's own scope shares only as text: in scope for the phases begun so far, "{{calibration.coverage.session_bytes.in_scope_phases_0_to_2}}"; phase 3, not started, "{{calibration.coverage.session_bytes.phase_3_not_started}}"; and, by lines, "{{calibration.coverage.session_estimate.breakdown.in_scope_phases_0_to_2}}". These do not give the share of the source still to be written: part of what is in scope and not ported is code inside files the port has already worked on, which it leaves out by design ([Coverage](#/calibration?section=coverage)).

What can be checked is the rate. When rgw-go finishes, divide all the output tokens its port used by all the Go it added: the whole-project rate the central scenario would be recalibrated to. On the phase table's basis it is {{computed.rates.all.outputPerGoByte | rate}} output tokens per Go byte so far, and phase {{computed.backTest.late | countExact}}'s alone is {{computed.rates.late.outputPerGoByte | rate}}. Provided the input ratios per output token stay as measured, a finished rate above {{computed.rates.all.outputPerGoByte | rate}} would mean the central figure is too low, and below it, too high: most of the dollars are re-read context, which the model ties to output at those ratios, so a rate of output alone says nothing about dollars if those ratios move. On the same proviso, only a finished whole-project rate above phase {{computed.backTest.late | countExact}}'s would put the {{computed.role.high.label}} scenario's harness setting below it too, and that scenario's other assumptions (coverage, difficulty, the work around the port) are not tested by a rate.

::: end
::: if not computed.hasBackTest

When rgw-go finishes its remaining phases, divide all the output tokens its port used by all the Go it added; provided the input ratios per output token stay as measured, a whole-project rate above the one this estimate rests on would mean the central figure is too low, and one below it that it is too high.

::: end
