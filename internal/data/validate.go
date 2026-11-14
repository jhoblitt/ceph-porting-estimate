package data

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"github.com/bmatcuk/doublestar/v4"
)

// Validate checks the set's schema and its cross-file references, and
// returns every problem it finds. Checks that need glob matching are the
// rollup package's.
func Validate(s *Set) Problems {
	var p Problems
	validateTaxonomy(&p, s.Groups, s.Components)
	validateDependencies(&p, s.Dependencies, &s.SLOC)
	validateModels(&p, s.Models, &s.Assumptions)
	validateAssumptions(&p, &s.Assumptions, &s.SLOC)
	validateSLOC(&p, &s.SLOC)
	return p
}

func validateTaxonomy(p *Problems, groups []Group, components []Component) {
	defined := validateGroups(p, groups)
	used := map[string]bool{}
	seen := map[string]string{}
	for i := range components {
		c := &components[i]
		where := fmt.Sprintf("%s: component %q", c.File, c.ID)
		switch c.ID {
		case "":
			where = fmt.Sprintf("%s: component #%d", c.File,
				positionInFile(i, func(j int) string { return components[j].File }))
			p.Addf("%s: id is empty", where)
		case UnclassifiedID, DependenciesID:
			p.Addf("%s: the id is reserved", where)
		}
		if c.ID != "" {
			if prev, ok := seen[c.ID]; ok {
				p.Addf("%s is also defined in %s", where, prev)
			} else {
				seen[c.ID] = c.File
			}
		}
		switch _, ok := defined[c.Group]; {
		case c.Group == "":
			p.Addf("%s: group is empty", where)
		case !ok:
			p.Addf("%s: group %q is not defined in any groups list", where, c.Group)
		}
		used[c.Group] = true
		if c.Name == "" {
			p.Addf("%s: name is empty", where)
		}
		if len(c.Features) == 0 {
			p.Addf("%s: features is empty", where)
		}
		validateFeatures(p, where, c.Features)
	}
	for i := range groups {
		g := &groups[i]
		if g.ID != "" && !used[g.ID] && defined[g.ID] == g.File {
			p.Addf("%s: group %q is used by no component", g.File, g.ID)
			used[g.ID] = true
		}
	}
}

// validateGroups checks each group and returns the file defining each
// group id first.
func validateGroups(p *Problems, groups []Group) map[string]string {
	defined := map[string]string{}
	for i := range groups {
		g := &groups[i]
		where := fmt.Sprintf("%s: group %q", g.File, g.ID)
		switch g.ID {
		case "":
			where = fmt.Sprintf("%s: group #%d", g.File,
				positionInFile(i, func(j int) string { return groups[j].File }))
			p.Addf("%s: id is empty", where)
		case UnclassifiedID, DependenciesID:
			p.Addf("%s: the id is reserved", where)
		}
		if g.ID != "" {
			if prev, ok := defined[g.ID]; ok {
				p.Addf("%s is also defined in %s", where, prev)
			} else {
				defined[g.ID] = g.File
			}
		}
		if g.Name == "" {
			p.Addf("%s: name is empty", where)
		}
		if g.Description == "" {
			p.Addf("%s: description is empty", where)
		}
	}
	return defined
}

// positionInFile is the 1-based position of entry i within its own
// taxonomy file, given each entry's file.
func positionInFile(i int, fileOf func(int) string) int {
	n := 0
	for j := range i + 1 {
		if fileOf(j) == fileOf(i) {
			n++
		}
	}
	return n
}

func validateFeatures(p *Problems, component string, features []Feature) {
	seen := map[string]bool{}
	for i := range features {
		f := &features[i]
		where := fmt.Sprintf("%s feature %q", component, f.ID)
		if f.ID == "" {
			where = fmt.Sprintf("%s feature #%d", component, i+1)
			p.Addf("%s: id is empty", where)
		} else if seen[f.ID] {
			p.Addf("%s: feature %q is defined twice", component, f.ID)
		}
		seen[f.ID] = true
		if f.Name == "" {
			p.Addf("%s: name is empty", where)
		}
		if len(f.Globs) == 0 {
			p.Addf("%s: globs is empty", where)
		}
		for _, g := range f.Globs {
			if !doublestar.ValidatePattern(g) {
				p.Addf("%s: glob %q is not a valid pattern", where, g)
			}
		}
		checkEnum(p, where, "scope", f.Scope, Scopes)
		checkEnum(p, where, "kind", f.Kind, Kinds)
		checkEnum(p, where, "difficulty", f.Difficulty, Difficulties)
	}
}

func checkEnum[T ~string](p *Problems, where, field string, v T, allowed []T) {
	if slices.Contains(allowed, v) {
		return
	}
	names := make([]string, len(allowed))
	for i, a := range allowed {
		names[i] = string(a)
	}
	p.Addf("%s: %s %q is not one of %s", where, field, v, strings.Join(names, ", "))
}

func validateDependencies(p *Problems, deps []Dependency, sloc *SLOC) {
	submodules := map[string]bool{}
	for _, sm := range sloc.Submodules {
		submodules[sm.Path] = true
	}
	seen := map[string]bool{}
	listedBy := map[string]string{}
	for i := range deps {
		d := &deps[i]
		where := fmt.Sprintf("%s: dependency %q", DependenciesFile, d.ID)
		if d.ID == "" {
			where = fmt.Sprintf("%s: dependency #%d", DependenciesFile, i+1)
			p.Addf("%s: id is empty", where)
		} else if seen[d.ID] {
			p.Addf("%s is defined twice", where)
		}
		seen[d.ID] = true
		if d.Name == "" {
			p.Addf("%s: name is empty", where)
		}
		if d.UsedFor == "" {
			p.Addf("%s: used_for is empty", where)
		}
		for _, sm := range d.Submodules {
			if !submodules[sm] {
				p.Addf("%s: submodule %q is not in %s", where, sm, SLOCFile)
			}
			switch prev, ok := listedBy[sm]; {
			case !ok:
				listedBy[sm] = d.ID
			case prev == d.ID:
				p.Addf("%s: submodule %q is listed twice", where, sm)
			default:
				p.Addf("%s: submodule %q is also listed by dependency %q", where, sm, prev)
			}
		}
		for _, t := range slices.Sorted(maps.Keys(d.Targets)) {
			if !slices.Contains(Targets, t) {
				p.Addf("%s: target %q is not one of %s", where, t, strings.Join(Targets, ", "))
			}
		}
		for _, t := range Targets {
			dt, ok := d.Targets[t]
			if !ok {
				p.Addf("%s: target %q is missing", where, t)
				continue
			}
			validateDependencyTarget(p, fmt.Sprintf("%s target %q", where, t), &dt)
		}
	}
}

func validateDependencyTarget(p *Problems, where string, t *DependencyTarget) {
	checkEnum(p, where, "strategy", t.Strategy, Strategies)
	switch {
	case t.SLOCEquivalent == nil:
		p.Addf("%s: sloc_equivalent is missing", where)
	case (t.Strategy == StrategyNative || t.Strategy == StrategyDrop) && *t.SLOCEquivalent != 0:
		p.Addf("%s: sloc_equivalent must be 0 for strategy %s", where, t.Strategy)
	case *t.SLOCEquivalent < 0:
		p.Addf("%s: sloc_equivalent is negative", where)
	}
	if t.Difficulty == "" {
		p.Addf("%s: difficulty is missing", where)
	} else {
		checkEnum(p, where, "difficulty", t.Difficulty, Difficulties)
	}
	if t.Note == "" {
		p.Addf("%s: note is empty", where)
	}
}

func validateModels(p *Problems, models []Model, a *Assumptions) {
	seen := map[string]bool{}
	for i := range models {
		m := &models[i]
		where := fmt.Sprintf("%s: model %q", ModelsFile, m.ID)
		if m.ID == "" {
			where = fmt.Sprintf("%s: model #%d", ModelsFile, i+1)
			p.Addf("%s: id is empty", where)
		} else {
			if seen[m.ID] {
				p.Addf("%s is defined twice", where)
			}
			if _, ok := a.Params.ModelEfficiency[m.ID]; !ok {
				p.Addf("%s has no params.model_efficiency entry in %s", where, AssumptionsFile)
			}
		}
		seen[m.ID] = true
		for _, f := range [][2]string{{"name", m.Name}, {"vendor", m.Vendor}, {"source", m.Source}} {
			if f[1] == "" {
				p.Addf("%s: %s is empty", where, f[0])
			}
		}
		switch _, err := time.Parse(time.DateOnly, m.ReadOn); {
		case m.ReadOn == "":
			p.Addf("%s: read_on is empty", where)
		case err != nil:
			p.Addf("%s: read_on %q is not a YYYY-MM-DD date", where, m.ReadOn)
		}
		validatePrices(p, where, "usd_per_mtok", &m.USDPerMTok)
		if m.CacheWriteTTL.Short == "" || m.CacheWriteTTL.Long == "" {
			p.Addf("%s: cache_write_ttl needs both short and long labels", where)
		}
		if lc := m.LongContext; lc != nil {
			if lc.ThresholdTokens == nil {
				p.Addf("%s: long_context.threshold_tokens is missing", where)
			} else if *lc.ThresholdTokens <= 0 {
				p.Addf("%s: long_context.threshold_tokens must be positive", where)
			}
			validatePrices(p, where, "long_context", &lc.Prices)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(a.Params.ModelEfficiency)) {
		if !seen[id] {
			p.Addf("%s: params.model_efficiency.%s names no model in %s", AssumptionsFile, id, ModelsFile)
		}
	}
}

func validatePrices(p *Problems, where, prefix string, pr *Prices) {
	for _, f := range []struct {
		name string
		v    *float64
	}{
		{"input", pr.Input},
		{"cache_write_short", pr.CacheWriteShort},
		{"cache_write_long", pr.CacheWriteLong},
		{"cache_read", pr.CacheRead},
		{"output", pr.Output},
	} {
		switch {
		case f.v == nil:
			p.Addf("%s: %s.%s is missing", where, prefix, f.name)
		case *f.v < 0:
			p.Addf("%s: %s.%s is negative", where, prefix, f.name)
		}
	}
}

func validateAssumptions(p *Problems, a *Assumptions, sloc *SLOC) {
	if a.Ceph.Repo != sloc.Repo {
		p.Addf("%s: ceph.repo %q does not match %s repo %q", AssumptionsFile, a.Ceph.Repo, SLOCFile, sloc.Repo)
	}
	if a.Ceph.Rev != sloc.Rev {
		p.Addf("%s: ceph.rev %s does not match %s rev %s", AssumptionsFile, a.Ceph.Rev, SLOCFile, sloc.Rev)
	}

	for _, lang := range slices.Sorted(maps.Keys(a.BytesPerToken)) {
		q := a.BytesPerToken[lang]
		path := "bytes_per_token." + lang
		validateQuantity(p, path, &q)
		if q.Value != nil && *q.Value <= 0 {
			p.Addf("%s: %s: value must be positive", AssumptionsFile, path)
		}
	}
	if _, ok := a.BytesPerToken[DefaultLang]; !ok {
		for _, lang := range sourceLangs(sloc) {
			if _, ok := a.BytesPerToken[lang]; !ok {
				p.Addf("%s: bytes_per_token has no entry for language %q in %s and no default", AssumptionsFile, lang, SLOCFile)
			}
		}
	}

	params := a.Params.Quantities()
	for _, path := range slices.Sorted(maps.Keys(params)) {
		q := params[path]
		validateQuantity(p, "params."+path, &q)
	}

	for _, id := range slices.Sorted(maps.Keys(a.Scenarios)) {
		if !slices.Contains(ScenarioIDs, id) {
			p.Addf("%s: scenarios: %q is not one of %s", AssumptionsFile, id, strings.Join(ScenarioIDs, ", "))
		}
		validateScenario(p, id, a.Scenarios[id], params)
	}
	for _, id := range ScenarioIDs {
		if _, ok := a.Scenarios[id]; !ok {
			p.Addf("%s: scenarios: %q is missing", AssumptionsFile, id)
		}
	}
	if _, ok := a.Scenarios[a.DefaultScenario]; !ok {
		p.Addf("%s: default_scenario %q is not a scenario", AssumptionsFile, a.DefaultScenario)
	}
}

func validateQuantity(p *Problems, path string, q *Quantity) {
	if q.Value == nil {
		p.Addf("%s: %s: value is missing", AssumptionsFile, path)
	}
	if q.Source == "" {
		p.Addf("%s: %s: source is empty", AssumptionsFile, path)
	}
	if q.Reason == "" {
		p.Addf("%s: %s: reason is empty", AssumptionsFile, path)
	}
}

func validateScenario(p *Problems, id string, sc Scenario, params map[string]Quantity) {
	where := fmt.Sprintf("%s: scenarios.%s", AssumptionsFile, id)
	if sc.Label == "" {
		p.Addf("%s: label is empty", where)
	}
	if sc.Description == "" {
		p.Addf("%s: description is empty", where)
	}
	for _, path := range slices.Sorted(maps.Keys(sc.Overrides)) {
		if _, ok := params[path]; !ok {
			p.Addf("%s.overrides: %q is not a param", where, path)
		}
		if _, ok := sc.Scale[path]; ok {
			p.Addf("%s: %q is in both overrides and scale", where, path)
		}
	}
	for _, path := range slices.Sorted(maps.Keys(sc.Scale)) {
		if _, ok := params[path]; !ok {
			p.Addf("%s.scale: %q is not a param", where, path)
		}
	}
	for _, name := range slices.Sorted(maps.Keys(sc.Toggles)) {
		if !slices.Contains(ToggleNames, name) {
			p.Addf("%s.toggles: %q is not a toggle", where, name)
		}
	}
}

// sourceLangs lists, sorted, the languages of the non-binary files.
func sourceLangs(sloc *SLOC) []string {
	langs := map[string]bool{}
	for i := range sloc.Files {
		if !sloc.Files[i].Binary {
			langs[sloc.Files[i].Lang] = true
		}
	}
	return slices.Sorted(maps.Keys(langs))
}

func validateSLOC(p *Problems, sloc *SLOC) {
	seen := map[string]bool{}
	for i := range sloc.Files {
		path := sloc.Files[i].Path
		if seen[path] {
			p.Addf("%s: file %q is listed twice", SLOCFile, path)
		}
		seen[path] = true
	}
}
