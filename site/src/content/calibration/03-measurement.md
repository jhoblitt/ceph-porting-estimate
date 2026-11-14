## The measurement

The rgw-go session supplied these totals on {{calibration.measurement.supplied_on}}. Their provenance, as recorded: “{{calibration.measurement.source}}”. The port itself, a controller and its subagents, made {{calibration.measurement.port.calls | countExact}} model calls and used {{computed.port.tokens | tokens}} tokens. {{computed.port.cacheReadShare | percent}} of those tokens were cache reads: an agent re-reads its whole context on every call, and the cache makes that re-reading cheap but not free.

::: port-by-role

Output, the tokens a model writes, is the category every input ratio is measured against. The {{calibration.measurement.tasks | countExact}} tasks reviewed in phases 1 and 2 took {{calibration.measurement.review_passes | countExact}} review passes, {{calibration.measurement.review_passes_per_task | ratio}} per task: a pass is the first review or a scoped re-review after a fix round.

::: if computed.reviewCountsDiffer

{{computed.reviewCounts.agents | countExact}} is the role breakdown's count of review agents, in its review row above; {{computed.reviewCounts.passes | countExact}} is the session's count of review passes. Both are the session's figures; the data does not say why they differ.

::: end

By phase, the port's tokens as the second, later aggregation counts them ([Gaps](#/calibration?section=gaps)), with the Go each phase added:

::: phases

::: if computed.hasGoReadSentence

{{computed.goReadSentence | text}}

::: end

Recorded with the phase table, in the data's words: "{{calibration.phases.note}}"

Some of the session's work served the port without being the port. It is measured separately and left out of the central scenario. It is added back when the switch for the work around the port is on, which you can do on the estimate page.

::: if computed.highIncludesAdjacent

The {{computed.role.high.label}} scenario turns it on.

::: end

::: adjacent-work
