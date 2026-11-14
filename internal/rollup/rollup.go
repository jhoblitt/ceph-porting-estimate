// Package rollup assigns each counted file to a taxonomy feature, checks
// the assignment, and rolls the counts up into the report the site renders.
//
// A file belongs to the feature whose matching glob is the most specific.
// The glob with the longest literal prefix, the text before its first
// metacharacter, wins. Among equal prefixes, the glob with the highest
// literal score wins: the number of characters any match must contain, so
// src/common/*Formatter* (20) beats src/common/** (11). Globs of different
// features equal on both are a tie, which check reports; globs of one
// feature may overlap freely. A file no glob matches is unclassified.
package rollup

import (
	"cmp"
	"fmt"
	"io"
	"slices"
	"strings"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
)

// BinaryLang is the language key a feature's binary files are counted
// under, whatever language the counter gave them.
const BinaryLang = "binary"

const (
	// maxTies caps the tie problems Build reports individually.
	maxTies = 20
	// maxLargest caps the unclassified files the summary lists.
	maxLargest = 20
)

// Result is what Build produces: the report, the unclassified summary that
// check always prints, and every problem found. The report is only fit to
// write when Problems is empty.
type Result struct {
	Report       Report
	Unclassified Unclassified
	Problems     data.Problems
}

// Unclassified summarizes the files no feature glob claims.
type Unclassified struct {
	Files int
	Code  int64
	// TotalCode is the code lines of every file in sloc.json.
	TotalCode int64
	// Largest lists up to 20 unclassified files, most code lines first.
	Largest []data.File
}

// Build validates s, assigns every file in sloc.json to a feature, and
// rolls the counts up. A file no glob claims goes to the synthetic
// unclassified component, so the feature totals always sum to the
// sloc.json totals.
func Build(s *data.Set) *Result {
	res := &Result{Problems: data.Validate(s)}

	m := newMatcher(s.Components)
	hits := make([]int, len(m.globs))
	langs := make([]map[string]data.Counts, len(m.features))
	for i := range langs {
		langs[i] = map[string]data.Counts{}
	}
	unclassified := map[string]data.Counts{}
	var unclassifiedFiles []data.File
	var ties []string

	for i := range s.SLOC.Files {
		f := &s.SLOC.Files[i]
		res.Unclassified.TotalCode += f.Code
		feature, tied := m.classify(f.Path, hits)
		if len(tied) > 0 {
			ties = append(ties, describeTie(s.Components, m, f.Path, tied))
		}
		target := unclassified
		if feature >= 0 {
			target = langs[feature]
		} else {
			unclassifiedFiles = append(unclassifiedFiles, *f)
		}
		lang := f.Lang
		if f.Binary {
			lang = BinaryLang
		}
		c := target[lang]
		c.Add(f.Counts())
		target[lang] = c
	}

	for i, g := range m.globs {
		if hits[i] == 0 {
			ref := m.features[g.feature]
			c := &s.Components[ref.component]
			res.Problems.Addf("%s: component %q feature %q: glob %q matches no file in %s",
				c.File, c.ID, c.Features[ref.feature].ID, g.pattern, data.SLOCFile)
		}
	}
	for i, t := range ties {
		if i == maxTies {
			res.Problems.Addf("taxonomy: %d more files have tied globs", len(ties)-maxTies)
			break
		}
		res.Problems = append(res.Problems, t)
	}

	res.Unclassified.summarize(unclassifiedFiles)
	if u := res.Unclassified; u.Code*100 > u.TotalCode {
		res.Problems.Addf("unclassified: %d of %d code lines (%s) match no feature glob, above the 1%% limit",
			u.Code, u.TotalCode, percent(u.Code, u.TotalCode))
	}

	res.Report = newReport(s, langs, unclassified)
	return res
}

func describeTie(components []data.Component, m *matcher, path string, tied []int) string {
	parts := make([]string, len(tied))
	for i, t := range tied {
		g := m.globs[t]
		file := components[m.features[g.feature].component].File
		parts[i] = fmt.Sprintf("%s (glob %q in %s)", m.names[g.feature], g.pattern, file)
	}
	first := &m.globs[tied[0]]
	return fmt.Sprintf("taxonomy: file %q ties at literal prefix %q and literal score %d between %s and %s",
		path, first.prefix, first.score, strings.Join(parts[:len(parts)-1], ", "), parts[len(parts)-1])
}

func (u *Unclassified) summarize(files []data.File) {
	u.Files = len(files)
	for i := range files {
		u.Code += files[i].Code
	}
	slices.SortFunc(files, func(a, b data.File) int {
		return cmp.Or(cmp.Compare(b.Code, a.Code), cmp.Compare(b.Bytes, a.Bytes), strings.Compare(a.Path, b.Path))
	})
	u.Largest = files[:min(len(files), maxLargest)]
}

func percent(part, whole int64) string {
	if whole == 0 {
		return "0.00%"
	}
	return fmt.Sprintf("%.2f%%", float64(part)*100/float64(whole))
}

// WriteUnclassified prints the unclassified summary: its size, then its
// largest files.
func WriteUnclassified(w io.Writer, u Unclassified) {
	noun := "files"
	if u.Files == 1 {
		noun = "file"
	}
	fmt.Fprintf(w, "unclassified: %d %s, %d of %d code lines (%s)\n",
		u.Files, noun, u.Code, u.TotalCode, percent(u.Code, u.TotalCode))
	for i := range u.Largest {
		f := &u.Largest[i]
		fmt.Fprintf(w, "%10d code %10d bytes  %s\n", f.Code, f.Bytes, f.Path)
	}
}
