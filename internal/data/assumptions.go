package data

import (
	"bytes"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
)

// Quantity is a number that is an assumption or a measurement, with its
// provenance.
type Quantity struct {
	// Value is nil when the key was missing.
	Value    *float64 `yaml:"value"    json:"value"`
	Measured bool     `yaml:"measured" json:"measured"`
	Source   string   `yaml:"source"   json:"source"`
	Reason   string   `yaml:"reason"   json:"reason"`
}

// Assumptions is assumptions.yaml.
type Assumptions struct {
	Ceph            CephPin             `yaml:"ceph"             json:"-"`
	BytesPerToken   map[string]Quantity `yaml:"bytes_per_token"  json:"bytes_per_token"`
	Params          Params              `yaml:"params"           json:"params"`
	Toggles         Toggles             `yaml:"toggles"          json:"toggles"`
	Scenarios       map[string]Scenario `yaml:"scenarios"        json:"scenarios"`
	DefaultScenario string              `yaml:"default_scenario" json:"default_scenario"`

	// scenarioOrder is the scenarios' order in the file, which Load records
	// because the map above cannot.
	scenarioOrder []string
}

// ScenarioIDs lists the scenarios in file order; any not in the file's
// order, as when Assumptions was built in code, follow in sorted order.
func (a *Assumptions) ScenarioIDs() []string {
	ids := make([]string, 0, len(a.Scenarios))
	for _, id := range a.scenarioOrder {
		if _, ok := a.Scenarios[id]; ok {
			ids = append(ids, id)
		}
	}
	for _, id := range slices.Sorted(maps.Keys(a.Scenarios)) {
		if !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	return ids
}

// MarshalJSON writes the scenarios in file order, the order the site
// presents them in, where encoding/json would sort a map's keys.
func (a *Assumptions) MarshalJSON() ([]byte, error) {
	type plain Assumptions
	return json.Marshal(struct {
		*plain
		Scenarios orderedScenarios `json:"scenarios"`
	}{(*plain)(a), orderedScenarios{ids: a.ScenarioIDs(), byID: a.Scenarios}})
}

type orderedScenarios struct {
	ids  []string
	byID map[string]Scenario
}

func (o orderedScenarios) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, id := range o.ids {
		if i > 0 {
			buf.WriteByte(',')
		}
		k, err := json.Marshal(id)
		if err != nil {
			return nil, err
		}
		v, err := json.Marshal(o.byID[id])
		if err != nil {
			return nil, fmt.Errorf("scenario %q: %w", id, err)
		}
		buf.Write(k)
		buf.WriteByte(':')
		buf.Write(v)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// DefaultLang is the bytes_per_token key used for a language with no entry
// of its own.
const DefaultLang = "default"

// CephPin is the ceph commit the data describes.
type CephPin struct {
	Repo string `yaml:"repo" json:"repo"`
	Rev  string `yaml:"rev"  json:"rev"`
}

// Params are the cost model's baseline parameters; a scenario overrides
// them by dotted path.
type Params struct {
	Expansion                  Quantity            `yaml:"expansion"                      json:"expansion"`
	TestRatio                  Quantity            `yaml:"test_ratio"                     json:"test_ratio"`
	Overhead                   Quantity            `yaml:"overhead"                       json:"overhead"`
	UncachedPerOutput          Quantity            `yaml:"uncached_per_output"            json:"uncached_per_output"`
	CacheWritePerOutput        Quantity            `yaml:"cache_write_per_output"         json:"cache_write_per_output"`
	CacheReadPerOutput         Quantity            `yaml:"cache_read_per_output"          json:"cache_read_per_output"`
	SourceReadPasses           Quantity            `yaml:"source_read_passes"             json:"source_read_passes"`
	Difficulty                 DifficultyParams    `yaml:"difficulty"                     json:"difficulty"`
	RustFactor                 Quantity            `yaml:"rust_factor"                    json:"rust_factor"`
	WasmOverhead               Quantity            `yaml:"wasm_overhead"                  json:"wasm_overhead"`
	CleanBreakDiscount         Quantity            `yaml:"clean_break_discount"           json:"clean_break_discount"`
	LongCacheWriteShare        Quantity            `yaml:"long_cache_write_share"         json:"long_cache_write_share"`
	LongContextShare           TokenCategories     `yaml:"long_context_share"             json:"long_context_share"`
	ModelEfficiency            map[string]Quantity `yaml:"model_efficiency"               json:"model_efficiency"`
	SLOCEquivalentBytesPerLine Quantity            `yaml:"sloc_equivalent_bytes_per_line" json:"sloc_equivalent_bytes_per_line"`
	AdjacentUplift             TokenCategories     `yaml:"adjacent_uplift"                json:"adjacent_uplift"`
}

// DifficultyParams holds one multiplier per Difficulty.
type DifficultyParams struct {
	Config   Quantity `yaml:"config"   json:"config"`
	Glue     Quantity `yaml:"glue"     json:"glue"`
	Standard Quantity `yaml:"standard" json:"standard"`
	Hard     Quantity `yaml:"hard"     json:"hard"`
	Extreme  Quantity `yaml:"extreme"  json:"extreme"`
}

// TokenCategories holds one quantity per billed token category.
type TokenCategories struct {
	Uncached   Quantity `yaml:"uncached"    json:"uncached"`
	CacheWrite Quantity `yaml:"cache_write" json:"cache_write"`
	CacheRead  Quantity `yaml:"cache_read"  json:"cache_read"`
	Output     Quantity `yaml:"output"      json:"output"`
}

func (c *TokenCategories) quantities(prefix string, into map[string]Quantity) {
	into[prefix+".uncached"] = c.Uncached
	into[prefix+".cache_write"] = c.CacheWrite
	into[prefix+".cache_read"] = c.CacheRead
	into[prefix+".output"] = c.Output
}

// Quantities returns every parameter keyed by the dotted path a scenario
// override names it with.
func (p *Params) Quantities() map[string]Quantity {
	q := map[string]Quantity{
		"expansion":                      p.Expansion,
		"test_ratio":                     p.TestRatio,
		"overhead":                       p.Overhead,
		"uncached_per_output":            p.UncachedPerOutput,
		"cache_write_per_output":         p.CacheWritePerOutput,
		"cache_read_per_output":          p.CacheReadPerOutput,
		"source_read_passes":             p.SourceReadPasses,
		"difficulty.config":              p.Difficulty.Config,
		"difficulty.glue":                p.Difficulty.Glue,
		"difficulty.standard":            p.Difficulty.Standard,
		"difficulty.hard":                p.Difficulty.Hard,
		"difficulty.extreme":             p.Difficulty.Extreme,
		"rust_factor":                    p.RustFactor,
		"wasm_overhead":                  p.WasmOverhead,
		"clean_break_discount":           p.CleanBreakDiscount,
		"long_cache_write_share":         p.LongCacheWriteShare,
		"sloc_equivalent_bytes_per_line": p.SLOCEquivalentBytesPerLine,
	}
	p.LongContextShare.quantities("long_context_share", q)
	p.AdjacentUplift.quantities("adjacent_uplift", q)
	for id, m := range p.ModelEfficiency {
		q["model_efficiency."+id] = m
	}
	return q
}

// Toggles are the cost model's on/off switches.
type Toggles struct {
	IncludeAdjacent bool `yaml:"include_adjacent" json:"include_adjacent"`
	CleanBreak      bool `yaml:"clean_break"      json:"clean_break"`
}

// ToggleNames lists the keys a scenario's toggles may set.
var ToggleNames = []string{"include_adjacent", "clean_break"}

// CalibratedID is the scenario that applies the baseline params unchanged.
const CalibratedID = "calibrated"

// Role says what a scenario stands for in the report's range.
type Role string

// The roles a scenario may carry.
const (
	RoleLow       Role = "low"
	RoleCentral   Role = "central"
	RoleHigh      Role = "high"
	RoleReference Role = "reference"
)

// Roles lists every valid Role.
var Roles = []Role{RoleLow, RoleCentral, RoleHigh, RoleReference}

// Scenario is a preset: the baseline params with some values replaced
// (Overrides) or multiplied (Scale), both keyed by the dotted paths
// Params.Quantities returns. Load turns an absent map into an empty one.
type Scenario struct {
	Label       string             `yaml:"label"       json:"label"`
	Role        Role               `yaml:"role"        json:"role"`
	Description string             `yaml:"description" json:"description"`
	Overrides   map[string]float64 `yaml:"overrides"   json:"overrides"`
	Scale       map[string]float64 `yaml:"scale"       json:"scale"`
	Toggles     map[string]bool    `yaml:"toggles"     json:"toggles"`
}

// fillEmpty gives every absent scenario map an empty value, so the report
// carries {} rather than null for it.
func (a *Assumptions) fillEmpty() {
	for id, sc := range a.Scenarios {
		if sc.Overrides == nil {
			sc.Overrides = map[string]float64{}
		}
		if sc.Scale == nil {
			sc.Scale = map[string]float64{}
		}
		if sc.Toggles == nil {
			sc.Toggles = map[string]bool{}
		}
		a.Scenarios[id] = sc
	}
}
