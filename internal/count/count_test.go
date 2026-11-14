package count_test

import (
	"bytes"
	"encoding/json"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/count"
)

var _ = Describe("Count", Ordered, func() {
	var fx fixture

	BeforeAll(func(ctx SpecContext) {
		fx = buildFixture(ctx)
	})

	It("records the resolved commit and its committer date", func(ctx SpecContext) {
		report, err := count.Count(ctx, fx.repo, "main")
		Expect(err).NotTo(HaveOccurred())
		Expect(report.Repo).To(Equal("ceph/ceph"))
		Expect(report.Rev).To(Equal(fx.rev))
		Expect(report.CommitDate).To(Equal(fixtureDate))
	})

	It("counts every regular file, sorted by path, skipping symlinks and gitlinks", func(ctx SpecContext) {
		report, err := count.Count(ctx, fx.repo, fx.rev)
		Expect(err).NotTo(HaveOccurred())
		Expect(report.Files).To(Equal([]count.File{
			{Path: ".gitmodules", Lang: "other", Code: 6, Bytes: int64(len(superGitmodules))},
			{Path: "Makefile", Lang: "make", Code: 2, Comment: 1, Bytes: int64(len(makefile))},
			{Path: "assets/logo.bin", Lang: "binary", Bytes: int64(len(logoBin)), Binary: true},
			{Path: "doc/notes.txt", Lang: "text", Code: 3, Blank: 1, Bytes: int64(len(notesTxt))},
			{Path: "empty.txt", Lang: "text"},
			{Path: "i18n/messages.xlf", Lang: "xml", Code: 4, Comment: 2, Blank: 1, Bytes: int64(len(messagesXlf))},
			{Path: "scripts/run", Lang: "shell", Code: 2, Comment: 2, Blank: 1, Bytes: int64(len(runSh))},
			{Path: "src/crlf.c", Lang: "c", Code: 2, Comment: 1, Blank: 1, Bytes: int64(len(crlfC))},
			{Path: "src/mixed.cpp", Lang: "cpp", Code: 3, Comment: 3, Blank: 1, Bytes: int64(len(mixedCpp))},
			{Path: "src/pybind/rados.pyx", Lang: "cython", Code: 2, Comment: 2, Blank: 1, Bytes: int64(len(radosPyx))},
			{Path: "src/test/cli/help.t", Lang: "cram", Code: 3, Blank: 1, Bytes: int64(len(helpT))},
			{Path: "tools/tool.py", Lang: "python", Code: 2, Comment: 4, Blank: 1, Bytes: int64(len(toolPy))},
		}))
	})

	It("aggregates an available submodule per language and marks absent ones", func(ctx SpecContext) {
		report, err := count.Count(ctx, fx.repo, fx.rev)
		Expect(err).NotTo(HaveOccurred())
		Expect(report.Submodules).To(Equal([]count.Submodule{
			{
				Path:      "vendor/foo",
				Rev:       fx.subRev,
				Available: true,
				Langs: map[string]count.Totals{
					"go":       {Files: 1, Code: 2, Comment: 1, Blank: 1, Bytes: int64(len(libGo))},
					"markdown": {Files: 1, Code: 2, Blank: 1, Bytes: int64(len(libReadme))},
					"other":    {Files: 1, Code: 3, Bytes: int64(len(subGitmodules))},
				},
			},
			{Path: "vendor/foo/deps/x", Rev: nestedSHA, Langs: map[string]count.Totals{}},
			{Path: "vendor/gone", Rev: goneSHA, Langs: map[string]count.Totals{}},
		}))
	})

	It("writes identical bytes on two runs", func(ctx SpecContext) {
		first, second := &bytes.Buffer{}, &bytes.Buffer{}
		for _, buf := range []*bytes.Buffer{first, second} {
			report, err := count.Count(ctx, fx.repo, fx.rev)
			Expect(err).NotTo(HaveOccurred())
			Expect(report.WriteJSON(buf)).To(Succeed())
		}
		Expect(second.String()).To(Equal(first.String()))
	})

	It("writes valid JSON with one file or submodule row per line", func(ctx SpecContext) {
		report, err := count.Count(ctx, fx.repo, fx.rev)
		Expect(err).NotTo(HaveOccurred())
		buf := &bytes.Buffer{}
		Expect(report.WriteJSON(buf)).To(Succeed())

		var decoded count.Report
		Expect(json.Unmarshal(buf.Bytes(), &decoded)).To(Succeed(), "output:\n%s", buf)
		Expect(&decoded).To(Equal(report))

		var rows []string
		for line := range strings.Lines(buf.String()) {
			if strings.HasPrefix(line, `{"path":`) {
				rows = append(rows, line)
			}
		}
		Expect(rows).To(HaveLen(len(report.Files)+len(report.Submodules)), "output:\n%s", buf)
	})

	It("rejects a revision the repository does not have", func(ctx SpecContext) {
		_, err := count.Count(ctx, fx.repo, "no-such-rev")
		Expect(err).To(MatchError(ContainSubstring(`resolving revision "no-such-rev"`)))
	})
})

var _ = Describe("Count with submodule names that leave .git/modules", func() {
	It("marks those submodules unavailable rather than reading outside it", func(ctx SpecContext) {
		fx := buildEscapeFixture(ctx)
		report, err := count.Count(ctx, fx.repo, fx.rev)
		Expect(err).NotTo(HaveOccurred())
		Expect(report.Submodules).To(Equal([]count.Submodule{
			{Path: "vendor/abs", Rev: fx.subRev, Langs: map[string]count.Totals{}},
			{Path: "vendor/escape", Rev: fx.subRev, Langs: map[string]count.Totals{}},
		}))
	})
})
