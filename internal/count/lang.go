package count

import (
	"bytes"
	"path"
	"strings"
)

// Language identifiers written to sloc.json. Every text file whose language
// is not in langByName, langByExt or the shebang table is "other".
const (
	langOther  = "other"
	langBinary = "binary"
)

// noComments is the syntax of a language without comments, which scc has no
// entry for: every non-blank line is code.
const noComments = ""

// syntax names the language whose comment syntax a file is counted with: an
// output language and the scc language-database entry for its syntax. One
// output language can span several syntaxes, as CSS does SCSS.
type syntax struct {
	lang string
	scc  string
}

var langByExt = map[string]syntax{
	"c":         {"c", "C"},
	"h":         {"cpp", "C++"},
	"cc":        {"cpp", "C++"},
	"cpp":       {"cpp", "C++"},
	"cxx":       {"cpp", "C++"},
	"c++":       {"cpp", "C++"},
	"hh":        {"cpp", "C++"},
	"hpp":       {"cpp", "C++"},
	"hxx":       {"cpp", "C++"},
	"ipp":       {"cpp", "C++"},
	"inl":       {"cpp", "C++"},
	"tcc":       {"cpp", "C++"},
	"py":        {"python", "Python"},
	"pyi":       {"python", "Python"},
	"sh":        {"shell", "Shell"},
	"bash":      {"shell", "Shell"},
	"go":        {"go", "Go"},
	"rs":        {"rust", "Rust"},
	"java":      {"java", "Java"},
	"ts":        {"typescript", "TypeScript"},
	"tsx":       {"typescript", "TypeScript"},
	"mts":       {"typescript", "TypeScript"},
	"cts":       {"typescript", "TypeScript"},
	"js":        {"javascript", "JavaScript"},
	"jsx":       {"javascript", "JavaScript"},
	"mjs":       {"javascript", "JavaScript"},
	"cjs":       {"javascript", "JavaScript"},
	"html":      {"html", "HTML"},
	"htm":       {"html", "HTML"},
	"css":       {"css", "CSS"},
	"scss":      {"css", "Sass"},
	"sass":      {"css", "Sass"},
	"yaml":      {"yaml", "YAML"},
	"yml":       {"yaml", "YAML"},
	"json":      {"json", "JSON"},
	"cmake":     {"cmake", "CMake"},
	"md":        {"markdown", "Markdown"},
	"markdown":  {"markdown", "Markdown"},
	"rst":       {"rst", "ReStructuredText"},
	"lua":       {"lua", "Lua"},
	"pl":        {"perl", "Perl"},
	"pm":        {"perl", "Perl"},
	"j2":        {"jinja", "Jinja"},
	"jinja":     {"jinja", "Jinja"},
	"jinja2":    {"jinja", "Jinja"},
	"jsonnet":   {"jsonnet", "Jsonnet"},
	"libsonnet": {"jsonnet", "Jsonnet"},

	// Cython is counted with Python's rules: scc's Cython entry does not
	// treat a double quote as a string.
	"pyx":        {"cython", "Python"},
	"pxd":        {"cython", "Python"},
	"pxi":        {"cython", "Python"},
	"xml":        {"xml", "XML"},
	"xlf":        {"xml", "XML"},
	"xsd":        {"xml", "XML"},
	"svg":        {"xml", "XML"},
	"txt":        {"text", noComments},
	"t":          {"cram", noComments},
	"toml":       {"toml", "TOML"},
	"ini":        {"ini", "INI"},
	"cfg":        {"ini", "INI"},
	"conf":       {"ini", "INI"},
	"proto":      {"protobuf", "Protocol Buffers"},
	"mk":         {"make", "Makefile"},
	"am":         {"make", "Makefile"},
	"dockerfile": {"dockerfile", "Dockerfile"},
}

// langByName is checked before langByExt, so that CMakeLists.txt is CMake
// rather than text.
var langByName = map[string]syntax{
	"CMakeLists.txt": {"cmake", "CMake"},
	"Makefile":       {"make", "Makefile"},
	"makefile":       {"make", "Makefile"},
	"GNUmakefile":    {"make", "Makefile"},
	"Dockerfile":     {"dockerfile", "Dockerfile"},
	"Containerfile":  {"dockerfile", "Dockerfile"},
}

// dockerfileVariant is the prefix of a Dockerfile named for its purpose,
// as in Dockerfile.build.
const dockerfileVariant = "Dockerfile."

// langByInterpreter is keyed by the interpreter's base name with any trailing
// version digits and dots removed, so python3.12 is python.
var langByInterpreter = map[string]syntax{
	"python": {"python", "Python"},
	"sh":     {"shell", "Shell"},
	"bash":   {"shell", "Shell"},
	"dash":   {"shell", "Shell"},
	"ksh":    {"shell", "Shell"},
	"zsh":    {"shell", "Shell"},
	"perl":   {"perl", "Perl"},
	"node":   {"javascript", "JavaScript"},
	"nodejs": {"javascript", "JavaScript"},
	"lua":    {"lua", "Lua"},
}

// DetectLanguage returns the sloc.json language of the text file at p, from
// its file name, then its extension, then the shebang on its first line. A
// build-time template is the language it is a template of: x.yaml.in is
// YAML.
func DetectLanguage(p string, content []byte) string {
	if s, ok := detect(p, content); ok {
		return s.lang
	}
	return langOther
}

func detect(p string, content []byte) (syntax, bool) {
	name := path.Base(p)
	if inner, ok := strings.CutSuffix(name, ".in"); ok && inner != "" {
		name = inner
	}
	if s, ok := langByName[name]; ok {
		return s, true
	}
	if ext := path.Ext(name); ext != "" {
		if s, ok := langByExt[strings.ToLower(ext[1:])]; ok {
			return s, true
		}
	}
	if strings.HasPrefix(name, dockerfileVariant) {
		return langByName["Dockerfile"], true
	}
	s, ok := langByInterpreter[interpreter(content)]
	return s, ok
}

// interpreter returns the normalized interpreter a shebang line names, or ""
// when content has none. "#!/usr/bin/env -S python3 -u" names python, and so
// does "#!@Python3_EXECUTABLE@", the CMake variable a template's shebang is
// substituted from.
func interpreter(content []byte) string {
	line, ok := bytes.CutPrefix(content, []byte("#!"))
	if !ok {
		return ""
	}
	if i := bytes.IndexByte(line, '\n'); i >= 0 {
		line = line[:i]
	}
	fields := strings.Fields(string(line))
	if len(fields) == 0 {
		return ""
	}
	cmd := path.Base(fields[0])
	if cmd == "env" {
		cmd = ""
		for _, f := range fields[1:] {
			if !strings.HasPrefix(f, "-") {
				cmd = path.Base(f)
				break
			}
		}
	}
	if v, ok := strings.CutPrefix(cmd, "@"); ok {
		if v, ok = strings.CutSuffix(strings.ToLower(v), "_executable@"); ok {
			cmd = v
		}
	}
	return strings.TrimRight(cmd, "0123456789.")
}
