package count

import (
	"bytes"
	"path"
	"slices"
	"sync"

	"github.com/boyter/scc/v3/processor"
)

// binarySniffLen is how much of a file is searched for a NUL byte, the mark
// of binary content.
const binarySniffLen = 8 << 10

// lines is a file's line count by kind.
type lines struct {
	code, comment, blank int64
}

var sccInit sync.Once

// initSCC loads scc's language database into its package state. scc keeps
// that database, and the switches that shape counting, in package variables;
// this is the only place that writes them.
func initSCC() {
	sccInit.Do(func() {
		processor.Complexity = true // true skips cyclomatic complexity, which is not reported
		processor.ProcessConstants()
	})
}

// isBinary reports whether content has a NUL byte in its first 8 KiB.
func isBinary(content []byte) bool {
	return bytes.IndexByte(content[:min(len(content), binarySniffLen)], 0) >= 0
}

// classify counts the lines of a text file with the comment syntax of the
// scc language sccLang. An unknown or empty sccLang has no comment syntax:
// every non-blank line is code.
func classify(sccLang string, content []byte) lines {
	initSCC()
	job := &processor.FileJob{
		Language: sccLang,
		Content:  content,
		Bytes:    int64(len(content)),
	}
	processor.CountStats(job)
	return lines{code: job.Code, comment: job.Comment, blank: job.Blank}
}

// otherSyntax returns the scc language for a file in no sloc.json language,
// so that the comments of a Makefile or an INI file are still told apart from
// its code. It returns "" when scc does not know the file either.
func otherSyntax(p string, content []byte) string {
	initSCC()
	candidates, _ := processor.DetectLanguage(path.Base(p))
	if len(candidates) == 1 && candidates[0] == processor.SheBang {
		return ""
	}
	// scc builds the candidate list by ranging over a map, and its tie-break
	// between candidates follows list order: sort it for a stable answer.
	return processor.DetermineLanguage(p, "", slices.Sorted(slices.Values(candidates)), content)
}
