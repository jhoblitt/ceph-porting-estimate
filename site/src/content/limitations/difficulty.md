**The difficulty classes are judgements.** Each feature's class is a judgement, and the classes' weights relative to each other are assumptions. The scale is normalised so that the model, applied to the source rgw-go ported, reproduces rgw-go's cost: the relative scale averages {{calibration.ported_mix.mean_relative_difficulty | ratio}} over that mix, itself a mapping judgement. How much harder consensus, peering, BlueStore or Crimson are than that mix was not measured. Code rated hard or extreme carries {{computed.aboveStandard.output | percent}} of the headline's output tokens.

::: if computed.hasLowHigh

The range is the {{computed.role.low.label}} and {{computed.role.high.label}} scenarios' difficulty settings.

::: end
