package data

// Strategy is how a port deals with a dependency on one target.
type Strategy string

// The strategies a dependency target may carry.
const (
	StrategyNative   Strategy = "native"
	StrategyBindings Strategy = "bindings"
	StrategyPort     Strategy = "port"
	StrategyDrop     Strategy = "drop"
)

// Strategies lists every valid Strategy.
var Strategies = []Strategy{StrategyNative, StrategyBindings, StrategyPort, StrategyDrop}

// Targets lists the port targets, each of which every dependency must cover.
var Targets = []string{"go", "rust", "wasm"}

// Dependency is one vendored or system library Ceph uses.
type Dependency struct {
	ID      string `yaml:"id"       json:"id"`
	Name    string `yaml:"name"     json:"name"`
	UsedFor string `yaml:"used_for" json:"used_for"`
	// Submodules are the ceph submodule paths the dependency is vendored
	// as; empty when it is a system library. Load turns an absent list
	// into an empty one.
	Submodules []string                    `yaml:"submodules" json:"submodules"`
	Targets    map[string]DependencyTarget `yaml:"targets"    json:"targets"`
}

// DependencyTarget is a dependency's strategy for one target.
type DependencyTarget struct {
	Strategy       Strategy   `yaml:"strategy"        json:"strategy"`
	Package        *string    `yaml:"package"         json:"package"`
	SLOCEquivalent *float64   `yaml:"sloc_equivalent" json:"sloc_equivalent"`
	Difficulty     Difficulty `yaml:"difficulty"      json:"difficulty"`
	Note           string     `yaml:"note"            json:"note"`
}

type dependenciesFile struct {
	Dependencies []Dependency `yaml:"dependencies"`
}
