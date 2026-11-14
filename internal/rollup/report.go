package rollup

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
)

// Report is report.json, the contract the site reads. Its JSON keys are
// snake_case, as in the YAML.
type Report struct {
	Ceph Ceph `json:"ceph"`
	// Groups are the taxonomy's groups in load order, then unclassified.
	Groups       []Group           `json:"groups"`
	Components   []Component       `json:"components"`
	Dependencies []Dependency      `json:"dependencies"`
	Models       []data.Model      `json:"models"`
	Assumptions  *data.Assumptions `json:"assumptions"`
	Calibration  json.RawMessage   `json:"calibration"`
}

// Ceph identifies the counted commit.
type Ceph struct {
	Repo       string `json:"repo"`
	Rev        string `json:"rev"`
	CommitDate string `json:"commit_date"`
}

// Group is an area of the report that components are presented under.
type Group struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Component is a taxonomy component with its features rolled up.
type Component struct {
	ID          string    `json:"id"`
	Group       string    `json:"group"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Root        []string  `json:"root"`
	Features    []Feature `json:"features"`
}

// Feature is a taxonomy feature with its files' totals per language.
type Feature struct {
	data.Feature
	Langs map[string]data.Counts `json:"langs"`
}

// Dependency is a dependencies.yaml entry with the size of its submodules.
type Dependency struct {
	data.Dependency
	// SubmoduleSize is nil when the dependency lists no submodule.
	SubmoduleSize *SubmoduleSize `json:"submodule_size"`
}

// SubmoduleSize totals a dependency's listed submodules and every
// submodule nested under them. A submodule the counter could not check out
// counts zero.
type SubmoduleSize struct {
	// Available is true when every listed submodule was checked out; an
	// unavailable nested one does not clear it.
	Available bool `json:"available"`
	data.Counts
	UnavailableNested int `json:"unavailable_nested"`
}

func newReport(s *data.Set, langs []map[string]data.Counts, unclassified map[string]data.Counts) Report {
	r := Report{
		Ceph:        Ceph{Repo: s.Assumptions.Ceph.Repo, Rev: s.SLOC.Rev, CommitDate: s.SLOC.CommitDate},
		Models:      s.Models,
		Assumptions: &s.Assumptions,
		Calibration: s.Calibration,
	}

	for i := range s.Groups {
		g := &s.Groups[i]
		r.Groups = append(r.Groups, Group{ID: g.ID, Name: g.Name, Description: g.Description})
	}
	r.Groups = append(r.Groups, Group{
		ID:          data.UnclassifiedID,
		Name:        "Unclassified",
		Description: "Files no feature claims",
	})

	n := 0
	for i := range s.Components {
		c := &s.Components[i]
		rc := Component{ID: c.ID, Group: c.Group, Name: c.Name, Description: c.Description, Root: c.Root}
		if rc.Root == nil {
			rc.Root = []string{}
		}
		for j := range c.Features {
			rc.Features = append(rc.Features, Feature{Feature: c.Features[j], Langs: langs[n]})
			n++
		}
		r.Components = append(r.Components, rc)
	}
	r.Components = append(r.Components, Component{
		ID:          data.UnclassifiedID,
		Group:       data.UnclassifiedID,
		Name:        "Unclassified",
		Description: "Files no feature glob claims.",
		Root:        []string{},
		Features: []Feature{{
			ID:          data.UnclassifiedID,
			Name:        "Unclassified",
			Description: "Files no feature glob claims.",
			Globs:       []string{},
			Scope:       data.ScopeNotPorted,
			Kind:        data.KindProduct,
			Difficulty:  data.DifficultyStandard,
			Why:         "Kept so that every counted file appears somewhere; check fails above 1% of code lines.",
			Langs:       unclassified,
		}},
	})

	r.Dependencies = make([]Dependency, 0, len(s.Dependencies))
	for _, d := range s.Dependencies {
		rd := Dependency{Dependency: d}
		if len(d.Submodules) > 0 {
			rd.SubmoduleSize = submoduleSize(d.Submodules, s.SLOC.Submodules)
		}
		r.Dependencies = append(r.Dependencies, rd)
	}
	return r
}

// submoduleSize sums the rows listed and the rows nested under a listed
// path, counting each row once. A listed path with no row is unavailable;
// data.Validate reports it.
func submoduleSize(listed []string, rows []data.Submodule) *SubmoduleSize {
	size := &SubmoduleSize{Available: true}
	found := 0
	for i := range rows {
		r := &rows[i]
		top := slices.Contains(listed, r.Path)
		nested := !top && slices.ContainsFunc(listed, func(l string) bool {
			return strings.HasPrefix(r.Path, l+"/")
		})
		switch {
		case top:
			found++
			size.Available = size.Available && r.Available
		case nested:
			if !r.Available {
				size.UnavailableNested++
			}
		default:
			continue
		}
		for _, c := range r.Langs {
			size.Add(c)
		}
	}
	if found < len(listed) {
		size.Available = false
	}
	return size
}

// JSON renders the report indented for diffing, with a trailing newline.
// The output is deterministic: slices keep data-file order and maps are
// emitted with sorted keys.
func (r *Report) JSON() ([]byte, error) {
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encoding report: %w", err)
	}
	return append(b, '\n'), nil
}

// WriteFile writes the report to path, creating its directory. It writes a
// temporary file beside path and renames it into place, so a reader sees
// the old report or the new one, never part of one.
func (r *Report) WriteFile(path string) error {
	b, err := r.JSON()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err = os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("creating the report directory: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".report-*.json")
	if err != nil {
		return fmt.Errorf("writing report %s: %w", path, err)
	}
	if err = replace(tmp, b, path); err != nil {
		return fmt.Errorf("writing report %s: %w", path, errors.Join(err, os.Remove(tmp.Name())))
	}
	return nil
}

// replace fills tmp with b and renames it to path. report.json is a build
// input other tools read, so it is world-readable rather than CreateTemp's
// owner-only default.
func replace(tmp *os.File, b []byte, path string) error {
	if _, err := tmp.Write(b); err != nil {
		return errors.Join(err, tmp.Close())
	}
	if err := tmp.Chmod(0o644); err != nil {
		return errors.Join(err, tmp.Close())
	}
	if err := tmp.Sync(); err != nil {
		return errors.Join(err, tmp.Close())
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
