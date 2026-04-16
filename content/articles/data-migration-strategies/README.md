---
title: 'Zero-Downtime Data Migrations: Backfills, Dual Writes, and Safe Cutovers'
description: >-
  A production-oriented playbook for overlapping migrations: invariants during dual
  writes, idempotent backfills and lag control, reconciliation, cutover gates,
  rollback triggers, and decommissioning the old path.
publishedDate: 2026-01-24
lastUpdatedOn: 2026-04-14
tags:
  - distributed-systems
  - reliability-engineering
  - data-engineering
  - platform-engineering
---

# Zero-Downtime Data Migrations: Backfills, Dual Writes, and Safe Cutovers

Schema migrations answer “what does the DDL look like next?” **Data migrations** answer “how do we move rows, blobs, or derived documents from system A to system B while production keeps accepting traffic, and how do we *prove* we can roll back?” This article stays on that second problem: **backfills**, **dual writes or log-driven fan-out**, **reconciliation**, **cutover**, **rollback**, and **decommissioning**—the parts that usually decide whether an outage becomes a story or a footnote.

![Flowchart of migration phases: define invariants, overlap window with durable capture and backfill, prove equivalence with reconciliation and shadow reads, bounded cutover with monitoring, then decommission or rollback.](./diagrams/zero-downtime-migration-phases-light.svg "End state is not “the new cluster exists,” it is “traffic can survive losing the old path,” with measured drift and a rehearsed rollback.")
![Flowchart of migration phases: define invariants, overlap window with durable capture and backfill, prove equivalence with reconciliation and shadow reads, bounded cutover with monitoring, then decommission or rollback.](./diagrams/zero-downtime-migration-phases-dark.svg)

## What “zero downtime” actually promises

**Zero downtime** means users keep making progress on their work while you change storage layout, vendor, or region. It does **not** mean zero risk, zero cost, or zero observable behavior change. You are trading a short hard outage for a **longer soft window** where two representations of truth coexist. The engineering problem is to keep that window **bounded**, **measurable**, and **reversible**.

PostgreSQL documents logical replication as a publisher/subscriber stream that can copy existing data and then apply ongoing changes; operators still must reason about conflicts, schema mapping, and monitoring lag ([PostgreSQL documentation: Logical replication](https://www.postgresql.org/docs/current/logical-replication.html)). MySQL’s replication model is likewise built around a durable log consumed by replicas, with operational guidance around lag and binlog retention ([MySQL Reference Manual: Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html)). Managed movers such as AWS DMS expose the same primitive at product level: initial load plus **ongoing change data capture** until you cut over ([AWS DMS documentation: CDC](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html)). The pattern generalizes: **capture → apply → verify → switch → retire**.

## Invariants before you touch traffic

Pick **one authoritative source of truth** per entity for each phase. Common choices:

- **Old primary during overlap.** New store is a follower; reads still come from the old path unless you have proven otherwise.
- **Split authority (dangerous).** Different services write different fields; only use when your reconciliation story is airtight.

Write explicit invariants, for example:

1. **Ordering:** For a given key, visible history matches a total order you can replay (commit order, monotonic version column, or log sequence).
2. **Completeness:** Every successful user-visible mutation eventually appears in the capture stream ([Debezium](https://debezium.io/documentation/reference/stable/index.html) and similar CDC connectors read the transaction log precisely to avoid missed application paths).
3. **Idempotency:** Replaying the same event or batch twice does not corrupt final state (see [RFC 9110: safe and idempotent methods](https://www.rfc-editor.org/rfc/rfc9110.html#name-common-method-properties) for the HTTP analogy; the same discipline applies to consumers).
4. **Rollback boundary:** You can revert reads to the old store without data loss **or** you accept forward-only loss and document it.

> **NOTE:** If you cannot state rollback in one sentence, you are not ready for a production cutover—only for a rehearsal.

## Dual writes versus single commit plus fan-out

There are two families of write path, each with different failure physics.

![Comparison diagram: application dual-writes to source and target versus single commit to source with transaction log consumed by an idempotent worker into target, both feeding a reconciliation loop.](./diagrams/write-fanout-and-reconciliation-light.svg "Application dual writes minimize infrastructure but expand the failure domain of each request. Log fan-out centralizes capture and makes “missed writes” less likely if all writers go through the database.")
![Comparison diagram: application dual-writes to source and target versus single commit to source with transaction log consumed by an idempotent worker into target, both feeding a reconciliation loop.](./diagrams/write-fanout-and-reconciliation-dark.svg)

**Application dual write** updates the legacy store and the new store inside one request. It is easy to reason about locally, but **partial failure** is the default case: one side commits, the other times out. You need retries, deduplication keys, and often a repair queue—conceptually the same work as a stream consumer, only less uniform across services.

**Single commit + durable fan-out** keeps the database as the choke point: after commit, changes appear in the WAL/binlog or an [outbox table](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-transactional-outbox-pattern) that a relay publishes. This is how large online migrations avoid asking every engineer to remember the second write ([Stripe engineering: Online migrations](https://stripe.com/blog/online-migrations)). The operational cost shifts to connectors, ordering, retention, and consumer lag.

Neither removes reconciliation. Both need **continuous proof** that the follower store matches the contract you will read after cutover.

## Backfills, lag, and throughput

A **backfill** is a batched historical copy; **streaming** (or dual writes) covers the tail. Production systems almost always run under **rate limits**: IOPS, replication bandwidth, page cache churn, and lock duration on hot rows all matter. AWS explicitly positions ongoing replication as continuing until lag is acceptable for cutover ([AWS DMS documentation: CDC](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html)).

Operational tactics that survive audits:

- **Watermarks and checkpoints** per partition so workers restart without scanning from epoch zero.
- **Idempotent upserts** keyed by stable natural or surrogate keys; store `source_updated_at` or `source_lsn` on the target row for last-write-wins decisions you can defend.
- **Adaptive throttling** when replica lag, consumer lag, or p99 write latency crosses SLO-driven ceilings—your backfill should be the first workload you shed, not user traffic.
- **Hot key isolation** so one viral entity cannot stall the entire job; shuffle partitions and cap batch sizes.

### Checkpoint discipline (concrete shape)

Most backfill incidents are “we restarted the job and duplicated work” or “we advanced the watermark past an uncommitted transaction.” A boring, safe worker loop looks like this in responsibilities (not a mandate on language or framework):

1. **Lease a partition** (hash range, tenant id, table slice) so two pods do not double-apply the same keys concurrently unless your writes are strictly commutative.
2. **Read a batch** ordered by a stable cursor (`updated_at`, `(shard, id)`, or log position).
3. **Transform and upsert** into the target with a deterministic payload version.
4. **Commit the checkpoint only after** the target batch commit succeeds—same spirit as transactional outbox relays, where downstream delivery is tied to durable progress ([Microsoft Learn: Transactional outbox pattern](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-transactional-outbox-pattern)).

If the source is a relational log, prefer **log sequence** over wall clock when you have it: clocks lie; LSNs and binlog positions reflect commit order the database already agreed on ([PostgreSQL documentation: Logical replication](https://www.postgresql.org/docs/current/logical-replication.html)).

### Lag is a product decision

Treat replication or consumer lag like any other SLO: define **who suffers** when lag grows (reads from follower? analytics? risk checks) and what **mitigation** is allowed (disable non-critical consumers, widen read-your-writes exceptions, temporarily route hot tenants to the old path). MySQL’s replication docs are explicit that replicas apply events asynchronously—design for **eventual** visibility unless you buy stronger guarantees with topology and routing ([MySQL Reference Manual: Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html)).

## Validation and reconciliation

Validation is more than row counts. Counts can match while **semantic drift** (wrong currency scale, missing soft deletes, truncated strings) slips through.

Layer checks:

| Layer | What it catches | Cost |
| ----- | ----------------- | ---- |
| Aggregate | Missing shards, wildly wrong totals | Cheap nightly |
| Sampled deep compare | Field-level bugs, encoding issues | Moderate |
| Shadow reads | Read-path incompatibility (indexes, nullability) | Higher—do before trusting new path |

Run reconciliation continuously during overlap, not as a single pre-cutover script. Quarantine mismatches with enough context (key, versions, payload hashes) for a human to classify **data bug vs. expected divergence**.

### What to diff when schemas differ

During **expand/contract** style moves, the target table often carries extra columns, different indexes, or normalized joins. Reconciliation should compare **business projections**, not raw storage:

- Map both sides through the same **read model** code path used in production, or through a SQL view that mirrors post-cutover joins.
- Freeze **default expressions** and **time zones** for the migration window; subtle `NOW()` vs. source `updated_at` differences create ghosts that pass row counts.
- For deletes, decide whether tombstones, `deleted_at`, or hard deletes are canonical, and assert the same rule on both sides—CDC connectors often emit delete events you must not drop on the floor ([Debezium documentation](https://debezium.io/documentation/reference/stable/index.html)).

## Cutover criteria and gates

Cutover is a **risk management event**, not a merge request. Treat it like a launch: explicit owner, time box, and pre-declared abort conditions. The checklist below is the same information as the diagram—use whichever format your team actually runs in a war room.

![Decision flowchart for cutover: verify lag, reconciliation, shadow reads, rollback rehearsal, staffing, then execute cutover with health check leading to stabilize or rollback to restart checks.](./diagrams/cutover-readiness-gates-light.svg "Gates exist to slow you down when metrics lie less than intuition. If a gate fails, fix the system—not the spreadsheet.")
![Decision flowchart for cutover: verify lag, reconciliation, shadow reads, rollback rehearsal, staffing, then execute cutover with health check leading to stabilize or rollback to restart checks.](./diagrams/cutover-readiness-gates-dark.svg)

Concrete **go** conditions often include:

- Consumer or replication **lag below a percentile budget** for a sustained window, not a single lucky minute ([PostgreSQL logical replication monitoring](https://www.postgresql.org/docs/current/logical-replication-monitoring.html) lists lag views operators rely on).
- Reconciliation **error rate near zero** with all known exceptions ticketed and classified.
- Shadow reads (or canary traffic) show **parity** on correctness metrics you defined up front.
- **Rollback rehearsal** completed on production-like data: restore flags, DNS or connection strings, and cache invalidation paths.

### Expand reads before expand writes (when reshaping tables)

Stripe’s public write-up on large online migrations describes a practical sequencing: **dual-write**, then **move reads**, then **move writes**, then **delete old data** ([Stripe engineering: Online migrations](https://stripe.com/blog/online-migrations)). The lesson generalizes: reads fail loudly on wrong indexes and nullability; writes fail loudly on constraint and trigger mismatch. Ordering work so **read paths exercise the new store under production query shapes** before you make the new store authoritative for writes reduces the chance that cutover day is the first time your ORM touches real cardinality.

Feature flags should default **off**, roll out **per tenant or shard**, and log **which code path served each request** so post-incident forensics does not devolve into guessing.

## Rollback: when to pull the cord

Rollback is not “re-deploy yesterday’s binary.” It is returning the **read path** (and possibly write path) to a known-good authority **without** silently discarding user work.

Trigger examples:

- **Sustained drift** between stores after cutover, especially growing drift (suggests a logic bug, not noise).
- **Correctness regressions** on golden workflows or payment-adjacent flows.
- **Latency or error budget** violations tied to the new path that cannot be mitigated within the change window.

If the new store has accepted writes that the old store never learned, **rollback may be lossy** unless you also replay forward—state this explicitly in the runbook. Many teams keep a short **forward sync** path from new → old only for emergency rollback windows, then delete it after confidence hardens.

## Decommissioning and organizational cleanup

Decommissioning is where migrations die of neglect: old tables linger, cron jobs keep writing “just in case,” and costs creep. A clean finish includes:

1. **Traffic proof:** No production reads or writes hit the legacy path for a full billing or release cycle—whichever is stricter for your business.
2. **Credential and network isolation:** Revoke DB users, firewall rules, and object-store prefixes so accidental writes fail loudly.
3. **Code deletion:** Remove feature flags, compatibility mappers, and temporary dual-write branches; static analysis or coverage gaps here have caused reintroduction bugs months later.
4. **Retention and compliance:** Export archives if policy requires, then drop with auditable tickets.

### Prove “zero traffic” with data, not grep

Before dropping the old cluster, collect **connection counts**, **query fingerprints**, and **egress bytes** tagged by application role. Dashboards beat assertions in Slack. After code deletion, run the same checks for a week—**surprise traffic** almost always means a forgotten reporting job or a vendor integration still pointed at the legacy DSN.

For long-running pipelines that *replace* rather than *move* data, Google’s SRE workbook chapter on data processing emphasizes monitoring, idempotent stages, and failure design ([Google SRE Workbook: Data processing](https://sre.google/workbook/data-processing/))—the same muscles you use for backfill workers at scale.

### Cost and toil

Dual clusters and double-written rows are not free. Make the **decommission date** a tracked milestone with an owner the same way the cutover date is; otherwise finance will notice the migration months before engineering considers it “done.”

## Common failure modes (short catalog)

| Failure mode | Early signal | Mitigation |
| ------------ | ------------ | ---------- |
| Missed writes outside the capture path | Reconciliation gaps clustered by service | Move capture to the log or outbox; block cutover until coverage proven |
| Backfill starving the tail | Growing lag while historical percent climbs | Throttle backfill; raise resources; partition hot keys |
| Non-idempotent consumers | Duplicate events corrupt state | Deterministic upserts; unique constraints; poison-message quarantine |
| Cutover under schema skew | Shadow read mismatches on defaults/encoding | Freeze DDL; align serializers; add contract tests |
| “Rollback” without a writer path | User-visible flapping reads | Rehearse two-way plan or accept forward-only |

## Closing heuristic

If you remember only three questions before flipping traffic:

1. **Where is truth right now, for reads and writes?**
2. **What metric proves the follower is equivalent, not just “caught up”?**
3. **What is the smallest reversible step if the metric lies?**

Answer those on paper, not only in Terraform, and the long overlap window becomes boring—which is the point.

## References

- [PostgreSQL documentation: Logical replication](https://www.postgresql.org/docs/current/logical-replication.html)
- [MySQL Reference Manual: Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [AWS DMS documentation: CDC](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html)
- [Debezium documentation](https://debezium.io/documentation/reference/stable/index.html)
- [Microsoft Learn: Transactional outbox pattern](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/implement-resilient-applications/implement-transactional-outbox-pattern)
- [Stripe engineering: Online migrations](https://stripe.com/blog/online-migrations)
- [RFC 9110: Safe and idempotent request methods](https://www.rfc-editor.org/rfc/rfc9110.html#name-common-method-properties)
- [Google SRE Workbook: Data processing](https://sre.google/workbook/data-processing/)
- Martin Kleppmann, *Designing Data-Intensive Applications* — stream processing, exactly-once semantics, and log-based integration trade-offs ([author site](https://dataintensive.net/))
