## Prices

Each model's standard-tier list prices, read from the vendor's own pricing page on the day shown. The figures for the other models are {{computed.model.name}}'s measured token counts priced on each model's sheet: a comparison of price sheets, not of models.

::: if computed.hasLongContext

Every price in the estimate is one of these, or one of the long-context prices below.

::: end
::: if not computed.hasLongContext

Every price in the estimate is one of these.

::: end

::: prices

::: if computed.hasLongContext

Some models charge more for calls whose prompt is longer than a threshold. The central scenario bills no call at that rate: an agent run against such a sheet would be configured to stay under it. The share billed in the comparison below is the share of each token category that rgw-go sent in calls whose prompt exceeded {{calibration.measurement_detail.prompt_size_tokens.threshold | count}} tokens, measured at that one threshold and applied unchanged to each such model, whatever its own threshold. See [What could make this wrong](#/methods?section=what-could-make-this-wrong).

::: long-context-prices

::: end
::: if computed.longContextBilled

Billing rgw-go's share of long prompts at those prices, {{computed.longContextAs | text}}, raises each such model's {{computed.target.name}} figure by up to {{computed.longContextRise | percent}}. Each one's central figure, beside the figure with those shares billed:

::: end
::: if computed.longContextUnbilled

Billing rgw-go's share of long prompts at those prices raises each such model's {{computed.target.name}} figure by up to {{computed.longContextRise | percent}}; no scenario in this report bills exactly those shares. Each one's central figure, beside the figure with those shares billed:

::: end
::: if computed.hasLongContext

::: long-context-effect

::: end
::: if not computed.hasLongContext

No model in this report has long-context prices: each bills its whole context window at the prices above.

::: end

### One row per model

The estimate page's comparison has one row per model and one column per target. Only {{computed.model.name}}'s token use was measured. Every other row is {{computed.model.name}}'s token counts priced on that model's sheet, so the rows differ because the price sheets do: it is not a measurement of which model would port Ceph most cheaply, and how many tokens any other model would need for the same work is not known.

::: if computed.interpretation.hasBreakEvens

Each other row's break-even says how many fewer or more tokens that model would have to need, for the same work, to cost what {{computed.model.name}} does:

::: break-evens

::: end

Not modelled: batch and flex tiers, which discount a request that can wait; fast or priority tiers, which charge more for lower latency; and regional or data-residency inference, which charges more to keep processing in one place. Each is a multiplier on the prices above. Negotiated discounts and subscription plans are outside the estimate too.
