## What is counted

Ceph as it stood at one commit: [`{{ceph.repo}}` at `{{ceph.rev | sha}}`](https://github.com/{{ceph.repo}}/commit/{{ceph.rev}}), committed on {{ceph.commit_date | day}}. Every count of Ceph in this report is of that tree.

This project's counter, `cephest count`, reads every regular file at the commit from git's object database, so a dirty working tree cannot leak in; symbolic links are skipped. It names a file's language from its file name, then its extension, then the interpreter on a `#!` line, and a build template such as `x.yaml.in` counts as the file it generates. Each file's lines are split into code, comment and blank with the comment and string rules of [scc](https://github.com/boyter/scc). A file with a NUL byte near its start is binary and carries no tokens. When the counts were committed, their total over text files matched `git grep -I -c ''` at the same commit exactly.

Vendored submodules (RocksDB, Seastar, SPDK and the rest) are counted separately, per dependency, where the submodule's pinned commit was present in the clone the counter read; any other is recorded as unavailable. They are not Ceph's own source and are not ported line for line: what dependency work costs comes from the data's estimate of the lines each strategy leaves ([Dependencies](#/methods?section=dependencies)), not from these counts.

::: if computed.submodules.anyUnavailable

Not counted at this commit: the submodules of {{computed.submodules.unavailable | list}}.

::: end
::: if computed.submodules.anyNestedUnavailable

Submodules nested inside counted ones that could not be counted themselves: {{computed.submodules.nestedUnavailable | cardinal}}.

::: end

Ceph's code at this commit, {{computed.lines.total | countExact}} lines leaving comments and blank lines aside, divides like this:

::: lines-by-group

The headline, the figure on the estimate page, covers {{computed.lines.headline | countExact}} of these lines. The next section says what each scope holds.
