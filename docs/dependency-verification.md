# dependencies.yaml package verification (2026-11-14)

## Strategy changes

None. Every abandoned package either had a maintained replacement (glommio -> compio, rdma-sys -> sideway,
serde_yaml -> serde-saphyr, gopkg.in/yaml.v3 -> go.yaml.in/yaml/v3, jmespath/go-jmespath ->
jmespath-community/go-jmespath, waki -> wstd) or sat in an entry already costed as a port
(reed-solomon-erasure, isa-l rust: package set to null, 1500 kept).

Judgement calls left for review, not applied:
- xxhash go: no maintained XXH32 package exists; ~100 lines to write, left `native`/0.
- lancedb go: an official pre-1.0 Go SDK (lancedb-go) now exists; 500-line glue estimate kept.
- libcryptsetup rust: libcryptsetup-rs is a maintained binding, so `bindings` could replace the 1200-line port.
- libkmip rust/wasm: kmip-protocol (WIP, partial) could shrink the 1500-line port.

## Could not check

No named package. Unnamed claims left marked unverified: absence of maintained Go SPDK and RDMA verbs bindings;
modernc.org/sqlite VFS API fit (gitlab.com unreachable from the sandbox); every WASI build claim.

Method: Go via proxy.golang.org (@latest, go.mod Deprecated grep); Rust via the crates.io index mirror on
raw.githubusercontent.com (pubtime field); archived/last-commit via github.com pages and commits.atom.

## Results

| dependency id | target | package | verdict | evidence URL | latest release/commit seen | remark |
|---|---|---|---|---|---|---|
| rocksdb | go | github.com/linxGnu/grocksdb | ok | https://proxy.golang.org/github.com/linxgnu/grocksdb/@latest | v1.11.1 2026-09-07 | cgo RocksDB binding |
| rocksdb | go (note) | github.com/cockroachdb/pebble | ok | https://proxy.golang.org/github.com/cockroachdb/pebble/v2/@latest | v2.1.7 2026-08-24 | current major is /v2 |
| isa-l | go | github.com/klauspost/reedsolomon | ok | https://github.com/klauspost/reedsolomon/blob/master/options.go | v1.14.2 2026-08-12 | WithCustomMatrix exists (doc: "for interoperability with libraries which generate the matrix differently") |
| jerasure | go | github.com/klauspost/reedsolomon | ok | https://github.com/klauspost/reedsolomon/blob/master/options.go | v1.14.2 2026-08-12 | WithJerasureMatrix builds Jerasure's RS-Vandermonde matrix only; confirms note |
| zstd | go | github.com/klauspost/compress/zstd | ok | https://proxy.golang.org/github.com/klauspost/compress/@latest | v1.20.4 2026-11-09 | |
| xxhash | go | github.com/cespare/xxhash/v2 | ok | https://github.com/cespare/xxhash/commits.atom | v2.3.0 2024-04-04; last commit 2024-07-03 | XXH64 only; stable/feature-complete, not archived, no activity in 28 months |
| xxhash | go (note) | github.com/zeebo/xxh3 | ok | https://proxy.golang.org/github.com/zeebo/xxh3/@latest | v1.1.0 2026-01-23 | XXH3 |
| xxhash | go (note) | XXH32 package | not found (maintained) | https://proxy.golang.org/github.com/OneOfOne/xxhash/@latest | OneOfOne/xxhash v1.2.8 2020-05; pierrec/xxHash v0.1.5 2019-03 | no maintained pure-Go XXH32 found |
| blake3 | go | lukechampine.com/blake3 | ok | https://github.com/lukechampine/blake3/commits.atom | v1.4.1 2025-05-08 (last commit same day) | ~18 months, at the edge; zeebo/blake3 last commit 2026-10-20 |
| isa-l-crypto | go | crypto/aes | ok (stdlib) | - | - | |
| opentelemetry | go | go.opentelemetry.io/otel | ok | https://proxy.golang.org/go.opentelemetry.io/otel/@latest | v1.47.0 2026-10-02 | |
| c-ares | go | net (Resolver) | ok (stdlib) | - | - | |
| arrow-parquet | go | github.com/apache/arrow-go | corrected | https://proxy.golang.org/github.com/apache/arrow-go/v18/@latest | v18.8.0 2026-09-04 | module path is github.com/apache/arrow-go/v18 |
| libkmip | go | github.com/ovh/kmip-go | ok | https://github.com/ovh/kmip-go/commits.atom | v0.9.2 2026-07-21; commit 2026-10-19 | |
| libkmip | go (note) | github.com/gemalto/kmip-go | ok | https://github.com/ThalesGroup/kmip-go | v0.1.0 2025-10-07 | repo moved to ThalesGroup/kmip-go |
| librdkafka | go | github.com/twmb/franz-go | ok | https://proxy.golang.org/github.com/twmb/franz-go/@latest | v1.22.3 2026-11-09 | |
| librdkafka | go (note) | confluent-kafka-go | ok | https://proxy.golang.org/github.com/confluentinc/confluent-kafka-go/v2/@latest | v2.16.1 2026-10-27 | |
| rook-client-python | go | github.com/rook/rook/pkg/apis | ok | https://proxy.golang.org/github.com/rook/rook/pkg/apis/@latest | pseudo-version 2026-11-13 | separate module |
| boost-asio-beast | go | net, net/http | ok (stdlib) | - | - | |
| boost-misc | go | stdlib + spf13/pflag | ok | https://proxy.golang.org/github.com/spf13/pflag/@latest | v1.1.0 2026-10-29 | |
| openssl | go | crypto/tls, crypto/* | ok (stdlib) | - | - | |
| compression-libs | go | github.com/pierrec/lz4/v4 | ok | https://proxy.golang.org/github.com/pierrec/lz4/v4/@latest | v4.1.33 2026-10-02 | |
| compression-libs | go | github.com/klauspost/compress (snappy, zlib/flate) | ok | https://github.com/klauspost/compress/tree/master/snappy | v1.20.4 2026-11-09 | snappy subpackage is a drop-in golang/snappy replacement; zlib and flate present |
| compression-libs | go | github.com/andybalholm/brotli | ok | https://proxy.golang.org/github.com/andybalholm/brotli/@latest | v1.3.0 2026-11-09 | |
| liburing | go | golang.org/x/sys/unix | ok | https://proxy.golang.org/golang.org/x/sys/@latest | v0.50.0 2026-11-06 | |
| liburing | go (note) | Go io_uring packages | checked | https://github.com/godzie44/go-uring/commits.atom | godzie44/go-uring 2025-05; iceber/iouring-go 2023-04; pawelgaczynski/giouring 2023-08 | none clearly maintained |
| libaio | go | golang.org/x/sys/unix | ok | https://proxy.golang.org/golang.org/x/sys/@latest | v0.50.0 2026-11-06 | |
| fuse | go | github.com/hanwen/go-fuse/v2 | ok | https://proxy.golang.org/github.com/hanwen/go-fuse/v2/@latest | v2.12.1 2026-10-21 | |
| libcryptsetup | go (note) | pure-Go LUKS | checked | https://github.com/anatol/luks.go/commits.atom | anatol/luks.go commit 2026-06-15 | maintained pure-Go LUKS1/2 unlock library; header formatting not checked; martinjungblut/go-cryptsetup (cgo) last commit 2022-05 |
| libnbd | go | libguestfs.org/libnbd | ok | https://proxy.golang.org/libguestfs.org/libnbd/@latest | v1.25.4 2026-03-03 | |
| linux-system | go | golang.org/x/sys/unix | ok | https://proxy.golang.org/golang.org/x/sys/@latest | v0.50.0 2026-11-06 | |
| libcurl | go | net/http | ok (stdlib) | - | - | |
| expat | go | encoding/xml | ok (stdlib) | - | - | |
| json-libs | go | encoding/json | ok (stdlib) | - | - | |
| lua | go | github.com/yuin/gopher-lua | ok | https://proxy.golang.org/github.com/yuin/gopher-lua/@latest | v1.1.2 2026-04-01 | |
| liboath | go | github.com/pquerna/otp | ok | https://github.com/pquerna/otp/commits.atom | v1.5.0 2024-12-31; commit 2025-08-07 | |
| openldap | go | github.com/go-ldap/ldap/v3 | ok | https://proxy.golang.org/github.com/go-ldap/ldap/v3/@latest | v3.4.15 2026-10-07 | |
| rabbitmq-c | go | github.com/rabbitmq/amqp091-go | ok | https://proxy.golang.org/github.com/rabbitmq/amqp091-go/@latest | v1.16.0 2026-10-19 | |
| redis | go | github.com/redis/go-redis/v9 | ok | https://proxy.golang.org/github.com/redis/go-redis/v9/@latest | v9.23.0 2026-10-05 | |
| sqlite | go | modernc.org/sqlite | ok | https://proxy.golang.org/modernc.org/sqlite/@latest | v1.62.0 2026-11-07 | |
| lmdb | go | go.etcd.io/bbolt | ok | https://proxy.golang.org/go.etcd.io/bbolt/@latest | v1.5.0 2026-06-03 | |
| foundationdb | go | github.com/apple/foundationdb/bindings/go | ok | https://proxy.golang.org/github.com/apple/foundationdb/bindings/go/@latest | pseudo-version 2026-11-13 | |
| grpc-protobuf | go | google.golang.org/grpc | ok | https://proxy.golang.org/google.golang.org/grpc/@latest | v1.85.0 2026-10-27 | |
| icu-boost-locale | go | golang.org/x/text | ok | https://proxy.golang.org/golang.org/x/text/@latest | v0.44.0 2026-11-09 | |
| arrow-parquet | go (note) | golang.org/x/text | ok | https://proxy.golang.org/golang.org/x/text/@latest | v0.44.0 2026-11-09 | |
| py-web | go | net/http (+ chi) | ok | https://proxy.golang.org/github.com/go-chi/chi/v5/@latest | chi v5.5.0 2026-10-14 | |
| jinja2 | go | github.com/nikolalohinski/gonja/v2 | ok | https://proxy.golang.org/github.com/nikolalohinski/gonja/v2/@latest | v2.9.1 2026-09-26 | maintained; Jinja compatibility not checked |
| kubernetes-client | go | k8s.io/client-go | ok | https://proxy.golang.org/k8s.io/client-go/@latest | v0.37.2 2026-10-28 | |
| asyncssh | go | golang.org/x/crypto/ssh | ok | https://proxy.golang.org/golang.org/x/crypto/@latest | v0.59.0 2026-11-11 | |
| py-crypto | go | crypto/x509, golang.org/x/crypto/bcrypt | ok | https://proxy.golang.org/golang.org/x/crypto/@latest | v0.59.0 2026-11-11 | |
| python3-saml | go | github.com/crewjam/saml | ok | https://github.com/crewjam/saml/commits.atom | v0.6.3 2026-11-08 | |
| scientific-python | go | gonum.org/v1/gonum | ok | https://proxy.golang.org/gonum.org/v1/gonum/@latest | v0.17.0 2025-12-29 | |
| py-utils | go | gopkg.in/yaml.v3 | superseded | https://github.com/go-yaml/yaml | v3.0.1 2022-05-27; archived 2025-04-01 | archived; maintained continuation is go.yaml.in/yaml/v3 (yaml/go-yaml, v3.0.6 2026-10-13) |
| py-utils | go | evanphx/json-patch | corrected | https://github.com/evanphx/json-patch/commits.atom | v5.9.11 2025-01-28 (last commit same) | import path github.com/evanphx/json-patch/v5; ~21 months inactive, not archived |
| py-utils | go | jmespath/go-jmespath | superseded | https://github.com/jmespath/go-jmespath/commits.atom | v0.4.0 2020-09; last commit 2022-06 | abandoned; jmespath-community/go-jmespath v1.1.1 2023-05, last commit 2025-02 (also low activity); kyverno fork last commit 2023-11 |
| py-utils | go | olekukonko/tablewriter | ok | https://proxy.golang.org/github.com/olekukonko/tablewriter/@latest | v1.1.5 2026-09-15 | |
| googletest | go (note) | gomock / testify | ok | https://proxy.golang.org/go.uber.org/mock/@latest | go.uber.org/mock v0.6.0 2025-08; testify v1.12.1 2026-08 | golang/mock archived-era (2021), go.uber.org/mock is the fork |
| lancedb | go (note) | github.com/lancedb/lancedb-go | found | https://github.com/lancedb/lancedb-go | v0.1.2 2025-09-30; commit 2026-05-09 | LanceDB Go SDK exists (cgo over prebuilt native lib), pre-1.0 |
| xxhash | go (note) | XXH32 search | not found (maintained) | https://pkg.go.dev/github.com/pierrec/xxHash | pierrec/xxHash 2019; OneOfOne 2020; harsh16coder/xxhash v1.0.1 2025-09 (obscure) | no established maintained XXH32 package |
| rocksdb | rust | rocksdb (rust-rocksdb) | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ro/ck/rocksdb | 0.25.0 2026-08-16 | crates.io index (pubtime) used as registry evidence throughout |
| rocksdb | wasm | fjall | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/fj/al/fjall | 3.1.13 2026-10-25 | WASI build unverified |
| seastar | rust | glommio | superseded | https://github.com/DataDog/glommio/commits.atom | 0.9.0 2024-03-25; last commit 2025-04-21 | inactive; compio (thread-per-core, io_uring/IOCP/polling) 0.19.2 2026-08-18, repo commit 2026-11-13; monoio crate last release 2024-08 |
| isa-l | rust | reed-solomon-erasure | not found (abandoned) | https://github.com/rust-rse/reed-solomon-erasure/commits.atom | 6.0.0 2022-09-23; last commit 2022-11 | no successor with ISA-L-compatible matrices; reed-solomon-simd (2025-10) is Leopard-style GF(2^16), not chunk-compatible; port already costed |
| zstd | rust | zstd | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/zs/td/zstd | 0.14.4 2026-11-12 | |
| zstd | rust/wasm | ruzstd | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ru/zs/ruzstd | 0.9.1 2026-10-11 | |
| zstd | wasm (note) | zstd-sys | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/zs/td/zstd-sys | 2.1.3 2026-11-12 | wasm build unverified |
| xxhash | rust/wasm | xxhash-rust | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/xx/ha/xxhash-rust | 0.8.19 2026-09-28 | |
| blake3 | rust/wasm | blake3 | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/bl/ak/blake3 | 1.8.7 2026-08-20 | has wasm32_simd feature (evidence for wasm32 support) |
| isa-l-crypto | rust/wasm | aes / aes-gcm | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ae/s-/aes-gcm | aes 0.9.4 2026-11-02; aes-gcm 0.11.1 2026-08-21 | |
| opentelemetry | rust/wasm | opentelemetry | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/op/en/opentelemetry | 0.33.1 2026-10-09 | |
| c-ares | rust | hickory-resolver | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/hi/ck/hickory-resolver | 0.26.3 2026-09-10 | |
| s3select | rust/wasm | sqlparser | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/sq/lp/sqlparser | 0.64.0 2026-11-09 | |
| arrow-parquet | rust/wasm | arrow + parquet | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ar/ro/arrow | 60.1.0 2026-10-28 | |
| libkmip | rust/wasm (note) | KMIP crates | checked | https://github.com/NLnetLabs/kmip-protocol | kmip-protocol 0.5.1 2026-11-09 | exists but self-described WIP, partial KMIP 1.0-1.2; cosmian_kmip 5.22.1 2026-10 is tied to Cosmian KMS; port kept |
| librdkafka | rust | rdkafka | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/rd/ka/rdkafka | 0.39.0 2026-01-25 | |
| librdkafka | wasm | rskafka | ok | https://github.com/influxdata/rskafka/commits.atom | 0.6.0 2025-03-20; commit 2026-10-29 | |
| lancedb | rust | lancedb | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/la/nc/lancedb | 0.41.0 2026-10-29 | |
| rook-client-python | rust/wasm | kube + kopium | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ko/pi/kopium | kube 5.1.0 2026-11-12; kopium 0.24.1 2026-07-03 | |
| boost-asio-beast | rust | tokio + hyper | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/hy/pe/hyper | tokio 1.54.1 2026-10-21; hyper 1.12.0 2026-10-06 | |
| boost-asio-beast | wasm | wstd / wasi-http | ok | https://github.com/bytecodealliance/wstd/blob/main/src/http/server.rs | wstd 0.6.8 2026-07-22; commit 2026-10-12 | wstd has http client, server (incoming-handler) and TcpListener; wasi-http is the interface, not a crate |
| boost-misc | rust/wasm | clap, regex, chrono, url, smallvec, crossbeam | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/sm/al/smallvec | clap 4.6.7 2026-09; regex 1.13.1 2026-07; chrono 0.4.45 2026-06; url 2.5.8 2026-01; smallvec 1.16.5 2026-11; crossbeam 0.8.5 2026-09 | |
| openssl | rust/wasm | rustls + aes-gcm, sha2, hmac, md-5 | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ru/st/rustls | rustls 0.24.0-dev.3 2026-11-12; sha2 0.11.1 2026-10; hmac 0.13.0 2026-03; md-5 0.11.0 2026-03 | |
| compression-libs | rust/wasm | lz4_flex, snap, flate2, miniz_oxide, brotli | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/lz/4_/lz4_flex | lz4_flex 0.14.0 2026-07; snap 1.1.2 2026-07; flate2 1.1.11 2026-11; miniz_oxide 0.9.1 2026-03; brotli 9.1.1 2026-10 | |
| rdma | rust | rdma-sys | superseded | https://github.com/datenlord/rdma-sys/commits.atom | 0.3.0 2023-02-01; last commit 2023-02 | abandoned (async-rdma too, 2023); sideway (RDMA-Rust) wraps ibverbs + rdmacm, 0.4.3 2026-06-04, commit 2026-11-09; ibverbs (jonhoo) verbs-only |
| liburing | rust | io-uring | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/io/-u/io-uring | 0.7.16 2026-11-09 | |
| libaio | rust | io-uring | ok | (as above) | 0.7.16 2026-11-09 | |
| fuse | rust | fuser | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/fu/se/fuser | 0.18.0 2026-07-22 | |
| libcryptsetup | rust/wasm (note) | LUKS2 crates | checked | https://github.com/stratis-storage/libcryptsetup-rs/commits.atom | luks2 0.5.0 2021-09 (abandoned); libcryptsetup-rs 0.16.1 2026-06-17 (maintained binding) | port kept; binding route noted |
| libnbd | rust | libnbd | corrected | https://gitlab.com/nbdkit/libnbd/-/raw/master/rust/Cargo.toml | not on crates.io (index 404); in-tree crate version 0.1.0 | bindings ship in the libnbd source tree only |
| linux-system | rust | nix, udev, linux-keyutils, caps | ok | https://github.com/Smithay/udev-rs/commits.atom | nix 0.31.3 2026-05; udev 0.9.3 2025-01-23 (last commit same); linux-keyutils 0.2.5 2026-03; caps 0.5.6 2025-10 | udev ~22 months inactive, not archived |
| linux-system | rust (note) | libblkid-sys | not found (abandoned) | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/li/bb/libblkid-sys | 0.1.0 2017-06-17 | blkid-sys 0.1.7 2023-05, blkid 1.0.1 2022-12 also stale; sysfs route remains |
| lttng | rust (note) | tracing, usdt | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/us/dt/usdt | tracing 0.1.44 2025-12; usdt 0.6.0 2025-09 | |
| allocators | rust | tikv-jemallocator | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ti/kv/tikv-jemallocator | 0.7.0 2026-05-25 | |
| libcurl | rust | reqwest | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/re/qw/reqwest | 0.13.5 2026-09-08 | |
| libcurl | wasm | wasi-http (waki / wstd) | corrected | https://github.com/wacker-dev/waki/commits.atom | waki 0.5.1 2024-12-12 (last commit same) | waki inactive ~23 months; wstd maintained (see above) |
| expat | rust/wasm | quick-xml | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/qu/ic/quick-xml | 0.42.0 2026-08-22 | |
| json-libs | rust/wasm | serde_json | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/se/rd/serde_json | 1.0.154 2026-10-11 | |
| lua | rust/wasm | mlua | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ml/ua/mlua | 0.12.2 2026-10-03 | |
| liboath | rust/wasm | totp-rs | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/to/tp/totp-rs | 6.0.0 2026-08-06 | |
| openldap | rust/wasm | ldap3 | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ld/ap/ldap3 | 0.12.1 2025-09-18 | |
| rabbitmq-c | rust/wasm | lapin | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/la/pi/lapin | 4.12.3 2026-10-18 | |
| redis | rust/wasm | redis | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/re/di/redis | 1.8.1 2026-10-30 | |
| sqlite | rust/wasm | rusqlite | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ru/sq/rusqlite | 0.42.0 2026-11-11 | |
| lmdb | rust | heed | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/he/ed/heed | 0.23.1 2026-10-26 | |
| lmdb | wasm | redb | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/re/db/redb | 4.6.0 2026-11-13 | |
| foundationdb | rust | foundationdb | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/fo/un/foundationdb | 0.11.0 2026-06-24 | |
| grpc-protobuf | rust/wasm | tonic + prost | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/to/ni/tonic | tonic 0.14.9 2026-10-29; prost 0.14.6 2026-11-12 | |
| icu-boost-locale | rust/wasm | icu / unicode-normalization | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/2/icu | icu 2.4.0 2026-10-22; unicode-normalization 0.1.26 2026-10-16 | |
| cython | rust | pyo3 | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/py/o3/pyo3 | 0.30.1 2026-10-14 | |
| py-web | rust | axum | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ax/um/axum | 0.8.9 2026-04-14 | |
| py-web | wasm | wasi-http | corrected | https://github.com/bytecodealliance/wstd/blob/main/src/http/server.rs | wstd 0.6.8 2026-07-22 | wasi-http is an interface; wstd provides the incoming-handler server |
| jinja2 | rust/wasm | minijinja | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/mi/ni/minijinja | 3.1.0 2026-11-07 | |
| kubernetes-client | rust/wasm | kube | ok | (as above) | 5.1.0 2026-11-12 | |
| asyncssh | rust/wasm | russh | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/ru/ss/russh | 0.65.1 2026-11-03 | |
| py-crypto | rust/wasm | rcgen, x509-parser, bcrypt | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/rc/ge/rcgen | rcgen 0.14.10 2026-08; x509-parser 0.18.1 2026-02; bcrypt 0.19.3 2026-07 | |
| python3-saml | rust | samael | ok | https://github.com/njaremko/samael/commits.atom | 0.0.22 2026-07-07 | maintained |
| scientific-python | rust/wasm | ndarray + linfa | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/li/nf/linfa | ndarray 0.17.2 2026-01; linfa 0.8.1 2025-12 | |
| py-utils | rust/wasm | serde_yaml (or successor) | superseded | https://github.com/dtolnay/serde-yaml | 0.9.34+deprecated 2024-03-25; archived | serde_yml archived 2026-05 and RUSTSEC-2025-0068 (unsound, unmaintained); serde_norway last commit 2024-12; serde-saphyr 2.1.1 2026-11-05 maintained, ser+de |
| py-utils | rust/wasm | json-patch, jmespath, comfy-table, reqwest, rustyline | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/jm/es/jmespath | json-patch 5.0.0 2026-11; jmespath 0.5.0 2026-01; comfy-table 8.0.1 2026-09; rustyline 19.0.0 2026-10 | |
| googletest | rust (note) | mockall | ok | https://raw.githubusercontent.com/rust-lang/crates.io-index/master/mo/ck/mockall | 0.15.0 2026-06-28 | |
| spdk | rust (note) | spdk crates | checked | https://crates.io/api/v1/crates?q=spdk | ironspdk 0.2.6 2026-11; spdk-io 0.1.0 2026-02; async-spdk 0.1.0 2026-02 | no spdk-sys; young single-maintainer crates only |
| qat | rust (note) | qatzip crates | not found | https://crates.io/api/v1/crates?q=qatzip | none | zero results |
