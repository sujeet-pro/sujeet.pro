---
title: Distributed Logging System
linkTitle: 'Logging System'
description: >-
  Designing a centralized logging pipeline from collection agents to tiered
  storage — covering data models, indexing trade-offs (Elasticsearch vs Loki vs
  ClickHouse), stream processing, and scaling lessons from Netflix's 5 PB/day
  deployment.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - system-design
  - distributed-systems
  - observability
  - logging
---

# Distributed Logging System

A centralized logging stack reconstructs the behavior of a distributed system from scattered, ephemeral, write-heavy text streams. The hard part is not collection; it is choosing where the [cost-vs-flexibility](#indexing-strategies) trade-off lands so that a senior engineer can answer an incident question in seconds without exploding the storage bill. This article walks through the decisions that determine that trade-off — log model, collection topology, buffering, storage engine, indexing strategy, query patterns, and scaling — and grounds them in production reality from Netflix, Grafana Labs, Splunk, and Datadog.

![Distributed logging pipeline overview: services emit logs to per-node or per-pod agents, agents push into a Kafka or Kinesis buffer, a stream processor parses and routes records into hot, warm, and cold storage tiers behind a search and visualization layer.](./diagrams/pipeline-overview-light.svg "Distributed logging pipeline: services → agents → buffer → stream processor → tiered storage → search and visualization.")
![Distributed logging pipeline overview: services emit logs to per-node or per-pod agents, agents push into a Kafka or Kinesis buffer, a stream processor parses and routes records into hot, warm, and cold storage tiers behind a search and visualization layer.](./diagrams/pipeline-overview-dark.svg)

## Mental model

Logs are **write-heavy, read-sparse, time-ordered, semi-structured** events with **unpredictable query shapes**. A single service can emit 10⁴–10⁵ events/second; a typical log line is queried zero times. That asymmetry rules out treating a log store like a row-oriented database — sequential append on the write path and tier-aware skip-or-scan on the read path beat row-oriented OLTP designs by one to two orders of magnitude in cost per query.

Four decisions dominate the design space:

1. **Data model** — structured (JSON or Protocol Buffers) vs unstructured. Structuring shifts parsing cost from query time to write time and unlocks better compression.
2. **Collection topology** — per-node DaemonSet vs per-pod sidecar. The first is resource-efficient; the second is isolation-efficient.
3. **Indexing strategy** — full inverted index (Elasticsearch / Lucene), label-only index (Loki), or columnar storage with skip indexes (ClickHouse). Each shifts the cost between storage, write throughput, and query latency.
4. **Storage tiering** — hot SSD, warm SSD/HDD, cold object storage, with a lifecycle policy that automates demotion. Most logs are never re-read after ~7 days, so leaving them on hot storage is pure waste.

Everything else — buffering, sharding, replication, sampling — exists to keep one of those four decisions from breaking under load.

## Log data model

### Structured vs unstructured

Unstructured (printf-style) logs are easy to emit and very expensive to query: every search becomes a regex scan over terabytes. Structured logs (JSON, Protocol Buffers, MessagePack) attach explicit field names at write time, which the storage engine can index and the query engine can use without re-parsing.

```json title="payment-error.log"
{
  "timestamp": "2026-04-21T10:23:45.123Z",
  "level": "ERROR",
  "service": "payment-service",
  "trace_id": "abc123",
  "message": "Payment failed",
  "error_code": "INSUFFICIENT_FUNDS",
  "amount_cents": 5000,
  "user_id": "usr_789"
}
```

| Aspect            | Unstructured    | Structured (JSON)    | Structured (Protobuf)    |
| ----------------- | --------------- | -------------------- | ------------------------ |
| Write simplicity  | printf-style    | requires log library | requires codegen         |
| Query flexibility | regex only      | field extraction     | field extraction         |
| Schema evolution  | n/a             | implicit (any field) | explicit (field numbers) |
| Compression       | weak            | moderate             | strong                   |
| Cross-language    | universal       | universal            | requires runtime         |

JSON is the de-facto default for application logs because every language and every aggregator already speaks it. Reach for Protocol Buffers when you have control of both producers and consumers, the volume justifies the codegen step, and field discipline matters (high-volume internal telemetry, RPC-trace systems).

### Schema evolution

JSON's implicit schema makes additions trivial but creates silent drift — two services can emit a `latency_ms` field with different types and only the consumer notices. Protocol Buffers enforce evolution rules in the spec itself: never reuse a deleted field number, prefer `reserved` over deletion, additive `proto3` fields default to zero. The [Protobuf documentation](https://protobuf.dev/programming-guides/proto3/#updating) is the normative source, and the [`buf` toolchain](https://buf.build/docs/breaking) automates breaking-change detection in CI.

### OpenTelemetry Logs as the canonical schema

Pick a normalized schema before you pick a backend. The [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) is now the closest thing the industry has to a vendor-neutral standard. Every record carries a small set of named top-level fields plus open attribute collections:

| Field                  | Purpose                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Timestamp`, `ObservedTimestamp` | Event time and ingestion time, distinguished so late-arriving data can be reasoned about correctly.    |
| `TraceId`, `SpanId`, `TraceFlags` | W3C-compatible identifiers that link the log to its trace context.                                    |
| `SeverityText`, `SeverityNumber`  | Original level string plus a normalized 1–24 integer; ≥ 17 means error, defaulted to 9 (`INFO`).      |
| `Body`                 | The free-form payload — string for legacy lines, structured object for modern emitters.                          |
| `Resource`             | Stable identity of the source: `service.name`, `service.namespace`, `host.id`, `k8s.pod.uid`.                    |
| `InstrumentationScope` | The library or logger that emitted the record.                                                                   |
| `Attributes`           | Per-event key/value pairs.                                                                                       |

Three properties of this model matter for design:

- **Correlation comes for free.** Any backend that respects `TraceId` / `SpanId` can pivot from a log line to its trace and back. OTel SDKs and logging bridges inject the active span context automatically.
- **Severity is comparable across services.** Numeric severity removes the `WARN` vs `WARNING` vs `30` mismatch; alerting on `SeverityNumber >= 17` is portable.
- **Resource is the natural multi-tenant key.** `service.namespace`, `k8s.namespace.name`, or `cloud.account.id` map cleanly onto tenant boundaries downstream.

> [!IMPORTANT]
> Whatever schema you pick, cap individual entries. [Datadog recommends each log entry stay under 25 KB and silently truncates anything larger than 1 MB at the API](https://docs.datadoghq.com/logs/log_collection/); the [Datadog Agent splits any record above ~900 KB into multiple lines before transport](https://docs.datadoghq.com/agent/logs/log_transport/). Even if your stack does not enforce a hard limit, large logs (full request bodies, multi-megabyte stack traces) ruin compression ratios and cripple list-page rendering. Truncate or sample them at the source.

## Collection architecture

### Agent deployment patterns

In Kubernetes, two patterns dominate, and they lie at opposite ends of the per-pod-cost / per-pod-isolation axis. The [Kubernetes logging architecture docs](https://kubernetes.io/docs/concepts/cluster-administration/logging/) treat node-level agents as the default, with sidecars reserved for cases where the node-level agent cannot reach the relevant logs.

**DaemonSet pattern** (one agent per node):

```yaml title="fluentd-daemonset.yaml" collapse={1-4, 12-20}
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
spec:
  template:
    spec:
      containers:
        - name: fluentd
          resources:
            requests:
              memory: "200Mi"
              cpu: "100m"
```

- **Pros**: One agent process per node, regardless of pod count; resource cost is bounded; configuration changes propagate via a single ConfigMap.
- **Cons**: Shared agent means one tenant's misbehaving log shape (a multi-line stack-trace storm, a malformed JSON record) can starve every other tenant on the node.
- **Best for**: clusters with homogeneous workloads and a small number of log shapes.

**Sidecar pattern** (one agent per pod):

- **Pros**: Per-application configuration, per-tenant isolation, per-pod failure boundary.
- **Cons**: The agent process count scales with the pod count, not the node count. Across a large cluster the aggregate footprint and operational surface grow accordingly. Sidecars also share the pod's CPU and memory limits, so a busy collector can starve the application it is supposed to instrument.[^sidecar-cost]
- **Best for**: multi-tenant PaaS environments, plug-ins where the operator does not control the workload, applications whose logs do not reach `stdout`/`stderr`.

![Agent topology comparison: a DaemonSet runs one shared agent per node, with every pod on the node forwarding to that agent before it ships to the buffer. A sidecar puts a dedicated agent inside each pod so per-pod configuration and failure boundaries are isolated, at the cost of one agent process per pod.](./diagrams/agent-topology-light.svg "Agent topology: DaemonSet shares one collector per node; sidecars give per-pod isolation at the cost of process count.")
![Agent topology comparison: a DaemonSet runs one shared agent per node, with every pod on the node forwarding to that agent before it ships to the buffer. A sidecar puts a dedicated agent inside each pod so per-pod configuration and failure boundaries are isolated, at the cost of one agent process per pod.](./diagrams/agent-topology-dark.svg)

**Decision factor**: there is no canonical pod-count threshold to switch over, but practitioner guides (e.g. Alibaba Cloud's [Logtail best-practices write-up](https://www.alibabacloud.com/blog/best-practices-of-kubernetes-log-collection_596356)) put the inflection roughly at hundreds of distinct collection configurations or low-thousands of pods per cluster. Below that, a DaemonSet is almost always the right answer; above it, isolation problems start to dominate and per-tenant sidecars (or per-tenant collector pools) become worthwhile.

[^sidecar-cost]: The "10×–20× more resources" figure that circulates in talks is a back-of-envelope estimate of the aggregate cluster cost, not a per-pod overhead — replacing one DaemonSet per node with one sidecar per pod multiplies the agent count by the pods-per-node ratio, which is commonly in that range. See the [Kubernetes Sidecar Pattern in Production](https://medium.com/@ismailkovvuru/kubernetes-sidecar-pattern-in-production-when-logging-slows-down-your-app-f8b68b6f44de) write-up for an example of the per-pod resource contention.

### Shipping strategies

**Push vs pull.** In a push model, the agent decides when to ship and the collector accepts; in a pull model, the collector polls the agent (Prometheus-style). Push wins on latency and is the dominant model for log shippers; pull wins when the collector needs to apply backpressure centrally and the agent has no durable buffer.

| Model | Latency                   | Failure mode             | Backpressure |
| ----- | ------------------------- | ------------------------ | ------------ |
| Push  | lower (immediate)         | agent buffers on failure | agent-side   |
| Pull  | higher (polling interval) | collector-side buffer    | server-side  |

**Batching.** Per the [Fluent Bit buffering docs](https://docs.fluentbit.io/manual/data-pipeline/buffering), the engine groups records into chunks averaging ~2 MB, with a default 1 second flush interval and at most 128 chunks held in memory simultaneously when filesystem buffering is enabled. Larger chunks amortize network overhead but increase tail latency and memory pressure during outages.

**Backpressure handling.** The non-negotiable rule is that an agent must never run with an unbounded memory buffer — the second that buffer fills, it OOM-kills the agent and often destabilizes the node. The three workable policies are:

1. **Bounded memory buffer with drop policy** — drop the oldest records when full. Acceptable for most operational logs.
2. **Disk spillover** — write to local disk when memory is exhausted (Fluentd's buffer plugin, Fluent Bit's `storage.path`). Trades local IOPS for durability.
3. **Adaptive sampling** — reduce the per-source rate dynamically under pressure (Vector). Preserves shape, loses fidelity.

### Agent comparison

| Agent      | Language | Memory  | Throughput | Best for                             |
| ---------- | -------- | ------- | ---------- | ------------------------------------ |
| Fluent Bit | C        | ~20 MB  | high       | edge, IoT, resource-constrained pods |
| Fluentd    | Ruby     | ~100 MB | medium     | plugin ecosystem, complex routing    |
| Vector     | Rust     | ~50 MB  | very high  | performance-critical, modern stacks  |
| Filebeat   | Go       | ~30 MB  | medium     | Elastic ecosystem                    |
| Logstash   | Java     | ~500 MB | medium     | heavy transformation pipelines       |

## Buffer and stream processing

### Why buffer

Direct shipping from agents to storage couples the two and turns every storage hiccup into an agent-side outage. A durable message queue (Kafka, Kinesis, Redpanda) between them earns its operational cost by giving you four properties: **absorption** of ingestion spikes, **decoupling** of collection from storage maintenance, **replay** for new pipelines, and **fan-out** to multiple consumers from a single stream. The trade-off is real — adding a queue costs roughly 10–50 ms of additional one-way latency and a non-trivial chunk of operations time — so for a small footprint you can ship straight from agent to storage and revisit when ingestion outpaces storage SLOs.

### Kafka for log streams

Kafka's partitioned, append-only log model maps almost perfectly onto log data, and the partition-key choice quietly drives the rest of the design.

```text title="kafka-topic-layout.txt"
Topic: application-logs
├── Partition 0: [service-a logs, ordered by offset]
├── Partition 1: [service-b logs, ordered by offset]
└── Partition 2: [service-c logs, ordered by offset]
```

| Partition key    | Pros                              | Cons                                    |
| ---------------- | --------------------------------- | --------------------------------------- |
| service name     | co-located logs, good compression | hot partitions for high-volume services |
| trace ID         | correlated logs together          | uneven distribution                     |
| round-robin      | even distribution                 | no per-key ordering                     |
| timestamp bucket | time locality                     | clock skew issues                       |

**Backpressure on the consumer side** is where most Kafka-based logging pipelines fail in production. The consumer-side recipe that survives load tests:

1. Disable auto-commit (`enable.auto.commit=false`) and acknowledge offsets only after a record has been fully processed and persisted. Auto-commit hides correctness bugs by advancing the offset before the work is done.
2. Cap concurrency with a bounded thread pool fed by the poll loop; the poll loop itself must stay lightweight.
3. Call `consumer.pause(partitions)` when the downstream system slows, and `resume()` once it recovers. This is the mechanism Kafka exposes specifically so consumers do not have to drop messages under back-pressure.
4. Alarm on the **rate of change** of `records-lag-max`, not just the absolute value — sudden slope changes catch outages earlier than threshold breaches.

The Kafka client consumer-config docs and practitioner write-ups (e.g. [Cut Kafka lag: 12 consumer patterns that work](https://medium.com/@Modexa/cut-kafka-lag-12-consumer-patterns-that-work-00e2d4c23d4e)) cover the knobs in detail.

### Stream processing

A dedicated stream processor stage (Flink, Spark Streaming, Vector, Benthos / RedPanda Connect) sits between the buffer and storage to do the work that should not happen at query time:

- **Parsing** structured fields out of unstructured prefixes.
- **Enrichment** with metadata that is too expensive to attach at the source (geo-IP, owning team, deployment SHA).
- **Routing** by level or service to different storage tiers — DEBUG to a sampled cheap tier, ERROR to the indexed hot tier.
- **Sampling** for high-cardinality, low-value sources (per-request access logs at full scale).

A useful rule of thumb: lightweight, deterministic transforms (regex, JSON parse) belong in the agent — they reduce the volume that hits the queue. Anything that needs a database lookup, a model call, or coordination across records belongs in the stream processor where retries are cheap.

## Storage engines

### Write-optimized architectures

Two architectural families dominate log storage, and the choice of family is more important than the choice of vendor inside it.

**LSM trees** (log-structured merge trees) buffer writes in memory, flush sorted segments to disk, and merge them in the background. Reads consult the memtable, then walk segment levels (with per-segment bloom filters to skip those that cannot match).

```text title="lsm-write-path.txt"
Write Path:
  Log Entry → MemTable (memory) → Flush → SSTable (disk)
                                            ↓
                                    Background compaction
                                            ↓
                                    Merged SSTables
```

- **Writes**: sequential, batched, O(1) amortized.
- **Reads**: check MemTable, then each SSTable level (bloom filters help).
- **Used in**: Elasticsearch (Lucene segments), RocksDB, Cassandra, ScyllaDB.

**Columnar storage** keeps each field as its own contiguous run on disk, sorted by a primary key. Same-typed columns compress dramatically better than rows, and the query engine reads only the columns the query references.

```text title="row-vs-column.txt"
Row-oriented:           Columnar:
| ts | level | msg |    | ts_col | level_col | msg_col |
| t1 | INFO  | A   |    | t1     | INFO      | A       |
| t2 | ERROR | B   |    | t2     | ERROR     | B       |
| t3 | INFO  | C   |    | t3     | INFO      | C       |
```

- **Compression**: typically 10×–100× better than row-oriented.
- **Query efficiency**: skip irrelevant columns and irrelevant blocks via per-block metadata.
- **Used in**: ClickHouse, Druid, Pinot, Parquet.

Netflix's logging deployment runs on ClickHouse and ingests **5 PB/day**, averaging **10.6 million events/second with 12.5 million peak**, after a redesign that brought query latency from ~3 s down to ~700 ms.[^netflix-clickhouse]

[^netflix-clickhouse]: ClickHouse Inc. and the Netflix observability team published the architecture in [How Netflix optimized its petabyte-scale logging system with ClickHouse](https://clickhouse.com/blog/netflix-petabyte-scale-logging). The three landed optimizations were JFlex-generated lexers (replacing regex log fingerprinting; throughput up 8–10×, per-record fingerprinting time from 216 µs to 23 µs), a custom native-protocol bulk insert (bypassing JDBC's per-row overhead), and sharded tag maps for high-cardinality `Map(String, String)` fields.

### Compression techniques

Columnar layouts compose multiple cheap codecs to reach surprising ratios. ClickHouse's own benchmark hits **~178× compression** on raw nginx access logs (20 GB → 109 MiB across 66 M entries) by structuring the rows, sorting on a clustering key, and stacking specialized codecs.[^clickhouse-178x] The marketing label for that benchmark is "170×".

[^clickhouse-178x]: [Compressing nginx logs 170× with column storage](https://clickhouse.com/blog/log-compression-170x). The post walks through dictionary encoding for low-cardinality columns, delta encoding for monotonic ones, and ZSTD on top.

| Technique           | How it works                                       | Best for                                |
| ------------------- | -------------------------------------------------- | --------------------------------------- |
| Dictionary encoding | store unique values once, reference by ID         | low-cardinality fields (level, service) |
| Delta encoding      | store deltas between consecutive values            | timestamps, monotonic IDs               |
| LZ4                 | fast block compression                             | general purpose, read-heavy             |
| ZSTD                | higher compression ratio, more CPU                 | archival, I/O-bound queries             |

Codec selection rule: use ZSTD for large range scans where the decompressor's CPU cost is amortized across many rows; prefer LZ4 when point-query decompression latency dominates.

### Tiered storage

Hot/warm/cold tiering lets the cost curve flatten across retention windows.

| Tier | Storage             | Indexing      | Typical retention | Query latency |
| ---- | ------------------- | ------------- | ----------------- | ------------- |
| Hot  | NVMe SSD            | full          | 1–7 days          | < 100 ms      |
| Warm | SSD or HDD          | partial / merged | 7–90 days      | 1–10 s        |
| Cold | Object storage (S3) | metadata only | months to years   | 30 s – minutes |

![Hot, warm, and cold storage lifecycle: ingestion lands on the hot tier, ages into the warm tier on rollover, transitions to cold object storage at the configured min age, and is eventually dropped on retention expiry. Queries hit the appropriate tier based on age and SLA.](./diagrams/tiered-storage-lifecycle-light.svg "Tiered storage lifecycle: data flows from ingestion through hot, warm, and cold tiers, with queries fanning out by recency and SLA.")
![Hot, warm, and cold storage lifecycle: ingestion lands on the hot tier, ages into the warm tier on rollover, transitions to cold object storage at the configured min age, and is eventually dropped on retention expiry. Queries hit the appropriate tier based on age and SLA.](./diagrams/tiered-storage-lifecycle-dark.svg)

[Elasticsearch ILM](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management) automates the transitions:

```json title="ilm-policy.json" collapse={1-2, 15-20}
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_size": "50GB", "max_age": "1d" }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {}
        }
      }
    }
  }
}
```

[Splunk SmartStore](https://help.splunk.com/en/data-management/manage-splunk-enterprise-indexers/9.4/implement-smartstore-to-reduce-local-storage-requirements/smartstore-architecture-overview) takes the same idea further by physically decoupling compute from storage: indexers cache only what they currently search on local SSD, while warm buckets live in S3-compatible object storage as the master copy. A cache manager fetches buckets on demand and evicts based on access recency. The architectural payoff is independent scaling — compute capacity becomes a function of query load, not retention window.

## Indexing strategies

The indexing decision is the largest single lever on cost, write throughput, and query latency. Three families dominate, and the article's other decisions (data model, tiering, sharding) usually fall out of which one you picked.

![Three indexing strategies side by side: an inverted index keeps a term dictionary and per-term postings list and offers O(log n) lookups but inflates index size by 1–3× the raw data; a label-only index keeps a stream key per label set and brute-force scans chunk content, drastically reducing index size; a columnar layout sorts data by primary key and uses granule-level metadata and skip indexes to read only the columns and blocks that match.](./diagrams/indexing-strategies-light.svg "Three indexing strategies: inverted index, label-only index, and columnar storage with skip indexes.")
![Three indexing strategies side by side: an inverted index keeps a term dictionary and per-term postings list and offers O(log n) lookups but inflates index size by 1–3× the raw data; a label-only index keeps a stream key per label set and brute-force scans chunk content, drastically reducing index size; a columnar layout sorts data by primary key and uses granule-level metadata and skip indexes to read only the columns and blocks that match.](./diagrams/indexing-strategies-dark.svg)

### Inverted indexes (full-text search)

Elasticsearch / OpenSearch are built on Lucene, which maintains an [inverted index](https://www.elastic.co/blog/found-elasticsearch-from-the-bottom-up) mapping each term to the documents that contain it.

```text title="inverted-index-shape.txt"
Term Dictionary:        Postings List:
"error"     → [doc1, doc3, doc7]
"payment"   → [doc2, doc3]
"timeout"   → [doc1, doc5, doc7]
```

A query looks up the term in the dictionary in O(log n), retrieves the postings list, and intersects or unions lists for boolean queries. The trade-off is index size: depending on the field types, replication factor, and feature set (positions for phrase queries, doc-values for sorting, `_source` for replay), the indexed footprint is typically a noticeable fraction of the raw data and can balloon several times larger for analyzed text fields. Elastic's own [LogsDB write-up](https://www.elastic.co/observability-labs/blog/elasticsearch-logsdb-storage-evolution) is the most honest accounting of where the bytes go and reports up to a 75% size reduction relative to default settings when the new logs-optimized format is enabled.

For shard sizing, the [current Elastic guidance](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards) is **10 GB to 50 GB per shard** with at most ~200 M documents per shard; the older "20 shards per GB of heap" rule was retired in 8.3 in favor of a per-node 1,000 shards budget.

### Label-based indexing (Loki)

Grafana Loki indexes only the **label set** that identifies a stream, not the log content itself.

```text title="loki-stream-key.txt"
Labels: {service="payment", level="error", env="prod"}
Chunks: [compressed log lines matching these labels]
```

A query first filters by labels (which is indexed and cheap), then brute-force scans the matching chunks. LogQL chains a stream selector with line filters and parser stages:

```logql title="logql-example.logql"
{service="payment"} |= "timeout" | json | latency_ms > 500
```

The [LogQL reference](https://grafana.com/docs/loki/latest/query/log_queries/) recommends ordering line filters before parser stages — line filters cut data volume cheaply, parsers extract fields after the volume has been reduced.

| Aspect           | Inverted index (Elasticsearch) | Label-only (Loki)            |
| ---------------- | ------------------------------ | ----------------------------- |
| Index size       | sizable fraction of raw data    | very small                    |
| Storage cost     | high                            | low                           |
| Full-text search | fast                            | scan required                 |
| High cardinality | handles well                    | label explosion if mishandled |
| Query latency    | consistent                      | varies with scan size         |

> [!CAUTION]
> Loki's published cardinality guidance is a hard guardrail, not a soft one. Grafana recommends each tenant stay below **100,000 active streams** and **1 million streams over 24 hours**, and explicitly calls out request IDs, user IDs, IPs, and timestamps as labels you must never use.[^loki-cardinality] High-cardinality fields belong in **structured metadata** (indexed without creating new streams) or in the log content (filtered with `|=` and `|~` at query time).

[^loki-cardinality]: [Cardinality in Grafana Loki](https://grafana.com/docs/loki/latest/get-started/labels/cardinality/) and the companion [label best-practices doc](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/) cover the active-stream limits, the structured-metadata escape hatch, and the `logcli series '{}' --analyze-labels` tool for auditing existing label usage.

### Bloom filters and skip indexes

Bloom filters trade exactness for memory: a small bit-array per block answers "definitely no" or "probably yes" for membership queries, with a tunable false-positive rate (~10 bits per element gives ~1% false positives).

ClickHouse uses bloom filters as a [data-skipping index](https://clickhouse.com/docs/optimize/skipping-indexes) — they tell the query engine which granules cannot match and therefore should not be read from disk. The classic flavors are `bloom_filter` for equality, `tokenbf_v1` for whole-word search, and `ngrambf_v1` for substring search; the latter two are deprecated in ClickHouse ≥ 26.2 in favor of a deterministic [`text` index](https://clickhouse.com/docs/optimize/skipping-indexes/examples) for full-text workloads.

Bloom filters are not a replacement for an inverted index when you genuinely need ranked full-text search; they shine as a cheap pre-filter on top of a primary key that already provides good locality. A common ClickHouse pattern is to sort log rows by a `(service, hour, fingerprint)` key and add bloom filters on the high-cardinality columns the engine cannot otherwise prune.

## Query patterns

### Real-time vs historical

| Query type              | Latency SLA | Index strategy        | Storage tier  |
| ----------------------- | ----------- | --------------------- | ------------- |
| Live tail               | < 1 s       | in-memory only        | hot           |
| Incident investigation  | < 10 s      | full index            | hot + warm    |
| Compliance audit        | minutes OK  | partial / metadata    | warm + cold   |
| Analytics / trending    | minutes OK  | aggregated / rollup   | all tiers     |

Designing the storage layout to match the dominant query type pays off disproportionately — a system tuned for live tail (sub-second) and ad-hoc incident investigation (sub-10-second) usually still serves audit queries acceptably; the reverse is rarely true.

### Query fan-out across tiers and shards

A query at a non-trivial cluster size never hits a single replica. The query frontend authenticates, scopes the request to a tenant, splits the time range, and fans the work out to the shards that own each slice. Results stream back, get merged, deduped, and (often) cached.

![Query fan-out: a client query enters a query frontend that handles auth and tenant scoping, then a scheduler splits the time range and fans out to hot shards, warm shards, and a cold reader pulling from object storage. Results merge, dedupe, and cache before returning to the client.](./diagrams/query-fan-out-light.svg "Query fan-out: a frontend splits the request by time and tenant, scatter-gathers across hot/warm/cold tiers, and merges results.")
![Query fan-out: a client query enters a query frontend that handles auth and tenant scoping, then a scheduler splits the time range and fans out to hot shards, warm shards, and a cold reader pulling from object storage. Results merge, dedupe, and cache before returning to the client.](./diagrams/query-fan-out-dark.svg)

Three knobs determine whether this scales:

- **Time-range splitting.** Loki, Mimir, and Tempo split a query into per-day (or per-hour) sub-queries that run in parallel; ClickHouse exploits PARTITION BY clauses for the same effect. Without it, a 30-day query runs serially and fan-out wins nothing.
- **Result caching.** Frontends cache by `(query, tenant, time bucket)`; only the trailing partial bucket is recomputed on every refresh. Grafana Loki documents this as the [`results_cache`](https://grafana.com/docs/loki/latest/configure/) layer in front of the query path.
- **Backpressure on the scatter side.** A misbehaving query that fans out to thousands of shards can saturate the network before any shard returns. Per-tenant `max_query_parallelism` and per-query data-volume limits keep one query from monopolizing the cluster.

### Multi-tenant query isolation

Once more than one team or customer shares the cluster, tenant isolation becomes a correctness property, not a feature. The two failure modes are **data leakage** (tenant A reads tenant B's logs) and **noisy-neighbor starvation** (tenant A's runaway query freezes tenant B's dashboards).

[Loki implements multi-tenancy](https://grafana.com/docs/loki/latest/operations/multi-tenancy/) at the HTTP boundary: with `auth_enabled: true`, every request must carry an `X-Scope-OrgID` header, and the storage path namespaces chunks and indices by tenant ID. A tenant-A request cannot read tenant-B data, and the `__tenant_id__` virtual label lets operators write cross-tenant queries explicitly when allowed (`X-Scope-OrgID: A|B`). Per-tenant `limits_config` overrides — `ingestion_rate_mb`, `max_streams_per_user`, `max_query_parallelism`, `max_global_streams_per_user` — cap how much one tenant can spend on either path.

Because the header itself is trust-on-first-write, a hardened deployment puts an authenticating gateway (NGINX, OAuth2 Proxy, an in-house edge) in front of Loki and lets only the gateway set `X-Scope-OrgID`. The same pattern applies to other tenant-aware backends: Elasticsearch's [security plugin](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth) enforces document-level security via field roles, and ClickHouse uses [row-level security policies](https://clickhouse.com/docs/sql-reference/statements/create/row-policy) tied to a `tenant_id` column.

### Sampling strategies

At petabyte scale, "ingest everything" is a budget statement, not a technical one. Sampling is how you keep the bill flat while preserving incident debuggability.

| Strategy           | Decision point         | Fidelity for errors | Best for                                        |
| ------------------ | ---------------------- | ------------------- | ----------------------------------------------- |
| Head-based         | request start          | random              | high-volume access logs, uniform traffic        |
| Tail-based         | after the request ends | always sampled      | trace-correlated logs, error investigation      |
| Adaptive / dynamic | rolling rate per source | preserved on spikes | bursty workloads, cost-capped pipelines        |
| Stratified         | per-level / per-source | tunable             | mixing DEBUG sampling with full-fidelity ERROR |

[Head-based sampling](https://opentelemetry.io/docs/concepts/sampling/) is cheap and stateless — pick a probability at the root span and propagate the decision via `traceparent`'s sampled flag. It cannot, however, guarantee that error traces survive: if the request errored on hop 5, you find that out after the head decision is locked in.

[Tail-based sampling](https://opentelemetry.io/blog/2022/tail-sampling/) buffers spans (and their correlated logs) until the trace finishes, then applies a policy: always keep traces with `error=true`, with `latency > 1s`, with a specific tag, plus a small percentage of the rest. The OpenTelemetry Collector's `tailsamplingprocessor` is the reference implementation. The cost is statefulness — every span of a trace must reach the same collector instance, which usually means a load-balancer-aware deployment of the collector itself.

Adaptive sampling reaches for a target ingestion rate per source and adjusts the per-record probability to hit it. Cloudflare's [ABR analytics](https://blog.cloudflare.com/explaining-cloudflares-abr-analytics/) takes this idea further by storing pre-computed samples at multiple resolutions (100 %, 10 %, 1 %) and picking the resolution that satisfies the query under a latency budget. Apply the same shape to logs by writing high-fidelity samples to the hot tier and pre-aggregated rollups to the warm tier; queries hit the rollup when they can.

> [!TIP]
> The cheapest sampling decision is the one made at the source. A `log.debug` call that never executes costs nothing; a `log.debug` call that executes, is shipped, queued, parsed, and then dropped at the stream processor costs you the entire pipeline minus the storage write. Wire log-level changes through the same change-management system as feature flags.

### Correlation across services

Distributed tracing turns scattered per-service logs back into a single request narrative. The mechanism is a **trace ID** generated at the edge and propagated through every downstream call as a `traceparent` header per [W3C Trace Context](https://www.w3.org/TR/trace-context/), with a vendor-specific `X-Request-ID` for legacy services that pre-date OTel. The OpenTelemetry SDKs and logging bridges automatically copy the active `TraceId` and `SpanId` into every emitted log record (see the [Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)), which is what makes a single `WHERE trace_id = '...'` query reconstruct the request path across stores.

![Sequence diagram showing a checkout request entering the API gateway, which generates a trace ID and propagates it through Auth, Payment, and Notification services. Each service emits log entries tagged with the same trace_id, enabling the log store to reconstruct the full request path with a single trace_id query.](./diagrams/trace-correlation-sequence-light.svg "Trace ID propagation: the API gateway mints a trace_id and forwards it on every downstream call so the log store can stitch the full request path back together.")
![Sequence diagram showing a checkout request entering the API gateway, which generates a trace ID and propagates it through Auth, Payment, and Notification services. Each service emits log entries tagged with the same trace_id, enabling the log store to reconstruct the full request path with a single trace_id query.](./diagrams/trace-correlation-sequence-dark.svg)

[Uber's Jaeger deployment](https://www.uber.com/us/en/blog/distributed-tracing/) is the canonical large-scale example: in 2016 it handled "thousands of traces per second" across hundreds of microservices, and by 2022 the [CRISP paper](https://www.usenix.org/system/files/atc22-zhang-zhizhou.pdf) reports throughput in the hundreds of thousands of spans per second across over 4,000 services, with adaptive sampling keeping the recorded volume tractable.

### Aggregation queries

Most "logging" dashboards are really aggregation dashboards in disguise. Columnar engines (ClickHouse, Druid) excel at these because the executor reads only the referenced columns.

```sql title="error-rate-by-service.sql"
-- Error rate by service, last hour
SELECT service, count(*) AS errors
FROM logs
WHERE level = 'ERROR'
  AND timestamp > now() - INTERVAL 1 HOUR
GROUP BY service
ORDER BY errors DESC;

-- P99 latency by endpoint, last day
SELECT endpoint, quantile(0.99)(latency_ms) AS p99
FROM logs
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY endpoint;
```

If aggregations dominate, materialized views or pre-aggregated rollups (ClickHouse `AggregatingMergeTree`, Druid rollup tables) drop the cost by another order of magnitude at the price of a slightly stale read.

## Scaling approaches

### Partitioning strategies

**Time-based partitioning** is the default for logs because retention and partitioning align: dropping old data is a metadata operation, not a delete pass.

```text title="time-partitions.txt"
logs-2026-04-19
logs-2026-04-20
logs-2026-04-21
```

The drawback is the hot/cold skew — recent partitions absorb almost all writes and reads. **Composite partitioning** by `(service, time)` (or `(tenant, time)` for multi-tenant systems) spreads the load and lets retention policies vary per source, at the cost of a much larger partition catalog.

```text title="composite-partitions.txt"
logs-payment-2026-04-21
logs-auth-2026-04-21
logs-payment-2026-04-22
```

A subtle property: each partition is independently ordered, but there is no global ordering across partitions. Cross-partition queries fan out and merge — fine for analytical queries, painful for queries that need a strict global order.

### Replication

Standard durability strategies apply. Logs are typically more tolerant of weak consistency than transactional data — losing a handful of log lines during a failover is rarely catastrophic — so eventual replication and async commit acks are common.

| Strategy            | Consistency  | Write latency | Failure tolerance |
| ------------------- | ------------ | ------------- | ----------------- |
| Sync to 2 replicas  | strong       | higher        | 1 node            |
| Async replication   | eventual     | lower         | data-loss window  |
| Quorum (2 of 3)     | strong       | medium        | 1 node            |

### Sharding for write throughput

When a single partition cannot absorb peak write volume (a hot service flooding its time bucket), shard within the partition.

```text title="sharded-partition.txt"
logs-payment (logical) →
  logs-payment-shard-0 (physical, 33% of writes)
  logs-payment-shard-1 (physical, 33% of writes)
  logs-payment-shard-2 (physical, 33% of writes)
```

Shard-key choice mirrors Kafka's partition-key trade-offs:

- **Hash of trace ID** — good distribution, but cross-shard queries become scatter-gather.
- **Round-robin** — maximum distribution, no per-key locality.
- **Consistent hashing** — smooth rebalancing as shards are added or removed; the only choice when the cluster grows over time.

## Real-world implementations

### ELK stack (Elasticsearch, Logstash, Kibana)

1. **Collection**: Filebeat / Metricbeat ships logs.
2. **Processing**: Logstash ingests, parses, enriches.
3. **Storage**: Elasticsearch indexes into sharded indices.
4. **Visualization**: Kibana queries via REST.

Lucene-backed inverted indexes give the most flexible query surface in this list (wildcards, fuzzy, phrase, faceted aggregation), at the corresponding storage and write cost. Pick ELK when query richness is the primary requirement and the storage budget can absorb the index overhead.

### Grafana Loki

1. **Distributor** receives logs, validates, forwards to ingesters.
2. **Ingester** batches logs into chunks and builds the label index.
3. **Querier** executes LogQL and merges results.
4. **Chunk store** lives in S3 / GCS / Azure Blob (compressed log chunks).
5. **Index store** lives in BoltDB, Cassandra, or object storage (label index only).

The architecture is essentially "Prometheus, but for logs." Cost-per-byte at scale is roughly an order of magnitude lower than a fully indexed system, at the price of label-cardinality discipline and slower full-text search. Pick Loki when Grafana is already the visualization layer and the log shape is naturally low-cardinality.

### ClickHouse for logs

ClickHouse is an OLAP database that has become a credible log store for the petabyte tier. Its design strengths line up well with logs: columnar storage, primary-key-sorted parts, granule-level skip indexes, materialized views for pre-aggregation, and aggressive compression. The Netflix architecture above is the reference deployment; the [`simple-logging-benchmark` repo](https://github.com/ClickHouse/simple-logging-benchmark) is a useful starting point for sizing your own workload.

Pick ClickHouse when scale and analytical queries dominate, and you accept giving up some of Lucene's free-form full-text capabilities in exchange for lower cost.

### Splunk

Splunk's classic architecture splits into forwarders, indexers, and search heads with the [SPL](https://docs.splunk.com/Documentation/Splunk/latest/Search/GetstartedwithSearch) query language. SmartStore (above) is the modern compute/storage-decoupled option. Pick Splunk when enterprise compliance, SOC integrations, and SPL ergonomics carry more weight than per-byte cost.

### Datadog CloudPrem

[CloudPrem](https://www.datadoghq.com/blog/introducing-datadog-cloudprem/) is Datadog's hybrid log-storage product, built on the open-source [Quickwit](https://quickwit.io/) engine. Indexers receive logs from Datadog Agents and write optimized index pieces called **splits** directly to S3-compatible object storage. A central **metastore** (PostgreSQL in the reference deployment) tracks split locations, and a **stateless search layer** consults the metastore to fan a query out to peer search nodes that pull splits from object storage in parallel. The architectural payoff is the same as Splunk SmartStore: compute and storage scale independently.

## Common pitfalls

### High-cardinality labels

**The mistake**: tagging streams by request ID, user ID, or trace ID.

**Why it happens**: these are exactly the fields engineers want to query.

**The consequence**: in a label-only system (Loki) you get stream explosion and ingester OOMs. In Elasticsearch you get a shard-count blow-up. In ClickHouse you get a useless skip-index.

**The fix**: keep high-cardinality fields in the log payload and query them with full-text filters, structured metadata (Loki), or skip indexes (ClickHouse). Reserve labels for low-cardinality identity (`service`, `env`, `region`).

### Unbounded log volume

**The mistake**: shipping every request at DEBUG in production.

**Why it happens**: "we might need it later".

**The consequence**: storage cost, query latency, and ingestion lag all spiral together; the on-call inherits the bill.

**The fix**: sample high-volume low-value sources, enforce a per-service quota at the agent or stream-processor stage, and treat log levels as part of the production change-management surface.

### Missing correlation IDs

**The mistake**: no trace ID propagation across services.

**Why it happens**: it requires cross-team coordination and a small library change everywhere.

**The consequence**: incident investigation devolves into per-service log diving and timestamp matching.

**The fix**: mandate `traceparent` (W3C) or an `X-Request-ID` header at the API gateway and propagate through every internal call. The investment pays back the first time you correlate a payment failure with an upstream auth blip.

### Single-tier storage

**The mistake**: keeping everything on hot storage indefinitely.

**Why it happens**: "storage is cheap".

**The consequence**: at scale, hot SSD dominates the bill, and the index keeps growing until query latency degrades.

**The fix**: tier early, automate transitions with ILM (Elasticsearch) or equivalent, and accept that warm-tier reads are slower in exchange for an order-of-magnitude lower per-byte cost.

### No backpressure handling

**The mistake**: agents with unbounded memory buffers.

**Why it happens**: "we cannot lose logs."

**The consequence**: the agent OOMs, the node destabilizes, and you lose far more logs (and other workloads) than a bounded buffer ever would.

**The fix**: bounded memory buffer with disk spillover or sampling under pressure. Some log loss is always preferable to a node-level outage.

## Practical takeaways

- **Structured logging** (JSON for ergonomics, Protobuf for hot paths) is non-negotiable at any meaningful scale; it shifts parsing cost from query time to write time and unlocks compression.
- **DaemonSet collectors** are the default; switch to per-tenant sidecars only when isolation or per-application configuration becomes the binding constraint, not earlier.
- **Pick the indexing family deliberately**: inverted indexes (Elasticsearch) for query richness, label-only indexes (Loki) for cost, columnar storage (ClickHouse) for extreme scale and analytical queries. Mixing engines (e.g. Loki for app logs + ClickHouse for access logs) is often the right call.
- **Tier storage from day one.** Most logs are never queried after a week; design the lifecycle policy before the cluster gets large enough for it to hurt.
- **Treat the buffer as load-shedding infrastructure.** Kafka or Kinesis between agents and storage exists primarily to keep an outage on one side from cascading to the other; design consumer back-pressure (`pause`/`resume`, bounded thread pools, manual commits) accordingly.
- **Pay the trace-ID propagation tax early.** It is cheap to add when the service count is small and very expensive to retrofit when it is not.

## Appendix

### Prerequisites

- Familiarity with distributed-systems fundamentals (replication, partitioning, consistency models).
- Working knowledge of time-series data characteristics.
- Basic understanding of search indexing concepts.

### Terminology

- **LSM tree (log-structured merge tree)**: write-optimized data structure that batches writes in memory and flushes them to immutable, sorted on-disk segments.
- **Inverted index**: mapping from terms to documents containing those terms; the foundation of full-text search engines like Lucene.
- **Bloom filter**: probabilistic set-membership data structure with no false negatives and a tunable false-positive rate.
- **ILM (index lifecycle management)**: automated policy for transitioning indexed data through storage tiers and eventual deletion.
- **LogQL**: Grafana Loki's query language, modeled on PromQL.
- **Span**: a single timed operation in a distributed trace; many spans make up a trace identified by a trace ID.

### References

- [How Netflix optimized its petabyte-scale logging system with ClickHouse](https://clickhouse.com/blog/netflix-petabyte-scale-logging) — 5 PB/day deployment, lexer / native-protocol / sharded-tag-map optimizations.
- [Compressing nginx logs 170× with column storage](https://clickhouse.com/blog/log-compression-170x) — anatomy of a 178× compression result.
- [Cardinality in Grafana Loki](https://grafana.com/docs/loki/latest/get-started/labels/cardinality/) and [label best practices](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/).
- [Elasticsearch — size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards) and the [Elasticsearch LogsDB write-up](https://www.elastic.co/observability-labs/blog/elasticsearch-logsdb-storage-evolution).
- [Splunk SmartStore architecture overview](https://help.splunk.com/en/data-management/manage-splunk-enterprise-indexers/9.4/implement-smartstore-to-reduce-local-storage-requirements/smartstore-architecture-overview).
- [Datadog CloudPrem](https://www.datadoghq.com/blog/introducing-datadog-cloudprem/) and [CloudPrem architecture docs](https://docs.datadoghq.com/cloudprem/introduction/architecture/).
- [Datadog log collection limits](https://docs.datadoghq.com/logs/log_collection/) and [Logs API](https://docs.datadoghq.com/api/latest/logs/).
- [Fluent Bit — Buffering & Storage](https://docs.fluentbit.io/manual/data-pipeline/buffering).
- [Kubernetes Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/) and Alibaba Cloud's [Best Practices of Kubernetes Log Collection](https://www.alibabacloud.com/blog/best-practices-of-kubernetes-log-collection_596356).
- [Evolving Distributed Tracing at Uber Engineering](https://www.uber.com/us/en/blog/distributed-tracing/) and the [CRISP paper](https://www.usenix.org/system/files/atc22-zhang-zhizhou.pdf).
- [Protocol Buffers — updating message types](https://protobuf.dev/programming-guides/proto3/#updating).
- [W3C Trace Context](https://www.w3.org/TR/trace-context/) for canonical trace-ID propagation.
- [ClickHouse data-skipping indexes](https://clickhouse.com/docs/optimize/skipping-indexes) including bloom-filter variants.
- [LogQL log queries](https://grafana.com/docs/loki/latest/query/log_queries/).
- [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) — normalized record fields, severity, resource attributes.
- [Loki tenant isolation](https://grafana.com/docs/loki/latest/operations/multi-tenancy/) — `X-Scope-OrgID`, per-tenant limits, multi-tenant queries.
- [OpenTelemetry sampling](https://opentelemetry.io/docs/concepts/sampling/) and [Tail Sampling with OpenTelemetry](https://opentelemetry.io/blog/2022/tail-sampling/).
- [Cloudflare ABR analytics](https://blog.cloudflare.com/explaining-cloudflares-abr-analytics/) — adaptive multi-resolution sampling.
