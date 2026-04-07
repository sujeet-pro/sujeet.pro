---
title: Exactly-Once Delivery
description: >-
  Why true exactly-once delivery is impossible and how production systems
  achieve it anyway — combining at-least-once delivery with idempotency keys,
  deduplication windows, and transactional outbox patterns.
publishedDate: 2026-02-04T00:00:00.000Z
lastUpdatedOn: 2026-02-04T00:00:00.000Z
tags:
  - distributed-systems
  - patterns
  - system-design
---

# Exactly-Once Delivery

True exactly-once delivery is impossible in distributed systems—the Two Generals Problem (1975) and FLP impossibility theorem (1985) prove this mathematically. What we call "exactly-once" is actually "effectively exactly-once": at-least-once delivery combined with idempotency and deduplication mechanisms that ensure each message's effect occurs exactly once, even when the message itself is delivered multiple times.

<figure>
<img class="only-light" src="./diagrams/exactly-once-semantics-at-least-once-delivery-idempotent-consumption-effectively.light.svg" alt="Exactly-once semantics: at-least-once delivery + idempotent consumption = effectively exactly-once effect." />
<img class="only-dark" src="./diagrams/exactly-once-semantics-at-least-once-delivery-idempotent-consumption-effectively.dark.svg" alt="Exactly-once semantics: at-least-once delivery + idempotent consumption = effectively exactly-once effect." />
<figcaption>Exactly-once semantics: at-least-once delivery + idempotent consumption = effectively exactly-once effect.</figcaption>
</figure>

## Abstract

The mental model for exactly-once semantics:

1. **Network unreliability is fundamental**—messages can be lost, duplicated, or reordered. No protocol can guarantee exactly-once delivery at the network layer.

2. **Exactly-once is a composition**: at-least-once delivery (never lose messages) + idempotency/deduplication (make duplicates harmless) = exactly-once effect.

3. **Three implementation layers**:
   - **Producer side**: Idempotent producers with sequence numbers (Kafka), idempotency keys (Stripe)
   - **Broker side**: Deduplication windows (SQS: 5 min, Azure: up to 7 days), FIFO ordering, transactional commits
   - **Consumer side**: Idempotent operations, processed-message tracking, atomic state updates

4. **The deduplication window trade-off**: Every system must choose how long to remember message IDs. Shorter windows save storage but risk duplicates from slow retries. Longer windows add overhead but catch more duplicates.

5. **Boundary matters**: Most exactly-once guarantees (Kafka, Pub/Sub) stop at system boundaries. Cross-system exactly-once requires additional patterns (transactional outbox, idempotent consumers).

## The Problem

### Why Naive Solutions Fail

**Approach 1: Fire-and-forget (at-most-once)**

Send the message once with no retries. If the network drops it, the message is lost forever.

- Fails because: Message loss is common—TCP connections drop, services restart, packets get corrupted
- Example: Payment notification lost → customer never knows payment succeeded → duplicate payment attempt

**Approach 2: Retry until acknowledged (at-least-once)**

Keep retrying until you receive an acknowledgment. Never lose a message.

- Fails because: The acknowledgment itself can be lost. Producer retries a message that was actually processed.
- Example: Transfer $100 → ack lost → retry → transfer $100 again → $200 withdrawn

**Approach 3: Distributed transactions (two-phase commit)**

Coordinate sender and receiver in a distributed transaction to ensure atomic delivery.

- Fails because: Blocks on coordinator availability, doesn't handle network partitions, terrible performance
- Example: 2PC coordinator fails while holding locks → all participants blocked indefinitely

### The Core Challenge

The fundamental tension: **reliability requires retries, but retries create duplicates**.

The Two Generals Problem proves this mathematically. Two parties cannot achieve certainty of agreement over an unreliable channel—any finite sequence of confirmations leaves doubt about whether the final message arrived.

> **FLP Impossibility (Fischer, Lynch, Patterson, 1985)**: No deterministic algorithm can solve consensus in an asynchronous system where even one process may fail. The theorem assumes reliable message delivery but unbounded delays—any fault-tolerant consensus algorithm has runs that never terminate.

Practical systems circumvent FLP through randomized algorithms (Ben-Or, Rabin), partial synchrony assumptions (Paxos, Raft), or failure detectors. The implication for exactly-once: we cannot guarantee it at the protocol level, so we make duplicates harmless instead.

## Delivery Semantics

### At-Most-Once

Each message is delivered zero or one times. Messages may be lost but are never redelivered.

**Implementation**: Send once, no retries, no acknowledgment tracking.

**Trade-offs**:

- ✅ Lowest latency and complexity
- ✅ No duplicate handling needed
- ❌ Data loss is guaranteed over time
- ❌ Unsuitable for critical operations

**Use cases**: Metrics collection, logging, real-time analytics where occasional loss is acceptable.

### At-Least-Once

Each message is delivered one or more times. Messages are never lost, but duplicates occur.

**Implementation**: Retry with exponential backoff until acknowledgment received. Store unacked messages durably.

**Trade-offs**:

- ✅ No data loss
- ✅ Simple to implement
- ❌ Consumer must handle duplicates
- ❌ Ordering not guaranteed with retries

**Use cases**: Event sourcing, audit logs, any system where data loss is unacceptable and consumers are idempotent.

### Exactly-Once (Effectively)

Each message's effect occurs exactly once. The message may be delivered multiple times, but the system ensures idempotent processing.

**Implementation**: At-least-once delivery + one of:

- Idempotent operations (natural or designed)
- Deduplication at consumer (track processed message IDs)
- Transactional processing (atomic read-process-write)

**Trade-offs**:

- ✅ No data loss, no duplicate effects
- ❌ Higher complexity and latency
- ❌ Requires coordination between producer, broker, and consumer
- ❌ Deduplication window creates edge cases

**Use cases**: Financial transactions, order processing, any operation where duplicates cause real-world harm.

### Comparison

| Aspect         | At-Most-Once | At-Least-Once | Exactly-Once              |
| -------------- | ------------ | ------------- | ------------------------- |
| Message loss   | Possible     | Never         | Never                     |
| Duplicates     | Never        | Possible      | Prevented                 |
| Complexity     | Low          | Medium        | High                      |
| Latency        | Lowest       | Medium        | Highest                   |
| State required | None         | Retry queue   | Dedup store + retry queue |

## Design Paths

### Path 1: Idempotent Operations

Make the operation itself idempotent—applying it multiple times produces the same result as applying it once.

**When to choose this path:**

- Operations are naturally idempotent (SET vs INCREMENT)
- You control the consumer's state model
- Minimal infrastructure investment desired

**Key characteristics:**

- No deduplication storage required
- Works regardless of delivery semantics
- Requires careful operation design

**Natural idempotency examples:**

```typescript
// SET operations are naturally idempotent
await db.query("UPDATE users SET email = $1 WHERE id = $2", [email, userId])

// DELETE with specific criteria is idempotent
await db.query("DELETE FROM sessions WHERE user_id = $1 AND token = $2", [userId, token])

// GET operations are always idempotent
const user = await db.query("SELECT * FROM users WHERE id = $1", [userId])
```

**Non-idempotent operations that need transformation:**

```typescript
// ❌ Non-idempotent: INCREMENT
await db.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [amount, accountId])

// ✅ Idempotent version: SET with version check
await db.query(
  `
  UPDATE accounts
  SET balance = $1, version = $2
  WHERE id = $3 AND version = $4
`,
  [newBalance, newVersion, accountId, expectedVersion],
)
```

**Trade-offs vs other paths:**

| Aspect            | Idempotent Operations       | Deduplication           |
| ----------------- | --------------------------- | ----------------------- |
| Storage overhead  | None                        | Message ID store        |
| Design complexity | Higher (rethink operations) | Lower (add dedup layer) |
| Failure modes     | Version conflicts           | Window expiry           |
| Latency           | Lower                       | Higher (dedup lookup)   |

### Path 2: Idempotency Keys (API Pattern)

Client generates a unique key per logical operation. Server tracks keys and returns cached results for duplicates.

**When to choose this path:**

- Exposing APIs to external clients
- Operations are not naturally idempotent
- Client controls retry behavior

**Key characteristics:**

- Client generates unique key (UUID v4)
- Server stores operation result keyed by idempotency key
- Subsequent requests with same key return cached result
- Keys expire after a window (typically 24 hours)

**Implementation approach:**

```typescript collapse={1-8, 26-35}
// Server-side idempotency key handling
import { Redis } from "ioredis"

interface IdempotencyRecord {
  status: "processing" | "completed" | "failed"
  response?: unknown
  createdAt: number
}

async function handleWithIdempotency(
  redis: Redis,
  idempotencyKey: string,
  operation: () => Promise<unknown>,
): Promise<{ cached: boolean; response: unknown }> {
  // Check for existing record
  const existing = await redis.get(`idem:${idempotencyKey}`)
  if (existing) {
    const record: IdempotencyRecord = JSON.parse(existing)
    if (record.status === "completed") {
      return { cached: true, response: record.response }
    }
    // Still processing - return 409 Conflict
    throw new Error("Request already in progress")
  }

  // Mark as processing (with TTL to handle crashes)
  await redis.set(
    `idem:${idempotencyKey}`,
    JSON.stringify({ status: "processing", createdAt: Date.now() }),
    "EX",
    3600, // 1 hour TTL for processing state
    "NX", // Only set if not exists
  )

  // Execute operation and store result
  // ... operation execution and result caching
}
```

**Stripe's implementation details:**

- Keys stored in Redis cluster shared across all API servers
- 24-hour retention window
- Keys recycled after window expires
- Response includes original status code and body

**Real-world example:**

Stripe processes millions of payment requests daily. Their idempotency key system:

- Client includes `Idempotency-Key` header with UUID
- Server returns `Idempotent-Replayed: true` header for cached responses
- First request that fails partway through is re-executed on retry
- First request that succeeds is returned from cache on retry

Result: Zero duplicate charges from network retries.

### Path 3: Broker-Side Deduplication

Message broker tracks message IDs and filters duplicates before delivery to consumers.

**When to choose this path:**

- Using a message broker that supports deduplication
- Want to offload deduplication from consumers
- Willing to accept deduplication window constraints

**Key characteristics:**

- Producer assigns unique message ID
- Broker maintains recent message IDs in memory/storage
- Duplicates filtered before consumer delivery
- Window-based: IDs forgotten after expiry

**Kafka idempotent producer (since 0.11, default since 3.0):**

The broker assigns a 64-bit Producer ID (PID) to each producer instance. The producer assigns monotonically increasing 32-bit sequence numbers per topic-partition:

```
Producer → [PID: 12345, Seq: 0] → Broker (accepts)
Producer → [PID: 12345, Seq: 1] → Broker (accepts)
Producer → [PID: 12345, Seq: 1] → Broker (duplicate, rejects)
Producer → [PID: 12345, Seq: 3] → Broker (out-of-order, error)
```

**Configuration (Kafka 3.0+):**

```properties
# Defaults changed in Kafka 3.0 - these are now on by default
enable.idempotence=true
acks=all
```

> **Prior to Kafka 3.0**: `enable.idempotence` defaulted to `false` and `acks` defaulted to `1`. Enabling idempotence required explicit configuration.

**Key limitation**: Idempotence is only guaranteed within a producer session. If the producer crashes and restarts without a `transactional.id`, it gets a new PID and sequence numbers reset—previously sent messages may be duplicated.

**AWS SQS FIFO deduplication:**

- **Fixed** 5-minute deduplication window (cannot be changed)
- Two methods: explicit `MessageDeduplicationId` or content-based (SHA-256 of body)
- After window expires, same ID can be submitted again
- Best practice: anchor `MessageDeduplicationId` to business context (e.g., `order-12345.payment`)
- With partitioning enabled: `MessageDeduplicationId + MessageGroupId` determines uniqueness

**Trade-offs vs other paths:**

| Aspect               | Broker-Side    | Consumer-Side        |
| -------------------- | -------------- | -------------------- |
| Consumer complexity  | Lower          | Higher               |
| Dedup window control | Broker-defined | Application-defined  |
| Cross-broker dedup   | No             | Yes                  |
| Storage location     | Broker         | Application database |

### Path 4: Consumer-Side Deduplication

Consumer tracks processed message IDs and skips duplicates.

**When to choose this path:**

- Broker doesn't support deduplication
- Need longer deduplication windows than broker provides
- Want application-level control over dedup logic

**Key characteristics:**

- Consumer stores processed message IDs durably
- Check before processing; skip if seen
- ID storage must be in same transaction as state updates
- Flexible window: can retain IDs indefinitely

**Implementation with database constraints:**

```typescript collapse={1-6, 28-35}
// Idempotent consumer with database constraints
import { Pool } from "pg"

interface Message {
  id: string
  payload: unknown
}

async function processIdempotently(
  pool: Pool,
  subscriberId: string,
  message: Message,
  handler: (payload: unknown) => Promise<void>,
): Promise<{ processed: boolean }> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Insert message ID - fails if duplicate (primary key violation)
    const result = await client.query(
      `INSERT INTO processed_messages (subscriber_id, message_id, processed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING
       RETURNING message_id`,
      [subscriberId, message.id],
    )

    if (result.rowCount === 0) {
      // Duplicate - skip processing
      await client.query("ROLLBACK")
      return { processed: false }
    }

    // Process message (state updates happen here)
    await handler(message.payload)

    await client.query("COMMIT")
    return { processed: true }
  } finally {
    client.release()
  }
}
```

**Schema:**

```sql
CREATE TABLE processed_messages (
  subscriber_id VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscriber_id, message_id)
);

-- Index for cleanup queries
CREATE INDEX idx_processed_messages_time
  ON processed_messages (processed_at);
```

**Real-world example:**

A payment processor handling webhook retries:

- Each webhook includes unique `event_id`
- Before processing: check if `event_id` exists in `processed_webhooks` table
- If exists: return 200 OK immediately (idempotent response)
- If not: process event, insert ID, return 200 OK
- Daily job: delete records older than 30 days

Result: Webhooks can be retried indefinitely without duplicate effects.

### Path 5: Transactional Processing

Wrap read-process-write into an atomic transaction. Either all effects happen or none do.

**When to choose this path:**

- Using Kafka with exactly-once requirements
- Processing involves read → transform → write pattern
- Need atomicity across multiple output topics/partitions

**Key characteristics:**

- Producer, consumer, and state updates are transactional
- Consumer offset committed as part of transaction
- Aborted transactions don't affect state
- Requires `isolation.level=read_committed` on consumers

**Kafka transactional producer/consumer:**

```typescript collapse={1-12, 45-55}
// Kafka exactly-once consume-transform-produce
import { Kafka, EachMessagePayload } from "kafkajs"

const kafka = new Kafka({ brokers: ["localhost:9092"] })

const producer = kafka.producer({
  transactionalId: "my-transactional-producer",
  maxInFlightRequests: 1,
  idempotent: true,
})

const consumer = kafka.consumer({
  groupId: "my-group",
  readUncommitted: false, // read_committed isolation
})

async function processExactlyOnce() {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: "input-topic" })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      const transaction = await producer.transaction()

      try {
        // Transform message
        const result = transform(message.value)

        // Produce to output topic (within transaction)
        await transaction.send({
          topic: "output-topic",
          messages: [{ value: result }],
        })

        // Commit consumer offset (within same transaction)
        await transaction.sendOffsets({
          consumerGroupId: "my-group",
          topics: [{ topic, partitions: [{ partition, offset: message.offset }] }],
        })

        await transaction.commit()
      } catch (error) {
        await transaction.abort()
        throw error
      }
    },
  })
}

function transform(value: Buffer | null): string {
  // Your transformation logic
  return value?.toString().toUpperCase() ?? ""
}
```

**Kafka's transactional guarantees:**

- **Atomicity**: All messages in transaction commit together or none commit
- **Isolation**: Consumers with `read_committed` only see committed messages
- **Durability**: Committed transactions survive broker failures

**Trade-offs vs other paths:**

| Aspect       | Transactional         | Consumer-Side Dedup      |
| ------------ | --------------------- | ------------------------ |
| Latency      | Higher (coordination) | Lower                    |
| Complexity   | Framework handles     | Application handles      |
| Cross-system | Kafka ecosystem only  | Works with any broker    |
| Recovery     | Automatic             | Manual offset management |

### Path 6: Transactional Outbox

Solve the dual-write problem by writing business data and events to the same database transaction, then asynchronously publishing events to the message broker.

**When to choose this path:**

- Need to update a database AND publish an event atomically
- Cannot tolerate lost events or phantom events (event published but DB write failed)
- Using a broker that doesn't support distributed transactions with your database

**Key characteristics:**

- Business data and outbox event written in single database transaction
- Background process reads outbox and publishes to broker
- Events marked as published or deleted after successful publish
- Requires idempotent consumers (relay may publish duplicates on crash recovery)

**Implementation approaches:**

| Approach                  | Description                                            | Trade-offs                                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Polling Publisher         | Background service polls outbox table periodically     | Simple, adds latency (polling interval)             |
| Change Data Capture (CDC) | Tools like Debezium read database transaction logs     | Lower latency, preserves order, more infrastructure |
| Log-only outbox           | PostgreSQL logical decoding without materializing rows | Minimal database growth, Postgres-specific          |

**Implementation with polling publisher:**

```typescript collapse={1-10, 35-50}
// Transactional outbox pattern
import { Pool, PoolClient } from "pg"

interface OutboxEvent {
  id: string
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: unknown
  createdAt: Date
}

async function createOrderWithEvent(pool: Pool, order: Order): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Write business data
    await client.query(
      `INSERT INTO orders (id, customer_id, total, status)
       VALUES ($1, $2, $3, $4)`,
      [order.id, order.customerId, order.total, "created"],
    )

    // Write event to outbox in same transaction
    await client.query(
      `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), "Order", order.id, "OrderCreated", JSON.stringify(order)],
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Polling publisher (separate process)
async function publishOutboxEvents(pool: Pool, publisher: MessagePublisher): Promise<void> {
  const client = await pool.connect()
  // ... polling and publishing logic
}
```

**Outbox table schema:**

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP NULL
);

CREATE INDEX idx_outbox_unpublished ON outbox (created_at)
  WHERE published_at IS NULL;
```

**Trade-offs vs direct publishing:**

| Aspect         | Transactional Outbox      | Direct to Broker   |
| -------------- | ------------------------- | ------------------ |
| Atomicity      | Guaranteed                | Dual-write problem |
| Latency        | Higher (async relay)      | Lower (direct)     |
| Complexity     | Higher (outbox + relay)   | Lower              |
| Ordering       | Preserved (by created_at) | Depends on broker  |
| Infrastructure | Database + relay process  | Broker only        |

**Real-world usage:**

Debezium's outbox connector reads the outbox table via CDC and publishes to Kafka. This eliminates the need for a custom polling publisher and provides exactly-once delivery when combined with Kafka transactions.

### Decision Framework

<figure>
<img class="only-light" src="./diagrams/diagram-1.light.svg" alt="Diagram" />
<img class="only-dark" src="./diagrams/diagram-1.dark.svg" alt="Diagram" />
</figure>

## Production Implementations

### Kafka: Confluent's EOS

**Context:** Apache Kafka, originally developed at LinkedIn, now maintained by Confluent. Processes trillions of messages per day across major tech companies.

**Implementation choices:**

- Pattern variant: Idempotent producer + transactional processing
- Key customization: Producer ID (PID) with per-partition sequence numbers
- Scale: Tested at 1M+ messages/second with exactly-once guarantees

**Architecture:**

<figure>
<img class="only-light" src="./diagrams/diagram-2.light.svg" alt="Diagram" />
<img class="only-dark" src="./diagrams/diagram-2.dark.svg" alt="Diagram" />
</figure>

**Specific details:**

- Broker assigns 64-bit Producer ID to each producer on init
- Sequence numbers are per topic-partition, 32-bit integers
- Broker maintains last 5 sequence numbers in memory (configurable)
- `transactional.id` persists PID across producer restarts
- Transaction coordinator manages two-phase commit for multi-partition writes

**Version evolution:**

| Version    | Change                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| Kafka 0.11 | KIP-98 introduced idempotent producers and transactions                             |
| Kafka 2.5  | EOS v2 introduced (improved scalability via KIP-447)                                |
| Kafka 3.0  | `enable.idempotence=true` and `acks=all` become defaults                            |
| Kafka 3.3  | KIP-618 added exactly-once for Kafka Connect source connectors                      |
| Kafka 4.0  | Will remove deprecated `exactly_once` and `exactly_once_beta` processing guarantees |

> **KIP-939 (in progress, 2024)**: Enables Kafka to participate in externally-coordinated 2PC transactions with databases. Adds a "prepare" RPC to the transaction coordinator, enabling atomic dual-writes between Kafka and external databases without the transactional outbox pattern.

**What worked:**

- Zero-overhead idempotency when enabled by default (Kafka 3.0+)
- Transactional writes perform within 3% of non-transactional in benchmarks

**What was hard:**

- Transaction coordinator becomes single point of coordination
- `transactional.id` management across producer instances
- Consumer rebalancing during transaction can cause duplicates if not using `read_committed`
- **EOS stops at the Kafka cluster boundary**—beyond Kafka, consumers must be idempotent

**Source:** [KIP-98 - Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)

### Stripe: Idempotency Keys

**Context:** Payment processing platform handling millions of API requests daily. A single duplicate charge causes real financial harm.

**Implementation choices:**

- Pattern variant: Client-generated idempotency keys with server-side caching
- Key customization: 24-hour retention, Redis-backed distributed cache
- Scale: Handles all Stripe API traffic with idempotency support

**Architecture:**

<figure>
<img class="only-light" src="./diagrams/diagram-3.light.svg" alt="Diagram" />
<img class="only-dark" src="./diagrams/diagram-3.dark.svg" alt="Diagram" />
</figure>

**Specific details:**

- Keys are user-provided strings up to 255 characters
- Response cached includes status code, headers, and body
- `Idempotent-Replayed: true` header indicates cached response
- Keys in "processing" state return 409 Conflict on retry
- Separate Redis cluster for idempotency to isolate failure domains

**What worked:**

- Completely eliminates duplicate charges from network issues
- Clients can safely retry with exponential backoff
- No application logic changes needed for idempotent endpoints

**What was hard:**

- Determining correct 24-hour window (too short = duplicates, too long = storage cost)
- Handling partial failures (charge succeeded but idempotency record write failed)
- Cross-datacenter replication of idempotency store

**Source:** [Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency)

### Google Pub/Sub: Exactly-Once Delivery

**Context:** Google Cloud's managed messaging service. Added exactly-once delivery (GA December 2022).

**Implementation choices:**

- Pattern variant: Broker-side deduplication with acknowledgment tracking
- Key customization: Regional scope, unique message IDs
- Scale: Google-scale messaging with exactly-once in single region

**Specific details:**

- Exactly-once guaranteed **within a single cloud region only**
- Uses unique message IDs assigned by Pub/Sub
- Subscribers receive acknowledgment confirmation (acknowledge succeeded or failed)
- Only the **latest acknowledgment ID** can acknowledge a message—previous IDs fail
- Default ack deadline: 60 seconds if unspecified

**Supported configurations:**

| Feature              | Exactly-Once Support |
| -------------------- | -------------------- |
| Pull subscriptions   | Yes                  |
| StreamingPull API    | Yes                  |
| Push subscriptions   | No                   |
| Export subscriptions | No                   |

**Performance trade-offs:**

- **Higher latency**: Significantly higher publish-to-subscribe latency vs regular subscriptions
- **Throughput limitation**: ~1,000 messages/second when combined with ordered delivery
- **Publish-side duplicates**: Subscription may still receive duplicates originating from the publish side

**Client library minimum versions (required for exactly-once):**

| Language | Version   |
| -------- | --------- |
| Python   | v2.13.6+  |
| Java     | v1.139.0+ |
| Go       | v1.25.1+  |
| Node.js  | v3.2.0+   |

**What worked:**

- Eliminates need for application-level deduplication in many cases
- Ack confirmation tells subscriber definitively if message was processed

**What was hard:**

- **Regional constraint**: Cross-region subscribers may receive duplicates
- Push subscriptions excluded (no ack confirmation mechanism)
- Still requires idempotent handlers for regional failover scenarios
- "The feature does not provide any guarantees around exactly-once side effects"—side effects are outside scope

**Source:** [Cloud Pub/Sub exactly-once delivery](https://cloud.google.com/pubsub/docs/exactly-once-delivery)

### Azure Service Bus: Duplicate Detection

**Context:** Microsoft's managed messaging service with configurable deduplication windows.

**Implementation choices:**

- Pattern variant: Broker-side deduplication with configurable window
- Key customization: Window from 20 seconds to 7 days
- Limitation: Standard/Premium tiers only (not Basic)

**Specific details:**

- Tracks `MessageId` of all messages during the deduplication window
- Duplicate messages are **accepted** (send succeeds) but **instantly dropped**
- Cannot enable/disable duplicate detection after queue/topic creation
- With partitioning: `MessageId + PartitionKey` determines uniqueness

**Configuration:**

```
duplicateDetectionHistoryTimeWindow: P7D  // ISO 8601 duration, max 7 days
```

**Best practice for MessageId:**

```
{application-context}.{message-subject}
Example: purchase-order-12345.payment
```

**Trade-off:** Longer windows provide better duplicate protection but consume more storage for tracking message IDs.

**Source:** [Azure Service Bus duplicate detection](https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection)

### NATS JetStream: Message Deduplication

**Context:** High-performance messaging system with built-in deduplication.

**Implementation choices:**

- Pattern variant: Header-based deduplication with sliding window
- Key customization: Configurable window (default 2 minutes)
- Alternative: Infinite deduplication via `DiscardNewPerSubject` (NATS 2.9.0+)

**Specific details:**

- Uses `Nats-Msg-Id` header for duplicate detection
- Server tracks message IDs within deduplication window
- **Double acknowledgment** mechanism prevents erroneous re-sends after failures

**Infinite deduplication pattern (NATS 2.9.0+):**

```
// Stream configuration for infinite deduplication
{
  "discard": "new",
  "discard_new_per_subject": true,
  "max_msgs_per_subject": 1
}

// Include unique ID in subject
Subject: orders.create.{order-id}
```

Publish fails if a message with that subject already exists—provides infinite exactly-once publication.

**Source:** [JetStream Model Deep Dive](https://docs.nats.io/using-nats/developer/develop_jetstream/model_deep_dive)

### Apache Pulsar: Transactions

**Context:** Multi-tenant distributed messaging with native exactly-once support since Pulsar 2.8.0.

**Implementation choices:**

- Pattern variant: Transaction API for atomic produce and acknowledgement
- Key customization: Cross-topic atomicity
- Scale: Used in production at Yahoo, Tencent, Verizon

**Specific details:**

- Transaction API enables atomic produce and acknowledgement across multiple topics
- Idempotent producer + exactly-once semantics at single partition level
- If transaction aborts, all writes and acknowledgments roll back

**Transaction flow:**

```
1. Begin transaction
2. Produce to topic A (within transaction)
3. Produce to topic B (within transaction)
4. Acknowledge consumed message (within transaction)
5. Commit or abort
```

**Integration:** Works with Apache Flink via `TwoPhaseCommitSinkFunction` for end-to-end exactly-once.

**Source:** [Pulsar Transactions](https://pulsar.apache.org/docs/next/txn-what/)

### Implementation Comparison

| Aspect         | Kafka EOS               | Stripe Idempotency  | Pub/Sub         | Azure Service Bus | NATS JetStream  | Pulsar               |
| -------------- | ----------------------- | ------------------- | --------------- | ----------------- | --------------- | -------------------- |
| Variant        | Producer + transactions | Client keys + cache | Broker dedup    | Broker dedup      | Header dedup    | Transactions         |
| Scope          | Kafka cluster           | Any HTTP client     | Single region   | Queue/Topic       | Stream          | Multi-topic          |
| Dedup window   | Session/configurable    | 24 hours            | Regional        | 20s–7 days        | 2 min (default) | Transaction          |
| Latency impact | 3%                      | Cache lookup        | Significant     | Minimal           | Minimal         | Transaction overhead |
| Client changes | Config only             | Add header          | Library upgrade | None              | Add header      | Transaction API      |

## Common Pitfalls

### 1. Deduplication Window Expiry

**The mistake:** Retry timeout longer than deduplication window.

**Example:**

- Send message with ID "X" at T=0
- AWS SQS FIFO has 5-minute deduplication window
- Client retry policy: exponential backoff up to 10 minutes
- At T=6 minutes: client retries, SQS accepts as new message
- Result: Duplicate processing despite deduplication "guarantee"

**Solutions:**

- Ensure max retry delay < deduplication window
- Use exponential backoff with cap: `min(2^attempt * 100ms, windowSize * 0.8)`
- For critical operations: implement consumer-side deduplication as backup

### 2. Producer Restart Losing Sequence State

**The mistake:** Idempotent producer without `transactional.id` loses sequence state on restart.

**Example:**

- Kafka producer with `enable.idempotence=true` but no `transactional.id`
- Producer crashes after sending message with seq=42
- Producer restarts, gets new PID, sequence resets to 0
- Messages with seq 0-42 are accepted again as "new"
- Result: 43 duplicate messages

**Solutions:**

- Set `transactional.id` for producers that must survive restarts
- Or: accept potential duplicates and ensure consumer idempotency

### 3. Consumer Rebalancing Race Condition

**The mistake:** Processing message but not committing offset before rebalance.

**Example:**

- Consumer processes message from partition 0
- Before offset commit: rebalance triggered (session timeout, new consumer joins)
- Partition 0 reassigned to different consumer
- New consumer reads from last committed offset (before the processed message)
- Result: Message processed twice by two different consumers

**Solutions:**

- Use transactional consumers (offset committed with output)
- Implement idempotent consumer pattern (database constraint on message ID)
- Increase `session.timeout.ms` for slow processing
- Use cooperative rebalancing (`partition.assignment.strategy=CooperativeStickyAssignor`)

### 4. Assuming Idempotency Key Uniqueness

**The mistake:** Using predictable keys that collide across users/operations.

**Example:**

- Developer uses `orderId` as idempotency key
- User A creates order 12345, key = "12345"
- User B creates order 12345 in different tenant, same key = "12345"
- User B's request returns User A's cached response
- Result: Data leakage between tenants

**Solutions:**

- Include tenant/user ID in key: `{tenantId}:{operationId}`
- Use client-generated UUIDs (UUID v4)
- Never derive keys solely from user-provided identifiers

### 5. Idempotency for GET Requests

**The mistake:** Adding idempotency keys to read operations.

**Example:**

- Developer adds idempotency keys to all endpoints including GET
- GET /user/123 with key "abc" returns user data, cached
- User updates their profile
- GET /user/123 with key "abc" returns stale cached data
- Result: Clients see outdated data indefinitely

**Solutions:**

- Idempotency keys only for state-changing operations (POST, PUT, DELETE)
- GET requests are naturally idempotent—no key needed
- If caching reads, use standard HTTP caching (ETags, Cache-Control)

### 6. Clock Skew in Last-Write-Wins

**The mistake:** Using wall-clock timestamps for conflict resolution in distributed system.

**Example:**

- Node A (clock +100ms skew) writes value V1 at local time T1
- Node B (accurate clock) writes value V2 at local time T2
- T1 > T2 due to clock skew, but V2 was actually written later
- LWW comparison: V1 wins because T1 > T2
- Result: Causally later write (V2) is discarded

**Solutions:**

- Use Lamport timestamps or vector clocks instead of wall clocks
- Use hybrid logical clocks (HLC) for ordering with physical time hints
- Accept that LWW with physical clocks is eventually consistent, not causally consistent

### 7. Assuming EOS Extends Beyond System Boundaries

**The mistake:** Believing Kafka's exactly-once guarantees extend to downstream systems.

**Example:**

- Kafka Streams app with `processing.guarantee=exactly_once_v2`
- App reads from Kafka, processes, writes to PostgreSQL
- Assumption: "Kafka handles exactly-once, so PostgreSQL writes are safe"
- Reality: Kafka EOS only covers Kafka-to-Kafka. The PostgreSQL write is outside the transaction.
- Result: Consumer crashes after PostgreSQL write but before Kafka offset commit → duplicate write on restart

**Solutions:**

- Use transactional outbox pattern for database writes
- Implement idempotent database operations (upsert with message ID)
- Use KIP-939 (when available) for native 2PC with external databases
- Always design downstream consumers as idempotent regardless of upstream guarantees

## Implementation Guide

### Starting Point Decision

<figure>
<img class="only-light" src="./diagrams/diagram-4.light.svg" alt="Diagram" />
<img class="only-dark" src="./diagrams/diagram-4.dark.svg" alt="Diagram" />
</figure>

### System Selection Guide

| Requirement           | Recommended System  | Reason                           |
| --------------------- | ------------------- | -------------------------------- |
| Kafka ecosystem       | Kafka with EOS v2   | Native support, minimal overhead |
| Serverless/managed    | SQS FIFO or Pub/Sub | No infrastructure to manage      |
| Configurable window   | Azure Service Bus   | 20s to 7 days window             |
| High performance      | NATS JetStream      | Low latency, simple model        |
| Cross-topic atomicity | Pulsar or Kafka     | Transaction APIs                 |
| HTTP API idempotency  | Redis + custom code | Stripe pattern                   |

### When to Build Custom

**Build custom when:**

- Existing solutions don't fit your consistency requirements
- Cross-system exactly-once needed (Kafka → external database)
- Need longer deduplication windows than broker provides
- Performance requirements exceed library capabilities

**Implementation checklist:**

- [ ] Define deduplication key format (unique, collision-resistant)
- [ ] Choose deduplication storage (Redis, database, in-memory)
- [ ] Set deduplication window (longer than max retry delay)
- [ ] Implement atomic state update + dedup record insert
- [ ] Add cleanup job for expired deduplication records
- [ ] Test with network partition simulation
- [ ] Test with producer/consumer restart scenarios
- [ ] Document failure modes and recovery procedures

### Testing Exactly-Once

**Unit tests:**

- Same message ID processed twice → single state change
- Different message IDs → independent state changes
- Concurrent identical requests → single effect

**Integration tests:**

- Producer crash mid-send → no duplicates after restart
- Consumer crash mid-process → message reprocessed once
- Broker failover → no duplicates or losses

**Chaos testing:**

- Network partition between producer and broker
- Kill consumer during processing
- Slow consumer causing rebalance
- Clock skew between nodes

## Conclusion

Exactly-once delivery is a misnomer—true exactly-once is mathematically impossible in distributed systems. What we achieve is "effectively exactly-once": at-least-once delivery combined with idempotency mechanisms that ensure each message's effect occurs exactly once.

The key insight is that exactly-once is a **composition**, not a primitive:

1. Never lose messages (at-least-once delivery with retries and persistence)
2. Make duplicates harmless (idempotent operations, deduplication tracking, or transactional processing)

Choose your implementation based on your constraints:

- **Idempotent operations** when you control the state model
- **Idempotency keys** for external-facing APIs
- **Broker-side deduplication** when your broker supports it (Kafka, SQS FIFO, Pub/Sub, Azure Service Bus, NATS JetStream)
- **Consumer-side deduplication** for maximum control and longer windows
- **Transactional processing** for Kafka/Pulsar consume-transform-produce patterns
- **Transactional outbox** when you need atomic database + event writes

Every approach has failure modes around the deduplication window. Design your retry policies to fit within the window, and consider layered approaches (broker + consumer deduplication) for critical paths.

**Critical reminder**: Most exactly-once guarantees stop at system boundaries. Kafka EOS doesn't extend to your PostgreSQL database. Pub/Sub exactly-once is regional. Always design downstream consumers as idempotent, regardless of upstream guarantees.

## Appendix

### Prerequisites

- Understanding of distributed systems fundamentals (network failures, partial failures)
- Familiarity with message brokers (Kafka, SQS, or similar)
- Basic knowledge of database transactions

### Terminology

- **Idempotency**: Property where applying an operation multiple times produces the same result as applying it once
- **PID (Producer ID)**: Unique 64-bit identifier assigned to a Kafka producer instance by the broker
- **Deduplication window**: Time period during which the system remembers message IDs for duplicate detection
- **EOS (Exactly-Once Semantics)**: Kafka's term for effectively exactly-once processing guarantees
- **2PC (Two-Phase Commit)**: Distributed transaction protocol that ensures atomic commits across multiple participants
- **CDC (Change Data Capture)**: Technique for reading database changes from transaction logs
- **Transactional outbox**: Pattern where events are written to an outbox table in the same database transaction as business data

### Summary

- True exactly-once delivery is impossible (Two Generals 1975, FLP 1985)
- "Exactly-once" means at-least-once delivery + idempotent consumption
- Six implementation paths: idempotent operations, idempotency keys, broker-side dedup, consumer-side dedup, transactional processing, transactional outbox
- Every deduplication mechanism has a window—design retry policies accordingly
- Kafka EOS: idempotent producers (PID + sequence) + transactional consumers (`read_committed`); default since Kafka 3.0
- Deduplication windows vary: SQS FIFO (5 min fixed), Azure Service Bus (20s–7 days), NATS (2 min default)
- Most exactly-once guarantees stop at system boundaries—always design downstream consumers as idempotent
- Test with chaos: network partitions, restarts, rebalancing, clock skew

### References

**Theoretical Foundations**

- [Impossibility of Distributed Consensus with One Faulty Process](https://groups.csail.mit.edu/tds/papers/Lynch/jacm85.pdf) - FLP impossibility theorem (1985)
- [A Brief Tour of FLP Impossibility](https://www.the-paper-trail.org/post/2008-08-13-a-brief-tour-of-flp-impossibility/) - Accessible explanation of FLP
- [Two Generals' Problem](https://en.wikipedia.org/wiki/Two_Generals%27_Problem) - First computer communication problem proven unsolvable

**Apache Kafka**

- [KIP-98 - Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging) - Kafka's exactly-once specification
- [KIP-129 - Streams Exactly-Once Semantics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-129%3A+Streams+Exactly-Once+Semantics) - Kafka Streams exactly-once
- [KIP-447 - Producer scalability for exactly once semantics](https://cwiki.apache.org/confluence/display/KAFKA/KIP-447:+Producer+scalability+for+exactly+once+semantics) - EOS v2 improvements
- [KIP-939 - Support Participation in 2PC](https://cwiki.apache.org/confluence/display/KAFKA/KIP-939:+Support+Participation+in+2PC) - Kafka + external database atomic writes
- [Message Delivery Guarantees for Apache Kafka](https://docs.confluent.io/kafka/design/delivery-semantics.html) - Confluent official docs
- [Exactly-once Support in Apache Kafka](https://medium.com/@jaykreps/exactly-once-support-in-apache-kafka-55e1fdd0a35f) - Jay Kreps on Kafka EOS

**Cloud Messaging Services**

- [Cloud Pub/Sub exactly-once delivery](https://cloud.google.com/pubsub/docs/exactly-once-delivery) - Google Pub/Sub implementation
- [AWS SQS FIFO exactly-once processing](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) - AWS implementation
- [Azure Service Bus duplicate detection](https://learn.microsoft.com/en-us/azure/service-bus-messaging/duplicate-detection) - Azure implementation

**Other Messaging Systems**

- [JetStream Model Deep Dive](https://docs.nats.io/using-nats/developer/develop_jetstream/model_deep_dive) - NATS deduplication
- [Pulsar Transactions](https://pulsar.apache.org/docs/next/txn-what/) - Apache Pulsar exactly-once

**API Idempotency**

- [Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency) - Stripe's idempotency key pattern
- [Implementing Stripe-like Idempotency Keys in Postgres](https://brandur.org/idempotency-keys) - Detailed implementation guide

**Patterns**

- [Transactional outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html) - Microservices.io pattern reference
- [Reliable Microservices Data Exchange With the Outbox Pattern](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/) - Outbox pattern with CDC
- [Idempotent Consumer Pattern](https://microservices.io/patterns/communication-style/idempotent-consumer.html) - Microservices.io pattern reference

**General**

- [The impossibility of exactly-once delivery](https://blog.bulloak.io/post/20200917-the-impossibility-of-exactly-once/) - Theoretical foundations
- [You Cannot Have Exactly-Once Delivery](https://bravenewgeek.com/you-cannot-have-exactly-once-delivery/) - Why true exactly-once is impossible
