package cli_test

import (
	"bytes"
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/cli"
)

// The data package owns the valid fixture; the rollup package owns the
// report it must produce.
const (
	fixtureDir = "../data/testdata/valid"
	goldenFile = "../rollup/testdata/report.golden.json"
)

// copyFixture copies the valid fixture into a temporary directory,
// replacing the one occurrence of old with replacement in file, and
// returns the directory.
func copyFixture(file, old, replacement string) string {
	dir := GinkgoT().TempDir()
	root := os.DirFS(fixtureDir)
	err := fs.WalkDir(root, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dst := filepath.Join(dir, path)
		if d.IsDir() {
			return os.MkdirAll(dst, 0o750)
		}
		b, err := fs.ReadFile(root, path)
		if err != nil {
			return err
		}
		if path == file {
			Expect(strings.Count(string(b), old)).To(Equal(1), "occurrences of %q in %s", old, file)
			b = []byte(strings.Replace(string(b), old, replacement, 1))
		}
		return os.WriteFile(dst, b, 0o600)
	})
	ExpectWithOffset(1, err).NotTo(HaveOccurred())
	return dir
}

var _ = Describe("data commands", func() {
	var stdout, stderr *bytes.Buffer

	BeforeEach(func() {
		stdout = &bytes.Buffer{}
		stderr = &bytes.Buffer{}
	})

	run := func(args ...string) error {
		return cli.Run(context.Background(), args, &bytes.Buffer{}, stdout, stderr)
	}

	badRev := func() string {
		return copyFixture("assumptions.yaml",
			"rev: 0123456789abcdef0123456789abcdef01234567", "rev: 1111111111111111111111111111111111111111")
	}

	Describe("check", func() {
		It("passes the valid fixture and prints the unclassified summary", func() {
			Expect(run("check", "--data", fixtureDir)).To(Succeed())
			Expect(stdout.String()).To(Equal(
				"unclassified: 1 file, 9 of 999 code lines (0.90%)\n" +
					"         9 code        400 bytes  README.md\n"))
		})

		It("reads the data directory from CEPHEST_DATA", func() {
			GinkgoT().Setenv("CEPHEST_DATA", fixtureDir)
			Expect(run("check")).To(Succeed())
		})

		It("defaults the data directory to data", func() {
			Expect(run("check")).To(MatchError(ContainSubstring("loading data: ")))
		})

		It("fails on a bad data set, naming the directory and every problem, after printing the summary", func() {
			dir := badRev()
			Expect(run("check", "--data", dir)).To(MatchError(
				"checking " + dir + ": 1 problem:\n" +
					"  assumptions.yaml: ceph.rev 1111111111111111111111111111111111111111 " +
					"does not match generated/sloc.json rev 0123456789abcdef0123456789abcdef01234567"))
			Expect(stdout.String()).To(HavePrefix("unclassified: 1 file, 9 of 999 code lines (0.90%)\n"))
		})
	})

	Describe("rollup", func() {
		It("requires --out", func() {
			Expect(run("rollup", "--data", fixtureDir)).To(MatchError("--out is required"))
		})

		It("writes the report the rollup package's golden file pins", func() {
			out := filepath.Join(GinkgoT().TempDir(), "generated", "report.json")
			Expect(run("rollup", "--data", fixtureDir, "--out", out)).To(Succeed())
			got, err := os.ReadFile(out)
			Expect(err).NotTo(HaveOccurred())
			want, err := os.ReadFile(goldenFile)
			Expect(err).NotTo(HaveOccurred())
			Expect(string(got)).To(Equal(string(want)))
		})

		It("refuses to write the report when check fails", func() {
			out := filepath.Join(GinkgoT().TempDir(), "report.json")
			Expect(run("rollup", "--data", badRev(), "--out", out)).To(MatchError(ContainSubstring("ceph.rev")))
			_, err := os.Stat(out)
			Expect(err).To(MatchError(fs.ErrNotExist))
		})
	})
})
