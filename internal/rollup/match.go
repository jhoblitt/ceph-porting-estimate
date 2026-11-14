package rollup

import (
	"strings"
	"unicode/utf8"

	"github.com/bmatcuk/doublestar/v4"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
)

// glob is one feature glob with its ranking precomputed. A file can only
// match when it starts with the literal prefix, which rules out almost
// every glob before doublestar runs.
type glob struct {
	pattern string
	prefix  string
	score   int
	// feature indexes matcher.features.
	feature int
}

// outranks reports whether g is more specific than o: a longer literal
// prefix, or an equally long one and a higher literal score.
func (g *glob) outranks(o *glob) bool {
	if len(g.prefix) != len(o.prefix) {
		return len(g.prefix) > len(o.prefix)
	}
	return g.score > o.score
}

func (g *glob) ranksWith(o *glob) bool {
	return len(g.prefix) == len(o.prefix) && g.score == o.score
}

type featureRef struct {
	component, feature int
}

// matcher assigns a path to the feature whose matching glob is the most
// specific: the longest literal prefix wins, and among equal prefixes the
// highest literal score. Globs of different features that match a path
// at the same prefix length and score tie, which is an error the caller
// reports; globs of one feature may overlap freely.
type matcher struct {
	globs    []glob
	features []featureRef
	// names are "component/feature", parallel to features.
	names []string
}

// literalPrefix is the pattern text before its first glob metacharacter.
// A backslash counts as one: whatever it escapes is not literal text the
// pattern starts with.
func literalPrefix(pattern string) string {
	if i := strings.IndexAny(pattern, `*?[{\`); i >= 0 {
		return pattern[:i]
	}
	return pattern
}

// literalScore counts the characters any match of pattern must contain
// literally: every character that is not glob syntax. `*`, `?` and a
// `[...]` class count nothing; a `**/` segment counts nothing, slash
// included, because it may match no directory at all; an escape counts as
// the one character it escapes; and an alternation counts its shortest
// alternative, so the score is a lower bound over every alternative.
func literalScore(pattern string) int {
	score := 0
	for i := 0; i < len(pattern); {
		switch pattern[i] {
		case '\\':
			score++
			i = skipEscape(pattern, i)
		case '*':
			if strings.HasPrefix(pattern[i:], "**/") && (i == 0 || pattern[i-1] == '/') {
				i += 3
			} else {
				i++
			}
		case '?':
			i++
		case '[':
			i = classEnd(pattern, i)
		case '{':
			end := closingBrace(pattern, i)
			score += shortestAlternative(pattern[i+1 : end])
			i = min(end+1, len(pattern))
		default:
			_, n := utf8.DecodeRuneInString(pattern[i:])
			score++
			i += n
		}
	}
	return score
}

// skipEscape returns the index after the backslash at i and the character
// it escapes.
func skipEscape(pattern string, i int) int {
	if i+1 >= len(pattern) {
		return len(pattern)
	}
	_, n := utf8.DecodeRuneInString(pattern[i+1:])
	return i + 1 + n
}

// classEnd returns the index after the `]` closing the class opened at i.
func classEnd(pattern string, i int) int {
	for j := i + 1; j < len(pattern); j++ {
		switch pattern[j] {
		case '\\':
			j = skipEscape(pattern, j) - 1
		case ']':
			return j + 1
		}
	}
	return len(pattern)
}

// closingBrace returns the index of the `}` closing the alternation opened
// at i, or len(pattern) when there is none.
func closingBrace(pattern string, i int) int {
	depth := 0
	for j := i; j < len(pattern); {
		switch pattern[j] {
		case '\\':
			j = skipEscape(pattern, j)
			continue
		case '[':
			j = classEnd(pattern, j)
			continue
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return j
			}
		}
		j++
	}
	return len(pattern)
}

// shortestAlternative scores each comma-separated alternative of an
// alternation's body and returns the lowest.
func shortestAlternative(body string) int {
	best, start, depth := -1, 0, 0
	consider := func(alt string) {
		if s := literalScore(alt); best < 0 || s < best {
			best = s
		}
	}
	for j := 0; j < len(body); {
		switch body[j] {
		case '\\':
			j = skipEscape(body, j)
			continue
		case '[':
			j = classEnd(body, j)
			continue
		case '{':
			depth++
		case '}':
			depth--
		case ',':
			if depth == 0 {
				consider(body[start:j])
				start = j + 1
			}
		}
		j++
	}
	consider(body[start:])
	return best
}

// newMatcher indexes every valid glob of every feature. An invalid glob is
// skipped; data.Validate reports it.
func newMatcher(components []data.Component) *matcher {
	m := &matcher{}
	for ci := range components {
		c := &components[ci]
		for fi := range c.Features {
			f := len(m.features)
			m.features = append(m.features, featureRef{component: ci, feature: fi})
			m.names = append(m.names, c.ID+"/"+c.Features[fi].ID)
			for _, p := range c.Features[fi].Globs {
				if doublestar.ValidatePattern(p) {
					m.globs = append(m.globs, glob{pattern: p, prefix: literalPrefix(p), score: literalScore(p), feature: f})
				}
			}
		}
	}
	return m
}

// classify returns the feature that claims path, or -1 when no glob
// matches. When globs of more than one feature match at the top rank,
// tied holds one such glob per feature, in taxonomy order, and feature is
// the first of them. When hits is not nil, classify counts every glob that
// matches path, winning or not.
func (m *matcher) classify(path string, hits []int) (feature int, tied []int) {
	best := -1
	for i := range m.globs {
		g := &m.globs[i]
		if !strings.HasPrefix(path, g.prefix) || !doublestar.MatchUnvalidated(g.pattern, path) {
			continue
		}
		if hits != nil {
			hits[i]++
		}
		switch {
		case best < 0 || g.outranks(&m.globs[best]):
			best = i
			tied = tied[:0]
		case g.ranksWith(&m.globs[best]) && g.feature != m.globs[best].feature:
			if !tiedWith(m.globs, tied, g.feature) {
				if len(tied) == 0 {
					tied = append(tied, best)
				}
				tied = append(tied, i)
			}
		}
	}
	if best < 0 {
		return -1, nil
	}
	return m.globs[best].feature, tied
}

func tiedWith(globs []glob, tied []int, feature int) bool {
	for _, t := range tied {
		if globs[t].feature == feature {
			return true
		}
	}
	return false
}
