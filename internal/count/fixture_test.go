package count_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

const (
	fixtureDate = "2026-11-14T05:11:18+05:30"
	nestedSHA   = "2222222222222222222222222222222222222222"
	goneSHA     = "1111111111111111111111111111111111111111"

	mixedCpp = `// leading line comment
#include <cstdio>

/* block comment
   spanning lines */
const char *url = "http://example.com"; // a URL, not a comment
int main() { /* inline */ return 0; }
`
	toolPy = `#!/usr/bin/env python3
"""Module docstring
spanning two lines."""

# a comment
def f():
    return 1  # trailing
`
	runSh = `#!/bin/sh
# say hi
echo hi

exit 0
`
	logoBin  = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
	crlfC    = "int a;\r\n// note\r\n\r\nint b;\r\n"
	makefile = "# build everything\nall:\n\ttrue\n"
	radosPyx = `# cython: language_level=3
"""Bindings docstring."""

cdef extern from "rados.h":
    int rados_create(void *cluster)  # create
`
	messagesXlf = `<?xml version="1.0"?>
<!-- a comment
     spanning lines -->
<xliff version="1.2">

  <file/> <!-- trailing -->
</xliff>
`
	notesTxt = "Some notes.\n# not a comment\n\nlast line\n"
	helpT    = "  $ ceph --version\n  ceph version\n\n# also output, not a comment\n"

	superGitmodules = `[submodule "libfoo"]
	path = vendor/foo
	url = https://example.invalid/libfoo.git
[submodule "gone"]
	path = vendor/gone
	url = https://example.invalid/gone.git
`

	libGo         = "package lib\n\n// F does nothing.\nfunc F() {}\n"
	libReadme     = "# lib\n\nSome text.\n"
	subGitmodules = `[submodule "x"]
	path = deps/x
	url = https://example.invalid/x.git
`
)

// fixture is a superproject with one file per classification case, a
// symlink, a gitlink whose module is absent, and a gitlink named differently
// from its path whose module is present and itself holds an absent gitlink.
type fixture struct {
	repo   string
	rev    string
	subRev string
}

func buildFixture(ctx context.Context) fixture {
	gitIn := func(dir string, args ...string) string { return runGit(ctx, dir, args...) }

	sub := GinkgoT().TempDir()
	gitIn(sub, "init", "-q", "-b", "main")
	writeFile(sub, "lib.go", libGo)
	writeFile(sub, "README.md", libReadme)
	writeFile(sub, ".gitmodules", subGitmodules)
	gitIn(sub, "add", ".")
	gitIn(sub, "update-index", "--add", "--cacheinfo", "160000,"+nestedSHA+",deps/x")
	gitIn(sub, "commit", "-q", "-m", "lib")
	subRev := gitIn(sub, "rev-parse", "HEAD")

	repo := GinkgoT().TempDir()
	gitIn(repo, "init", "-q", "-b", "main")
	writeFile(repo, "src/mixed.cpp", mixedCpp)
	writeFile(repo, "tools/tool.py", toolPy)
	writeFile(repo, "scripts/run", runSh)
	Expect(os.Chmod(filepath.Join(repo, "scripts/run"), 0o755)).To(Succeed())
	writeFile(repo, "assets/logo.bin", logoBin)
	writeFile(repo, "src/crlf.c", crlfC)
	writeFile(repo, "src/pybind/rados.pyx", radosPyx)
	writeFile(repo, "i18n/messages.xlf", messagesXlf)
	writeFile(repo, "doc/notes.txt", notesTxt)
	writeFile(repo, "src/test/cli/help.t", helpT)
	writeFile(repo, "empty.txt", "")
	writeFile(repo, "Makefile", makefile)
	writeFile(repo, ".gitmodules", superGitmodules)
	Expect(os.Symlink("src/mixed.cpp", filepath.Join(repo, "link.cpp"))).To(Succeed())
	gitIn(repo, "add", ".")
	gitIn(repo, "update-index", "--add", "--cacheinfo", "160000,"+subRev+",vendor/foo")
	gitIn(repo, "update-index", "--add", "--cacheinfo", "160000,"+goneSHA+",vendor/gone")
	gitIn(repo, "commit", "-q", "-m", "super")
	rev := gitIn(repo, "rev-parse", "HEAD")

	gitIn(repo, "clone", "-q", "--bare", sub, filepath.Join(repo, ".git", "modules", "libfoo"))

	return fixture{repo: repo, rev: rev, subRev: subRev}
}

// escapeFixture is a superproject whose .gitmodules gives two submodules
// names that reach outside .git/modules: a relative one with a ".." segment
// and an absolute one. At both places a repository holding the pinned commit
// waits, so following either name would make that submodule available.
type escapeFixture struct {
	repo, rev, subRev string
}

func buildEscapeFixture(ctx context.Context) escapeFixture {
	gitIn := func(dir string, args ...string) string { return runGit(ctx, dir, args...) }

	sub := GinkgoT().TempDir()
	gitIn(sub, "init", "-q", "-b", "main")
	writeFile(sub, "lib.go", libGo)
	gitIn(sub, "add", ".")
	gitIn(sub, "commit", "-q", "-m", "lib")
	subRev := gitIn(sub, "rev-parse", "HEAD")

	absName := filepath.Join(GinkgoT().TempDir(), "abs")
	repo := GinkgoT().TempDir()
	gitIn(repo, "init", "-q", "-b", "main")
	writeFile(repo, ".gitmodules", `[submodule "../escape"]
	path = vendor/escape
	url = https://example.invalid/escape.git
[submodule "`+absName+`"]
	path = vendor/abs
	url = https://example.invalid/abs.git
`)
	gitIn(repo, "add", ".")
	gitIn(repo, "update-index", "--add", "--cacheinfo", "160000,"+subRev+",vendor/escape")
	gitIn(repo, "update-index", "--add", "--cacheinfo", "160000,"+subRev+",vendor/abs")
	gitIn(repo, "commit", "-q", "-m", "super")
	rev := gitIn(repo, "rev-parse", "HEAD")

	gitIn(repo, "clone", "-q", "--bare", sub, filepath.Join(repo, ".git", "escape"))
	gitIn(repo, "clone", "-q", "--bare", sub, absName)

	return escapeFixture{repo: repo, rev: rev, subRev: subRev}
}

func writeFile(dir, name, content string) {
	path := filepath.Join(dir, name)
	Expect(os.MkdirAll(filepath.Dir(path), 0o755)).To(Succeed())
	Expect(os.WriteFile(path, []byte(content), 0o644)).To(Succeed())
}

// runGit runs git in dir isolated from the caller's configuration, with fixed
// identities and dates so commit hashes do not depend on the machine.
func runGit(ctx context.Context, dir string, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_AUTHOR_NAME=fixture",
		"GIT_AUTHOR_EMAIL=fixture@example.invalid",
		"GIT_COMMITTER_NAME=fixture",
		"GIT_COMMITTER_EMAIL=fixture@example.invalid",
		"GIT_AUTHOR_DATE="+fixtureDate,
		"GIT_COMMITTER_DATE="+fixtureDate,
	)
	out, err := cmd.CombinedOutput()
	Expect(err).NotTo(HaveOccurred(), "git %s: %s", strings.Join(args, " "), out)
	return strings.TrimSpace(string(out))
}
