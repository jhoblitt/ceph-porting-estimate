## Prompt sizes and cache lifetimes

Two details of how rgw-go's tokens were spread decide how they are priced: how long each call's prompt was, and how long each cache write was kept. Both come from a second aggregation by the rgw-go session over {{calibration.measurement_detail.calls | countExact}} calls, which reproduces the first one's cache-write total.

### Prompt sizes

For a model with long-context prices, the estimate bills every token category of a call whose prompt is over the threshold at those prices. rgw-go ran on a Claude harness whose context window is far larger than such thresholds and whose prices do not change with prompt size, so nothing in its pricing rewarded short prompts:

::: prompt-sizes

{{computed.port.callsOverThreshold | percent}} of its calls had a prompt over {{calibration.measurement_detail.prompt_size_tokens.threshold | count}} tokens. Those calls held these shares of each category's tokens:

::: long-context-shares

The central scenario bills no call at a long-context rate: an agent run against a sheet that surcharges long prompts would be configured to stay under the threshold. The data's own caveat: {{calibration.measurement_detail.prompt_size_tokens.caveat}}

{{computed.longContextSentence | text}}

Further up the distribution:

::: prompt-above

The transcripts hold {{calibration.measurement_detail.prompt_size_tokens.compaction_markers | countExact}} compaction markers; the calls that summarised the context are probably not among those counted.

::: if computed.hasLongContext

The Methods page's [Prices](#/methods?section=prices) section gives, for each model with long-context prices, its central figure and its figure with these shares billed at those prices.

::: end
::: if not computed.hasLongContext

No model in this report has long-context prices, so these shares change no figure.

::: end

### Where cache writes come from

{{calibration.measurement_detail.cache_write_by_call.low_cache_read_calls.share_of_calls | percent}} of calls, those that read under a tenth of their prompt from cache, carry {{calibration.measurement_detail.cache_write_by_call.low_cache_read_calls.share_of_cache_write | percent}} of the cache-write tokens. In the session's words: {{calibration.measurement_detail.cache_write_by_call.note}} So that part of the bill depends on how the work is split into agents, which a different harness could change.

::: if computed.subagentsDiffer

About {{computed.subagents.note | countExact}} is the session's approximate figure in the words quoted above; {{computed.subagents.port | countExact}} is the port row's own count ([The measurement](#/calibration?section=the-measurement)); the data does not say why they differ.

::: end

### Cache lifetimes

::: if computed.longerCacheWriteCostsMore

Every price sheet in this report charges more for a cache write kept for its longer lifetime.

::: end

Of rgw-go's {{calibration.measurement_detail.cache_write_ttl_tokens.total | countExact}} cache-write tokens, {{calibration.measurement_detail.cache_write_ttl_tokens.long_1h | countExact}} were at the longer lifetime: a share of {{assumptions.params.long_cache_write_share.value | percent}}. The estimate applies that share to every model's longer cache-write tier, whatever lifetime the vendor gives it.
