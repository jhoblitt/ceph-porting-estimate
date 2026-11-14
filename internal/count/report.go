package count

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// Report is the content of sloc.json: per-file counts for one commit of the
// superproject, and per-language totals for each of its submodules.
type Report struct {
	Repo       string      `json:"repo"`
	Rev        string      `json:"rev"`
	CommitDate string      `json:"commit_date"`
	Files      []File      `json:"files"`
	Submodules []Submodule `json:"submodules"`
}

// File is the line and byte count of one regular file.
type File struct {
	Path    string `json:"path"`
	Lang    string `json:"lang"`
	Code    int64  `json:"code"`
	Comment int64  `json:"comment"`
	Blank   int64  `json:"blank"`
	Bytes   int64  `json:"bytes"`
	Binary  bool   `json:"binary"`
}

// Submodule is one gitlink: its commit, whether that commit was found in a
// local module repository, and if it was, its totals per language.
type Submodule struct {
	Path      string            `json:"path"`
	Rev       string            `json:"rev"`
	Available bool              `json:"available"`
	Langs     map[string]Totals `json:"langs"`
}

// Totals sums the files of one language.
type Totals struct {
	Files   int64 `json:"files"`
	Code    int64 `json:"code"`
	Comment int64 `json:"comment"`
	Blank   int64 `json:"blank"`
	Bytes   int64 `json:"bytes"`
}

// WriteJSON writes r to w as JSON with one file or submodule per line, so
// that a recount diffs line by line.
func (r *Report) WriteJSON(w io.Writer) error {
	var buf bytes.Buffer
	header, err := json.Marshal(struct {
		Repo       string `json:"repo"`
		Rev        string `json:"rev"`
		CommitDate string `json:"commit_date"`
	}{r.Repo, r.Rev, r.CommitDate})
	if err != nil {
		return fmt.Errorf("encoding the report header: %w", err)
	}
	buf.Write(bytes.TrimSuffix(header, []byte("}")))
	buf.WriteString(",\n")
	if err := writeRows(&buf, "files", r.Files); err != nil {
		return err
	}
	buf.WriteString(",\n")
	if err := writeRows(&buf, "submodules", r.Submodules); err != nil {
		return err
	}
	buf.WriteString("\n}\n")
	if _, err := w.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("writing the report: %w", err)
	}
	return nil
}

// writeRows writes `"key":[` and then the rows one per line, ending at the
// closing bracket.
func writeRows[T any](buf *bytes.Buffer, key string, rows []T) error {
	buf.WriteString(`"` + key + `":[`)
	for i, row := range rows {
		b, err := json.Marshal(row)
		if err != nil {
			return fmt.Errorf("encoding %s row %d: %w", key, i, err)
		}
		if i > 0 {
			buf.WriteByte(',')
		}
		buf.WriteByte('\n')
		buf.Write(b)
	}
	if len(rows) > 0 {
		buf.WriteByte('\n')
	}
	buf.WriteByte(']')
	return nil
}
