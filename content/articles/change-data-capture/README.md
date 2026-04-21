---
title: Change Data Capture
linkTitle: 'CDC'
description: >-
  Log-based, trigger-based, and polling-based CDC approaches compared, with Debezium implementation
  details, Kafka integration patterns, and the trade-offs that make log-based CDC the production standard.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - distributed-systems
  - patterns
  - system-design
  - databases
  - data-engineering
---

# Change Data Capture

Change Data Capture (CDC) extracts and streams database changes to downstream systems in real-time. Rather than polling databases or maintaining dual-write logic, CDC reads directly from the database's internal change mechanisms—transaction logs, replication streams, or triggers—providing a reliable, non-invasive way to propagate data changes across systems.

This article covers CDC approaches, log-based implementation internals, production patterns, and when each variant makes sense.

![CDC captures changes from the database's transaction log and emits structured change events to downstream consumers — each event carries the operation type, before/after state, and source metadata.](./diagrams/cdc-overview-light.svg "CDC captures changes from the database's transaction log and emits structured change events to downstream consumers — each event carries operation type, before/after state, and source metadata.")
![CDC captures changes from the database's transaction log and emits structured change events to downstream consumers — each event carries the operation type, before/after state, and source metadata.](./diagrams/cdc-overview-dark.svg)

## Mental Model

CDC provides **eventually-consistent data propagation without application-level dual writes**. The insight that makes it work: databases already record every change internally — for crash recovery and physical replication — so CDC is "expose that internal stream as a public, consumer-facing API."

Three approaches, ordered by how much database cooperation they require:

- **Log-based CDC** tails the database's transaction log (PostgreSQL WAL, MySQL binlog, MongoDB oplog, SQL Server transaction log). Non-invasive on the write path, captures *every* committed change including direct SQL and migrations, preserves commit order. The production default.
- **Trigger-based CDC** installs `AFTER INSERT/UPDATE/DELETE` triggers that copy mutations to a shadow table. Works on locked-down or legacy databases without log access, at the cost of write-path latency and shadow-table contention.
- **Polling-based CDC** runs `SELECT ... WHERE updated_at > :hwm` against a read replica. No special database privileges, but it cannot see hard deletes and pays a perpetual query tax.

**The decision axis is source access vs. operational footprint**: log-based asks the DB team to expose replication slots / binlog access in exchange for minimal runtime cost; polling avoids that conversation but loses fidelity. Trigger-based is the in-between option for environments where neither extreme is available.

**Production reality**: log-based CDC dominates. The two anchor tools are [Debezium](https://debezium.io/) (self-managed, sub-second, runs on Kafka Connect) and [AWS DMS](https://aws.amazon.com/dms/) (managed, seconds-to-minutes, AWS-native sinks). Kafka is the default transport — partly because it preserves order per partition, partly because Schema Registry + Kafka Connect Sinks form a pre-built fan-out into search indexes, caches, warehouses, and downstream services.

## The Problem CDC Solves

### Why Naive Solutions Fail

**Approach 1: dual writes in application code.**

```typescript collapse={1-5}
async function updateUser(userId: string, data: UserData) {
  await db.users.update(userId, data)
  await kafka.publish("users", { op: "UPDATE", after: data })
}
```

> [!CAUTION]
> The dual-write pattern is the most common cause of long-tail data divergence between OLTP and downstream systems. Two independent commits with no shared transaction is, by construction, an unsolved consensus problem.

Fails because:

- **Partial failures**: Database commits but Kafka publish fails. Data is now inconsistent.
- **Distributed transaction complexity**: XA/2PC across an RDBMS and Kafka exists but is slow, fragile, and not supported by Kafka's open-source brokers.
- **Missed changes**: Direct SQL updates, migrations, replicas, and other services bypass the publish logic entirely.
- **Ordering**: Kafka messages may interleave or arrive out of database commit order.

**Approach 2: polling with timestamps.**

```sql
SELECT * FROM users WHERE updated_at > :last_poll_time
```

Fails because:

- **Misses hard deletes**: Deleted rows don't appear in query results.
- **Clock skew**: `updated_at` may not reflect commit order — especially across replicas, or under multi-statement transactions where `now()` is captured at statement start.
- **Polling interval trade-off**: frequent polling adds DB load; infrequent polling adds end-to-end latency.
- **Transaction visibility**: may read mid-transaction state if isolation isn't tight.

**Approach 3: trigger-based capture.**

```sql
CREATE TRIGGER user_changes AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION capture_change();
```

Fails at scale because:

- **Transaction overhead**: trigger runs synchronously within the transaction, adding latency to every write.
- **Lock contention**: writing to a shadow table from every transaction concentrates contention on a single hot relation.
- **Operational burden**: triggers must be re-applied on every schema change and replicated to every shard.

### The Core Challenge

The fundamental tension: **application code cannot reliably capture all database changes without the database's cooperation**. Direct SQL, stored procedures, migrations, and multiple services all modify data outside application control.

CDC resolves this by **reading changes where they're already reliably recorded**—the database's transaction log. This log exists for durability and replication; CDC treats it as a public API.

## CDC Approaches

### Log-Based CDC (Primary Approach)

**How it works:**

1. CDC connector acts as a replica consumer for the database's transaction log
2. Connector maintains position (LSN, binlog coordinates, or GTID) for resumability
3. Changes parsed from binary log format into structured events
4. Events published to message broker, maintaining transaction boundaries

**Database-specific mechanisms:**

| Database   | Log Type              | Access Method            | Position Tracking         |
| ---------- | --------------------- | ------------------------ | ------------------------- |
| PostgreSQL | WAL (Write-Ahead Log) | Logical Replication Slot | LSN (Log Sequence Number) |
| MySQL      | Binary Log            | Binlog client protocol   | GTID or file:position     |
| MongoDB    | Oplog                 | Change Streams API       | Resume token              |
| SQL Server | Transaction Log       | CDC tables or log reader | LSN                       |

**Why log-based is preferred:**

- **Complete capture**: Every committed change, including DDL, is in the log
- **Minimal overhead**: Reading the log adds no load to write path
- **Transactional boundaries**: Changes can be grouped by transaction
- **Ordering guarantees**: Log order matches commit order

**Trade-offs:**

| Advantage                      | Disadvantage                    |
| ------------------------------ | ------------------------------- |
| Captures all changes           | Requires database configuration |
| No write-path overhead         | Log format is database-specific |
| Transaction ordering preserved | Replication slot management     |
| Includes deletes and DDL       | Requires log retention tuning   |

### Trigger-Based CDC

**How it works:**

1. Create triggers on source tables for INSERT, UPDATE, DELETE
2. Triggers write change records to shadow tables
3. Separate process polls shadow tables and publishes events
4. Shadow table records deleted after successful publish

**When to choose:**

- Log-based access unavailable (managed databases, permission restrictions)
- Only specific tables need capture (trigger overhead is localized)
- Legacy databases without logical replication support

**Trade-offs:**

| Advantage                             | Disadvantage                     |
| ------------------------------------- | -------------------------------- |
| Works without special database access | Adds latency to every write      |
| Full control over captured data       | Trigger maintenance overhead     |
| Selective capture                     | Lock contention on shadow tables |

### Polling-Based CDC

**How it works:**

1. Query source tables periodically for changes since last poll
2. Use `updated_at` timestamp or sequence column to identify changes
3. Mark captured rows or track high-water mark
4. Publish changes to downstream systems

**When to choose:**

- Read replica available for polling (isolates from production writes)
- Soft deletes only (hard deletes not used)
- Near-real-time acceptable (seconds to minutes latency)

**Limitations:**

- Cannot capture hard deletes without tombstone markers
- Timestamp precision issues (multiple changes within same timestamp)
- Must poll frequently to approach real-time
- No transaction grouping

### Decision Framework

![CDC approach decision tree: log access → log-based; otherwise triggers; if no triggers and no hard deletes, polling.](./diagrams/diagram-1-light.svg "Decision tree for picking a CDC approach based on database access and delete semantics.")
![CDC approach decision tree: log access → log-based; otherwise triggers; if no triggers and no hard deletes, polling.](./diagrams/diagram-1-dark.svg)

## Log-Based CDC Internals

### PostgreSQL: WAL and Logical Replication

PostgreSQL's CDC uses **logical replication**, which decodes the physical WAL into logical change events.

**Architecture:**

![PostgreSQL logical replication: writes hit the WAL, logical decoding emits row-level changes through a replication slot to the CDC connector, which publishes to Kafka.](./diagrams/diagram-2-light.svg "PostgreSQL logical replication path from WAL to Kafka via a replication slot.")
![PostgreSQL logical replication: writes hit the WAL, logical decoding emits row-level changes through a replication slot to the CDC connector, which publishes to Kafka.](./diagrams/diagram-2-dark.svg)

**Configuration requirements:**

```sql
-- postgresql.conf
wal_level = logical                    -- Required for logical replication
max_replication_slots = 4              -- One per CDC connector
max_wal_senders = 4                    -- Connections for replication

-- Create replication slot (done by Debezium automatically)
SELECT pg_create_logical_replication_slot('debezium', 'pgoutput');
```

**Output plugins:**

| Plugin          | Output Format   | Use Case                                        |
| --------------- | --------------- | ----------------------------------------------- |
| `pgoutput`      | Binary protocol | Native PostgreSQL replication, Debezium default |
| `wal2json`      | JSON            | External systems requiring JSON                 |
| `test_decoding` | Text            | Debugging and testing                           |

**Critical operational concern—slot bloat:**

PostgreSQL retains WAL as long as a replication slot hasn't consumed it. If a CDC connector goes down:

```sql
-- Monitor slot lag
SELECT slot_name,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
FROM pg_replication_slots;

-- Set maximum retained WAL (PostgreSQL 13+)
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
```

Without `max_slot_wal_keep_size`, an inactive slot can fill the disk. This is the most common CDC production incident.

**Version evolution:**

> [!NOTE]
> **PostgreSQL 17 (released 2024-09-26)** added [logical replication failover slot synchronization](https://www.postgresql.org/docs/17/logical-replication-failover.html). Slots created with `failover = true` are propagated to physical standbys via the `slotsync` worker, so a promoted standby can resume CDC without re-snapshotting. Prior versions required external tooling (e.g. `pg_failover_slots`) or a full re-snapshot after primary failover.

### MySQL: Binary Log

MySQL's CDC reads the binary log, which records all data modifications.

**Configuration requirements:**

```ini
# my.cnf
server-id = 1                          # Unique across replication topology
log_bin = mysql-bin                    # Enable binary logging
binlog_format = ROW                    # Required: ROW format (not STATEMENT)
binlog_row_image = FULL                # Capture before and after state
binlog_expire_logs_seconds = 259200    # Retention (3 days). expire_logs_days is deprecated since MySQL 8.0.
```

**GTID (Global Transaction ID):**

GTIDs uniquely identify transactions across the replication topology, enabling position-independent replication.

```sql
-- Enable GTID mode
gtid_mode = ON
enforce_gtid_consistency = ON

-- Format: server_uuid:transaction_id
-- Example: 3E11FA47-71CA-11E1-9E33-C80AA9429562:23
```

**Why GTID matters for CDC:**

- **Resumability**: CDC connector can resume from GTID regardless of binlog file rotation
- **Failover**: After primary failover, GTID identifies exactly which transactions to resume from
- **Multi-source**: When capturing from multiple MySQL instances, GTIDs prevent duplicate processing

**Binlog format comparison:**

| Format    | Content                             | CDC Compatibility                        |
| --------- | ----------------------------------- | ---------------------------------------- |
| STATEMENT | SQL statements                      | Poor—cannot determine actual row changes |
| ROW       | Actual row changes                  | Required for CDC                         |
| MIXED     | Statement or row depending on query | Unreliable for CDC                       |

### MongoDB: Change Streams

MongoDB provides Change Streams, a high-level API over the oplog (operations log).

```typescript collapse={1-3}
const client = new MongoClient(uri)
const db = client.db("mydb")

// Watch collection-level changes
const changeStream = db.collection("users").watch([], {
  fullDocument: "updateLookup", // Include full document on updates
  fullDocumentBeforeChange: "whenAvailable", // Include before-image (MongoDB 6.0+)
})

changeStream.on("change", (change) => {
  // change.operationType: 'insert' | 'update' | 'delete' | 'replace'
  // change.fullDocument: current document state
  // change.fullDocumentBeforeChange: previous state (if configured)
  // change._id: resume token for resumability
})
```

**Key differences from relational CDC:**

- **Schema-free**: Documents can vary; change events reflect actual structure
- **Nested changes**: Updates to nested fields captured as partial updates
- **Resume tokens**: Opaque tokens for resumability (vs. LSN/GTID)

**Limitation**: Change Streams require replica set or sharded cluster. Single-node MongoDB doesn't support CDC.

## Design Paths

### Path 1: Debezium + Kafka Connect

**Context**: Open-source CDC platform. Most popular choice for self-managed CDC.

**Architecture:**

![Debezium architecture: source database → Debezium connector running inside Kafka Connect → Kafka topic per table → Schema Registry + downstream consumers.](./diagrams/diagram-3-light.svg "Debezium connector hosted inside Kafka Connect, fanning out per-table topics to consumers.")
![Debezium architecture: source database → Debezium connector running inside Kafka Connect → Kafka topic per table → Schema Registry + downstream consumers.](./diagrams/diagram-3-dark.svg)

**When to choose this path:**

- Self-managed infrastructure with Kafka already in place
- Need sub-second latency
- Require full control over configuration and schema handling
- Multi-database environments

**Key characteristics:**

- One Kafka topic per table (configurable)
- Schema Registry integration for Avro/Protobuf/JSON Schema
- Exactly-once semantics with Kafka 3.3.0+ and KRaft
- Snapshot for initial data load, then streaming

**Configuration example:**

```json collapse={1-2, 15-25}
{
  "name": "users-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "db.example.com",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${secrets:postgres/password}",
    "database.dbname": "myapp",
    "topic.prefix": "myapp",
    "table.include.list": "public.users,public.orders",
    "slot.name": "debezium_users",
    "publication.name": "dbz_publication",
    "snapshot.mode": "initial",
    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "key.converter.schema.registry.url": "http://schema-registry:8081",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081",
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false",
    "transforms.unwrap.delete.handling.mode": "rewrite"
  }
}
```

**Trade-offs vs other paths:**

| Aspect             | Debezium                      | AWS DMS                              | Fivetran                                  |
| ------------------ | ----------------------------- | ------------------------------------ | ----------------------------------------- |
| Latency            | Sub-second                    | Seconds-minutes                      | Seconds-minutes                           |
| Cost shape         | Self-managed Kafka Connect + Kafka infra | Hourly replication instance or DCU-hour serverless | Per-million rows (MAR-based subscription) |
| Operational burden | High                          | Low                                  | Very low                                  |
| Customization      | Full control                  | Limited                              | Limited                                   |
| Schema handling    | Schema Registry               | Basic                                | Automatic                                 |

> [!NOTE]
> Resist comparing these on absolute dollars — Fivetran's [MAR-based pricing](https://www.fivetran.com/pricing) and AWS DMS's serverless DCU model both shift price as your CDC volume changes, while Debezium's cost is dominated by the size of your Kafka cluster. Build a small spreadsheet against your actual change volume before you decide.

**Real-world: Shopify**

Shopify retired their batch extraction service ("Longboat") in favor of [log-based CDC on Debezium + Kafka Connect](https://shopify.engineering/capturing-every-change-shopify-sharded-monolith), running ~150 connectors on Kubernetes against their sharded MySQL monolith. Schema evolution is mediated by Confluent Schema Registry; large tables use a custom snapshot mode that does not block binlog tailing.

For scale context, [Tobi Lütke reported](https://x.com/tobi/status/1862908953715503396) Shopify's 2024 Black Friday peak at 284M edge requests/min and 66M Kafka messages/sec — that Kafka layer is downstream of the same CDC pipeline. The CDC stream itself is a fraction of total edge traffic, but the design point is "every committed write reaches Kafka without application participation."

### Path 2: AWS Database Migration Service

**Context**: Managed CDC service integrated with AWS ecosystem.

**Architecture:**

![AWS DMS architecture: source database → DMS replication instance → S3 / Redshift / DynamoDB / Kinesis as targets, with CloudWatch metrics on the side.](./diagrams/diagram-4-light.svg "AWS DMS replication instance fanning ongoing CDC into native AWS sinks.")
![AWS DMS architecture: source database → DMS replication instance → S3 / Redshift / DynamoDB / Kinesis as targets, with CloudWatch metrics on the side.](./diagrams/diagram-4-dark.svg)

**When to choose this path:**

- AWS-centric infrastructure
- Prefer managed over self-managed
- Target is AWS service (S3, Redshift, DynamoDB)
- Batch/near-real-time acceptable (not sub-second)

**Key characteristics:**

- Full load + ongoing CDC in single task
- Automatic schema migration (optional)
- Built-in monitoring via CloudWatch
- No Kafka required (direct to S3/Redshift)

**Limitations:**

- **Tables without primary keys**: Skipped during CDC (critical gap)
- **Latency**: Seconds to minutes, not sub-second
- **Large transactions**: Can cause significant lag
- **DDL propagation**: Limited support; may require manual intervention

**Cost model:**

| Component            | Pricing model                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Replication instance | Hourly, size-dependent (T3/C5/C6i/R5/R6i families). T3 small classes start in the cents/hour range; large R-series instances run dollars/hour. |
| DMS Serverless       | Per-hour DCU (1 DCU ≈ 2 GB RAM); auto-scales with workload. Minimum billing window applies.                   |
| Data transfer        | Standard AWS rates; cross-AZ and egress charged separately.                                                   |
| Storage              | Per-GB/month for replication instance log + cache storage.                                                    |

> [!NOTE]
> Confirm current rates at [aws.amazon.com/dms/pricing](https://aws.amazon.com/dms/pricing/) — the published price list moves frequently and DMS Serverless adds a separate DCU-hour line item that did not exist in the original DMS launch pricing.

### Path 3: Maxwell's Daemon (MySQL-Specific)

**Context**: Lightweight MySQL CDC tool. Simpler than Debezium for MySQL-only environments.

**Architecture:**

![Maxwell's Daemon architecture: single MySQL → Maxwell process tailing the binlog → JSON output to Kafka, Kinesis, RabbitMQ, or stdout.](./diagrams/diagram-5-light.svg "Maxwell's Daemon as a lightweight single-process MySQL binlog tailer with JSON output.")
![Maxwell's Daemon architecture: single MySQL → Maxwell process tailing the binlog → JSON output to Kafka, Kinesis, RabbitMQ, or stdout.](./diagrams/diagram-5-dark.svg)

**When to choose:**

- MySQL only
- Want simpler deployment than full Kafka Connect
- JSON output acceptable (no schema registry)
- Lower operational overhead priority

**Output format:**

```json
{
  "database": "myapp",
  "table": "users",
  "type": "update",
  "ts": 1706745600,
  "data": { "id": 1, "name": "Alice", "email": "alice@example.com" },
  "old": { "name": "Old Name" }
}
```

**Trade-offs:**

| Advantage               | Disadvantage                 |
| ----------------------- | ---------------------------- |
| Simple deployment       | MySQL only                   |
| Multiple output targets | No schema registry           |
| Lightweight             | Less mature ecosystem        |
| Easy JSON parsing       | Single-threaded per database |

### Comparison Matrix

| Factor             | Debezium        | AWS DMS         | Maxwell      | Fivetran        |
| ------------------ | --------------- | --------------- | ------------ | --------------- |
| Databases          | 10+             | 20+             | MySQL only   | 500+            |
| Latency            | Sub-second      | Seconds-minutes | Sub-second   | Seconds-minutes |
| Deployment         | Self-managed    | Managed         | Self-managed | SaaS            |
| Schema evolution   | Schema Registry | Basic           | JSON only    | Automatic       |
| Cost at scale      | Low (infra)     | Medium          | Low          | High            |
| Operational burden | High            | Low             | Medium       | Very low        |

## Production Implementations

### LinkedIn: Databus

**Context**: LinkedIn built Databus (2012) as one of the first production CDC systems. Open-sourced; influenced later designs.

**Architecture:**

![LinkedIn Databus architecture: OLTP source → relay servers with in-memory circular buffers → live consumers; a separate bootstrap server hydrates new or fallen-behind consumers.](./diagrams/diagram-6-light.svg "LinkedIn Databus relay + bootstrap-server pattern.")
![LinkedIn Databus architecture: OLTP source → relay servers with in-memory circular buffers → live consumers; a separate bootstrap server hydrates new or fallen-behind consumers.](./diagrams/diagram-6-dark.svg)

**Implementation details:**

- **Relay pattern**: Relays pull from OLTP database, deserialize to Avro, store in circular memory buffer
- **Bootstrap service**: Provides full data snapshots for new consumers or catch-up
- **Infinite lookback**: New consumers can request full dataset without stressing production database
- **Transactional ordering**: Preserves commit order within source

**Scale:**

- Thousands of events/second per relay server
- Millisecond end-to-end latency
- Powers: Social Graph Index, People Search Index, member profile replicas

**Key insight from LinkedIn:**

> "The relay maintains a sliding time window of changes in memory. Consumers that fall behind can catch up from the relay; consumers that fall too far behind bootstrap from a snapshot and then resume streaming."

### Airbnb: SpinalTap + Riverbed

**Context**: Airbnb uses CDC for their materialized views framework, processing billions of events daily.

**SpinalTap (CDC layer):**

- Scalable CDC across MySQL, DynamoDB, and internal storage
- Kafka as event transport
- Handles sharded monolith with transactional consistency

**Riverbed (materialized views):**

![Airbnb Riverbed pipeline: SpinalTap CDC connectors fan multiple OLTP sources into Kafka, Spark Streaming joins them, and the result lands in materialized-view stores (search, payments).](./diagrams/diagram-7-light.svg "SpinalTap → Kafka → Spark → materialized views in Airbnb's Riverbed framework.")
![Airbnb Riverbed pipeline: SpinalTap CDC connectors fan multiple OLTP sources into Kafka, Spark Streaming joins them, and the result lands in materialized-view stores (search, payments).](./diagrams/diagram-7-dark.svg)

**Scale (2024):**

- 2.4 billion CDC events per day
- 350 million documents written daily to materialized views
- 50+ materialized views (search, payments, reviews, itineraries)
- Lambda architecture: Kafka (online) + Spark (offline)

**What worked:**

- GraphQL DSL for declarative view definitions
- Automatic schema evolution handling
- Real-time search index updates

### Netflix: DBLog

**Context**: Netflix developed DBLog for CDC across heterogeneous databases.

**Key innovation—incremental snapshots:**

Traditional CDC: Full snapshot (locks table) → Start streaming

DBLog approach:

```
1. Start CDC streaming (no snapshot)
2. Incrementally snapshot in chunks:
   - Select small range by primary key
   - Emit snapshot events
   - Continue streaming concurrently
3. Reconcile snapshot with streaming at consumer
```

**Benefits:**

- No long-running locks or table copies
- Snapshot can be paused/resumed
- Works alongside live traffic

The watermark technique looks like this in practice — chunk-by-chunk SELECTs interleave with the live log via two marker writes that bracket each chunk:

![Snapshot + stream switchover using DBLog watermarks: the connector writes LOW and HIGH watermarks to a sentinel table, selects a primary-key chunk between them, and reconciles in-memory chunk rows against any live log events that touched the same keys.](./diagrams/snapshot-stream-switchover-light.svg "DBLog watermark technique: the live log keeps flowing while a chunked SELECT is reconciled against any conflicting log events.")
![Snapshot + stream switchover using DBLog watermarks: the connector writes LOW and HIGH watermarks to a sentinel table, selects a primary-key chunk between them, and reconciles in-memory chunk rows against any live log events that touched the same keys.](./diagrams/snapshot-stream-switchover-dark.svg)

The original algorithm is described in the [DBLog paper (Andreakis et al., 2020)](https://arxiv.org/abs/2010.12597); Debezium adopted it as its default ad-hoc snapshot mode.

**Production since 2018:**

- Powers Netflix's Delta platform (data synchronization) and the broader [Data Mesh](https://netflixtechblog.com/data-mesh-a-data-movement-and-processing-platform-netflix-1288bcab2873) movement / processing layer
- Studio applications event processing
- DBLog itself is RDBMS-only (MySQL, PostgreSQL); CockroachDB, Cassandra, and other non-relational stores feed Data Mesh via separate, source-specific connectors (e.g. CockroachDB changefeeds)

> [!TIP]
> The DBLog watermark technique was adopted upstream as Debezium's [incremental snapshot](https://debezium.io/blog/2021/10/07/incremental-snapshots/) (Debezium 1.6, 2021). If you use Debezium today, you already get a DBLog-style snapshot via the signaling table.

### WePay: Cassandra CDC

**Context**: WePay (now part of Chase) built CDC for Cassandra, which lacks native CDC support.

**Implementation:**

![WePay Cassandra CDC: a CDC agent runs on every Cassandra node and reads its local commit log; agents are partitioned as primary for disjoint key ranges to avoid duplicate emissions into Kafka.](./diagrams/diagram-8-light.svg "Per-node Cassandra CDC agents with primary-agent partitioning into Kafka.")
![WePay Cassandra CDC: a CDC agent runs on every Cassandra node and reads its local commit log; agents are partitioned as primary for disjoint key ranges to avoid duplicate emissions into Kafka.](./diagrams/diagram-8-dark.svg)

**Key design decisions:**

- **Agent per node**: Each Cassandra node has a local CDC agent reading commit logs
- **Primary agent pattern**: Each agent is "primary" for a subset of partition keys, avoiding duplicates
- **Exactly-once**: Achieved at agent level through offset tracking

**Open-sourced**: Donated upstream and now lives as the [Debezium Cassandra connector](https://debezium.io/documentation/reference/stable/connectors/cassandra.html) (still flagged as incubating). Unlike most Debezium connectors, it runs as a **standalone JVM agent on each Cassandra node** rather than as a Kafka Connect task — there is no central process that can read commit logs from a remote node.

### Implementation Comparison

| Aspect            | LinkedIn Databus  | Airbnb SpinalTap   | Netflix DBLog        | WePay Cassandra       |
| ----------------- | ----------------- | ------------------ | -------------------- | --------------------- |
| Primary database  | Oracle/MySQL      | MySQL/DynamoDB     | Heterogeneous        | Cassandra             |
| Snapshot approach | Bootstrap server  | Full then stream   | Incremental chunks   | N/A (no snapshot)     |
| Scale             | Thousands/sec     | Billions/day       | Studio-scale         | Payments-scale        |
| Open-source       | Yes (archived)    | No                 | Concepts only        | Yes (Debezium)        |
| Key innovation    | Relay + bootstrap | Materialized views | Incremental snapshot | Primary agent pattern |

## Schema Evolution

### The Schema Challenge

CDC events must carry schema information. When source schema changes, downstream consumers must handle the evolution.

**Problem scenarios:**

1. **Column added**: New events have field; old events don't
2. **Column removed**: Old events have field; new events don't
3. **Column renamed**: Appears as remove + add
4. **Type changed**: `INT` → `BIGINT`, `VARCHAR(50)` → `VARCHAR(100)`

### Schema Registry Integration

![Schema Registry flow: Debezium registers Avro schemas in the registry and embeds the schema ID in each Kafka record; consumers fetch schemas by ID and cache them for decoding.](./diagrams/diagram-9-light.svg "Schema Registry decouples schemas from Kafka payloads — schema IDs travel with each record.")
![Schema Registry flow: Debezium registers Avro schemas in the registry and embeds the schema ID in each Kafka record; consumers fetch schemas by ID and cache them for decoding.](./diagrams/diagram-9-dark.svg)

**How it works:**

1. CDC connector serializes event with schema
2. Schema registered in Schema Registry (if new)
3. Event includes schema ID reference (not full schema)
4. Consumer fetches schema by ID, caches locally
5. Consumer deserializes using fetched schema

**Compatibility modes:**

| Mode     | Allows                       | Use Case                           |
| -------- | ---------------------------- | ---------------------------------- |
| BACKWARD | New schema can read old data | Consumers updated before producers |
| FORWARD  | Old schema can read new data | Producers updated before consumers |
| FULL     | Both directions              | Most restrictive; safest           |
| NONE     | Any change                   | Development only                   |

**Recommended approach**: BACKWARD_TRANSITIVE (all previous versions readable by latest)

### Handling DDL Changes

**Safe operations (backward compatible):**

- Add nullable column
- Add column with default value
- Increase column size (`VARCHAR(50)` → `VARCHAR(100)`)

**Breaking operations (require coordination):**

- Remove column
- Rename column
- Change column type
- Add NOT NULL column without default

**Migration pattern for breaking changes:**

The order matters — every intermediate state must be readable by **both** the previous and the next code version, otherwise the CDC stream serializes a state nobody can decode.

![Schema-evolution migration: add nullable column, dual-write, backfill, switch readers, stop writing the old column, drop. Each step is gated by a Schema Registry compatibility check, CDC stream health, and consumer lag.](./diagrams/schema-evolution-migration-light.svg "Breaking-change migration pattern under CDC: every intermediate state stays BACKWARD-compatible.")
![Schema-evolution migration: add nullable column, dual-write, backfill, switch readers, stop writing the old column, drop. Each step is gated by a Schema Registry compatibility check, CDC stream health, and consumer lag.](./diagrams/schema-evolution-migration-dark.svg)

### Debezium Schema Handling

Debezium can be configured to:

```json
{
  "schema.history.internal.kafka.topic": "schema-changes.myapp",
  "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
  "include.schema.changes": "true"
}
```

**Schema change events:**

```json
{
  "source": { "table": "users", "db": "myapp" },
  "ddl": "ALTER TABLE users ADD COLUMN phone VARCHAR(20)",
  "databaseName": "myapp",
  "tableChanges": [{
    "type": "ALTER",
    "id": "myapp.users",
    "table": {
      "columns": [...]
    }
  }]
}
```

## Exactly-Once Semantics

### The Delivery Challenge

CDC involves multiple hops where failures can occur:

```
Database → CDC Connector → Kafka → Consumer → Target System
```

Each transition can fail after partial completion.

### Kafka Exactly-Once (Since 0.11.0)

**Idempotent producer:**

```properties
enable.idempotence=true
```

Producer assigns sequence number to each message. Broker deduplicates by (producer_id, sequence).

**Transactional writes:**

```java
producer.initTransactions();
producer.beginTransaction();
producer.send(record1);
producer.send(record2);
producer.commitTransaction(); // Atomic: all or nothing
```

**Consumer isolation:**

```properties
isolation.level=read_committed
```

Consumer only sees committed transactional messages.

### Debezium EOS (Kafka Connect 3.3+, KIP-618)

[KIP-618](https://cwiki.apache.org/confluence/display/KAFKA/KIP-618%3A+Exactly-Once+Support+for+Source+Connectors) landed in Kafka 3.3.0 (Oct 2022) and exposed exactly-once semantics to Kafka Connect *source* connectors. Debezium opted in incrementally; [Debezium 3.3.0 (Oct 2025)](https://debezium.io/blog/2025/10/01/debezium-3-3-final-released/) extended EOS to all core connectors (MariaDB, MongoDB, MySQL, Oracle, PostgreSQL, SQL Server).

Prerequisites per the [Debezium EOS reference](https://debezium.io/documentation/reference/stable/configuration/eos.html):

1. Kafka Connect 3.3+ in **distributed mode** (standalone mode is not supported).
2. Worker config `exactly.once.source.support=enabled`.
3. Connector config `exactly.once.support=required`.
4. Connector offset topic stored in Kafka (the default).

```properties title="connect-distributed.properties"
exactly.once.source.support=enabled
```

```properties title="connector.properties"
exactly.once.support=required
```

KRaft is **not** a hard requirement — EOS works against ZooKeeper-backed brokers too — but new Kafka 3.x clusters generally run KRaft, and ZooKeeper mode is removed in Kafka 4.0.

**How it works:**

1. Connector reads changes and writes the source offset inside a Kafka transaction.
2. Records + offset commit are written atomically; partial failures roll back.
3. On restart, the connector resumes from the last *committed* offset (any aborted transaction's records are filtered out by `read_committed` consumers).

> [!IMPORTANT]
> EOS here is "database → Kafka" only. Consumers (sinks, services) still need idempotent application — by source LSN/GTID/resume token — to make the *end-to-end* path exactly-once.

### End-to-End Exactly-Once

For true end-to-end exactly-once:

![End-to-end exactly-once: source DB → Debezium with EOS → Kafka with EOS → consumer reads at-least-once → idempotent write to target keyed on source LSN.](./diagrams/diagram-10-light.svg "EOS holds DB → Kafka; the consumer closes the loop with idempotent writes keyed on source LSN.")
![End-to-end exactly-once: source DB → Debezium with EOS → Kafka with EOS → consumer reads at-least-once → idempotent write to target keyed on source LSN.](./diagrams/diagram-10-dark.svg)

Consumer-side idempotency:

```typescript collapse={1-5}
async function processChange(change: ChangeEvent) {
  const key = `${change.source.table}:${change.key}`
  const version = change.source.lsn

  // Idempotent upsert using source version
  await target.upsert(
    {
      id: key,
      data: change.after,
      _version: version,
    },
    {
      where: { _version: { lt: version } }, // Only apply if newer
    },
  )
}
```

## CDC Consumer Patterns

### Transactional Outbox Integration

The **transactional outbox pattern** ([Chris Richardson](https://microservices.io/patterns/data/transactional-outbox.html)) ensures reliable event publishing by writing events to a database table (`outbox`) within the **same transaction** as business data. CDC tails the outbox and replays it onto Kafka, replacing the dual-write anti-pattern from §"Why Naive Solutions Fail" with a single atomic commit.

![Dual-write anti-pattern (left) vs transactional outbox + CDC (right): the outbox merges the two writes into one transaction, leaving CDC to replay the outbox onto Kafka.](./diagrams/dual-write-vs-outbox-cdc-light.svg "Outbox + CDC replaces the dual-write anti-pattern with one atomic commit and one log to tail.")
![Dual-write anti-pattern (left) vs transactional outbox + CDC (right): the outbox merges the two writes into one transaction, leaving CDC to replay the outbox onto Kafka.](./diagrams/dual-write-vs-outbox-cdc-dark.svg)

![Transactional outbox relay: the application transaction updates business tables and inserts an event row into the outbox table atomically; CDC tails the outbox and Debezium's EventRouter SMT routes events to per-aggregate Kafka topics.](./diagrams/diagram-11-light.svg "Transactional outbox keeps event publishing atomic with the originating DB write; EventRouter SMT shapes the topic.")
![Transactional outbox relay: the application transaction updates business tables and inserts an event row into the outbox table atomically; CDC tails the outbox and Debezium's EventRouter SMT routes events to per-aggregate Kafka topics.](./diagrams/diagram-11-dark.svg)

**CDC as outbox relay:**

```sql
-- Outbox table
CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(255),
    aggregate_id VARCHAR(255),
    type VARCHAR(255),
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Application writes to outbox in same transaction
BEGIN;
UPDATE users SET email = 'new@example.com' WHERE id = 123;
INSERT INTO outbox (id, aggregate_type, aggregate_id, type, payload)
VALUES (gen_random_uuid(), 'User', '123', 'EmailChanged', '{"email": "new@example.com"}');
COMMIT;
```

**Debezium outbox transform:**

```json
{
  "transforms": "outbox",
  "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
  "transforms.outbox.table.field.event.key": "aggregate_id",
  "transforms.outbox.table.field.event.payload": "payload",
  "transforms.outbox.route.topic.replacement": "events.${routedByValue}"
}
```

### Cache Invalidation

CDC enables event-driven cache invalidation without TTL guessing:

![Event-driven cache invalidation: PostgreSQL writes flow through Debezium and Kafka into a cache invalidator service that deletes or warms Redis entries; the application reads through Redis with DB fallback.](./diagrams/diagram-12-light.svg "CDC-driven cache invalidation replaces TTL guessing with deterministic invalidation events.")
![Event-driven cache invalidation: PostgreSQL writes flow through Debezium and Kafka into a cache invalidator service that deletes or warms Redis entries; the application reads through Redis with DB fallback.](./diagrams/diagram-12-dark.svg)

**Implementation:**

```typescript collapse={1-8}
interface ChangeEvent {
  op: "c" | "u" | "d" // create, update, delete
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  source: { table: string }
}

async function handleChange(change: ChangeEvent) {
  const table = change.source.table
  const key = change.after?.id ?? change.before?.id

  // Invalidate cache entry
  await redis.del(`${table}:${key}`)

  // Optional: warm cache with new value
  if (change.op !== "d" && change.after) {
    await redis.setex(`${table}:${key}`, 3600, JSON.stringify(change.after))
  }
}
```

**Benefits over TTL:**

- Immediate invalidation (sub-second vs. minutes/hours)
- No stale reads from long TTLs
- No thundering herd from short TTLs

### Search Index Synchronization

CDC keeps search indices in sync with source of truth:

![Search index synchronization: PostgreSQL → Debezium → Kafka → Elasticsearch sink connector → Elasticsearch index, with tombstone events translated into deletes.](./diagrams/diagram-13-light.svg "CDC keeps Elasticsearch indexes synchronized with the OLTP source of truth.")
![Search index synchronization: PostgreSQL → Debezium → Kafka → Elasticsearch sink connector → Elasticsearch index, with tombstone events translated into deletes.](./diagrams/diagram-13-dark.svg)

**Kafka Connect Elasticsearch sink:**

```json
{
  "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
  "topics": "myapp.public.products",
  "connection.url": "http://elasticsearch:9200",
  "type.name": "_doc",
  "key.ignore": "false",
  "schema.ignore": "true",
  "behavior.on.null.values": "delete"
}
```

**Handling deletions:**

- Debezium emits tombstone (null value) for deletes
- Sink connector translates tombstone to Elasticsearch delete
- Index stays synchronized including deletions

### Analytics Pipeline Feeding

CDC enables real-time analytics without batch ETL:

![Real-time analytics pipeline: OLTP DB → Debezium → Kafka → Flink streaming job → both a data warehouse and a real-time dashboard.](./diagrams/diagram-14-light.svg "CDC + a stream processor collapses the lambda-architecture batch and stream paths into one pipeline.")
![Real-time analytics pipeline: OLTP DB → Debezium → Kafka → Flink streaming job → both a data warehouse and a real-time dashboard.](./diagrams/diagram-14-dark.svg)

**Lambda architecture simplification:**

| Traditional                | CDC-Based                          |
| -------------------------- | ---------------------------------- |
| Batch ETL (daily) + Stream | Single CDC stream                  |
| Batch for completeness     | Snapshot + stream for completeness |
| Hours-old data             | Seconds-old data                   |
| Multiple pipelines         | Single pipeline                    |

## Common Pitfalls

### 1. Replication Slot Disk Bloat (PostgreSQL)

> [!CAUTION]
> An inactive logical replication slot will pin WAL **forever** by default (`max_slot_wal_keep_size = -1`, meaning unlimited). If your CDC connector dies and nobody notices, the primary's pg_wal directory grows until disk is full and Postgres refuses writes. This is the single most common Postgres-CDC production incident.

**What happens**: CDC connector goes down or can't keep up. PostgreSQL retains all WAL since the slot's `restart_lsn`. Disk fills. Database crashes.

**Example**: Connector had a 2-hour network partition. 50 GB of WAL accumulated. Recovery required manual slot deletion and a full re-snapshot.

**Solutions:**

```sql
-- Monitor slot lag
SELECT slot_name,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag,
       active
FROM pg_replication_slots;

-- Cap retained WAL per slot (PostgreSQL 13+ — default is -1 / unlimited)
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';

-- Alert on inactive slots
SELECT slot_name FROM pg_replication_slots WHERE NOT active;
```

Setting `max_slot_wal_keep_size` trades durability of the CDC stream for primary availability: once a slot exceeds the cap, PostgreSQL invalidates it and the connector must re-snapshot. Pick the value such that it covers your worst expected connector outage but leaves disk headroom — Gunnar Morling's [replication slot deep-dive](https://www.morling.dev/blog/mastering-postgres-replication-slots/) is the best operational reference.

### 2. Tables Without Primary Keys

**The mistake**: Creating tables without primary keys, then adding them to CDC.

**What happens**: AWS DMS skips these tables entirely during CDC. Debezium can capture but updates/deletes can't be keyed properly.

**Example**: Legacy table `audit_log` had no PK. Added to CDC scope. All changes captured as creates; updates appeared as new rows.

**Solutions:**

- Add primary keys to all tables before enabling CDC
- Use composite key if no natural key exists
- For truly keyless tables, add surrogate key column

### 3. Large Transaction Handling

**The mistake**: Running batch updates (millions of rows) during CDC operation.

**What happens**: Debezium buffers changes until transaction commits. Memory pressure. Downstream lag. Potential OOM.

**Example**: Nightly job updating 5M rows in single transaction. CDC connector memory spiked to 8GB, causing restart. Other tables' CDC delayed by 30 minutes.

**Solutions:**

- Break large updates into batches with commits
- Configure Debezium memory limits
- Schedule large batch jobs during low-traffic windows
- Use `incremental.snapshot` for backfills

### 4. Snapshot + Streaming Race Conditions

**The mistake**: Not understanding snapshot isolation during initial load.

**What happens**: Snapshot reads table at point-in-time. Streaming starts from "after snapshot." Changes during snapshot can be missed or duplicated.

**Example**:

1. Snapshot starts at LSN 100
2. Row inserted at LSN 150
3. Snapshot reads row (sees insertion)
4. Streaming starts at LSN 100
5. Streaming also captures insertion at LSN 150
6. Duplicate row in target

**Solutions:**

Debezium handles this correctly when configured properly:

```json
{
  "snapshot.mode": "initial",
  "snapshot.locking.mode": "minimal"
}
```

Consumer must be idempotent to handle potential duplicates during snapshot-to-streaming transition.

### 5. Schema Change During CDC

**The mistake**: Assuming DDL changes propagate seamlessly.

**What happens**:

- Column added: Old consumers fail parsing
- Column removed: Data loss if not handled
- Type changed: Deserialization errors

**Example**: Added `phone` column to `users` table. CDC captured the DDL. Downstream consumer's Avro schema didn't have `phone`. Consumer crashed with schema mismatch error.

**Solutions:**

- Use Schema Registry with BACKWARD compatibility
- Test schema changes in staging with CDC running
- Coordinate consumer deployments with schema changes
- Monitor for schema change events before production DDL

## Implementation Guide

### Starting Point Decision

![Starting-point decision tree: branch on team experience, then on budget for managed services or required latency, ending in concrete tool recommendations (Fivetran, AWS DMS+MSK, Debezium self-managed, or Debezium + Confluent Cloud).](./diagrams/diagram-15-light.svg "Choosing a CDC starting point based on team experience, budget, latency, and infrastructure preference.")
![Starting-point decision tree: branch on team experience, then on budget for managed services or required latency, ending in concrete tool recommendations (Fivetran, AWS DMS+MSK, Debezium self-managed, or Debezium + Confluent Cloud).](./diagrams/diagram-15-dark.svg)

### Checklist for Production CDC

**Database preparation:**

- [ ] Enable logical replication/binary logging
- [ ] Create dedicated CDC user with minimal permissions
- [ ] Configure log retention appropriately
- [ ] Add primary keys to all tables in scope
- [ ] Test DDL change impact

**Infrastructure:**

- [ ] Kafka cluster sized for CDC throughput
- [ ] Schema Registry deployed and accessible
- [ ] Monitoring dashboards for connector lag
- [ ] Alerting on replication slot lag (PostgreSQL)
- [ ] Alerting on connector failures

**Operational:**

- [ ] Runbook for connector restart
- [ ] Runbook for re-snapshot after extended downtime
- [ ] Backup strategy for connector offsets
- [ ] Schema change coordination process
- [ ] Large transaction handling policy

### Capacity Planning

**Throughput estimation:**

```
CDC messages/sec ≈ (writes/sec to source tables) × (avg columns per table / 10)
```

Each CDC message size depends on row size and change type (update includes before/after).

**Kafka sizing:**

| Metric               | Recommendation                            |
| -------------------- | ----------------------------------------- |
| Partitions per topic | 2-3 × expected consumer parallelism       |
| Replication factor   | 3 (standard Kafka recommendation)         |
| Retention            | 7 days minimum (allows consumer recovery) |
| Broker disk          | 3 × (daily CDC volume) × retention days   |

## Conclusion

CDC transforms database changes into reliable event streams, enabling real-time data propagation without application-level dual writes. Log-based CDC—reading from WAL, binlog, or oplog—is the production standard, capturing all changes with minimal database impact.

**Key decisions:**

1. **Log-based vs. polling**: Log-based captures everything including deletes; polling is simpler but misses hard deletes and adds latency
2. **Debezium vs. managed**: Debezium offers sub-second latency and full control; managed services (DMS, Fivetran) reduce operational burden
3. **Schema evolution strategy**: Schema Registry with BACKWARD compatibility prevents consumer breakage

**Critical operational concerns:**

- PostgreSQL replication slot bloat is the most common production incident
- Large transactions can cause memory pressure and downstream lag
- Tables without primary keys create CDC gaps

**Start simple**: Single database → Debezium → Kafka → single consumer. Add complexity (schema registry, multiple sources, complex routing) as requirements demand.

## Appendix

### Prerequisites

- Database administration fundamentals (replication, transaction logs)
- Message broker concepts (Kafka topics, partitions, consumer groups)
- Distributed systems basics (eventual consistency, exactly-once semantics)

### Terminology

| Term                 | Definition                                                          |
| -------------------- | ------------------------------------------------------------------- |
| **WAL**              | Write-Ahead Log—PostgreSQL's transaction log for durability         |
| **Binlog**           | Binary Log—MySQL's log of all data modifications                    |
| **Oplog**            | Operations Log—MongoDB's capped collection recording writes         |
| **LSN**              | Log Sequence Number—position in PostgreSQL WAL                      |
| **GTID**             | Global Transaction ID—MySQL's cross-topology transaction identifier |
| **Replication slot** | PostgreSQL mechanism to track consumer position and retain WAL      |
| **Tombstone**        | Kafka message with null value indicating deletion                   |
| **Schema Registry**  | Service storing and versioning message schemas                      |
| **Snapshot**         | Initial full data load before streaming changes                     |

### Summary

- CDC extracts database changes from transaction logs without impacting write performance
- **Log-based CDC** (Debezium, DMS) is the production standard—captures all operations including deletes and DDL
- **PostgreSQL** uses logical replication slots; monitor `max_slot_wal_keep_size` to prevent disk bloat
- **MySQL** requires `binlog_format=ROW` and benefits from GTID for resumability across failover
- **Exactly-once semantics** require Kafka Connect 3.3+ in distributed mode (KIP-618); consumer-side idempotency keyed on source LSN/GTID is what closes the end-to-end loop
- **Schema evolution** needs Schema Registry with BACKWARD compatibility; coordinate schema changes with consumer deployments
- **Transactional outbox** pattern integrates naturally with CDC for reliable event publishing

### References

**Official Documentation:**

- [Debezium Documentation](https://debezium.io/documentation/reference/stable/architecture.html) - Architecture, connectors, and configuration
- [Debezium Exactly-Once Delivery](https://debezium.io/documentation/reference/stable/configuration/eos.html) - EOS prerequisites and connector configuration
- [Debezium 3.3.0.Final release notes](https://debezium.io/blog/2025/10/01/debezium-3-3-final-released/) - EOS extended to all core connectors
- [Debezium Incremental Snapshots](https://debezium.io/blog/2021/10/07/incremental-snapshots/) - Watermark-based snapshot, post-Netflix DBLog
- [PostgreSQL Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html) - Native PostgreSQL replication
- [PostgreSQL Logical Decoding](https://www.postgresql.org/docs/current/logicaldecoding.html) - WAL decoding internals
- [PostgreSQL 17 Logical Replication Failover](https://www.postgresql.org/docs/17/logical-replication-failover.html) - `failover = true` slot synchronization
- [MySQL Binary Log](https://dev.mysql.com/doc/refman/8.0/en/binary-log.html) - Binlog configuration and format
- [MySQL GTID](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-concepts.html) - Global Transaction ID concepts
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/) - Change Stream API reference
- [AWS DMS CDC](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html) - DMS ongoing replication
- [AWS DMS pricing](https://aws.amazon.com/dms/pricing/) - On-demand replication instances and DMS Serverless DCU model

**Engineering Blogs:**

- [LinkedIn: Open Sourcing Databus](https://engineering.linkedin.com/data-replication/open-sourcing-databus-linkedins-low-latency-change-data-capture-system) - Original Databus architecture
- [Shopify: Capturing Every Change](https://shopify.engineering/capturing-every-change-shopify-sharded-monolith) - CDC at Shopify scale
- [Netflix: DBLog](https://netflixtechblog.com/dblog-a-generic-change-data-capture-framework-69351fb9099b) - Incremental snapshot approach
- [Airbnb: SpinalTap](https://medium.com/airbnb-engineering/capturing-data-evolution-in-a-service-oriented-architecture-72f7c643ee6f) - CDC for materialized views

**Patterns and Best Practices:**

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html) - Reliable event publishing pattern
- [AWS Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) - AWS implementation guide
- [PostgreSQL Replication Slots Deep Dive](https://www.morling.dev/blog/mastering-postgres-replication-slots/) - Operational guidance
- [Advantages of Log-Based CDC](https://debezium.io/blog/2018/07/19/advantages-of-log-based-change-data-capture/) - Comparison with other approaches

**Kafka Exactly-Once:**

- [Kafka Exactly-Once Semantics](https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/) - Confluent explanation
- [KIP-98: Exactly Once Delivery](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging) - Original Kafka transactional producer proposal
- [KIP-618: Exactly-Once Support for Source Connectors](https://cwiki.apache.org/confluence/display/KAFKA/KIP-618%3A+Exactly-Once+Support+for+Source+Connectors) - Source-side EOS in Kafka Connect 3.3+
