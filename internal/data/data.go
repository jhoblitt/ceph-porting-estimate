// Package data loads and validates the hand-edited data files and the
// counter's generated/sloc.json.
package data

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"strings"

	"go.yaml.in/yaml/v3"
)

// The files Load reads, relative to the data directory.
const (
	TaxonomyFile     = "taxonomy.yaml"
	TaxonomyGlob     = "taxonomy/*.yaml"
	DependenciesFile = "dependencies.yaml"
	ModelsFile       = "models.yaml"
	AssumptionsFile  = "assumptions.yaml"
	CalibrationFile  = "calibration.yaml"
	SLOCFile         = "generated/sloc.json"
)

// Set is everything in a data directory.
type Set struct {
	// Groups and Components are the merged taxonomy: taxonomy.yaml first,
	// then each taxonomy/*.yaml in name order.
	Groups       []Group
	Components   []Component
	Dependencies []Dependency
	Models       []Model
	Assumptions  Assumptions
	// Calibration is calibration.yaml converted to JSON, keys in file order.
	Calibration json.RawMessage
	SLOC        SLOC
}

// Load reads every data file from fsys. It reports every file it cannot
// read or parse, not just the first; it does not validate content.
func Load(fsys fs.FS) (*Set, error) {
	s := &Set{}
	var (
		deps   dependenciesFile
		models modelsFile
	)
	taxonomy, taxonomyErr := loadTaxonomy(fsys)
	calibration, calibrationErr := loadCalibration(fsys)
	err := errors.Join(
		taxonomyErr,
		decodeYAML(fsys, DependenciesFile, &deps),
		decodeYAML(fsys, ModelsFile, &models),
		decodeYAML(fsys, AssumptionsFile, &s.Assumptions),
		calibrationErr,
		decodeJSON(fsys, SLOCFile, &s.SLOC),
	)
	if err != nil {
		return nil, err
	}

	s.Groups = taxonomy.Groups
	s.Components = taxonomy.Components
	s.Calibration = calibration
	s.Dependencies = deps.Dependencies
	for i := range s.Dependencies {
		if s.Dependencies[i].Submodules == nil {
			s.Dependencies[i].Submodules = []string{}
		}
	}
	s.Models = models.Models
	s.Assumptions.fillEmpty()
	return s, nil
}

// loadTaxonomy merges the groups and components of taxonomy.yaml and then
// each taxonomy/*.yaml in name order, recording the file each came from.
func loadTaxonomy(fsys fs.FS) (taxonomyFile, error) {
	var merged taxonomyFile
	names, err := fs.Glob(fsys, TaxonomyGlob)
	if err != nil {
		return merged, fmt.Errorf("listing %s: %w", TaxonomyGlob, err)
	}
	if _, err := fs.Stat(fsys, TaxonomyFile); err == nil {
		names = append([]string{TaxonomyFile}, names...)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return merged, fmt.Errorf("reading %s: %w", TaxonomyFile, err)
	}
	if len(names) == 0 {
		return merged, fmt.Errorf("no taxonomy: neither %s nor %s exists", TaxonomyFile, TaxonomyGlob)
	}

	var errs []error
	for _, name := range names {
		var t taxonomyFile
		if err := decodeYAML(fsys, name, &t); err != nil {
			errs = append(errs, err)
			continue
		}
		for i := range t.Groups {
			t.Groups[i].File = name
		}
		for i := range t.Components {
			t.Components[i].File = name
		}
		merged.Groups = append(merged.Groups, t.Groups...)
		merged.Components = append(merged.Components, t.Components...)
	}
	return merged, errors.Join(errs...)
}

func decodeYAML(fsys fs.FS, name string, v any) error {
	b, err := fs.ReadFile(fsys, name)
	if err != nil {
		return fmt.Errorf("reading %s: %w", name, err)
	}
	dec := yaml.NewDecoder(bytes.NewReader(b))
	dec.KnownFields(true)
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			return fmt.Errorf("%s is empty", name)
		}
		return fmt.Errorf("parsing %s: %w", name, err)
	}
	return nil
}

func decodeJSON(fsys fs.FS, name string, v any) error {
	b, err := fs.ReadFile(fsys, name)
	if err != nil {
		return fmt.Errorf("reading %s: %w", name, err)
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("parsing %s: %w", name, err)
	}
	return nil
}

func loadCalibration(fsys fs.FS) (json.RawMessage, error) {
	var doc yaml.Node
	if err := decodeYAML(fsys, CalibrationFile, &doc); err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := writeJSON(&buf, &doc); err != nil {
		return nil, fmt.Errorf("converting %s to JSON: %w", CalibrationFile, err)
	}
	return buf.Bytes(), nil
}

// Problems lists everything wrong with a data set, one line each.
type Problems []string

// Addf appends a problem.
func (p *Problems) Addf(format string, args ...any) {
	*p = append(*p, fmt.Sprintf(format, args...))
}

// Err returns p as an error, or nil when there are no problems.
func (p *Problems) Err() error {
	if len(*p) == 0 {
		return nil
	}
	return p
}

func (p *Problems) Error() string {
	noun := "problems"
	if len(*p) == 1 {
		noun = "problem"
	}
	return fmt.Sprintf("%d %s:\n  %s", len(*p), noun, strings.Join(*p, "\n  "))
}
