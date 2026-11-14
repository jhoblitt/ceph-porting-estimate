package cli_test

import (
	"bytes"
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/cli"
)

var _ = Describe("Run", func() {
	var stdout, stderr *bytes.Buffer

	BeforeEach(func() {
		stdout = &bytes.Buffer{}
		stderr = &bytes.Buffer{}
	})

	run := func(args ...string) error {
		return cli.Run(context.Background(), args, &bytes.Buffer{}, stdout, stderr)
	}

	DescribeTable("a subcommand whose behavior has not landed",
		func(name string) {
			Expect(run(name)).To(MatchError("not implemented"), "subcommand %q", name)
		},
		Entry("check", "check"),
		Entry("rollup", "rollup"),
	)

	It("lists every subcommand in its help", func() {
		Expect(run("--help")).To(Succeed())
		for _, name := range []string{"count", "check", "rollup"} {
			Expect(stdout.String()).To(MatchRegexp(`(?m)^  %s\s`, name), "subcommand %q", name)
		}
	})

	It("rejects an unknown log format before running a subcommand", func() {
		Expect(run("--log-format", "xml", "count")).To(MatchError(`unknown log format "xml"`))
	})
})
