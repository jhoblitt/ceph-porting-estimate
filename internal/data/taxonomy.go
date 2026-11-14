package data

import (
	"fmt"

	"go.yaml.in/yaml/v3"
)

// Scope says whether a feature counts toward the headline estimate.
type Scope string

// The scopes a feature may carry.
const (
	ScopeHeadline  Scope = "headline"
	ScopeShown     Scope = "shown"
	ScopeNotPorted Scope = "not-ported"
)

// Scopes lists every valid Scope.
var Scopes = []Scope{ScopeHeadline, ScopeShown, ScopeNotPorted}

// Kind says what sort of code a feature holds.
type Kind string

// The kinds a feature may carry.
const (
	KindProduct Kind = "product"
	KindTest    Kind = "test"
	KindConfig  Kind = "config"
)

// Kinds lists every valid Kind.
var Kinds = []Kind{KindProduct, KindTest, KindConfig}

// Difficulty selects the cost model's difficulty multiplier.
type Difficulty string

// The difficulty classes.
const (
	DifficultyConfig   Difficulty = "config"
	DifficultyGlue     Difficulty = "glue"
	DifficultyStandard Difficulty = "standard"
	DifficultyHard     Difficulty = "hard"
	DifficultyExtreme  Difficulty = "extreme"
)

// Difficulties lists every valid Difficulty.
var Difficulties = []Difficulty{DifficultyConfig, DifficultyGlue, DifficultyStandard, DifficultyHard, DifficultyExtreme}

// Reserved component and group ids: rollup synthesizes these itself.
const (
	UnclassifiedID = "unclassified"
	DependenciesID = "dependencies"
)

// Group is an area of the report that components are presented under.
type Group struct {
	ID          string `yaml:"id"          json:"id"`
	Name        string `yaml:"name"        json:"name"`
	Description string `yaml:"description" json:"description"`
	// File is the taxonomy file the group was read from, relative to the
	// data directory.
	File string `yaml:"-" json:"-"`
}

// Component is one top-level node of the taxonomy.
type Component struct {
	ID string `yaml:"id" json:"id"`
	// Group is the id of the group the component is presented under.
	Group       string     `yaml:"group"       json:"group"`
	Name        string     `yaml:"name"        json:"name"`
	Description string     `yaml:"description" json:"description"`
	Root        StringList `yaml:"root"        json:"root"`
	Features    []Feature  `yaml:"features"    json:"features"`
	// File is the taxonomy file the component was read from, relative to
	// the data directory.
	File string `yaml:"-" json:"-"`
}

// Feature is a leaf of the taxonomy: the files its globs claim.
type Feature struct {
	ID          string     `yaml:"id"          json:"id"`
	Name        string     `yaml:"name"        json:"name"`
	Description string     `yaml:"description" json:"description"`
	Globs       []string   `yaml:"globs"       json:"globs"`
	Scope       Scope      `yaml:"scope"       json:"scope"`
	Kind        Kind       `yaml:"kind"        json:"kind"`
	Difficulty  Difficulty `yaml:"difficulty"  json:"difficulty"`
	Why         string     `yaml:"why"         json:"why"`
}

// StringList is a list of strings that YAML may also write as one scalar.
type StringList []string

// UnmarshalYAML accepts a scalar or a sequence of scalars.
func (s *StringList) UnmarshalYAML(n *yaml.Node) error {
	switch n.Kind {
	case yaml.ScalarNode:
		if n.Tag == "!!null" {
			*s = nil
			return nil
		}
		*s = StringList{n.Value}
		return nil
	case yaml.SequenceNode:
		var l []string
		if err := n.Decode(&l); err != nil {
			return err
		}
		*s = l
		return nil
	default:
		return fmt.Errorf("line %d: want a string or a list of strings", n.Line)
	}
}

type taxonomyFile struct {
	Groups     []Group     `yaml:"groups"`
	Components []Component `yaml:"components"`
}
