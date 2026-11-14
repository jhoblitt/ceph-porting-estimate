package rollup

// Ginkgo is imported by name here: this file is in package rollup, whose
// Report type a dot-import of Ginkgo would shadow.
import (
	g "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
)

// feature builds a taxonomy feature that only carries what matching reads.
func feature(id string, globs ...string) data.Feature {
	return data.Feature{ID: id, Globs: globs}
}

var _ = g.Describe("literalPrefix", func() {
	g.DescribeTable("the pattern text before the first glob metacharacter",
		func(pattern, want string) {
			Expect(literalPrefix(pattern)).To(Equal(want))
		},
		g.Entry("a pattern with no metacharacter", "src/mon/Paxos.cc", "src/mon/Paxos.cc"),
		g.Entry("a star", "src/mon/Paxos*", "src/mon/Paxos"),
		g.Entry("a doublestar", "src/mon/**", "src/mon/"),
		g.Entry("a question mark", "src/mon/Mon?tor.cc", "src/mon/Mon"),
		g.Entry("a character class", "src/mon/[A-Z]*.cc", "src/mon/"),
		g.Entry("an alternation", "src/{mon,osd}/*.cc", "src/"),
		g.Entry("an escape", `src/mon/a\*b`, "src/mon/a"),
		g.Entry("a leading metacharacter", "**/CMakeLists.txt", ""),
	)
})

var _ = g.Describe("literalScore", func() {
	g.DescribeTable("the literal characters any match must contain",
		func(pattern string, want int) {
			Expect(literalScore(pattern)).To(Equal(want), "pattern %q", pattern)
		},
		g.Entry("a pattern with no metacharacter", "src/mon/Paxos.cc", 16),
		g.Entry("stars in the basename", "src/common/*Formatter*", 20),
		g.Entry("a trailing doublestar", "src/common/**", 11),
		g.Entry("a star and an extension", "src/test/*.cc", 12),
		g.Entry("a doublestar segment counts none of its slashes but the one before it", "a/**/b.c", 5),
		g.Entry("a short trailing doublestar", "a/**", 2),
		g.Entry("a leading doublestar segment", "**/CMakeLists.txt", 14),
		g.Entry("a question mark", "src/mon/Mon?tor.cc", 17),
		g.Entry("a character class", "src/mon/[A-Z]*.cc", 11),
		g.Entry("a negated character class", "src/mon/cfg/[!.]*.yaml", 17),
		g.Entry("an alternation counts its shortest alternative", "a/{x,xyz}*", 3),
		g.Entry("two alternations", "{a,bc}{d,ef}", 2),
		g.Entry("an alternation holding a glob", "src/{mon/*.cc,osd/**}", 8),
		g.Entry("an escape counts the character it escapes", `a\*b`, 3),
	)
})

// taxonomy is the matcher specs' taxonomy, built fresh for each use.
func taxonomy() []data.Component {
	return []data.Component{
		{ID: "mon", Features: []data.Feature{
			feature("paxos", "src/mon/Paxos*"),
			feature("core", "src/mon/**", "src/mon/*.cc"),
			feature("config", "src/mon/cfg/[!.]*.yaml"),
		}},
		{ID: "osd", Features: []data.Feature{
			feature("core", "src/osd/**"),
			feature("shared", "src/common/{mon,osd}_*.cc"),
		}},
		{ID: "common", Features: []data.Feature{
			feature("catchall", "src/common/**"),
			feature("formatter", "src/common/*Formatter*"),
		}},
		{ID: "build", Features: []data.Feature{
			feature("cmake", "**/CMakeLists.txt"),
			// Points outside any component root: matching ignores roots.
			feature("mon-tests", "src/test/mon/**"),
			feature("tests", "src/test/**"),
			feature("cc-tests", "src/test/*.cc"),
		}},
		{ID: "deep", Features: []data.Feature{
			feature("any", "a/**"),
			feature("bc", "a/**/b.c"),
			feature("foo", "a/*foo*"),
			feature("bar", "a/*bar*"),
			feature("long-literal", "a/**/*verylongliteral*"),
			feature("long-prefix", "a/b/*"),
		}},
		{ID: "tie", Features: []data.Feature{
			// Prefix "src/tie/" and score 11 for both.
			feature("a", "src/tie/*.cc"),
			feature("b", "src/tie/?.cc"),
			feature("c", "src/tie/x*"),
		}},
		{ID: "three", Features: []data.Feature{
			feature("x", "src/three/*x*"),
			feature("y", "src/three/*y*"),
			feature("z", "src/three/*z*"),
		}},
	}
}

var _ = g.Describe("matcher", func() {
	// classify reports the winning feature as "component/feature", "" when
	// no glob matches, and the tied features in the same form.
	classify := func(path string) (string, []string) {
		m := newMatcher(taxonomy())
		f, tied := m.classify(path, nil)
		var tiedNames []string
		for _, t := range tied {
			tiedNames = append(tiedNames, m.names[m.globs[t].feature])
		}
		if f < 0 {
			return "", tiedNames
		}
		return m.names[f], tiedNames
	}

	g.DescribeTable("which feature claims a file",
		func(path, want string) {
			got, tied := classify(path)
			Expect(tied).To(BeEmpty(), "path %q", path)
			Expect(got).To(Equal(want), "path %q", path)
		},
		g.Entry("a longer literal prefix beats a shorter one", "src/mon/Paxos.cc", "mon/paxos"),
		g.Entry("the general glob takes what the specific one does not", "src/mon/Monitor.cc", "mon/core"),
		g.Entry("two globs of the same feature are no tie", "src/mon/MonMap.cc", "mon/core"),
		g.Entry("a negated character class excludes", "src/mon/cfg/.hidden.yaml", "mon/core"),
		g.Entry("a negated character class includes", "src/mon/cfg/mon.yaml", "mon/config"),
		g.Entry("an alternation's score beats a catch-all at the same prefix", "src/common/osd_util.cc", "osd/shared"),
		g.Entry("a basename wildcard beats a catch-all at the same prefix", "src/common/Formatter.cc", "common/formatter"),
		g.Entry("the catch-all takes what the basename wildcard does not", "src/common/Mutex.cc", "common/catchall"),
		g.Entry("an extension beats a doublestar at the same prefix", "src/test/test_foo.cc", "build/cc-tests"),
		g.Entry("a doublestar segment's literal tail beats a bare doublestar", "a/q/b.c", "deep/bc"),
		g.Entry("a longer literal prefix beats a higher score", "a/b/xverylongliteral", "deep/long-prefix"),
		g.Entry("a glob with an empty literal prefix still matches", "CMakeLists.txt", "build/cmake"),
		g.Entry("a more specific glob outranks an empty-prefix glob", "src/mon/CMakeLists.txt", "mon/core"),
		g.Entry("a glob outside its component's root", "src/test/mon/test_paxos.cc", "build/mon-tests"),
		g.Entry("no glob matches", "README.md", ""),
	)

	g.DescribeTable("globs of different features tying at the longest prefix and the highest score",
		func(path string, want []string) {
			_, tied := classify(path)
			Expect(tied).To(Equal(want), "path %q", path)
		},
		g.Entry("two features", "src/tie/y.cc", []string{"tie/a", "tie/b"}),
		g.Entry("two wildcard basenames with equal literals", "a/foobar.c", []string{"deep/foo", "deep/bar"}),
		g.Entry("three features", "src/three/xyz", []string{"three/x", "three/y", "three/z"}),
	)

	g.It("lets a longer literal prefix settle what would otherwise be a three-way tie", func() {
		_, tied := classify("src/tie/x.cc")
		Expect(tied).To(BeEmpty(), "src/tie/x* has the longer prefix and wins outright")
	})

	g.It("counts every glob that matches, winning or not", func() {
		m := newMatcher(taxonomy())
		hits := make([]int, len(m.globs))
		for _, p := range []string{"src/mon/Paxos.cc", "src/mon/Monitor.cc"} {
			m.classify(p, hits)
		}
		byPattern := map[string]int{}
		for i, g := range m.globs {
			byPattern[g.pattern] += hits[i]
		}
		Expect(byPattern).To(HaveKeyWithValue("src/mon/Paxos*", 1))
		Expect(byPattern).To(HaveKeyWithValue("src/mon/**", 2))
		Expect(byPattern).To(HaveKeyWithValue("src/mon/*.cc", 2))
		Expect(byPattern).To(HaveKeyWithValue("src/osd/**", 0))
	})
})
