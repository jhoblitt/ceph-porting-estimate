## The cost model

A few lines of arithmetic per feature, summed. The specification is [`docs/cost-model.md`](https://github.com/jhoblitt/ceph-porting-estimate/blob/main/docs/cost-model.md); the code that runs in your browser implements it. A unit test checks that, given rgw-go's own size, it gives back rgw-go's measured token totals: a consistency check, not a validation, since it holds for any coverage and there is no second port to test against. In reading order:

### Tokens from bytes

```
S = Σ over the feature's languages of  bytes ÷ bpt[language]
```

- `S`: the feature's source tokens. Binary files are skipped.
- `bpt`: bytes per token, by language; see the table below. No tokenizer is run.

### Work

```
W = S × D[class] × F[target]
```

- `D`: the difficulty multiplier for the feature's class (the [difficulty table](#/methods?section=difficulty)).
- `F`: the target factor. Go is the measured target, so its factor is one; Rust is `rust_factor`; WASM is `rust_factor × wasm_overhead`, {{computed.wasmFactor | multiplier}} Go's work.

### Code, tests and output

```
code  = W × E
R     = Σ S of headline tests ÷ Σ S of headline product code
T_new = max(0, T − R)

out   = code × (1 + T_new) × H × M × C      product code
out   = code × H × M × C                    tests and configuration
```

- `E`: expansion, tokens of product code rgw-go wrote per token of source it ported. rgw-go's product Go counts its comments, {{calibration.sizes.rgw_go.product_go_comments.share_of_product_go_bytes | percent}} of its bytes, many citing the C++ they replace, so this is not a code-size ratio.
- `R`: the tests Ceph already has, per token of product code, in raw source tokens; computed once over the headline. `T`: the test volume a finished port has per token of product code. Only the shortfall `T_new` is written as new tests ([scope](#/methods?section=how-existing-tests-are-treated)).
- `H`: overhead, output tokens emitted per token of code that survives. It holds the review passes, rework and discarded drafts.
- `M`: model efficiency, tokens a model needs for the same work relative to the model rgw-go was measured on.
- `C`: the clean-break factor, applied only when the clean-break switch is on.

### Input

```
uncached    = out × u + W × p
cache write = out × w
cache read  = out × r
```

- `u`, `w`, `r`: uncached input, cache-write and cache-read tokens per output token, measured on rgw-go.
- `p`: extra uncached reads of the source; zero except in the reference scenario.

Input is not proportional to source size: an agent re-reads its context on every call, so input follows the number of calls. That it follows output at a fixed ratio, rgw-go's whole-project ratio, is a modelling choice, which one aggregate cannot show; rgw-go's own phases differ, and the low and high scenarios take two of them. Cache reads were {{computed.port.cacheReadShare | percent}} of all the tokens rgw-go's port used.

::: if computed.interpretation.hasCacheShare

At {{computed.model.name}}'s list prices, cache reads and writes together, the re-read context, are {{computed.interpretation.cacheShare | percent}} of the headline's dollars, so the estimate moves almost in proportion to those prices and to the cache-read and cache-write tokens per output token.

::: end

With the switch for the work around the port on, each of the four categories is multiplied by one plus its adjacent-work uplift `A`.

### Dollars

```
price(x, cat) = (1 − σ[cat]) × P.x  +  σ[cat] × P.long_context.x
write price   = (1 − λ) × price(cache_write_short, cache_write)
              +      λ  × price(cache_write_long, cache_write)

usd = ( uncached    × price(input, uncached)
      + cache write × write price
      + cache read  × price(cache_read, cache_read)
      + out         × price(output, output) ) ÷ one million
```

- `P`: the model's list prices per million tokens ([Prices](#/methods?section=prices)); `x` names a price, `cat` the token category it applies to.
- `σ`: the share of each category's tokens that rgw-go sent in calls whose prompt exceeded {{calibration.measurement_detail.prompt_size_tokens.threshold | count}} tokens. It is zero in the central scenario: an agent run against a price sheet that surcharges long prompts would be configured to stay under the threshold. rgw-go's shares were measured at that one threshold on a harness with no surcharge. {{computed.longContextSentence | text}} For a model without them, `price(x, cat)` is just `P.x`.
- `λ`: the share of cache writes at the longer of the two cache lifetimes.

Every model is priced on the same token volumes. `M` is the only per-model adjustment to volume.

::: if computed.sameModelEfficiency

In this data every model's `M` is the same, so the comparison across models is the same work on a different price sheet.

::: end

### Every parameter

Measured values come from the rgw-go port ([Calibration](#/calibration)); the rest are assumptions, each with its reason.

::: params

### Bytes per token

Tokens are derived from bytes, so the method is the same for every model and needs no tokenizer. The values are assumptions, typical of current Claude-family tokenizers on source code; none was measured.

::: bytes-per-token

For C++ the value's error cancels. The expansion `E` is calibrated as rgw-go's Go tokens over the tokens of the RGW source they replaced, nearly all of it C++, both computed from bytes with these same values; the overhead `H` is output tokens over Go tokens. Multiply them through and a C++ feature's output depends on its bytes, not on the C++ or the Go value. C++ is {{computed.headlineLanguageShare.cpp | percent}} of the headline's code lines. What does move the estimate is each other language's value relative to C++: Python, at {{computed.headlineLanguageShare.python | percent}} of the headline lines, is the next largest.
