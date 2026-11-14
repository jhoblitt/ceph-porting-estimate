## The project

[rgw-go](https://github.com/{{calibration.project.repo}}) is a drop-in Go replacement for `radosgw`, Ceph's S3 gateway, built against Ceph Squid {{calibration.project.ports.tag}} and, according to the rgw-go session, also Tentacle v20.2.4. Its acceptance test is Rook's `TestCephObjectSuite` passing with rgw-go installed as `/usr/bin/radosgw`. It reaches RADOS through go-ceph over cgo, and stores its metadata in the same on-RADOS formats as the C++ gateway, so the two can share a cluster. This page measures it at commit [`{{calibration.project.commit}}`](https://github.com/{{calibration.project.repo}}/tree/{{calibration.project.commit}}) of {{calibration.project.commit_date}}.

**How it is built.** One owner and one long-lived Claude Code controller session. The controller hands each task to Claude Opus subagents working in their own git worktrees, one task at a time; each task goes through implement, review, fix rounds, a gate and a merge.

**What it covers.** The source it ports is `src/rgw` at {{calibration.project.ports.tag}} and the RADOS object classes radosgw calls: {{calibration.sizes.source.total.lines | countExact}} lines in all. By design it leaves out multisite; every storage driver except RADOS; Swift; Lua; S3 Select; S3 Vectors and dedup; cloud transition and restore; Keystone and LDAP; SSE-KMS and SSE-S3; the dynamic resharding worker; librgw, NFS and SMB; QAT and UADK offload; D3N; Kafka and AMQP delivery; and the `radosgw-admin` command. How much of the source it covers is an estimate of its own, in [Coverage](#/calibration?section=coverage).

**Its size**, counted by this project from git at the measured commit:

::: rgw-go-sizes

A sibling project, [rgw-rs](https://github.com/jhoblitt/rgw-rs), is a Rust port that shares rgw-go's exclusions. Only its first week of transcripts was available, so it is not used here.

### Timeline

As the rgw-go session reported it. It is context only: this report estimates tokens, not time, and nothing on these pages turns one into the other.

- 2026-09-25: the repository and its design spec.
- Phase 0, foundations, from 09-26: the encoding layer, metadata codecs, object-class clients, the librados seam and disposable test clusters. Its gate: every metadata object a populated radosgw wrote decodes and re-encodes byte for byte.
- Phase 1, from 09-29 to 10-13: the data path, authentication and core administration (SigV4 and SigV2; ACL, policy and quota authorization; bucket and object operations; multipart uploads; reading every manifest layout and codec; cache invalidation, garbage collection and the reshard protocol; the admin API). It ran larger than planned.
- Phase 2, from 10-13 and still in progress at the measurement: versioning, object lock, the lifecycle worker, CORS, static websites, public-access blocks, POST object, checksums, and compression and placement on the write path.
- Not started: phase 3 (notifications, IAM and STS, bucket logging, rate limits, the ops log, admin-socket counters) and phase 4 (SSE-C, request payment).

About seven weeks had elapsed at the measurement, with 579 pull requests merged.
