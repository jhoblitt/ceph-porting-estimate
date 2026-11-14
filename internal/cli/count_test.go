package cli_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/cli"
	"github.com/jhoblitt/ceph-porting-estimate/internal/count"
)

var _ = Describe("count", func() {
	run := func(args ...string) error {
		return cli.Run(context.Background(), args, &bytes.Buffer{}, &bytes.Buffer{}, &bytes.Buffer{})
	}

	DescribeTable("a missing required flag",
		func(want string, args ...string) {
			Expect(run(append([]string{"count"}, args...)...)).To(MatchError(want))
		},
		Entry("--repo", "--repo is required", "--rev", "HEAD", "--out", "sloc.json"),
		Entry("--rev", "--rev is required", "--repo", ".", "--out", "sloc.json"),
		Entry("--out", "--out is required", "--repo", ".", "--rev", "HEAD"),
	)

	It("writes sloc.json for the commit", func(ctx SpecContext) {
		repo := GinkgoT().TempDir()
		for _, args := range [][]string{
			{"init", "-q", "-b", "main"},
			{"config", "user.name", "fixture"},
			{"config", "user.email", "fixture@example.invalid"},
		} {
			git(ctx, repo, args...)
		}
		Expect(os.WriteFile(filepath.Join(repo, "a.py"), []byte("x = 1\n"), 0o644)).To(Succeed())
		git(ctx, repo, "add", "a.py")
		git(ctx, repo, "commit", "-q", "-m", "a")
		out := filepath.Join(GinkgoT().TempDir(), "sloc.json")

		Expect(run("count", "--repo", repo, "--rev", "main", "--out", out)).To(Succeed())

		raw, err := os.ReadFile(out)
		Expect(err).NotTo(HaveOccurred())
		var report count.Report
		Expect(json.Unmarshal(raw, &report)).To(Succeed(), "sloc.json:\n%s", raw)
		Expect(report.Files).To(Equal([]count.File{{Path: "a.py", Lang: "python", Code: 1, Bytes: 6}}))
	})
})

func git(ctx context.Context, dir string, args ...string) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL=/dev/null", "GIT_CONFIG_NOSYSTEM=1")
	out, err := cmd.CombinedOutput()
	Expect(err).NotTo(HaveOccurred(), "git %v: %s", args, out)
}
