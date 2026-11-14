package data

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Tolerances, in percent, between a value in the data and the value its
// source gives. Derived values are written to four or five significant
// figures, well inside derivedTolerancePct; mixTolerancePct bounds how far
// the difficulty scale's mean over rgw-go's mix may sit from 1;
// reportedTolerancePct is for the few figures calibration.yaml records to
// three significant figures, whose rounding alone can exceed
// derivedTolerancePct.
const (
	derivedTolerancePct  = 0.1
	mixTolerancePct      = 0.5
	reportedTolerancePct = 0.5
)

// calibration reads the keys of calibration.yaml that the assumptions are
// derived from; the rest of the file is free-form. A key that cannot be
// read, or a divisor that is not positive, is reported once and reads as
// NaN, which every comparison skips, so one bad key does not also report
// each figure computed from it.
type calibration struct {
	doc      any
	p        *Problems
	reported map[string]bool
}

// validateCalibration recomputes every number in assumptions.yaml that is
// a copy or a function of calibration.yaml, and every derived figure
// calibration.yaml records, and reports each one that no longer matches.
func validateCalibration(p *Problems, s *Set) {
	var doc any
	if err := json.Unmarshal(s.Calibration, &doc); err != nil {
		p.Addf("%s: %v", CalibrationFile, err)
		return
	}
	c := &calibration{doc: doc, p: p, reported: map[string]bool{}}
	a := &s.Assumptions
	c.checkModel(s.Models)
	sz := c.readSizes(a)
	c.checkPort(a, sz)
	c.checkSanity(s.Models)
	c.checkCoverage(a, sz)
	c.checkDifficulty(a)
	c.checkPhases(a)
	c.checkLongContext(a)
}

func (c *calibration) problem(path, format string, args ...any) {
	if c.reported[path] {
		return
	}
	c.reported[path] = true
	c.p.Addf("%s: %s %s", CalibrationFile, path, fmt.Sprintf(format, args...))
}

// at follows the dotted path rel down from node, base naming node in
// messages; ok is false when a key along it is absent.
func (c *calibration) at(node any, base, rel string) (v any, path string, ok bool) {
	path = rel
	if base != "" {
		path = base + "." + rel
	}
	v = node
	for k := range strings.SplitSeq(rel, ".") {
		m, isMap := v.(map[string]any)
		if !isMap {
			return nil, path, false
		}
		if v, ok = m[k]; !ok {
			return nil, path, false
		}
	}
	return v, path, true
}

// numAt reads a number; nullIsZero reads a YAML null as 0, as the
// measurement table's "—" cells are.
func (c *calibration) numAt(node any, base, rel string, nullIsZero bool) float64 {
	v, path, ok := c.at(node, base, rel)
	switch f := v.(type) {
	case float64:
		return f
	case nil:
		if ok && nullIsZero {
			return 0
		}
	}
	if ok {
		c.problem(path, "is not a number")
	} else {
		c.problem(path, "is missing")
	}
	return math.NaN()
}

func (c *calibration) num(path string) float64 { return c.numAt(c.doc, "", path, false) }

func (c *calibration) str(path string) (string, bool) {
	v, _, ok := c.at(c.doc, "", path)
	s, isString := v.(string)
	switch {
	case !ok:
		c.problem(path, "is missing")
	case !isString:
		c.problem(path, "is not a string")
	}
	return s, ok && isString
}

func (c *calibration) mapping(path string) map[string]any {
	v, _, ok := c.at(c.doc, "", path)
	m, isMap := v.(map[string]any)
	switch {
	case !ok:
		c.problem(path, "is missing")
	case !isMap:
		c.problem(path, "is not a mapping")
	}
	return m
}

func (c *calibration) list(path string) []any {
	v, _, ok := c.at(c.doc, "", path)
	l, isList := v.([]any)
	switch {
	case !ok:
		c.problem(path, "is missing")
	case !isList:
		c.problem(path, "is not a list")
	}
	return l
}

// positive returns v when it can be divided by, and otherwise reports the
// operand by name and returns NaN, so that a zero or negative divisor fails
// the check instead of producing an infinity that compares equal to
// anything.
func (c *calibration) positive(name string, v float64) float64 {
	switch {
	case math.IsNaN(v):
		return v
	case v <= 0 || math.IsInf(v, 0):
		c.problem(name, "is %s; it must be positive to divide by", show(v))
		return math.NaN()
	}
	return v
}

// record checks a figure calibration.yaml records against the value its
// sources give.
func (c *calibration) record(path string, want float64, how string) {
	c.recordWithin(path, want, how, derivedTolerancePct)
}

// recordWithin is record with a tolerance of tolPct percent.
func (c *calibration) recordWithin(path string, want float64, how string, tolPct float64) {
	got := c.num(path)
	if math.IsNaN(got) || math.IsNaN(want) || near(got, want, tolPct) {
		return
	}
	c.p.Addf("%s: %s is %s, but %s gives %s; they differ by more than %g%%",
		CalibrationFile, path, show(got), how, show(want), tolPct)
}

// compare reports an assumptions.yaml value that differs from what
// calibration.yaml gives by more than derivedTolerancePct. A missing value,
// or a NaN from an unreadable key, has been reported already.
func compare(p *Problems, path string, got *float64, want float64, how string) {
	CompareDerived(p, CalibrationFile, path, got, want, how)
}

// CompareDerived reports an assumptions.yaml value that differs by more
// than derivedTolerancePct from want, the value the data file source
// gives by the arithmetic how.
func CompareDerived(p *Problems, source, path string, got *float64, want float64, how string) {
	if got == nil || math.IsNaN(want) || near(*got, want, derivedTolerancePct) {
		return
	}
	p.Addf("%s: %s is %g, but %s gives %s (%s); they differ by more than %g%%",
		AssumptionsFile, path, *got, source, show(want), how, derivedTolerancePct)
}

// near reports whether got is within tolPct percent of want. NaN is near
// everything, since whatever produced it has been reported; an infinity is
// near nothing.
func near(got, want, tolPct float64) bool {
	switch {
	case math.IsNaN(got) || math.IsNaN(want):
		return true
	case math.IsInf(got, 0) || math.IsInf(want, 0):
		return false
	}
	return math.Abs(got-want) <= math.Abs(want)*tolPct/100
}

// show formats x to six significant figures without an exponent or
// trailing zeros.
func show(x float64) string {
	if x == 0 || math.IsInf(x, 0) || math.IsNaN(x) {
		return strconv.FormatFloat(x, 'g', -1, 64)
	}
	decimals := max(0, 5-int(math.Floor(math.Log10(math.Abs(x)))))
	s := strconv.FormatFloat(x, 'f', decimals, 64)
	if strings.Contains(s, ".") {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	return s
}

func orNaN(v *float64) float64 {
	if v == nil {
		return math.NaN()
	}
	return *v
}

// bytesPerToken is the bytes per token the model applies to lang, NaN when
// no usable entry exists (validateAssumptions reports that).
func (a *Assumptions) bytesPerToken(lang string) float64 {
	q, ok := a.BytesPerToken[lang]
	if !ok {
		q = a.BytesPerToken[DefaultLang]
	}
	if q.Value == nil || *q.Value <= 0 {
		return math.NaN()
	}
	return *q.Value
}

func difficultyNames() string {
	names := make([]string, len(Difficulties))
	for i, d := range Difficulties {
		names[i] = string(d)
	}
	return strings.Join(names, ", ")
}
