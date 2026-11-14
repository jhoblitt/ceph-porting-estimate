package count_test

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/count"
)

var _ = DescribeTable("DetectLanguage",
	func(path, content, want string) {
		Expect(count.DetectLanguage(path, []byte(content))).To(Equal(want), "path %q", path)
	},
	Entry("a .h header is C++", "src/include/a.h", "", "cpp"),
	Entry("an upper-case extension", "src/a.CXX", "", "cpp"),
	Entry("CMakeLists.txt by filename", "src/CMakeLists.txt", "", "cmake"),
	Entry("plain text", "doc/notes.txt", "", "text"),
	Entry("a .yaml.in template is YAML", "src/common/options/global.yaml.in", "", "yaml"),
	Entry("a .cmake.in template is CMake", "cmake/modules/x.cmake.in", "", "cmake"),
	Entry("a .in template named by its shebang", "src/ceph.in", "#!@Python3_EXECUTABLE@\n", "python"),
	Entry("a .in template with nothing else to go on", "src/foo.in", "plain\n", "other"),
	Entry("Cython .pyx", "src/pybind/rados/rados.pyx", "", "cython"),
	Entry("Cython .pxd", "src/pybind/rados/c_rados.pxd", "", "cython"),
	Entry("Cython .pxi", "src/pybind/rbd/mock.pxi", "", "cython"),
	Entry("XML .xml", "doc/x.xml", "", "xml"),
	Entry("XML .xlf", "i18n/messages.de.xlf", "", "xml"),
	Entry("XML .xsd", "schema/x.xsd", "", "xml"),
	Entry("SVG is XML", "doc/logo.svg", "", "xml"),
	Entry("a cram test", "src/test/cli/osdmaptool/help.t", "", "cram"),
	Entry("TOML", "src/rust/Cargo.toml", "", "toml"),
	Entry("INI .ini", "src/tox.ini", "", "ini"),
	Entry("INI .cfg", "src/setup.cfg", "", "ini"),
	Entry("INI .conf", "etc/ceph.conf", "", "ini"),
	Entry("protobuf", "src/x.proto", "", "protobuf"),
	Entry("Makefile by name", "src/Makefile", "", "make"),
	Entry("lower-case makefile by name", "src/makefile", "", "make"),
	Entry("GNUmakefile by name", "src/GNUmakefile", "", "make"),
	Entry("a .mk include", "src/rules.mk", "", "make"),
	Entry("an automake .am", "src/Makefile.am", "", "make"),
	Entry("Dockerfile by name", "container/Dockerfile", "", "dockerfile"),
	Entry("a Dockerfile variant", "container/Dockerfile.build", "", "dockerfile"),
	Entry("Containerfile by name", "container/Containerfile", "", "dockerfile"),
	Entry("a .dockerfile", "container/base.dockerfile", "", "dockerfile"),
	Entry("SCSS counts as CSS", "web/style.scss", "", "css"),
	Entry("libsonnet is jsonnet", "mixin/a.libsonnet", "", "jsonnet"),
	Entry("the last extension decides", "templates/conf.yaml.j2", "", "jinja"),
	Entry("reStructuredText", "doc/index.rst", "", "rst"),
	Entry("TSX is TypeScript", "web/app.tsx", "", "typescript"),
	Entry("an extension beats a shebang", "bin/x.py", "#!/bin/sh\n", "python"),
	Entry("an env shebang with a versioned interpreter", "bin/tool", "#!/usr/bin/env python3\n", "python"),
	Entry("a shebang with an interpreter flag", "bin/tool", "#!/usr/bin/perl -w\n", "perl"),
	Entry("a bash shebang is shell", "bin/tool", "#!/bin/bash\nset -e\n", "shell"),
	Entry("an env -S shebang", "bin/tool", "#!/usr/bin/env -S node --no-warnings\n", "javascript"),
	Entry("an unknown interpreter is other", "bin/tool", "#!/usr/bin/awk -f\n", "other"),
	Entry("no extension and no shebang is other", "bin/tool", "echo hi\n", "other"),
)
