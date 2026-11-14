package count_test

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	"github.com/jhoblitt/ceph-porting-estimate/internal/count"
)

var _ = DescribeTable("ValidSubmoduleName",
	func(name string, want bool) {
		Expect(count.ValidSubmoduleName(name)).To(Equal(want), "name %q", name)
	},
	Entry("a nested name", "src/rocksdb", true),
	Entry("dots inside a segment", "a..b/c", true),
	Entry("empty", "", false),
	Entry("a leading .. segment", "../escape", false),
	Entry("a .. segment between backslashes", `a\..\b`, false),
	Entry("a trailing .. segment", "a/..", false),
	Entry("an absolute name", "/etc/x", false),
	Entry("a backslash-rooted name", `\x`, false),
)
