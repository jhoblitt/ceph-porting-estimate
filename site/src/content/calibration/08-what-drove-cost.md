## What drove cost

The rgw-go session named seven things that drove the port's cost. Here they are condensed, in this report's words; each is a reason a port of other parts of Ceph might cost more or less per line than rgw-go did.

1. **Byte-compatible on-RADOS formats.** Every versioned encoding had to round-trip byte for byte against golden files captured from a real radosgw. The session expects a foundations phase of this shape for any component with persisted state.
2. **Living beside the C++ daemons.** rgw-go shares a cluster with them in both directions: the bucket index and object-class protocols, versioning, cache invalidation, garbage collection and resharding. That is harder than a standalone rewrite, and much of the review effort went there.
3. **Two release floors.** Supporting both Squid and Tentacle roughly doubled verification, and moving a floor is a unit of work of its own.
4. **Upstream defects.** Reading the source closely enough to port it finds bugs in it. Triaging them, reproducing them on a running cluster and filing them upstream took real controller time.
5. **Parity testing.** Ceph's s3-tests, compared result by result against radosgw's recorded baseline on every change to the S3 path; Rook's suite; disposable Ceph clusters on kind. Bringing clusters up, flaky tests and contention on the host were a recurring cost.
6. **The FFI boundary.** rgw-go reaches RADOS through go-ceph over cgo and needed a fork of go-ceph for bindings it lacked. The boundary cost about 0.7 to 3.0 µs per operation and was not a bottleneck. For other targets, how mature the librados, librbd and libcephfs bindings are is a first-order cost.
7. **Process overhead.** The most rework came from treating code in plans as binding, wrong facts about radosgw in plans, tasks too large for one implement-and-review loop, hot files shared by parallel tasks, review findings parked instead of fixed, host load from unbounded builds, and API session limits stopping every agent at once.

The first two are why the central scenario already carries the cost of compatibility, and why the clean-break switch on the estimate page exists: a port that keeps no on-disk or wire compatibility would skip much of them.
