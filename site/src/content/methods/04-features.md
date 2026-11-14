## From files to features

The smallest unit the estimate prices is a feature: a named set of path globs into the Ceph tree, such as RGW's multisite sync or BlueStore's allocators. Features make up components (the OSD, the monitor, RGW's core), and components sit under groups (RADOS core, Crimson, the object gateway). At this commit {{computed.counts.features | countExact}} features in {{computed.counts.components | countExact}} components under {{computed.counts.groups | countExact}} groups hold the counted files. Each feature carries a scope, a kind (product, test or configuration), a difficulty class and a written reason for that class.

A file belongs to the feature whose matching glob is the most specific: the longest literal prefix wins, then the most literal characters. Two features tied on both is an error the data check reports, and so is a file no glob claims beyond a small allowance; at this commit every file is claimed. The rules and the taxonomy files are in the [repository's README](https://github.com/jhoblitt/ceph-porting-estimate/blob/main/README.md) and [`data/taxonomy/`](https://github.com/jhoblitt/ceph-porting-estimate/tree/main/data/taxonomy).

### Difficulty

The difficulty class scales the work a feature takes per token of source. The classes are judged relative to each other, and the scale is normalised so that the model, applied to the source rgw-go ported, reproduces rgw-go's measured cost: mapped onto the taxonomy, what rgw-go ported averages {{calibration.ported_mix.mean_relative_difficulty | ratio}} on the relative scale, and each multiplier is its relative value divided by that. Configuration of any rating (suite YAML, for instance) is priced as configuration.

::: difficulty-classes

Which class a feature gets is a judgement, recorded with its reason in the taxonomy. Code rated hard or extreme is {{computed.aboveStandard.lines | percent}} of the headline lines but, once its multiplier applies, {{computed.aboveStandard.output | percent}} of the headline's output tokens. Those weights are assumptions: the normalisation fixes only their average over what rgw-go ported, and nothing harder than that mix was measured.
