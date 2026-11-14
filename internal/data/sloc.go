package data

// SLOC is generated/sloc.json, the counter's per-file output.
type SLOC struct {
	Repo       string      `json:"repo"`
	Rev        string      `json:"rev"`
	CommitDate string      `json:"commit_date"`
	Files      []File      `json:"files"`
	Submodules []Submodule `json:"submodules"`
}

// File is one counted file of the ceph tree.
type File struct {
	Path    string `json:"path"`
	Lang    string `json:"lang"`
	Code    int64  `json:"code"`
	Comment int64  `json:"comment"`
	Blank   int64  `json:"blank"`
	Bytes   int64  `json:"bytes"`
	Binary  bool   `json:"binary"`
}

// Submodule is a submodule counted per language rather than per file.
type Submodule struct {
	Path      string            `json:"path"`
	Rev       string            `json:"rev"`
	Available bool              `json:"available"`
	Langs     map[string]Counts `json:"langs"`
}

// Counts are line and byte totals over some set of files.
type Counts struct {
	Files   int64 `json:"files"`
	Code    int64 `json:"code"`
	Comment int64 `json:"comment"`
	Blank   int64 `json:"blank"`
	Bytes   int64 `json:"bytes"`
}

// Add accumulates o into c.
func (c *Counts) Add(o Counts) {
	c.Files += o.Files
	c.Code += o.Code
	c.Comment += o.Comment
	c.Blank += o.Blank
	c.Bytes += o.Bytes
}

// Counts returns the file's contribution to a Counts total.
func (f *File) Counts() Counts {
	return Counts{Files: 1, Code: f.Code, Comment: f.Comment, Blank: f.Blank, Bytes: f.Bytes}
}
