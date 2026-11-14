package data

import (
	"fmt"
	"maps"
	"math"
	"slices"
	"strings"
)

// harnessParams are the parameters whose scenario scales calibration.yaml
// derives from one of rgw-go's phases.
var harnessParams = []string{"overhead", "cache_read_per_output", "cache_write_per_output"}

// tokenCategories are the billed token categories, in the order the
// measurement table gives them.
var tokenCategories = []string{"uncached", "cache_write", "cache_read", "output"}

func (c *calibration) checkModel(models []Model) {
	const path = "measurement.model_id"
	id, ok := c.str(path)
	if ok && !slices.ContainsFunc(models, func(m Model) bool { return m.ID == id }) {
		c.problem(path, "%q names no model in %s", id, ModelsFile)
	}
}

// rgwSizes are rgw-go's Go and the source it ported, in tokens at the
// bytes per token the model applies.
type rgwSizes struct {
	goBPT                  float64
	product, test, tooling float64
	source                 float64
	sourceBytes            float64
}

func (c *calibration) readSizes(a *Assumptions) rgwSizes {
	sz := rgwSizes{goBPT: a.bytesPerToken("go")}
	sz.product = c.positive("sizes.rgw_go.product_go.bytes", c.num("sizes.rgw_go.product_go.bytes")) / sz.goBPT
	sz.test = c.num("sizes.rgw_go.test_go.bytes") / sz.goBPT
	sz.tooling = c.num("sizes.rgw_go.tooling_go.bytes") / sz.goBPT
	sz.source, sz.sourceBytes = c.sourceTokens(a)
	c.record("sizes.source.tokens", sz.source, "Σ sizes.source.by_language ÷ bytes_per_token")
	return sz
}

// sourceTokens converts sizes.source.by_language, bytes per language per
// source group, to tokens with the bytes per token the model applies, and
// returns the bytes too.
func (c *calibration) sourceTokens(a *Assumptions) (tokens, bytes float64) {
	const path = "sizes.source.by_language"
	groups := c.mapping(path)
	if groups == nil {
		return math.NaN(), math.NaN()
	}
	for _, g := range slices.Sorted(maps.Keys(groups)) {
		langs, ok := groups[g].(map[string]any)
		if !ok {
			c.problem(path+"."+g, "is not a mapping")
			return math.NaN(), math.NaN()
		}
		for _, lang := range slices.Sorted(maps.Keys(langs)) {
			b := c.numAt(langs, path+"."+g, lang, false)
			bytes += b
			tokens += b / a.bytesPerToken(lang)
		}
	}
	return tokens, bytes
}

// checkPort recomputes the ratios measured on the whole port, in
// assumptions.yaml and where calibration.yaml's derived block records them.
func (c *calibration) checkPort(a *Assumptions, sz rgwSizes) {
	pr := &a.Params
	port := map[string]float64{}
	for _, cat := range tokenCategories {
		port[cat] = c.num("measurement.port." + cat)
	}
	out := c.positive("measurement.port.output", port["output"])
	surviving := c.positive("sizes.rgw_go product + test + tooling Go", sz.product+sz.test+sz.tooling)
	const ttl = "measurement_detail.cache_write_ttl_tokens"
	longShare := c.num(ttl+".long_1h") / c.positive(ttl+".total", c.num(ttl+".total"))

	c.record("derived.bytes_per_token_go", sz.goBPT, "assumptions.yaml bytes_per_token.go")
	c.record("derived.product_go_tokens", sz.product, "sizes.rgw_go.product_go.bytes ÷ bytes_per_token.go")
	c.record("derived.test_go_tokens", sz.test, "sizes.rgw_go.test_go.bytes ÷ bytes_per_token.go")
	c.record("derived.tooling_go_tokens", sz.tooling, "sizes.rgw_go.tooling_go.bytes ÷ bytes_per_token.go")
	c.record("derived.surviving_go_tokens", sz.product+sz.test+sz.tooling, "product + test + tooling Go tokens")
	c.record(ttl+".long_share", longShare, ttl+" long_1h ÷ total")

	for _, d := range []struct {
		param string
		value *float64
		want  float64
		how   string
	}{
		{
			"test_ratio", pr.TestRatio.Value, (sz.test + sz.tooling) / sz.product,
			"(test + tooling Go tokens) ÷ product Go tokens",
		},
		// measurement's token volumes are in millions, sizes in bytes.
		{
			"overhead", pr.Overhead.Value, port["output"] * 1e6 / surviving,
			"measurement.port output ÷ tokens of all surviving Go",
		},
		{"uncached_per_output", pr.UncachedPerOutput.Value, port["uncached"] / out, "measurement.port uncached ÷ output"},
		{"cache_write_per_output", pr.CacheWritePerOutput.Value, port["cache_write"] / out, "measurement.port cache_write ÷ output"},
		{"cache_read_per_output", pr.CacheReadPerOutput.Value, port["cache_read"] / out, "measurement.port cache_read ÷ output"},
		{"long_cache_write_share", pr.LongCacheWriteShare.Value, longShare, ttl + " long_1h ÷ total"},
	} {
		compare(c.p, "params."+d.param, d.value, d.want, d.how)
		c.record("derived."+d.param, d.want, d.how)
	}

	rows := c.list("measurement.adjacent")
	uplift := map[string]*float64{
		"uncached":    pr.AdjacentUplift.Uncached.Value,
		"cache_write": pr.AdjacentUplift.CacheWrite.Value,
		"cache_read":  pr.AdjacentUplift.CacheRead.Value,
		"output":      pr.AdjacentUplift.Output.Value,
	}
	for _, cat := range tokenCategories {
		sum := 0.0
		for i, row := range rows {
			sum += c.numAt(row, fmt.Sprintf("measurement.adjacent[%d]", i), cat, true)
		}
		want := sum / c.positive("measurement.port."+cat, port[cat])
		how := fmt.Sprintf("Σ measurement.adjacent %s ÷ measurement.port %s", cat, cat)
		compare(c.p, "params.adjacent_uplift."+cat, uplift[cat], want, how)
		c.record("derived.adjacent_uplift."+cat, want, how)
	}
}

// coverageEnds name the coverage keys a scenario's expansion may be taken
// at, in calibration.yaml's coverage.scenario_end.
var coverageEnds = []string{"low", "value", "high"}

// checkCoverage checks the expansion at each coverage end, the coverage
// value against the byte classification it is, and every scenario that
// overrides the expansion against the end calibration.yaml maps it to.
func (c *calibration) checkCoverage(a *Assumptions, sz rgwSizes) {
	source := c.positive("sizes.source.by_language (in tokens)", sz.source)
	expansionAt := map[string]float64{}
	for _, end := range coverageEnds {
		cov := "coverage." + end
		expansionAt[end] = sz.product / (source * c.positive(cov, c.num(cov)))
	}
	how := func(end string) string {
		return "product Go tokens ÷ (source tokens × coverage." + end + ")"
	}
	compare(c.p, "params.expansion", a.Params.Expansion.Value, expansionAt["value"], how("value"))
	c.record("derived.expansion.central", expansionAt["value"], how("value"))
	c.record("derived.expansion.at_low_coverage", expansionAt["low"], how("low"))
	c.record("derived.expansion.at_high_coverage", expansionAt["high"], how("high"))

	const bc = "coverage.byte_classification"
	share := c.num(bc+".ported_bytes") / c.positive("sizes.source.by_language (in bytes)", sz.sourceBytes)
	c.record(bc+".ported_share_bytes", share, bc+".ported_bytes ÷ Σ sizes.source.by_language bytes")
	c.record("coverage.value", c.num(bc+".ported_share_bytes"), bc+".ported_share_bytes")

	const mapPath = "coverage.scenario_end"
	mapping := c.mapping(mapPath)
	for _, id := range slices.Sorted(maps.Keys(mapping)) {
		path := mapPath + "." + id
		sc, ok := a.Scenarios[id]
		if !ok {
			c.problem(path, "names no scenario in %s", AssumptionsFile)
			continue
		}
		end, isString := mapping[id].(string)
		if !isString || !slices.Contains(coverageEnds, end) {
			c.problem(path, "is %v, not one of %s", mapping[id], strings.Join(coverageEnds, ", "))
			continue
		}
		where := fmt.Sprintf("scenarios.%s.overrides.expansion", id)
		got, ok := sc.Overrides["expansion"]
		if !ok {
			c.p.Addf("%s: %s is missing; %s derives it from coverage.%s", AssumptionsFile, where, CalibrationFile, end)
			continue
		}
		compare(c.p, where, &got, expansionAt[end], how(end))
	}
	for _, id := range a.ScenarioIDs() {
		if _, overrides := a.Scenarios[id].Overrides["expansion"]; overrides && mapping != nil {
			if _, mapped := mapping[id]; !mapped {
				c.p.Addf("%s: scenarios.%s.overrides.expansion names no coverage end; map the scenario in %s %s",
					AssumptionsFile, id, CalibrationFile, mapPath)
			}
		}
	}
}

// checkDifficulty checks the difficulty scale against the mix of classes
// rgw-go ported: each multiplier is its relative value over the mix's mean,
// so the model applied to that mix reproduces rgw-go's measured cost, and
// the mix's shares are those of the features it lists.
func (c *calibration) checkDifficulty(a *Assumptions) {
	const mix = "ported_mix"
	c.checkMixFeatures()
	shares := c.mapping(mix + ".share_by_difficulty")
	mean := c.positive(mix+".mean_relative_difficulty", c.num(mix+".mean_relative_difficulty"))
	params := a.Params.Quantities()
	relative := map[Difficulty]float64{}
	for _, d := range Difficulties {
		relative[d] = c.num(fmt.Sprintf("%s.relative_difficulty.%s", mix, d))
		compare(c.p, "params.difficulty."+string(d), params["difficulty."+string(d)].Value, relative[d]/mean,
			fmt.Sprintf("%s.relative_difficulty.%s ÷ %s.mean_relative_difficulty", mix, d, mix))
	}
	if shares == nil {
		return
	}

	var sum, mixRelative, mixParams float64
	for _, k := range slices.Sorted(maps.Keys(shares)) {
		d := Difficulty(k)
		if !slices.Contains(Difficulties, d) {
			c.p.Addf("%s: %s.share_by_difficulty: %q is not one of %s", CalibrationFile, mix, k, difficultyNames())
			return
		}
		share := c.numAt(shares, mix+".share_by_difficulty", k, false)
		sum += share
		mixRelative += share * relative[d]
		mixParams += share * orNaN(params["difficulty."+k].Value)
	}
	if !near(sum, 1, mixTolerancePct) {
		c.p.Addf("%s: %s.share_by_difficulty sums to %s, not 1; they differ by more than %g%%",
			CalibrationFile, mix, show(sum), mixTolerancePct)
	}
	if !near(mean, mixRelative, derivedTolerancePct) {
		c.p.Addf("%s: %s.mean_relative_difficulty is %g, but its mix gives %s (Σ %s.share_by_difficulty × %s.relative_difficulty); they differ by more than %g%%",
			CalibrationFile, mix, mean, show(mixRelative), mix, mix, derivedTolerancePct)
	}
	if !near(mixParams, 1, mixTolerancePct) {
		c.p.Addf("%s: params.difficulty averages %s over rgw-go's ported mix (Σ %s.share_by_difficulty × params.difficulty), not 1; they differ by more than %g%%",
			AssumptionsFile, show(mixParams), mix, mixTolerancePct)
	}
}

// checkMixFeatures recomputes the mix's shares, and the byte
// classification's ported bytes, from the features the mix lists.
func (c *calibration) checkMixFeatures() {
	const mix = "ported_mix"
	byClass := map[Difficulty]float64{}
	total := 0.0
	for i, f := range c.list(mix + ".features") {
		base := fmt.Sprintf("%s.features[%d]", mix, i)
		bytes := c.numAt(f, base, "bytes", false)
		v, path, ok := c.at(f, base, "difficulty")
		d, isString := v.(string)
		switch {
		case !ok:
			c.problem(path, "is missing")
		case !isString || !slices.Contains(Difficulties, Difficulty(d)):
			c.problem(path, "is %v, not one of %s", v, difficultyNames())
		}
		byClass[Difficulty(d)] += bytes
		total += bytes
	}
	c.record("coverage.byte_classification.ported_bytes", total, mix+".features: Σ bytes")
	total = c.positive(mix+".features: Σ bytes", total)
	for _, d := range Difficulties {
		path := fmt.Sprintf("%s.share_by_difficulty.%s", mix, d)
		if _, _, listed := c.at(c.doc, "", path); listed || byClass[d] > 0 {
			c.record(path, byClass[d]/total, fmt.Sprintf("%s.features: bytes in %s features ÷ all", mix, d))
		}
	}
}

// phaseTotals are one implementation phase's figures, or all phases'.
type phaseTotals struct {
	output, cacheRead, cacheWrite float64
	goBytes                       float64 // Go bytes added on main during the phase
	goTokens                      float64
}

// checkPhases checks the phase table's derived block, each scenario scale
// calibration.yaml derives from a phase (that phase's ratio over all
// phases'), and that every scenario scaling a harness parameter has such a
// phase. Each row gives the Go bytes on main at the phase's end, so the
// rows must be in phase order and a phase added the difference from the
// row before.
func (c *calibration) checkPhases(a *Assumptions) {
	goBPT := a.bytesPerToken("go")
	byPhase := map[float64]phaseTotals{}
	var all phaseTotals
	var prevBytes, prevPhase float64
	for i, row := range c.list("phases.rows") {
		base := fmt.Sprintf("phases.rows[%d]", i)
		n := c.numAt(row, base, "phase", false)
		if i > 0 && n <= prevPhase {
			c.problem(base+".phase", "is %s, not after phases.rows[%d].phase %s; the rows must be in phase order",
				show(n), i-1, show(prevPhase))
		}
		end := c.numAt(row, base, "go_bytes.product", false) + c.numAt(row, base, "go_bytes.test", false)
		added := c.positive(base+".go_bytes added since the row before", end-prevBytes)
		t := phaseTotals{
			output:     c.positive(base+".output", c.numAt(row, base, "output", false)),
			cacheRead:  c.numAt(row, base, "cache_read", false),
			cacheWrite: c.numAt(row, base, "cache_write", false),
			goBytes:    added,
			goTokens:   added / goBPT,
		}
		c.recordPhase("phase_"+show(n), t, base)
		prevBytes, prevPhase = end, n
		byPhase[n] = t
		all.output += t.output
		all.cacheRead += t.cacheRead
		all.cacheWrite += t.cacheWrite
		all.goBytes += t.goBytes
		all.goTokens += t.goTokens
	}
	c.recordPhase("all_phases", all, "phases.rows")

	const path = "phases.scenario_phase"
	mapping := c.mapping(path)
	for _, id := range slices.Sorted(maps.Keys(mapping)) {
		sc, ok := a.Scenarios[id]
		if !ok {
			c.problem(path+"."+id, "names no scenario in %s", AssumptionsFile)
			continue
		}
		n := c.numAt(mapping, path, id, false)
		t, ok := byPhase[n]
		if !ok {
			if !math.IsNaN(n) {
				c.p.Addf("%s: %s.%s: phase %g is not in phases.rows", CalibrationFile, path, id, n)
			}
			continue
		}
		for _, r := range []struct {
			param, how string
			ratio      float64
		}{
			{"overhead", "output per Go token added", (t.output / t.goTokens) / (all.output / all.goTokens)},
			{"cache_read_per_output", "cache_read per output", (t.cacheRead / t.output) / (all.cacheRead / all.output)},
			{"cache_write_per_output", "cache_write per output", (t.cacheWrite / t.output) / (all.cacheWrite / all.output)},
		} {
			where := fmt.Sprintf("scenarios.%s.scale.%s", id, r.param)
			got, ok := sc.Scale[r.param]
			if !ok {
				c.p.Addf("%s: %s is missing; %s derives it from phase %g", AssumptionsFile, where, CalibrationFile, n)
				continue
			}
			compare(c.p, where, &got, r.ratio, fmt.Sprintf("phase %g ÷ all phases, %s", n, r.how))
		}
	}
	if mapping == nil {
		return
	}
	for _, id := range a.ScenarioIDs() {
		if _, mapped := mapping[id]; mapped {
			continue
		}
		for _, param := range harnessParams {
			if _, scaled := a.Scenarios[id].Scale[param]; scaled {
				c.p.Addf("%s: scenarios.%s.scale.%s is not derived from a phase; map the scenario in %s %s",
					AssumptionsFile, id, param, CalibrationFile, path)
			}
		}
	}
}

// recordPhase checks the derived figures phases.derived.<key> records for
// one phase, or for all of them.
func (c *calibration) recordPhase(key string, t phaseTotals, from string) {
	base := "phases.derived." + key
	c.record(base+".go_bytes_added", t.goBytes, from+": Go bytes added")
	// The table's token volumes are in millions.
	c.record(base+".output_per_go_token", t.output*1e6/t.goTokens, from+": output ÷ Go tokens added")
	c.record(base+".cache_read_per_output", t.cacheRead/t.output, from+": cache_read ÷ output")
	c.record(base+".cache_write_per_output", t.cacheWrite/t.output, from+": cache_write ÷ output")
}

// checkLongContext checks every scenario that overrides a long-context
// share against rgw-go's measured shares: a scenario listed in
// long_context_scenarios must set all four to them, and one that sets any
// must be listed.
func (c *calibration) checkLongContext(a *Assumptions) {
	const base = "measurement_detail.prompt_size_tokens"
	listPath := base + ".long_context_scenarios"
	listed := map[string]bool{}
	for i, v := range c.list(listPath) {
		item := fmt.Sprintf("%s[%d]", listPath, i)
		id, isString := v.(string)
		if !isString {
			c.problem(item, "is not a string")
			continue
		}
		sc, ok := a.Scenarios[id]
		if !ok {
			c.problem(item, "%q names no scenario in %s", id, AssumptionsFile)
			continue
		}
		listed[id] = true
		for _, cat := range tokenCategories {
			share := base + ".share_over_threshold." + cat
			want := c.num(share)
			where := fmt.Sprintf("scenarios.%s.overrides.long_context_share.%s", id, cat)
			got, ok := sc.Overrides["long_context_share."+cat]
			if !ok {
				c.p.Addf("%s: %s is missing; %s derives it from %s", AssumptionsFile, where, CalibrationFile, share)
				continue
			}
			compare(c.p, where, &got, want, share)
		}
	}
	if c.reported[listPath] {
		return
	}
	for _, id := range a.ScenarioIDs() {
		if listed[id] {
			continue
		}
		for _, path := range slices.Sorted(maps.Keys(a.Scenarios[id].Overrides)) {
			if strings.HasPrefix(path, "long_context_share.") {
				c.p.Addf("%s: scenarios.%s.overrides.%s is not derived from rgw-go's shares; list the scenario in %s %s",
					AssumptionsFile, id, path, CalibrationFile, listPath)
			}
		}
	}
}
