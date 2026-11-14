package rollup_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
	"github.com/jhoblitt/ceph-porting-estimate/internal/rollup"
)

// The data package owns the valid fixture; rollup specs start from it and
// change the taxonomy or the file list in Go.
const fixtureDir = "../data/testdata/valid"

func loadFixture() *data.Set {
	s, err := data.Load(os.DirFS(fixtureDir))
	ExpectWithOffset(1, err).NotTo(HaveOccurred())
	return s
}

func component(r *rollup.Report, id string) rollup.Component {
	for _, c := range r.Components {
		if c.ID == id {
			return c
		}
	}
	Fail("no component " + id)
	return rollup.Component{}
}

func featureLangs(r *rollup.Report, componentID, featureID string) map[string]data.Counts {
	for _, f := range component(r, componentID).Features {
		if f.ID == featureID {
			return f.Langs
		}
	}
	Fail("no feature " + componentID + "/" + featureID)
	return nil
}

func addFeature(s *data.Set, componentID string, f data.Feature) {
	for i := range s.Components {
		if s.Components[i].ID == componentID {
			s.Components[i].Features = append(s.Components[i].Features, f)
			return
		}
	}
	Fail("no component " + componentID)
}

// validFeature is a feature carrying every field the schema requires.
func validFeature(id string, globs ...string) data.Feature {
	return data.Feature{
		ID: id, Name: id, Globs: globs,
		Scope: data.ScopeShown, Kind: data.KindProduct, Difficulty: data.DifficultyGlue,
	}
}

// stealFeature's glob ties with mon/core's "src/mon/**", same literal
// prefix and same literal score, on every file directly under src/mon/
// that no Paxos glob claims.
func stealFeature() data.Feature {
	return validFeature("steal", "src/mon/*")
}

func cppFile(path string, code int64) data.File {
	return data.File{Path: path, Lang: "cpp", Code: code, Bytes: code * 40}
}

var _ = Describe("Build", func() {
	var s *data.Set

	BeforeEach(func() {
		s = loadFixture()
	})

	It("finds nothing wrong with the valid fixture", func() {
		Expect(rollup.Build(s).Problems).To(BeEmpty())
	})

	It("rolls every file up so the feature sums equal the sloc.json totals", func() {
		r := rollup.Build(s)

		var want data.Counts
		for i := range s.SLOC.Files {
			want.Add(s.SLOC.Files[i].Counts())
		}
		var got data.Counts
		for _, c := range r.Report.Components {
			for _, f := range c.Features {
				for _, n := range f.Langs {
					got.Add(n)
				}
			}
		}
		Expect(got).To(Equal(want))
		Expect(got.Files).To(Equal(int64(len(s.SLOC.Files))))
	})

	It("keeps the sum invariant when globs tie and files go unclassified", func() {
		addFeature(s, "rgw", stealFeature())
		s.SLOC.Files = append(s.SLOC.Files, cppFile("tools/a.cc", 500), cppFile("tools/b.cc", 7))
		r := rollup.Build(s)
		Expect(r.Problems).NotTo(BeEmpty())

		var want, got data.Counts
		for i := range s.SLOC.Files {
			want.Add(s.SLOC.Files[i].Counts())
		}
		for _, c := range r.Report.Components {
			for _, f := range c.Features {
				for _, n := range f.Langs {
					got.Add(n)
				}
			}
		}
		Expect(got).To(Equal(want))
	})

	It("splits a feature's totals by language and files binaries under binary", func() {
		r := rollup.Build(s)
		Expect(featureLangs(&r.Report, "mgr", "dashboard")).To(Equal(map[string]data.Counts{
			"python": {Files: 1, Code: 100, Comment: 10, Blank: 10, Bytes: 4000},
			"binary": {Files: 1, Bytes: 5000},
		}))
	})

	It("gives a specific glob's files to its feature and the rest to the general one", func() {
		r := rollup.Build(s)
		Expect(featureLangs(&r.Report, "mon", "paxos")).To(Equal(map[string]data.Counts{
			"cpp": {Files: 2, Code: 200, Comment: 30, Blank: 20, Bytes: 8000},
		}))
		Expect(featureLangs(&r.Report, "mon", "core")).To(Equal(map[string]data.Counts{
			"cpp": {Files: 1, Code: 300, Comment: 40, Blank: 30, Bytes: 12000},
		}))
	})

	It("puts files no glob claims in a trailing unclassified component", func() {
		r := rollup.Build(s)
		last := r.Report.Components[len(r.Report.Components)-1]
		Expect(last.ID).To(Equal("unclassified"))
		Expect(last.Features).To(HaveLen(1))
		f := last.Features[0]
		Expect(f.ID).To(Equal("unclassified"))
		Expect(f.Scope).To(Equal(data.ScopeNotPorted))
		Expect(f.Langs).To(Equal(map[string]data.Counts{
			"markdown": {Files: 1, Code: 9, Blank: 3, Bytes: 400},
		}))
	})

	It("keeps the taxonomy's component and feature order", func() {
		r := rollup.Build(s)
		var ids []string
		for _, c := range r.Report.Components {
			for _, f := range c.Features {
				ids = append(ids, c.ID+"/"+f.ID)
			}
		}
		Expect(ids).To(Equal([]string{
			"mon/paxos", "mon/core", "mon/tests", "mgr/dashboard",
			"rgw/frontend", "rgw/admin", "unclassified/unclassified",
		}))
	})

	It("lists the groups in load order, ending with unclassified", func() {
		Expect(rollup.Build(s).Report.Groups).To(Equal([]rollup.Group{
			{ID: "core", Name: "Core daemons", Description: "The daemons every cluster runs."},
			{ID: "gateways", Name: "Gateways", Description: "Protocol gateways in front of RADOS."},
			{ID: "unclassified", Name: "Unclassified", Description: "Files no feature claims"},
		}))
	})

	It("carries each component's group, unclassified for the synthetic component", func() {
		groups := map[string]string{}
		for _, c := range rollup.Build(s).Report.Components {
			groups[c.ID] = c.Group
		}
		Expect(groups).To(Equal(map[string]string{
			"mon": "core", "mgr": "core", "rgw": "gateways", "unclassified": "unclassified",
		}))
	})

	It("keeps a feature whose matched files all went to more specific globs, with empty langs", func() {
		addFeature(s, "mgr", validFeature("shadowed", "src/**/Paxos.cc"))
		r := rollup.Build(s)
		Expect(r.Problems).To(BeEmpty())
		Expect(featureLangs(&r.Report, "mgr", "shadowed")).To(Equal(map[string]data.Counts{}))
		b, err := r.Report.JSON()
		Expect(err).NotTo(HaveOccurred())
		Expect(string(b)).To(MatchRegexp(`"id": "shadowed",(?s:.*?)"langs": \{\}`))
	})

	It("reports a glob that matches no file", func() {
		s.Components[0].Features[0].Globs = append(s.Components[0].Features[0].Globs, "src/mon/Paxoz*")
		Expect(rollup.Build(s).Problems).To(ConsistOf(
			`taxonomy.yaml: component "mon" feature "paxos": glob "src/mon/Paxoz*" matches no file in generated/sloc.json`,
		))
	})

	It("reports a tie between globs of different features, naming the file and both features", func() {
		addFeature(s, "rgw", stealFeature())
		Expect(rollup.Build(s).Problems).To(ConsistOf(
			`taxonomy: file "src/mon/Monitor.cc" ties at literal prefix "src/mon/" and literal score 8 between ` +
				`mon/core (glob "src/mon/**" in taxonomy.yaml) and rgw/steal (glob "src/mon/*" in taxonomy/rgw.yaml)`,
		))
	})

	It("names every feature in a three-feature tie", func() {
		addFeature(s, "rgw", validFeature("x", "src/new/*x*"))
		addFeature(s, "rgw", validFeature("y", "src/new/*y*"))
		addFeature(s, "mgr", validFeature("z", "src/new/*z*"))
		s.SLOC.Files = append(s.SLOC.Files, cppFile("src/new/xyz.cc", 1))
		Expect(rollup.Build(s).Problems).To(ConsistOf(
			`taxonomy: file "src/new/xyz.cc" ties at literal prefix "src/new/" and literal score 9 between ` +
				`mgr/z (glob "src/new/*z*" in taxonomy/mgr.yaml), ` +
				`rgw/x (glob "src/new/*x*" in taxonomy/rgw.yaml) and ` +
				`rgw/y (glob "src/new/*y*" in taxonomy/rgw.yaml)`,
		))
	})

	It("gives a file to the glob with more literal characters when the prefixes are equal", func() {
		addFeature(s, "rgw", validFeature("monitor", "src/mon/*itor.cc"))
		r := rollup.Build(s)
		Expect(r.Problems).To(BeEmpty())
		Expect(featureLangs(&r.Report, "rgw", "monitor")).To(HaveKeyWithValue("cpp", HaveField("Files", int64(1))))
		Expect(featureLangs(&r.Report, "mon", "core")).To(BeEmpty())
	})

	It("reports every tie up to a cap, then how many more there are", func() {
		addFeature(s, "rgw", stealFeature())
		for i := range 30 {
			s.SLOC.Files = append(s.SLOC.Files, cppFile(fmt.Sprintf("src/mon/tie%02d.cc", i), 1))
		}
		p := rollup.Build(s).Problems
		Expect(p).To(HaveLen(21))
		Expect(p[0]).To(ContainSubstring(`file "src/mon/Monitor.cc" ties`))
		Expect(p[19]).To(ContainSubstring(`file "src/mon/tie18.cc" ties`))
		Expect(p[20]).To(Equal("taxonomy: 11 more files have tied globs"))
	})

	DescribeTable("the 1% unclassified limit",
		func(extra int64, want []string) {
			s.SLOC.Files = append(s.SLOC.Files, data.File{Path: "tools/extra.sh", Lang: "shell", Code: extra})
			Expect(rollup.Build(s).Problems).To(Equal(data.Problems(want)))
		},
		Entry("exactly 1% passes", int64(1), nil),
		Entry("just over 1% fails", int64(2), []string{
			"unclassified: 11 of 1001 code lines (1.10%) match no feature glob, above the 1% limit",
		}),
	)

	It("summarizes unclassified files, largest first, capped at 20", func() {
		for i := range 25 {
			s.SLOC.Files = append(s.SLOC.Files, cppFile(fmt.Sprintf("tools/f%02d.cc", i), int64(i%5)))
		}
		u := rollup.Build(s).Unclassified
		Expect(u.Files).To(Equal(26))
		Expect(u.Code).To(Equal(int64(9 + 5*(0+1+2+3+4))))
		Expect(u.TotalCode).To(Equal(int64(999 + 5*(0+1+2+3+4))))
		var paths []string
		for _, f := range u.Largest {
			paths = append(paths, f.Path)
		}
		Expect(paths).To(Equal([]string{
			"README.md",
			"tools/f04.cc", "tools/f09.cc", "tools/f14.cc", "tools/f19.cc", "tools/f24.cc",
			"tools/f03.cc", "tools/f08.cc", "tools/f13.cc", "tools/f18.cc", "tools/f23.cc",
			"tools/f02.cc", "tools/f07.cc", "tools/f12.cc", "tools/f17.cc", "tools/f22.cc",
			"tools/f01.cc", "tools/f06.cc", "tools/f11.cc", "tools/f16.cc",
		}))
	})

	It("carries the data package's problems", func() {
		s.Assumptions.Ceph.Rev = "1111111111111111111111111111111111111111"
		Expect(rollup.Build(s).Problems).To(ConsistOf(ContainSubstring("ceph.rev 1111111111111111111111111111111111111111 does not match")))
	})

	It("sizes each dependency over its submodules and everything nested under them", func() {
		r := rollup.Build(s)
		Expect(r.Problems).To(BeEmpty())
		sizes := map[string]*rollup.SubmoduleSize{}
		for _, d := range r.Report.Dependencies {
			sizes[d.ID] = d.SubmoduleSize
		}
		Expect(sizes).To(Equal(map[string]*rollup.SubmoduleSize{
			// src/rocksdb plus its nested folly; the unavailable nested gtest
			// is counted but does not make rocksdb unavailable, and
			// src/rocksdb_tools is not under src/rocksdb/.
			"rocksdb": {
				Available:         true,
				Counts:            data.Counts{Files: 15, Code: 6200, Comment: 570, Blank: 450, Bytes: 239000},
				UnavailableNested: 1,
			},
			// Two listed submodules; one unavailable makes the whole unavailable.
			"seastar": {
				Available: false,
				Counts:    data.Counts{Files: 4, Code: 800, Comment: 60, Blank: 50, Bytes: 25000},
			},
			"boost": nil,
		}))
	})

	It("sizes each dependency's own submodules apart from anything nested under them", func() {
		r := rollup.Build(s)
		Expect(r.Problems).To(BeEmpty())
		own := map[string]*rollup.SubmoduleSize{}
		for _, d := range r.Report.Dependencies {
			own[d.ID] = d.SubmoduleOwn
		}
		Expect(own).To(Equal(map[string]*rollup.SubmoduleSize{
			// src/rocksdb alone: neither the nested folly nor the nested
			// gtest, nor src/rocksdb_tools.
			"rocksdb": {
				Available: true,
				Counts:    data.Counts{Files: 12, Code: 5300, Comment: 520, Blank: 410, Bytes: 209000},
			},
			"seastar": {
				Available: false,
				Counts:    data.Counts{Files: 4, Code: 800, Comment: 60, Blank: 50, Bytes: 25000},
			},
			"boost": nil,
		}))
	})
})

var _ = Describe("WriteUnclassified", func() {
	It("prints the size and the largest files", func() {
		var buf bytes.Buffer
		rollup.WriteUnclassified(&buf, rollup.Unclassified{
			Files: 2, Code: 12, TotalCode: 1000,
			Largest: []data.File{
				{Path: "tools/a.sh", Code: 10, Bytes: 300},
				{Path: "README.md", Code: 2, Bytes: 80},
			},
		})
		Expect(buf.String()).To(Equal(
			"unclassified: 2 files, 12 of 1000 code lines (1.20%)\n" +
				"        10 code        300 bytes  tools/a.sh\n" +
				"         2 code         80 bytes  README.md\n"))
	})

	It("prints a bare total when nothing is unclassified", func() {
		var buf bytes.Buffer
		rollup.WriteUnclassified(&buf, rollup.Unclassified{TotalCode: 1000})
		Expect(buf.String()).To(Equal("unclassified: 0 files, 0 of 1000 code lines (0.00%)\n"))
	})
})

var _ = Describe("Report", func() {
	It("has exactly the keys the site reads", func() {
		b, err := rollup.Build(loadFixture()).Report.JSON()
		Expect(err).NotTo(HaveOccurred())

		var top map[string]json.RawMessage
		Expect(json.Unmarshal(b, &top)).To(Succeed())
		Expect(top).To(HaveLen(7))
		Expect(top).To(SatisfyAll(
			HaveKey("ceph"), HaveKey("groups"), HaveKey("components"), HaveKey("dependencies"),
			HaveKey("models"), HaveKey("assumptions"), HaveKey("calibration"),
		))

		Expect(string(b)).NotTo(ContainSubstring(`"difficulty": ""`))

		var assumptions map[string]json.RawMessage
		Expect(json.Unmarshal(top["assumptions"], &assumptions)).To(Succeed())
		Expect(assumptions).NotTo(HaveKey("ceph"))
		Expect(string(top["ceph"])).To(MatchJSON(`{
			"repo": "ceph/ceph",
			"rev": "0123456789abcdef0123456789abcdef01234567",
			"commit_date": "2026-11-01T12:00:00Z"
		}`))
	})

	It("places groups between ceph and components, and each component's group right after its id", func() {
		b, err := rollup.Build(loadFixture()).Report.JSON()
		Expect(err).NotTo(HaveOccurred())
		text := string(b)
		Expect(strings.Index(text, `"ceph":`)).To(BeNumerically("<", strings.Index(text, `"groups":`)))
		Expect(strings.Index(text, `"groups":`)).To(BeNumerically("<", strings.Index(text, `"components":`)))
		Expect(text).To(ContainSubstring("\"id\": \"mon\",\n      \"group\": \"core\",\n"))
		Expect(text).To(ContainSubstring("\"id\": \"unclassified\",\n      \"group\": \"unclassified\",\n"))
	})

	It("is byte-for-byte deterministic and matches the golden file", func() {
		first, err := rollup.Build(loadFixture()).Report.JSON()
		Expect(err).NotTo(HaveOccurred())
		for range 10 {
			again, againErr := rollup.Build(loadFixture()).Report.JSON()
			Expect(againErr).NotTo(HaveOccurred())
			Expect(again).To(Equal(first))
		}

		golden := filepath.Join("testdata", "report.golden.json")
		if os.Getenv("CEPHEST_UPDATE_GOLDEN") != "" {
			Expect(os.WriteFile(golden, first, 0o600)).To(Succeed())
		}
		want, err := os.ReadFile(golden)
		Expect(err).NotTo(HaveOccurred())
		Expect(string(first)).To(Equal(string(want)), "rerun with CEPHEST_UPDATE_GOLDEN=1 after an intended change")
	})

	Describe("WriteFile", func() {
		var (
			r   rollup.Report
			dir string
			out string
		)

		BeforeEach(func() {
			r = rollup.Build(loadFixture()).Report
			dir = filepath.Join(GinkgoT().TempDir(), "site", "generated")
			out = filepath.Join(dir, "report.json")
		})

		entries := func() []string {
			des, err := os.ReadDir(dir)
			Expect(err).NotTo(HaveOccurred())
			var names []string
			for _, de := range des {
				names = append(names, de.Name())
			}
			return names
		}

		It("writes the report readable by other tools, creating its directory and leaving nothing else", func() {
			Expect(r.WriteFile(out)).To(Succeed())
			got, err := os.ReadFile(out)
			Expect(err).NotTo(HaveOccurred())
			want, err := r.JSON()
			Expect(err).NotTo(HaveOccurred())
			Expect(got).To(Equal(want))
			info, err := os.Stat(out)
			Expect(err).NotTo(HaveOccurred())
			Expect(info.Mode().Perm()).To(Equal(os.FileMode(0o644)))
			Expect(entries()).To(Equal([]string{"report.json"}))
		})

		It("replaces an existing report", func() {
			Expect(os.MkdirAll(dir, 0o750)).To(Succeed())
			Expect(os.WriteFile(out, []byte("stale"), 0o600)).To(Succeed())
			Expect(r.WriteFile(out)).To(Succeed())
			got, err := os.ReadFile(out)
			Expect(err).NotTo(HaveOccurred())
			Expect(string(got)).To(HavePrefix("{\n"))
			info, err := os.Stat(out)
			Expect(err).NotTo(HaveOccurred())
			Expect(info.Mode().Perm()).To(Equal(os.FileMode(0o644)))
		})

		It("removes its temporary file when the final rename fails", func() {
			Expect(os.MkdirAll(filepath.Join(out, "occupied"), 0o750)).To(Succeed())
			Expect(r.WriteFile(out)).To(MatchError(ContainSubstring("writing report " + out)))
			Expect(entries()).To(Equal([]string{"report.json"}))
			Expect(filepath.Join(out, "occupied")).To(BeADirectory())
		})
	})
})
