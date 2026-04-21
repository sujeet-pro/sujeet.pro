---
title: "Instagram: From Redis to Cassandra and the Rocksandra Storage Engine"
linkTitle: "Instagram → Cassandra"
description: >-
  How Instagram migrated activity feed and fraud detection from Redis to
  Cassandra for ≈75% cost savings, then built Rocksandra (a RocksDB-based
  pluggable storage engine) to drop P99 reads from 60 ms to 20 ms and GC stalls
  by ~10x — a seven-year evolution from 12 nodes to 1,000+ across six data
  centres.
publishedDate: 2026-02-08T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - case-study
  - data
  - migrations
  - distributed-systems
  - storage
  - databases
---

# Instagram: From Redis to Cassandra and the Rocksandra Storage Engine

Instagram migrated activity feed, fraud detection, and direct-message workloads from Redis to Apache Cassandra in 2012 to escape memory-bound costs, then built [Rocksandra](https://issues.apache.org/jira/browse/CASSANDRA-13474) — a pluggable storage engine that swaps Cassandra's Java storage path for [RocksDB](http://rocksdb.org/) — to reverse JVM garbage collection stalls that dominated P99 latency at 1,000+ nodes. The pattern reappears at each phase: adopt a proven distributed system, hit a structural ceiling, and replace the offending layer rather than the entire stack. This article reconstructs the seven-year evolution from primary sources — Cassandra Summit talks, the Apache JIRA, the Instagram engineering blog, and the OSDI 2018 Akkio paper — and surfaces the engineering decisions a senior engineer would want to relitigate today.

![Instagram's Cassandra journey across four phases: Redis replacement, scale-out to 1,000+ nodes, Rocksandra storage swap, and Akkio-driven geo-locality.](./diagrams/cassandra-journey-timeline-light.svg "Instagram's Cassandra journey: from Redis replacement to a globally distributed, custom-storage-engine deployment spanning six data centres.")
![Instagram's Cassandra journey across four phases: Redis replacement, scale-out to 1,000+ nodes, Rocksandra storage swap, and Akkio-driven geo-locality.](./diagrams/cassandra-journey-timeline-dark.svg)

## Abstract

Instagram's Cassandra story is not a single migration but a series of compounding infrastructure decisions spanning 2012 to 2019:

- **The cost problem (2012)**: Redis stored everything in memory. Fraud detection logs and activity feeds were growing faster than Instagram could afford RAM. Cassandra's disk-backed LSM (Log-Structured Merge) tree storage cut infrastructure costs by ≈75% while adding horizontal scalability ([Branson, Cassandra Summit 2013](https://www.slideshare.net/slideshow/c-summit-2013-cassandra-at-instagram-23756207/23756207)).
- **The latency problem (2017)**: At 1,000+ nodes, JVM garbage collection (GC) stalls drove P99 read latencies into the 25–60 ms range. Instagram designed a pluggable storage engine API ([CASSANDRA-13474](https://issues.apache.org/jira/browse/CASSANDRA-13474)) and slotted in a C++ RocksDB-based engine ([Rocksandra](https://issues.apache.org/jira/browse/CASSANDRA-13476)). P99 reads dropped to ≈20 ms, GC stalls from 2.5 % to 0.3 %, and the Instagram engineering team measured "more than 10 times reduction" for some tail-latency-sensitive workloads ([Instagram Engineering, 2018](https://instagram-engineering.com/open-sourcing-a-10x-reduction-in-apache-cassandra-tail-latency-d64f86b43589)).
- **The locality problem (2018)**: Full data replication across continents wasted storage and forced cross-ocean quorum requests. Akkio, Facebook's data placement service, partitioned data by user geography — US data in US data centres, EU data in EU data centres — reducing access latency by up to 50 %, cross-datacentre traffic by up to 50 %, and storage footprint by up to 40 % ([Annamalai et al., OSDI 2018](https://www.usenix.org/system/files/osdi18-annamalai.pdf)).

Each phase built on the previous one. The Redis migration proved Cassandra viable. Scale revealed JVM limits, which drove Rocksandra. Global expansion demanded locality-aware placement. The pattern: adopt, hit limits, engineer past them.

## Context

### The System

Instagram launched in October 2010 as an iOS photo-sharing app built by two engineers: Kevin Systrom and Mike Krieger. The original stack ran entirely on Amazon Web Services (AWS):

| Component            | Technology                 | Configuration                                                             |
| -------------------- | -------------------------- | ------------------------------------------------------------------------- |
| **Application**      | Django (Python) + Gunicorn | 25+ High-CPU Extra-Large EC2 instances                                    |
| **Primary database** | PostgreSQL                 | 12 Quadruple Extra-Large Memory instances + 12 replicas                   |
| **Caching**          | Redis + Memcached          | Multiple Quadruple Extra-Large instances (Redis), 6 instances (Memcached) |
| **Photo storage**    | Amazon S3 + CloudFront     | Several terabytes                                                         |
| **Async tasks**      | Gearman                    | ~200 Python workers                                                       |

Redis powered several critical data structures:

- **Photo-to-user ID mapping**: 300 million entries, optimized via hash bucketing to fit in ~5 GB (vs ~21 GB naive approach)
- **Activity feed**: A 32-node cluster (16 masters, 16 replicas) storing per-user activity timelines
- **Main feed**: Photo feed data for the home timeline
- **Sessions**: User authentication state

PostgreSQL handled users, photo metadata, tags, comments, and relationships, sharded using a custom scheme with PostgreSQL schemas as logical shards. Instagram's custom 64-bit ID generation used PL/pgSQL functions within each shard (41 bits for time, 13 bits for shard ID, 10 bits for sequence).

### The Trigger

**Date**: Early 2012

**Growth**: Instagram crossed 30 million users in early 2012 and was acquired by Facebook for $1 billion in April 2012 with just 13 employees. By mid-2013, monthly active users hit 100 million.

**Key metrics at the time:**

| Metric                      | Value                                         |
| --------------------------- | --------------------------------------------- |
| Registered users            | 30+ million (early 2012)                      |
| Monthly active users        | 100 million (mid-2013)                        |
| Photos stored               | 150+ million (August 2011), 20 billion (2013) |
| Upload rate                 | 25+ photos/sec, 90+ likes/sec                 |
| Engineering team            | 3-6 engineers                                 |
| Redis activity feed cluster | 32 nodes (16 masters, 16 replicas)            |

### Constraints

- **Memory cost**: Redis stored everything in RAM. Quadruple Extra-Large Memory EC2 instances were the most expensive instance class, and the activity feed cluster alone required 32 of them.
- **Workload mismatch**: Fraud detection and activity feeds had write-heavy access patterns (high write-to-read ratio). Paying for in-memory speed on data that was mostly written and rarely read was wasteful.
- **Durability**: Redis was designed as an in-memory store with persistence as a secondary feature. For security audit data used in fraud detection and spam fighting, stronger durability guarantees were needed.
- **Scaling model**: Redis scaled vertically (bigger instances) rather than horizontally (more nodes). Adding capacity meant migrating to larger instances, not simply adding machines.
- **Team size**: With 3-6 engineers, operational complexity had to stay minimal.

## The Problem

### Symptoms

The activity feed and fraud detection systems consumed the most expensive hardware in Instagram's fleet while underutilizing CPU. Redis machines ran out of memory long before they ran out of compute.

Rick Branson, Instagram's infrastructure engineer, described the core issue at Cassandra Summit 2013: the data was growing faster than the team could justify paying for in-memory storage. Fraud detection logs, security audit data, and activity feeds were append-heavy workloads where sub-millisecond reads were unnecessary--but they were paying for sub-millisecond capability on every byte.

### Root Cause Analysis

**The fundamental mismatch**: Redis optimizes for access speed by keeping everything in memory. Instagram's growing workloads--fraud detection logs, activity feeds, user inbox data--had a high write-to-read ratio. Most data was written once and read infrequently. Storing it in RAM was paying a premium for a capability the workload did not need.

**The scaling ceiling**: When a Redis node filled its memory, the only option was to migrate to a larger instance type. There was no mechanism to spread load across additional smaller nodes without re-architecting the sharding layer. Redis's single-threaded design further constrained vertical headroom.

**The durability gap**: Redis offered persistence through RDB (Redis Database) snapshots and AOF (Append-Only File) logs, but these were secondary features. For data used in fraud detection and spam enforcement, the team needed storage with replication and durability as first-class properties.

### Why It Wasn't Obvious Earlier

At Instagram's initial scale (2010-2011), Redis was the right choice. The entire working dataset fit in memory, latency was critical for feed rendering, and the operational simplicity of Redis with a small team was a significant advantage. The problem only emerged as data volumes outgrew what memory-based storage could justify economically.

## Options Considered

### Option 1: Scale Redis Vertically

**Approach**: Upgrade to larger EC2 instance types with more RAM.

**Pros:**

- Zero code changes
- Familiar operations

**Cons:**

- Cost scales linearly with data growth (all data in RAM)
- Instance types had memory ceilings--no path to unlimited growth
- Single-threaded architecture limited per-node throughput
- No horizontal elasticity

**Why not chosen**: Cost was already prohibitive and would only increase. Memory-based storage for write-heavy, rarely-read data was architecturally wrong for the workload.

### Option 2: HBase

**Approach**: Use Apache HBase, which Facebook had adopted internally for some workloads after moving away from Cassandra for inbox search.

**Pros:**

- Proven at Facebook scale
- Strong consistency model
- Good integration with Hadoop ecosystem

**Cons:**

- Requires ZooKeeper and HDFS--significant operational overhead
- Master-slave architecture introduces single points of failure
- Higher operational complexity for a team of 3-6 engineers

**Why not chosen**: The operational complexity of running ZooKeeper + HDFS + HBase was disproportionate for the team size. Instagram's philosophy was "do the simple thing first."

### Option 3: Apache Cassandra (Chosen)

**Approach**: Migrate fraud detection, activity feed, and inbox data from Redis to Cassandra.

**Pros:**

- Peer-to-peer architecture (no master, no SPOF)
- Tunable consistency per query
- Horizontal scaling by adding nodes
- High write throughput on commodity hardware
- Disk-based storage (dramatically cheaper per GB than RAM)

**Cons:**

- Eventually consistent by default (not suitable for all workloads)
- JVM-based (GC pauses could affect tail latency)
- Less mature tooling than PostgreSQL

**Why chosen**: The write-heavy, high-volume, eventual-consistency-tolerant workloads matched Cassandra's design point. The peer-to-peer architecture minimized operational burden. One of Instagram's engineers had deep Cassandra expertise from prior work at DataStax, reducing adoption risk.

### Decision Factors

| Factor                  | Scale Redis        | HBase             | Cassandra             |
| ----------------------- | ------------------ | ----------------- | --------------------- |
| Cost per GB             | Very high (RAM)    | Low (disk)        | Low (disk)            |
| Horizontal scalability  | Poor               | Good              | Good                  |
| Operational complexity  | Low                | High (ZK+HDFS)    | Medium                |
| Write throughput        | High (single node) | High              | Very high             |
| Team expertise          | Strong             | None              | Strong (one engineer) |
| Single point of failure | Per-node           | ZooKeeper, Master | None                  |

## Implementation

### Phase 1: Initial Cassandra Deployment (2012-2013)

#### Cluster Configuration

The first production Cassandra cluster was deployed on AWS for fraud detection and activity feed workloads:

| Parameter               | Value                                             |
| ----------------------- | ------------------------------------------------- |
| **Cassandra version**   | 1.2.3                                             |
| **Cluster size**        | 12 nodes                                          |
| **Instance type**       | EC2 hi1.4xlarge (8-core CPU, 60 GB RAM, 2 TB SSD) |
| **Availability zones**  | 3                                                 |
| **Replication factor**  | 3                                                 |
| **Write consistency**   | TWO                                               |
| **Read consistency**    | ONE                                               |
| **Compaction strategy** | LeveledCompactionStrategy                         |
| **Virtual nodes**       | Enabled                                           |
| **JVM heap**            | 8 GB                                              |
| **Young generation**    | 800 MB                                            |
| **Data stored**         | ~1.2 TB                                           |

**Why these choices:**

- **RF=3 across 3 AZs**: Every row existed in all three availability zones, providing AZ-level fault tolerance.
- **W=TWO, R=ONE**: Writes were durable (confirmed by two replicas) while reads were fast (single replica). This matched the write-heavy access pattern.
- **LeveledCompactionStrategy**: Optimizes read latency by maintaining sorted data at the cost of higher write amplification. Chosen because when reads did happen (e.g., rendering a user's activity feed), latency mattered.
- **hi1.4xlarge instances**: High I/O instances with SSD storage--critical for Cassandra's disk-heavy workload. The 60 GB RAM allowed large page caches while keeping the JVM heap small.

#### Data Model: Activity Feed

The primary data model replaced Redis lists with Cassandra wide rows:

**Redis (before):**

```redis
key: inbox:<user_id>
value: list of activity JSON blobs (LPUSH/LRANGE)
```

**Cassandra (after):**

```sql title="Activity feed schema (CQL)"
CREATE TABLE inbox_activities_by_user (
    user_id bigint,
    activity_id timeuuid,
    activity_data blob,
    PRIMARY KEY (user_id, activity_id)
) WITH CLUSTERING ORDER BY (activity_id DESC);
```

**Why this model:**

- `user_id` as partition key co-located all activities for a single user on the same nodes, enabling efficient range scans.
- `activity_id` as a TimeUUID clustering column provided natural time ordering without a separate sort.
- `CLUSTERING ORDER BY DESC` meant the most recent activities were physically first on disk, optimizing the most common query: "show me the latest N activities."

#### Peak Throughput

| Metric           | Value                             |
| ---------------- | --------------------------------- |
| Peak writes      | ~20,000/sec                       |
| Peak reads       | ~15,000/sec                       |
| Data consistency | 99.63% (measured across replicas) |

### Phase 2: Scaling to 1,000+ Nodes (2014-2016)

After Instagram migrated from AWS to Facebook's data centers in 2013-2014, Cassandra usage expanded dramatically. By Dikang Gu's Cassandra Summit 2016 presentation, the deployment had grown to:

| Metric                     | Value                                                    |
| -------------------------- | -------------------------------------------------------- |
| **Total nodes**            | 1,000+                                                   |
| **Data stored**            | Hundreds of terabytes                                    |
| **Operations per second**  | Millions                                                 |
| **Largest single cluster** | 100+ nodes                                               |
| **Use cases**              | Feed, inbox, Direct messaging, counters, fraud detection |

#### Feed Data Model (2016)

The feed system became Cassandra's highest-throughput use case:

| Metric                         | Value  |
| ------------------------------ | ------ |
| Write QPS (Queries Per Second) | 1M+    |
| Average read latency           | 20 ms  |
| P99 read latency               | 100 ms |

Write path: when a user posted a photo, the system performed fan-out-on-write, pushing the media id to each follower's feed store. This traded write amplification for read simplicity — rendering a feed became a single partition read rather than a scatter-gather across followed users.

**Celebrity fan-out optimisation**: for accounts with millions of followers, fan-out-on-write was prohibitively expensive. Instagram used a hybrid approach: non-celebrity posts were pre-computed (push model), while celebrity content was computed on demand (pull model). When a user read their feed, parallel threads fetched the pre-computed inbox and the small set of celebrity posts the user follows, then merged the results. An LRU-eviction cache stored active users' feeds to reduce re-computation.

![Hybrid fan-out for the home feed: posts from normal accounts are fanned out at write time into per-follower wide rows; celebrity posts are stored once and pulled at read time. The feed renderer issues both fetches in parallel, then merges by timestamp.](./diagrams/feed-fan-out-hybrid-light.svg "Hybrid feed fan-out — push for normal accounts, pull for celebrities, merge at read time.")
![Hybrid fan-out for the home feed: posts from normal accounts are fanned out at write time into per-follower wide rows; celebrity posts are stored once and pulled at read time. The feed renderer issues both fetches in parallel, then merges by timestamp.](./diagrams/feed-fan-out-hybrid-dark.svg)

#### Proxy Nodes

As clusters grew, Instagram discovered that co-locating coordinator responsibilities with data storage on the same node caused latency spikes when data nodes became hot. The solution: dedicated proxy nodes configured with `join_ring: false`, acting as coordinators without storing data locally. Clients connected exclusively to proxy nodes, which forwarded requests to the appropriate data nodes. This architectural change alone produced a 2x latency improvement.

#### Counter Service

A separate Cassandra-backed counter service tracked likes, views, and engagement metrics:

| Metric               | Value |
| -------------------- | ----- |
| Read/Write QPS       | 50K+  |
| Average read latency | 3 ms  |
| P99 read latency     | 50 ms |

#### JVM Tuning Evolution

As clusters grew, GC tuning became increasingly critical:

| Period         | Heap  | Young Gen | Notes                                                          |
| -------------- | ----- | --------- | -------------------------------------------------------------- |
| 2013 (initial) | 8 GB  | 800 MB    | Default settings                                               |
| 2014           | 20 GB | 10 GB     | Addressed Young GC double-collection bug in JDK 1.7+           |
| Later          | 64 GB | 16 GB     | MaxTenuringThreshold=6, Young GC every 10s, 2x P99 improvement |

The 2014 scaling to 60 hi1.4xlarge instances (2x the highest estimate) revealed that Cassandra's JVM heap management required careful tuning. The Young GC double-collection bug in JDK 1.7+ caused objects to be collected twice, and the fix--running 10 GB Young Gen with 20 GB total heap--was a hard-won operational lesson.

### Phase 3: Rocksandra -- Replacing the Storage Engine (2017-2018)

#### The Latency Problem

Despite years of JVM tuning, GC remained the dominant source of tail latency:

| Metric                               | Value                            |
| ------------------------------------ | -------------------------------- |
| Average read latency                 | 5 ms                             |
| P99 read latency                     | 25-60 ms (varied by cluster)     |
| GC stall rate (low traffic)          | 1.25%                            |
| GC stall rate (high traffic)         | 2.5%                             |
| Target SLA (Service Level Agreement) | Five nines (99.999%) reliability |

The root cause was structural: Cassandra's memtable, compaction, read path, and write path all created short-lived objects on the Java heap. As data volume and throughput increased, so did GC pressure. No amount of tuning could eliminate the fundamental tension between JVM-managed memory and latency-sensitive storage workloads.

![How a JVM stop-the-world Young GC turns a steady-state 5 ms read into a 25-60 ms P99 spike: while mutator threads are paused, incoming reads queue and every queued request inherits the pause length on resume.](./diagrams/gc-pause-tail-latency-light.svg "GC pause impact on tail latency — stop-the-world Young GC freezes mutator threads, queued reads then inherit the full pause and surface as P99 spikes.")
![How a JVM stop-the-world Young GC turns a steady-state 5 ms read into a 25-60 ms P99 spike: while mutator threads are paused, incoming reads queue and every queued request inherits the pause length on resume.](./diagrams/gc-pause-tail-latency-dark.svg)

#### Architecture: Pluggable Storage Engine

Cassandra had no pluggable storage engine architecture. Instagram designed one from scratch, defining a new `StorageEngine` API that separated Cassandra's distribution layer (gossip, replication, consistency) from its storage layer (memtables, SSTables, compaction).

![Side-by-side architecture: stock Cassandra runs the entire memtable, SSTable, and compaction path on the JVM heap, generating GC pressure; Rocksandra keeps the JVM coordinator unchanged but routes row-level work through a StorageEngine API to a C++ RocksDB engine, removing Java garbage from the storage hot path.](./diagrams/architecture-before-after-rocksandra-light.svg "Architecture before vs after Rocksandra — only the storage layer changes; gossip, replication, and consistency stay on the JVM.")
![Side-by-side architecture: stock Cassandra runs the entire memtable, SSTable, and compaction path on the JVM heap, generating GC pressure; Rocksandra keeps the JVM coordinator unchanged but routes row-level work through a StorageEngine API to a C++ RocksDB engine, removing Java garbage from the storage hot path.](./diagrams/architecture-before-after-rocksandra-dark.svg)

The three core challenges:

1. **Storage engine API**: Define clean interfaces between Cassandra's coordination layer and the storage implementation. Filed as [CASSANDRA-13474](https://issues.apache.org/jira/browse/CASSANDRA-13474) in Apache JIRA.

2. **Data type encoding/decoding**: Cassandra supports rich data types (collections, UDTs, counters, frozen types). RocksDB is a pure key-value store. Instagram designed encoding algorithms that mapped Cassandra's table schemas and data types into RocksDB's byte-oriented key-value pairs while preserving the same query semantics. Filed as [CASSANDRA-13476](https://issues.apache.org/jira/browse/CASSANDRA-13476).

3. **Streaming decoupling**: Cassandra's streaming (used for repairs, bootstrapping, and data movement) was tightly coupled to the SSTable format. Instagram re-implemented streaming using RocksDB APIs: incoming data streamed into temporary SST files first, then used RocksDB's ingest file API to bulk-load them--avoiding the overhead of individual writes during bootstrap and repair.

The pluggable engine API was defined at `org.apache.cassandra.engine.StorageEngine`, with Instagram's RocksDB implementation at `org.apache.cassandra.rocksdb.RocksDBEngine`. Configuration required three JVM parameters: `cassandra.rocksdb.keyspace` (target keyspace), `cassandra.rocksdb.dir` (data directory), and `cassandra.rocksdb.stream.dir` (temporary streaming directory).

**Feature scope**: Rocksandra supported most non-nested data types, table schemas, point and range queries, mutations, timestamps, TTL (Time To Live), and cell-level tombstones. It did not support multi-partition queries, nested data types, counters, range tombstones, materialized views, secondary indexes, or repair operations. These limitations were acceptable because Instagram's primary use cases were simple key-value and wide-column patterns.

#### Why RocksDB

RocksDB is a C++ embeddable key-value store originally developed at Facebook, optimized for fast storage (SSDs and NVMe). It uses an LSM tree architecture--the same fundamental structure as Cassandra's storage engine--but implemented in C++ with arena-allocated memtables and off-heap iterators, so the storage hot path produces no Java garbage at all.

Instagram already operated RocksDB at scale for other Facebook workloads. Using a proven technology that the team understood, rather than adopting a new distributed database like ScyllaDB, minimized adoption risk. As one engineer noted in the Hacker News discussion: why replace a system proven at massive scale with something unproven at that scale?

![Write-path comparison: in stock Cassandra, every step (memtable, flush, compaction) allocates short-lived Java objects and feeds Young GC pressure; in Rocksandra, the same steps run inside RocksDB on off-heap C++ memory, leaving the JVM coordinator unchanged.](./diagrams/write-path-comparison-light.svg "Write-path comparison — Cassandra's Java path churns short-lived heap objects at every stage; Rocksandra's RocksDB path is fully off-heap and produces no Java garbage on writes.")
![Write-path comparison: in stock Cassandra, every step (memtable, flush, compaction) allocates short-lived Java objects and feeds Young GC pressure; in Rocksandra, the same steps run inside RocksDB on off-heap C++ memory, leaving the JVM coordinator unchanged.](./diagrams/write-path-comparison-dark.svg)

#### Performance Results

After approximately one year of development and testing — the [CASSANDRA-13474 description](https://issues.apache.org/jira/browse/CASSANDRA-13474) confirms the timeline — Rocksandra was rolled into production clusters:

**Production metrics**: the engineering blog reports a "3-4× reduction on P99 read latency in general, even more than 10 times reduction for some use cases" and a step change in GC behaviour:

| Metric                              | Before (Java engine) | After (Rocksandra) | Improvement                  |
| ----------------------------------- | -------------------- | ------------------ | ---------------------------- |
| P99 read latency (one prod cluster) | 60 ms                | 20 ms              | ≈3× reduction                |
| GC stall rate                       | 2.5 % (peak)         | 0.3 %              | ≈10× reduction               |
| Latency variance                    | High (GC-driven)     | Low                | Predictable across runs      |
| Read-only throughput at P99 ≈ 2 ms (NDBench) | ≈30 K ops/s | ≈300 K ops/s       | ≈10× reduction in cost-per-QPS |

> [!NOTE]
> The "10×" headline in [Instagram's open-source announcement](https://instagram-engineering.com/open-sourcing-a-10x-reduction-in-apache-cassandra-tail-latency-d64f86b43589) actually points at two different numbers: the GC stall rate fell ≈10× (2.5 % → 0.3 %) and the read-only NDBench benchmark sustained ≈10× the throughput at the same ≈2 ms P99 (300 K/s vs 30 K/s on Cassandra 3.0). The single-cluster production P99 improvement was closer to 3× (60 ms → 20 ms). Cite the right number for the right workload.

**Benchmark environment** ([NDBench](https://github.com/Netflix/ndbench) on AWS, per the Instagram blog):

| Parameter   | Value                                                           |
| ----------- | --------------------------------------------------------------- |
| Instances   | 3 × i3.8xlarge EC2 (32-core, 244 GB RAM)                        |
| Storage     | RAID0 across 4 NVMe flash drives (≈500 GB of data per server)   |
| Schema      | NDBench default `emp` table (`emp_uname` PK + 3 text columns)   |
| Dataset     | 250 million rows, 6 KB each                                     |
| Concurrency | 128 readers + 128 writers                                       |

![Rocksandra internal layout: the JVM coordinator drives gossip, replication, and streaming; the StorageEngine API hands rows over JNI to a RocksDB engine that owns encode/decode (CASSANDRA-13476) and a bulk SST ingest path used by streaming, repair, and bootstrap.](./diagrams/rocksandra-architecture-light.svg "Rocksandra internals — the StorageEngine API plus a re-implemented streaming layer that bulk-loads incoming SST files via RocksDB's ingest API, avoiding per-row writes during repair and bootstrap.")
![Rocksandra internal layout: the JVM coordinator drives gossip, replication, and streaming; the StorageEngine API hands rows over JNI to a RocksDB engine that owns encode/decode (CASSANDRA-13476) and a bulk SST ingest path used by streaming, repair, and bootstrap.](./diagrams/rocksandra-architecture-dark.svg)

The improvement was not just in absolute latency but in consistency. With the Java engine, P99 latency varied between 25 ms and 60 ms depending on GC timing. With Rocksandra the storage hot path produces no Java garbage, so the dominant source of P99 variance is gone — what remains is mostly JVM coordination overhead.

#### Open Source

Instagram open-sourced Rocksandra on GitHub ([Instagram/cassandra](https://github.com/Instagram/cassandra), `rocks_3.0` branch, based on Cassandra 3.0). The CASSANDRA-13474 JIRA already referenced the public blog post by April 2017; Rocksandra and the [benchmark framework](https://github.com/Instagram/cassandra-aws-benchmark) were open-sourced in 2017–2018 alongside the F8 2018 talk "[Cassandra on RocksDB at Instagram](https://developers.facebook.com/videos/f8-2018/cassandra-on-rocksdb-at-instagram/)". The repository was archived by Instagram on 28 September 2023.

### Phase 4: Geographic Data Partitioning with Akkio (2018)

#### The Locality Problem

By 2018, Instagram served over 1 billion monthly active users across multiple continents. The original approach--replicating all data across all data centers--created two problems:

1. **Storage waste**: Full replication meant every user's data existed in every region, even if that user only accessed their data from one continent.
2. **Cross-ocean latency**: Quorum consistency (requiring a majority of replicas to agree) meant some requests had to cross the Atlantic, adding 60+ ms of latency.

#### Akkio: Facebook's Data Placement Service

Instagram integrated [Akkio](https://engineering.fb.com/2018/10/08/core-infra/akkio/), a Facebook-internal locality management service that had been in production since 2014 and, by the time of [the OSDI 2018 paper](https://www.usenix.org/system/files/osdi18-annamalai.pdf), managed roughly 100 PB across five different storage backends.

**Core concept: microshards (μ-shards)**

Akkio sits between client applications and the underlying datastore. Each μ-shard is an application-defined unit of related data exhibiting access locality. Average μ-shard size at Facebook is ≈200 KB, with typical sizes ranging from a few hundred bytes to a few megabytes; for Instagram's user-keyed data, one user's data is one μ-shard. μ-shards never span shards — Akkio assigns each μ-shard to exactly one underlying shard and migrates it as a unit.

**How it works:**

1. **Access tracking**: An Akkio client library wraps every datastore call, asynchronously recording the requesting region against the μ-shard id in a time-windowed counter (10-day retention, typically queried over the last 3 days).
2. **Placement scoring**: When the Akkio client detects a cross-region access, it hints the Data Placement Service (DPS). The DPS reads the recent access history, scores each region by weighted recency × available capacity, and picks the highest-scoring placement.
3. **Migration**: If the chosen placement differs from the current one, the DPS serialises a migration: lock the μ-shard, set the source ACL to read-only, copy to the destination, atomically update the location DB, delete from source, release the lock. For eventually consistent backends like Cassandra, Akkio uses timestamp-based ordering rather than ACL flips.

![Akkio microshard placement: the client library records access patterns, the Data Placement Service scores regions by recency-weighted history × capacity, and migrations are serialised through a lock on the location database.](./diagrams/akkio-microshard-placement-light.svg "Akkio microshard placement and migration flow — every cross-region access is a hint that triggers asynchronous re-evaluation by the DPS.")
![Akkio microshard placement: the client library records access patterns, the Data Placement Service scores regions by recency-weighted history × capacity, and migrations are serialised through a lock on the location database.](./diagrams/akkio-microshard-placement-dark.svg)

**The canonical Cassandra + Akkio use case at Instagram — Connection-Info**

The OSDI 2018 paper documents Instagram **Connection-Info** as the headline Cassandra deployment behind Akkio. Connection-Info stores per-user state (when and where each user was online, status, connection endpoints) and has roughly **30 billion μ-shards**. It runs on Cassandra with quorum reads and writes for strong consistency. The original deployment used 5× full replication across five US datacentres; once usage in a second continent grew, that no longer fit. Akkio enabled a 3× replication scheme with two replicas in the destination continent and one in the source — keeping a quorum within one continent and read/write latencies under 50 ms instead of the 100+ ms a cross-ocean quorum would impose. **Without Akkio, Instagram could not have expanded Connection-Info into the second continent at all.**

**Architecture after Akkio integration:**

| Region | Data centres   | Data scope     |
| ------ | -------------- | -------------- |
| US     | 3 data centres | US users' data |
| EU     | 3 data centres | EU users' data |

Each region maintained 20 % capacity headroom for single-datacentre failover within the region ([Xiao, LISA 2018](https://www.infoq.com/news/2018/11/instagram-across-continents/)).

**Aggregate results across Akkio-managed services:**

| Metric                                   | Improvement         | Source            |
| ---------------------------------------- | ------------------- | ----------------- |
| Access latency                           | Up to 50 % reduction | OSDI 2018 abstract |
| Cross-datacentre traffic                 | Up to 50 % reduction | OSDI 2018 abstract |
| Storage footprint                        | Up to 40 % reduction | OSDI 2018 abstract |
| Instagram Direct end-to-end p90 latency  | −90 ms              | OSDI 2018 §5.2.4   |
| Instagram Direct end-to-end p95 latency  | −150 ms             | OSDI 2018 §5.2.4   |
| Instagram Direct text message send rate  | +1.1 %              | OSDI 2018 §5.2.4   |

> [!IMPORTANT]
> The Direct numbers above describe **Iris**, the Facebook-internal queueing service that Instagram Direct uses (Iris persists to MySQL, not Cassandra). They illustrate Akkio's reach beyond Cassandra rather than the Cassandra read path itself. Cassandra-on-Akkio at Instagram is best characterised by Connection-Info: locality determines whether a quorum can stay on one continent.

The Social Hash partitioner routed requests to the correct Cassandra buckets based on user geography, with special handling for high-follower accounts that generated distributed access patterns across regions. TAO, Facebook's social graph store, was modified for region-local masters but did **not** use Akkio: media objects are accessed globally, so locality-based μ-shard placement would have provided little benefit ([Xiao, LISA 2018](https://www.infoq.com/news/2018/11/instagram-across-continents/)).

## Outcome

### Metrics Comparison Across Phases

| Metric           | Redis (2012)       | Cassandra 1.2 (2013) | Cassandra at scale (2016) | Rocksandra (2018) |
| ---------------- | ------------------ | -------------------- | ------------------------- | ----------------- |
| Nodes            | 32 (activity feed) | 12                   | 1,000+                    | 1,000+            |
| Data stored      | In-memory only     | ~1.2 TB              | Hundreds of TB            | Hundreds of TB    |
| Cost (relative)  | 100%               | ~25%                 | -                         | -                 |
| P99 read latency | Sub-ms             | -                    | 25-60 ms                  | 20 ms             |
| GC stall rate    | N/A                | -                    | 1.25-2.5%                 | 0.3%              |
| Write QPS (feed) | -                  | 20K                  | 1M+                       | 1M+               |
| Geographic scope | Single region      | Single region        | Multi-DC (US)             | US + EU (6 DCs)   |

### Timeline

| Date                  | Milestone                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| October 2010          | Instagram launches on PostgreSQL + Redis                                      |
| Early 2012            | Cassandra adoption begins for fraud detection                                 |
| April 2012            | Facebook acquires Instagram (13 employees)                                    |
| June 2013             | Rick Branson presents first 12-node Cassandra cluster at Cassandra Summit     |
| April 2013 - Mid 2014 | Migration from AWS to Facebook data centers                                   |
| 2014                  | Cassandra scales to 60+ nodes; Cassandra Summit 2014 presentation             |
| 2015                  | Multi-datacenter expansion within the US                                      |
| 2016                  | 1,000+ nodes, Dikang Gu presents at Cassandra Summit 2016                     |
| 2016-2017             | Rocksandra development (~1 year); CASSANDRA-13474/13476 filed Apr 2017         |
| 2017-2018             | Rocksandra open-sourced ([Instagram/cassandra `rocks_3.0`](https://github.com/Instagram/cassandra/tree/rocks_3.0)); F8 2018 talk in May |
| October 2018          | Geographic partitioning with Akkio ([LISA 2018](https://www.infoq.com/news/2018/11/instagram-across-continents/), [OSDI 2018](https://www.usenix.org/system/files/osdi18-annamalai.pdf))         |
| 2019                  | Cassandra as a Service inside Instagram ([Dikang Gu, DataStax Accelerate 2019](https://www.datastax.com/resources/video/datastax-accelerate-2019-solving-optimal-data-placement-instagrams-global-scale)) |
| September 2023        | Instagram archives the `Instagram/cassandra` GitHub repo                       |

### Unexpected Benefits

- **Operational simplicity at scale**: Cassandra's peer-to-peer architecture meant no master failovers, no ZooKeeper dependency, and straightforward capacity additions — critical for a team that grew dramatically from a handful of engineers in 2012 to hundreds inside Facebook over the next several years.
- **Pluggable storage engine as a platform**: The storage engine API Instagram built for Rocksandra (CASSANDRA-13474) was proposed upstream to Apache Cassandra, potentially enabling other storage backends beyond RocksDB.
- **Akkio enablement**: Cassandra's flexible replication model made it a natural fit for Akkio's microshard-based data placement, which was harder to apply to systems like TAO (Facebook's social graph store) with globally-accessed data.

### Remaining Limitations

- **Rocksandra adoption**: The pluggable storage engine API ([CASSANDRA-13474](https://issues.apache.org/jira/browse/CASSANDRA-13474)) was not merged into mainline Apache Cassandra — its status remains "Open" with no fix version, and Jeremiah Jordan's review feedback (2017) noted the API needs a second engine implementation to validate it. Instagram maintained a fork, which was [archived on GitHub on 28 September 2023](https://github.com/Instagram/cassandra).
- **JVM overhead persists**: Cassandra's coordination layer (gossip, request handling) still runs on the JVM. Rocksandra only replaced the storage path.
- **Eventual consistency trade-offs**: Workloads requiring strong consistency remained on PostgreSQL or TAO. Cassandra served use cases where eventual consistency was acceptable.

## Lessons Learned

### Technical Lessons

#### 1. Match Storage Costs to Access Patterns

**The insight**: Storing write-heavy, rarely-read data in RAM is an architectural smell. The cost model should match the access pattern--disk storage for archival writes, memory for hot reads.

**How it applies elsewhere:**

- Audit logs, analytics events, and activity streams rarely need sub-millisecond reads
- The ≈75 % cost saving Instagram reported came from recognising that write performance, not read speed, was the binding constraint ([Branson, 2013](https://www.slideshare.net/slideshow/c-summit-2013-cassandra-at-instagram-23756207/23756207))

**Warning signs to watch for:**

- Memory utilization growing faster than CPU utilization on cache/store nodes
- Storage cost dominating infrastructure budget for data that is mostly written

#### 2. JVM Garbage Collection Limits Tail Latency at Scale

**The insight**: JVM-based storage engines create an inherent tension between throughput and P99 latency. At sufficient scale (1,000+ nodes, millions of operations), no amount of GC tuning eliminates the problem.

**How it applies elsewhere:**

- Any JVM-based data store (Elasticsearch, Kafka, HBase) will face similar GC pressure at scale
- The pattern of replacing hot-path components with native code (C++/Rust) is increasingly common: ScyllaDB (C++ Cassandra), Redpanda (C++ Kafka), Quickwit (Rust Elasticsearch)

**Warning signs to watch for:**

- P99 latency 10-15x higher than average (indicates GC pauses, not I/O)
- GC stall percentage above 1% during normal operation
- Latency variance that does not correlate with load changes

#### 3. Build on Proven Components Rather Than Replacing Entire Systems

**The insight**: Instagram replaced Cassandra's storage engine with RocksDB rather than replacing Cassandra entirely with ScyllaDB or another system. This preserved operational expertise, cluster tooling, and the proven distribution layer while solving the specific problem (GC latency).

**How it applies elsewhere:**

- When a system has one problematic layer, consider replacing that layer rather than the entire system
- Organizational trust in a technology is a real engineering asset--switching costs include lost operational knowledge

**What they'd do differently:**
The pluggable storage engine API was not accepted upstream into Apache Cassandra, leaving Instagram on a fork. Contributing the API earlier in the process might have changed the outcome.

### Process Lessons

#### 1. Presentation-Driven Engineering Rigor

Instagram's Cassandra team presented at Cassandra Summit every year from 2013 to 2019. Each presentation forced the team to quantify their deployment's state, document decisions, and articulate challenges. This created an unusually well-documented evolution that other teams could learn from.

#### 2. Shadow Clustering for Version Upgrades

When migrating from Cassandra 2.2 to 3.0, Dikang Gu's team used shadow clusters--parallel deployments receiving replicated traffic--to validate behavior before cutting over production. This pattern reduced the risk of major version upgrades on a system serving billions of operations.

### Organizational Lessons

#### 1. Small Teams Need Low-Ops Technology

Instagram chose Cassandra partly because its peer-to-peer architecture required less operational overhead than master-slave systems like HBase. With 3-6 engineers running the entire infrastructure, every operational burden was magnified. The absence of ZooKeeper dependencies, master failover procedures, and HDFS management was a decisive factor.

#### 2. Expertise Acquisition Through Hiring

One of Instagram's engineers had deep Cassandra expertise from prior work at DataStax. This single hire de-risked the entire migration. When adopting unfamiliar infrastructure, hiring someone who has operated it at scale is often more effective than training existing staff.

## Applying This to Your System

### When This Pattern Applies

You might face similar challenges if:

- You are storing append-heavy, rarely-read data (logs, events, feeds) in an in-memory store
- Your storage costs are growing faster than your read throughput requirements justify
- You need horizontal scalability without master-node bottlenecks
- Your JVM-based data store has P99 latencies significantly higher than P50

### Checklist for Evaluation

- [ ] Is your storage cost dominated by memory for data with a high write-to-read ratio?
- [ ] Are you hitting vertical scaling limits (memory, instance type ceilings)?
- [ ] Is your P99 latency 10x+ higher than average, suggesting GC pressure?
- [ ] Does your team have (or can acquire) Cassandra operational expertise?
- [ ] Are your consistency requirements compatible with eventual consistency?

### Starting Points

If you want to explore this approach:

1. **Profile your workload**: Measure write-to-read ratio, access recency, and hot data percentage. If most data is cold, it does not belong in RAM.
2. **Benchmark Cassandra for your schema**: Use cassandra-stress or NDBench with your actual data model and access patterns. Test with LeveledCompactionStrategy for read-heavy partitions and SizeTieredCompactionStrategy for write-heavy ones.
3. **Start with one workload**: Instagram started with fraud detection--a non-user-facing, write-heavy workload where Cassandra failure would not break the product. Choose your lowest-risk, highest-waste workload.
4. **Monitor GC from day one**: Track GC stall percentage, not just average latency. A 2% stall rate that is invisible in averages will dominate your P99.

## Conclusion

Instagram's Cassandra journey demonstrates a recurring pattern in infrastructure evolution: adopt technology for its strengths, discover its limits at scale, then engineer past those limits rather than replacing the system entirely. The ≈75 % cost saving from migrating off Redis validated Cassandra. The GC-latency wall at 1,000+ nodes led to Rocksandra rather than a database switch. Geographic expansion drove Akkio integration rather than a replication redesign.

The transferable insight is not "use Cassandra." It is: match your storage cost model to your access patterns, expect JVM-based systems to hit GC walls at scale, and when you hit a wall, replace the problematic layer--not the entire stack.

## Appendix

### Prerequisites

- Understanding of LSM tree storage engines (memtables, SSTables, compaction)
- Familiarity with distributed system concepts (replication factor, consistency levels, partitioning)
- Basic knowledge of JVM garbage collection (Young/Old Gen, GC pauses, stall rates)

### Terminology

| Term                          | Definition                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LSM tree**                  | Log-Structured Merge tree. A write-optimized data structure that buffers writes in memory (memtable), flushes to sorted files on disk (SSTables), and periodically merges them (compaction). |
| **Rocksandra**                | Instagram's name for their modified Cassandra with RocksDB as the storage engine.                                                                                                            |
| **Akkio**                     | Facebook's data placement service that tracks access patterns and migrates data units (microshards) to data centers closest to frequent accessors.                                           |
| **Microshard (u-shard)**      | An application-defined data unit in Akkio, typically representing a single user's data, that can be independently placed in a specific data center.                                          |
| **GC stall rate**             | The percentage of time a JVM-based application is paused for garbage collection, unable to process requests.                                                                                 |
| **Fan-out on write**          | A pattern where data is duplicated to all recipients' stores at write time, trading write amplification for fast reads.                                                                      |
| **LeveledCompactionStrategy** | A Cassandra compaction strategy that maintains data in sorted levels, optimizing read latency at the cost of higher write amplification.                                                     |
| **Shadow cluster**            | A parallel deployment receiving replicated production traffic for testing, used to validate new configurations or versions before production cutover.                                        |

### Summary

- Instagram migrated fraud detection and activity-feed workloads from Redis to Cassandra in 2012, cutting infrastructure costs by ≈75 % by moving from in-memory to disk-based storage for write-heavy, rarely-read data.
- The initial 12-node Cassandra 1.2 cluster on AWS grew to 1,000+ nodes on Facebook's infrastructure by 2016, handling millions of operations per second across feed, inbox, Direct messaging, and counter workloads.
- JVM garbage collection became the dominant source of P99 latency at scale (25–60 ms). Instagram built Rocksandra, replacing Cassandra's Java storage engine with a C++ RocksDB engine through a pluggable `StorageEngine` API. Typical P99 reads dropped to ~20 ms (≈3×), and GC stall rate fell from 2.5 % to 0.3 % (≈10×).
- Geographic data partitioning via Akkio eliminated cross-continent replication for user-keyed Cassandra workloads (Connection-Info), reducing latency by up to 50 % and storage by up to 40 % by placing each user's μ-shard in the nearest regional cluster.
- The pattern — adopt proven technology, discover scale-specific limits, engineer past them rather than replace the system — is a reusable approach for infrastructure evolution.

### References

**Primary sources — Cassandra Summit and Instagram engineering**

- [Cassandra at Instagram, Cassandra Summit 2013 — Rick Branson](https://www.slideshare.net/slideshow/c-summit-2013-cassandra-at-instagram-23756207/23756207) — initial 12-node hi1.4xlarge deployment, RF=3 / W=TWO / R=ONE, 75 % cost reduction.
- [Cassandra at Instagram (August 2013) — Rick Branson](https://www.slideshare.net/rbranson/cassandra-at-instagram-aug-2013) — updated cluster configuration and data models.
- [Cassandra at Instagram 2014, Cassandra Summit 2014 — Rick Branson](https://www.slideshare.net/planetcassandra/cassandra-summit-2014-cassandra-at-instagram-2014) — scaling to 60+ nodes; JVM tuning lessons including the JDK 1.7 Young GC double-collection bug.
- [Cassandra at Instagram 2016, Cassandra Summit 2016 — Dikang Gu](https://www.slideshare.net/DataStax/cassandra-at-instagram-2016) — 1,000+ nodes, feed data model, proxy nodes, counter service.
- [Open-sourcing a 10x reduction in Apache Cassandra tail latency — Instagram Engineering](https://instagram-engineering.com/open-sourcing-a-10x-reduction-in-apache-cassandra-tail-latency-d64f86b43589) — Rocksandra announcement, NDBench results, feature scope.
- [What Powers Instagram — Instagram Engineering](https://instagram-engineering.com/what-powers-instagram-hundreds-of-instances-dozens-of-technologies-adf2e22da2ad) — original AWS stack: Django + Gunicorn, PostgreSQL, Redis, Memcached, Gearman, S3, CloudFront.
- [Sharding & IDs at Instagram — Instagram Engineering](https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c) — 64-bit ID layout (41 bits time, 13 bits shard, 10 bits sequence) and PL/pgSQL implementation.
- [Instagration Pt. 2: Scaling to Multiple Data Centers — Instagram Engineering](https://instagram-engineering.com/instagration-pt-2-scaling-our-infrastructure-to-multiple-data-centers-5745cbad7834) — multi-DC expansion within the US.

**Apache JIRA and Rocksandra source**

- [CASSANDRA-13474 — Cassandra pluggable storage engine, Apache JIRA](https://issues.apache.org/jira/browse/CASSANDRA-13474) — umbrella ticket; status "Open" as of 2025; sub-tasks include CASSANDRA-13475 (engine design), CASSANDRA-14115/16/18 (streaming, repair, write-path refactors).
- [CASSANDRA-13476 — RocksDB based storage engine, Apache JIRA](https://issues.apache.org/jira/browse/CASSANDRA-13476) — concrete RocksDB engine implementation.
- [Instagram/cassandra (`rocks_3.0` branch) — GitHub](https://github.com/Instagram/cassandra/tree/rocks_3.0) — open-source Rocksandra code; archived 28 September 2023.
- [Cassandra on RocksDB (OSCON 2018) — Dikang Gu](https://conferences.oreilly.com/oscon/oscon-or-2018/public/schedule/detail/67020.html) — technical deep-dive on Rocksandra architecture.
- [Cassandra on RocksDB at Instagram (F8 2018) — Meta for Developers](https://developers.facebook.com/videos/f8-2018/cassandra-on-rocksdb-at-instagram/) — F8 talk; coincides with broader open-source rollout.
- [Instagram Supercharges Cassandra with a Pluggable RocksDB Storage Engine — The New Stack](https://thenewstack.io/instagram-supercharges-cassandra-pluggable-rocksdb-storage-engine/) — interview with Francois Deliege and Dikang Gu on the storage engine API design.

**Akkio and geographic partitioning**

- [Sharding the Shards: Managing Datastore Locality at Scale with Akkio — USENIX OSDI 2018](https://www.usenix.org/system/files/osdi18-annamalai.pdf) — Akkio architecture, μ-shards, Connection-Info (§5.2.3) and Direct (§5.2.4) production results.
- [Managing data store locality at scale with Akkio — Engineering at Meta](https://engineering.fb.com/2018/10/08/core-infra/akkio/) — DPS architecture, ZippyDB-backed metadata, capacity scoring.
- [Splitting Stateful Services across Continents at Instagram — InfoQ (LISA 2018, Sherry Xiao)](https://www.infoq.com/news/2018/11/instagram-across-continents/) — 3 US + 3 EU layout, 20 % regional headroom, why TAO does not use Akkio.
- [Solving Optimal Data Placement for Instagram's Global Scale, DataStax Accelerate 2019 — Dikang Gu](https://www.datastax.com/resources/video/datastax-accelerate-2019-solving-optimal-data-placement-instagrams-global-scale) — operational view of Akkio integration.

**Context and corroboration**

- [Instagram: Making the Switch to Cassandra from Redis — Hacker News discussion](https://news.ycombinator.com/item?id=5845107) — Rick Branson's contemporaneous comments on the Redis-to-Cassandra decision.
- [Facebook to Buy Instagram (13 employees) for $1 Billion — KQED](https://www.kqed.org/news/61601/facebook-to-buy-instagram-for-1-billion) — acquisition date and team size.
