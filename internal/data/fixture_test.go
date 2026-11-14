package data_test

import (
	"io/fs"
	"os"
	"strings"
	"testing/fstest"

	. "github.com/onsi/gomega"
)

// edit turns the valid fixture into a minimal bad one: it replaces the one
// occurrence of Old in File with New. An empty Old creates File with New as
// its content; Remove deletes File.
type edit struct {
	File   string
	Old    string
	New    string
	Remove bool
}

// fixture returns testdata/valid with edits applied. Every Old must occur
// exactly once, so a fixture change cannot silently turn a bad case into a
// valid one.
func fixture(edits ...edit) fstest.MapFS {
	m := fstest.MapFS{}
	root := os.DirFS("testdata/valid")
	err := fs.WalkDir(root, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := fs.ReadFile(root, path)
		m[path] = &fstest.MapFile{Data: b}
		return err
	})
	ExpectWithOffset(1, err).NotTo(HaveOccurred())

	for _, e := range edits {
		switch {
		case e.Remove:
			ExpectWithOffset(1, m).To(HaveKey(e.File))
			delete(m, e.File)
		case e.Old == "":
			ExpectWithOffset(1, m).NotTo(HaveKey(e.File))
			m[e.File] = &fstest.MapFile{Data: []byte(e.New)}
		default:
			ExpectWithOffset(1, m).To(HaveKey(e.File))
			body := string(m[e.File].Data)
			ExpectWithOffset(1, strings.Count(body, e.Old)).To(Equal(1), "occurrences of %q in %s", e.Old, e.File)
			m[e.File] = &fstest.MapFile{Data: []byte(strings.Replace(body, e.Old, e.New, 1))}
		}
	}
	return m
}
