// Package count counts the source lines of every file at one commit of a git
// repository, reading objects only, and of the submodules it pins.
package count

import (
	"cmp"
	"context"
	"path"
	"slices"
)

// upstream names the repository sloc.json describes.
const upstream = "ceph/ceph"

// Count counts every regular file at rev in the repository checked out at
// repoPath, and every submodule whose pinned commit a local module repository
// holds. Symlinks are not files and are skipped; gitlinks are counted as
// submodules, not descended.
func Count(ctx context.Context, repoPath, rev string) (*Report, error) {
	g, err := openRepo(ctx, repoPath)
	if err != nil {
		return nil, err
	}
	sha, err := g.resolveCommit(ctx, rev)
	if err != nil {
		return nil, err
	}
	date, err := g.commitDate(ctx, sha)
	if err != nil {
		return nil, err
	}
	files, submodules, err := g.countCommit(ctx, sha, "")
	if err != nil {
		return nil, err
	}
	return &Report{
		Repo:       upstream,
		Rev:        sha,
		CommitDate: date,
		Files:      files,
		Submodules: submodules,
	}, nil
}

// countCommit counts the files of commit sha in g, and the submodules it pins
// and theirs, recursively. Paths are prefixed with prefix, the commit's
// location in the superproject.
func (g gitDir) countCommit(ctx context.Context, sha, prefix string) ([]File, []Submodule, error) {
	entries, err := g.listTree(ctx, sha)
	if err != nil {
		return nil, nil, err
	}

	var blobs, gitlinks []treeEntry
	gitmodules := ""
	for _, e := range entries {
		switch e.mode {
		case modeFile, modeExecutable:
			blobs = append(blobs, e)
			if e.path == ".gitmodules" {
				gitmodules = e.oid
			}
		case modeGitlink:
			gitlinks = append(gitlinks, e)
		}
	}

	files := make([]File, len(blobs))
	oids := make([]string, len(blobs))
	for i, e := range blobs {
		oids[i] = e.oid
	}
	err = g.readBlobs(ctx, oids, func(i int, content []byte) error {
		files[i] = countFile(path.Join(prefix, blobs[i].path), content)
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	slices.SortFunc(files, func(a, b File) int { return cmp.Compare(a.Path, b.Path) })

	var submodules []Submodule
	if len(gitlinks) > 0 {
		names := map[string]string{}
		if gitmodules != "" {
			if names, err = g.submoduleNames(ctx, gitmodules); err != nil {
				return nil, nil, err
			}
		}
		for _, e := range gitlinks {
			subs, err := g.countSubmodule(ctx, e, names, prefix)
			if err != nil {
				return nil, nil, err
			}
			submodules = append(submodules, subs...)
		}
	}
	slices.SortFunc(submodules, func(a, b Submodule) int { return cmp.Compare(a.Path, b.Path) })
	return files, submodules, nil
}

// countSubmodule counts the gitlink e when its module repository holds the
// pinned commit, returning its row and those of the submodules it pins in
// turn. names maps the parent's submodule paths to their names; a path
// .gitmodules does not declare is taken as its own name, as git does. A name
// moduleDir refuses leaves the submodule unavailable, as a missing module does.
func (g gitDir) countSubmodule(ctx context.Context, e treeEntry, names map[string]string, prefix string) ([]Submodule, error) {
	full := path.Join(prefix, e.path)
	row := Submodule{Path: full, Rev: e.oid, Langs: map[string]Totals{}}

	name, ok := names[e.path]
	if !ok {
		name = e.path
	}
	mod, ok := g.moduleDir(name)
	if !ok || !mod.hasCommit(ctx, e.oid) {
		return []Submodule{row}, nil
	}

	files, nested, err := mod.countCommit(ctx, e.oid, full)
	if err != nil {
		return nil, err
	}
	row.Available = true
	for _, f := range files {
		t := row.Langs[f.Lang]
		t.Files++
		t.Code += f.Code
		t.Comment += f.Comment
		t.Blank += f.Blank
		t.Bytes += f.Bytes
		row.Langs[f.Lang] = t
	}
	return append([]Submodule{row}, nested...), nil
}

// countFile classifies one file's content.
func countFile(p string, content []byte) File {
	f := File{Path: p, Bytes: int64(len(content))}
	if isBinary(content) {
		f.Lang = langBinary
		f.Binary = true
		return f
	}
	s, ok := detect(p, content)
	if !ok {
		s = syntax{lang: langOther, scc: otherSyntax(p, content)}
	}
	n := classify(s.scc, content)
	f.Lang, f.Code, f.Comment, f.Blank = s.lang, n.code, n.comment, n.blank
	return f
}
