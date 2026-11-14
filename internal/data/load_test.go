package data_test

import (
	"encoding/json"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/data"
)

func componentIDs(s *data.Set) []string {
	ids := make([]string, 0, len(s.Components))
	for i := range s.Components {
		ids = append(ids, s.Components[i].ID+"@"+s.Components[i].File)
	}
	return ids
}

var _ = Describe("Load", func() {
	It("merges taxonomy.yaml and then taxonomy/*.yaml in name order", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(componentIDs(s)).To(Equal([]string{
			"mon@taxonomy.yaml", "mgr@taxonomy/mgr.yaml", "rgw@taxonomy/rgw.yaml",
		}))
	})

	It("merges groups in the same load order, recording each one's file", func() {
		s, err := data.Load(fixture(edit{
			File: "taxonomy/00-groups.yaml",
			New:  "groups:\n  - {id: tools, name: Tools, description: Command-line tools.}\n",
		}))
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Groups).To(Equal([]data.Group{
			{ID: "core", Name: "Core daemons", Description: "The daemons every cluster runs.", File: "taxonomy.yaml"},
			{ID: "tools", Name: "Tools", Description: "Command-line tools.", File: "taxonomy/00-groups.yaml"},
			{ID: "gateways", Name: "Gateways", Description: "Protocol gateways in front of RADOS.", File: "taxonomy/rgw.yaml"},
		}))
	})

	It("reads a component's group", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		groups := map[string]string{}
		for _, c := range s.Components {
			groups[c.ID] = c.Group
		}
		Expect(groups).To(Equal(map[string]string{"mon": "core", "mgr": "core", "rgw": "gateways"}))
	})

	It("reads the taxonomy from taxonomy/ alone when taxonomy.yaml is absent", func() {
		s, err := data.Load(fixture(edit{File: "taxonomy.yaml", Remove: true}))
		Expect(err).NotTo(HaveOccurred())
		Expect(componentIDs(s)).To(Equal([]string{"mgr@taxonomy/mgr.yaml", "rgw@taxonomy/rgw.yaml"}))
	})

	It("fails when there is no taxonomy file at all", func() {
		_, err := data.Load(fixture(
			edit{File: "taxonomy.yaml", Remove: true},
			edit{File: "taxonomy/mgr.yaml", Remove: true},
			edit{File: "taxonomy/rgw.yaml", Remove: true},
		))
		Expect(err).To(MatchError("no taxonomy: neither taxonomy.yaml nor taxonomy/*.yaml exists"))
	})

	It("accepts a component root as one string, a list, or nothing", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		roots := map[string]data.StringList{}
		for _, c := range s.Components {
			roots[c.ID] = c.Root
		}
		Expect(roots).To(Equal(map[string]data.StringList{
			"mon": {"src/mon"},
			"mgr": nil,
			"rgw": {"src/rgw", "src/pybind/rgw"},
		}))
	})

	It("rejects a component root that is a mapping", func() {
		_, err := data.Load(fixture(edit{File: "taxonomy.yaml", Old: "root: src/mon", New: "root: {path: src/mon}"}))
		Expect(err).To(MatchError(ContainSubstring("parsing taxonomy.yaml: line 10: want a string or a list of strings")))
	})

	It("reads long_context_share as one quantity per token category", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		lcs := s.Assumptions.Params.LongContextShare
		Expect(*lcs.CacheRead.Value).To(Equal(0.3))
		Expect(lcs.CacheRead.Reason).To(Equal("share of cache reads above the threshold"))
		Expect(s.Assumptions.Params.Quantities()).To(HaveKey("long_context_share.output"))
	})

	It("reads a scenario's overrides, scale and toggles, each optional", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Assumptions.Scenarios["pessimistic"]).To(Equal(data.Scenario{
			Label:       "Pessimistic",
			Role:        data.RoleHigh,
			Description: "Hard code is harder and adjacent work counts.",
			Overrides: map[string]float64{
				"difficulty.extreme": 3, "expansion": 2.381,
				"long_context_share.uncached": 0.5, "long_context_share.cache_write": 0.5,
				"long_context_share.cache_read": 0.5, "long_context_share.output": 0.5,
			},
			Scale:   map[string]float64{"overhead": 1.25, "cache_read_per_output": 1.1, "cache_write_per_output": 1.2},
			Toggles: map[string]bool{"include_adjacent": true},
		}))
		calibrated := s.Assumptions.Scenarios["calibrated"]
		Expect(calibrated.Overrides).To(Equal(map[string]float64{}))
		Expect(calibrated.Scale).To(Equal(map[string]float64{}))
		Expect(calibrated.Toggles).To(Equal(map[string]bool{}))
	})

	It("reads source_read_passes into params", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Assumptions.Params.Quantities()).To(HaveKeyWithValue("source_read_passes", HaveField("Value", HaveValue(Equal(2.5)))))
	})

	It("rejects long_context_share written as a single quantity", func() {
		_, err := data.Load(fixture(edit{
			File: "assumptions.yaml",
			Old:  "  long_context_share:\n    uncached:",
			New:  "  long_context_share: {value: 0.2, measured: false, source: assumption, reason: old form}\n  long_context_share_was:\n    uncached:",
		}))
		Expect(err).To(MatchError(ContainSubstring("field value not found in type data.TokenCategories")))
	})

	It("rejects a key the schema does not know, naming the file", func() {
		_, err := data.Load(fixture(edit{File: "models.yaml", Old: "    vendor: OpenAI\n", New: "    vendor: OpenAI\n    flavor: green\n"}))
		Expect(err).To(MatchError(ContainSubstring("parsing models.yaml: yaml: unmarshal errors:\n  line 13: field flavor not found")))
	})

	It("keeps read_on as the literal date string", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Models[0].ReadOn).To(Equal("2026-11-13"))
	})

	It("reads a dependency's submodules as a list, empty when absent", func() {
		s, err := data.Load(fixture(edit{File: "dependencies.yaml", Old: "    submodules: []\n", New: ""}))
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Dependencies[0].Submodules).To(Equal([]string{"src/rocksdb"}))
		Expect(s.Dependencies[1].Submodules).To(Equal([]string{"src/seastar", "src/dpdk"}))
		Expect(s.Dependencies[2].Submodules).To(Equal([]string{}))
	})

	It("reads a null package as nil", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(s.Dependencies[0].Targets["go"].Package).To(HaveValue(Equal("github.com/linxGnu/grocksdb")))
		Expect(s.Dependencies[0].Targets["wasm"].Package).To(BeNil())
	})

	It("carries calibration.yaml as JSON with its key order and literal dates", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		Expect(string(s.Calibration)).To(HavePrefix(`{"project":"rgw-go","measured_on":"2026-11-13",` +
			`"measurement":{"model_id":"opus-5-5","port":{"uncached":0.0304,"cache_write":76,"cache_read":3800,"output":3.04},` +
			`"adjacent":[{"scope":"reproduction",`))
	})

	It("carries the scenarios into JSON in file order, not sorted", func() {
		s, err := data.Load(fixture())
		Expect(err).NotTo(HaveOccurred())
		b, err := json.Marshal(&s.Assumptions)
		Expect(err).NotTo(HaveOccurred())
		var top struct {
			Scenarios json.RawMessage `json:"scenarios"`
		}
		Expect(json.Unmarshal(b, &top)).To(Succeed())
		text := string(top.Scenarios)
		naive, calibrated, pessimistic := strings.Index(text, `"naive":`), strings.Index(text, `"calibrated":`), strings.Index(text, `"pessimistic":`)
		Expect(naive).To(BeNumerically(">", 0), text)
		Expect(naive).To(BeNumerically("<", calibrated), text)
		Expect(calibrated).To(BeNumerically("<", pessimistic), text)
	})

	It("rejects calibration.yaml content JSON cannot carry", func() {
		_, err := data.Load(fixture(edit{File: "calibration.yaml", Old: "project: rgw-go", New: "project: .inf"}))
		Expect(err).To(MatchError(ContainSubstring("converting calibration.yaml to JSON: line 3:")))
	})

	DescribeTable("a missing required file",
		func(name string) {
			_, err := data.Load(fixture(edit{File: name, Remove: true}))
			Expect(err).To(MatchError(ContainSubstring("reading " + name + ":")))
		},
		Entry("dependencies.yaml", "dependencies.yaml"),
		Entry("models.yaml", "models.yaml"),
		Entry("assumptions.yaml", "assumptions.yaml"),
		Entry("calibration.yaml", "calibration.yaml"),
		Entry("generated/sloc.json", "generated/sloc.json"),
	)

	It("rejects an empty YAML file", func() {
		_, err := data.Load(fixture(edit{File: "models.yaml", Remove: true}, edit{File: "models.yaml", New: "# nothing\n"}))
		Expect(err).To(MatchError(ContainSubstring("models.yaml is empty")))
	})

	It("rejects a sloc.json field outside the counter's contract", func() {
		_, err := data.Load(fixture(edit{File: "generated/sloc.json", Old: `"commit_date"`, New: `"committed"`}))
		Expect(err).To(MatchError(ContainSubstring(`parsing generated/sloc.json:`)))
		Expect(err).To(MatchError(ContainSubstring(`committed`)))
	})

	It("reports every unreadable file, not just the first", func() {
		_, err := data.Load(fixture(edit{File: "models.yaml", Remove: true}, edit{File: "calibration.yaml", Remove: true}))
		Expect(err).To(MatchError(And(ContainSubstring("reading models.yaml"), ContainSubstring("reading calibration.yaml"))))
	})
})
