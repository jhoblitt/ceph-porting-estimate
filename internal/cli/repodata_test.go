package cli_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/cli"
)

const modulePath = "github.com/jhoblitt/ceph-porting-estimate"

// repoRoot walks up from the working directory, which go test sets to the
// package directory, to the directory whose go.mod declares this module.
func repoRoot() string {
	dir, err := os.Getwd()
	ExpectWithOffset(1, err).NotTo(HaveOccurred())
	for {
		if goModDeclares(filepath.Join(dir, "go.mod"), modulePath) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			Fail("no go.mod declaring module " + modulePath + " above the working directory")
		}
		dir = parent
	}
}

func goModDeclares(path, module string) bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for line := range strings.Lines(string(b)) {
		if name, ok := strings.CutPrefix(strings.TrimSpace(line), "module "); ok {
			return strings.Trim(strings.TrimSpace(name), `"`) == module
		}
	}
	return false
}

// The committed data is checked here as well as by make data-check, so a
// plain go test ./... fails on invalid data whatever the Makefile does.
var _ = Describe("the repository's data directory", func() {
	It("passes check", func() {
		dir := filepath.Join(repoRoot(), "data")
		stdout := &bytes.Buffer{}
		err := cli.Run(context.Background(), []string{"check", "--data", dir},
			&bytes.Buffer{}, stdout, &bytes.Buffer{})
		Expect(err).NotTo(HaveOccurred(), "check output:\n%s", stdout)
		Expect(stdout.String()).To(HavePrefix("unclassified: "))
	})
})
