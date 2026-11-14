package count

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// Tree entry modes, as git ls-tree prints them.
const (
	modeFile       = "100644"
	modeExecutable = "100755"
	modeGitlink    = "160000"
)

// gitDir is the absolute path of a git directory. Every read goes through
// object-level commands, so a dirty or absent working tree never matters.
type gitDir string

type treeEntry struct {
	mode, oid, path string
}

// openRepo returns the git directory holding the objects and the submodule
// repositories of the checkout at path.
func openRepo(ctx context.Context, path string) (gitDir, error) {
	out, err := runGit(ctx, "-C", path, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return "", fmt.Errorf("finding the git directory of %s: %w", path, err)
	}
	return gitDir(strings.TrimSpace(string(out))), nil
}

func (g gitDir) git(ctx context.Context, args ...string) ([]byte, error) {
	return runGit(ctx, append([]string{"--git-dir=" + string(g)}, args...)...)
}

// moduleDir is where git keeps the repository of the submodule called name.
// The name comes from .gitmodules at the counted commit, which is untrusted:
// it reports false for a name git itself would refuse, or one that would
// land outside g's modules directory.
func (g gitDir) moduleDir(name string) (gitDir, bool) {
	if !validSubmoduleName(name) {
		return "", false
	}
	base := filepath.Join(string(g), "modules")
	dir := filepath.Join(base, filepath.FromSlash(name))
	if !strings.HasPrefix(dir, base+string(filepath.Separator)) {
		return "", false
	}
	return gitDir(dir), true
}

// validSubmoduleName applies git's check_submodule_name, which refuses an
// empty name and a ".." segment split on either slash, and refuses an
// absolute name besides.
func validSubmoduleName(name string) bool {
	if name == "" || filepath.IsAbs(name) || strings.HasPrefix(name, `\`) {
		return false
	}
	for seg := range strings.FieldsFuncSeq(name, func(r rune) bool { return r == '/' || r == '\\' }) {
		if seg == ".." {
			return false
		}
	}
	return true
}

func (g gitDir) resolveCommit(ctx context.Context, rev string) (string, error) {
	out, err := g.git(ctx, "rev-parse", "--verify", "--quiet", "--end-of-options", rev+"^{commit}")
	if err != nil {
		return "", fmt.Errorf("resolving revision %q: %w", rev, err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (g gitDir) commitDate(ctx context.Context, sha string) (string, error) {
	out, err := g.git(ctx, "show", "-s", "--format=%cI", sha)
	if err != nil {
		return "", fmt.Errorf("reading the commit date of %s: %w", sha, err)
	}
	return strings.TrimSpace(string(out)), nil
}

// hasCommit reports whether g exists and holds the commit sha.
func (g gitDir) hasCommit(ctx context.Context, sha string) bool {
	_, err := g.git(ctx, "cat-file", "-e", sha+"^{commit}")
	return err == nil
}

// listTree returns every entry of the commit sha's tree, recursively. A
// gitlink is an entry of its own; the submodule behind it is not descended.
func (g gitDir) listTree(ctx context.Context, sha string) ([]treeEntry, error) {
	out, err := g.git(ctx, "ls-tree", "-r", "-z", "--full-tree", "--format=%(objectmode) %(objectname)%x09%(path)", sha)
	if err != nil {
		return nil, fmt.Errorf("listing the tree of %s: %w", sha, err)
	}
	var entries []treeEntry
	if len(out) == 0 {
		return entries, nil
	}
	for rec := range bytes.SplitSeq(bytes.TrimSuffix(out, []byte{0}), []byte{0}) {
		meta, p, ok := strings.Cut(string(rec), "\t")
		mode, oid, ok2 := strings.Cut(meta, " ")
		if !ok || !ok2 {
			return nil, fmt.Errorf("parsing ls-tree record %q", rec)
		}
		entries = append(entries, treeEntry{mode: mode, oid: oid, path: p})
	}
	return entries, nil
}

// submoduleNames maps each submodule path declared in the .gitmodules blob
// oid to the submodule's name, which is where its repository lives under
// modules/.
func (g gitDir) submoduleNames(ctx context.Context, oid string) (map[string]string, error) {
	names := map[string]string{}
	out, err := g.git(ctx, "config", "--blob", oid, "--null", "--get-regexp", `^submodule\..*\.path$`)
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
		return names, nil // no submodule declares a path
	}
	if err != nil {
		return nil, fmt.Errorf("reading .gitmodules: %w", err)
	}
	for rec := range bytes.SplitSeq(bytes.TrimSuffix(out, []byte{0}), []byte{0}) {
		key, p, ok := strings.Cut(string(rec), "\n")
		if !ok {
			return nil, fmt.Errorf("parsing .gitmodules record %q", rec)
		}
		names[p] = strings.TrimSuffix(strings.TrimPrefix(key, "submodule."), ".path")
	}
	return names, nil
}

func runGit(ctx context.Context, args ...string) ([]byte, error) {
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "git", args...) //nolint:gosec // the arguments are the operator's repository and revision, and no argument reaches a shell
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return out, nil
}
