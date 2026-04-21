---
title: Design a Flash Sale System
linkTitle: 'Flash Sale'
description: >-
  Designing a flash sale system that handles millions of concurrent buyers and limited
  inventory: CDN-hosted virtual waiting rooms, token-gated admission, Redis atomic
  inventory deduction, asynchronous order processing, and layered bot defence under
  10-100x traffic spikes.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - system-design
  - interview-prep
  - distributed-systems
  - reliability
---

# Design a Flash Sale System

A flash sale must serve millions of buyers competing for a fixed pool of inventory in seconds, with zero tolerance for overselling. Treat it as four constraints chained together: a CDN-hosted **waiting room** absorbs the spike, a **token gate** meters admission to backend capacity, an **atomic inventory store** prevents overselling, and an **async order queue** decouples user-visible latency from durable fulfilment. Each layer's job is to shield the next.

![System overview — CDN waiting room → API gateway → queue, inventory and order services → Redis, message queue and PostgreSQL.](./diagrams/system-overview-light.svg "System overview — CDN waiting room → API gateway → queue, inventory and order services → Redis, message queue and PostgreSQL.")
![System overview — CDN waiting room → API gateway → queue, inventory and order services → Redis, message queue and PostgreSQL.](./diagrams/system-overview-dark.svg)

## Mental model

Three constraints fight each other in any flash sale and the architecture is the negotiated truce.

1. **Traffic absorption.** Millions of users arriving in seconds cannot hit origin. A CDN-hosted waiting room absorbs the spike at the edge; a queue service meters admission to backend capacity.
2. **Inventory accuracy.** Overselling destroys trust and forces refunds, returns, or worse — legal exposure for ticketing. Atomic Redis Lua scripts give "check-and-decrement" without races. Pre-allocating tokens equal to inventory turns "did we oversell?" into "did we issue more tokens than items?", which is trivially false by construction.
3. **Order durability under load.** Synchronous payment + write paths cannot scale with the spike. A durable message queue decouples order receipt from order completion: the user gets a fast `202 Accepted`; a worker pool drains the queue at the database's pace, with retries and a dead-letter queue for poison messages.

The mental model is **waiting room → token gate → atomic inventory → async order queue**. Every section below either implements one of those four boxes or explains how to harden it under load.

![Admission funnel — 10M raw arrivals shaped down to 10K confirmed orders by the four layers.](./diagrams/admission-funnel-light.svg "Admission funnel — each layer drops a quantitative order of magnitude so the inventory tier never sees raw traffic.")
![Admission funnel — 10M raw arrivals shaped down to 10K confirmed orders by the four layers.](./diagrams/admission-funnel-dark.svg)

| Design decision        | Trade-off                                                                  |
| ---------------------- | -------------------------------------------------------------------------- |
| CDN waiting room       | Absorbs traffic cheaply; adds user-facing latency and a polling tax        |
| Token-based admission  | Prevents overselling by construction; requires accurate pre-allocation     |
| Redis atomic counters  | Sub-millisecond inventory checks; hot-key risk on a single-product surge   |
| Async order processing | Handles 100x spikes; delayed confirmation and harder UX expectations       |

## Requirements

### Functional Requirements

| Feature                     | Scope    | Notes                                 |
| --------------------------- | -------- | ------------------------------------- |
| Virtual waiting room        | Core     | Absorbs traffic spike before backend  |
| Queue management            | Core     | FIFO admission with position tracking |
| Inventory reservation       | Core     | Atomic decrement, no overselling      |
| Order placement             | Core     | Async processing with durability      |
| Bot detection               | Core     | Multi-layer defense                   |
| Payment processing          | Core     | Idempotent, timeout-aware             |
| Order confirmation          | Core     | Email/push notification               |
| Purchase limits             | Extended | 1-2 units per customer                |
| VIP early access            | Extended | Tiered queue priority                 |
| Real-time inventory display | Extended | Eventually consistent display         |

### Non-Functional Requirements

| Requirement             | Target    | Rationale                                                                                                                                                                                                                          |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability            | 99.99%    | Revenue and reputational impact during a public on-sale window; the [Alibaba flash-sale playbook](https://www.alibabacloud.com/blog/system-stability-assurance-for-large-scale-flash-sales_596968) is the canonical reference here. |
| Waiting room latency    | < 100ms   | Static asset served by CDN; users compare it to opening a website.                                                                                                                                                                  |
| Inventory check latency | < 50ms    | On the critical path, gates checkout. Sub-ms in Redis, but budget for network and serialisation.                                                                                                                                    |
| Checkout latency        | < 5s p99  | User-acceptable; async order processing hides downstream payment + DB time.                                                                                                                                                         |
| Queue position accuracy | Real-time | Trust requires visible progress; stale numbers are worse than slow numbers.                                                                                                                                                         |
| Inventory accuracy      | 100%      | Zero tolerance for overselling — refund cost, regulatory risk for ticketing, brand damage.                                                                                                                                          |
| Order durability        | Zero loss | Queued orders must survive worker, broker, and AZ failures.                                                                                                                                                                         |

### Scale Estimation

**Traffic Profile:**

| Metric               | Normal  | Flash Sale Peak | Multiplier |
| -------------------- | ------- | --------------- | ---------- |
| Concurrent users     | 100K    | 10M             | 100x       |
| Page requests/sec    | 10K RPS | 1M RPS          | 100x       |
| Inventory checks/sec | 1K RPS  | 500K RPS        | 500x       |
| Orders/sec           | 100 TPS | 10K TPS         | 100x       |

**Back-of-envelope (1M users, 10K inventory, 30-min sale window):**

```text
Users arriving in first minute:   1,000,000
Waiting-room HTML hits (CDN):     1M × 3 refreshes = 3M req/min ≈ 50K RPS at edge
Queue-status polls (CDN-bypass):  1M × 1 poll / 5s = 200K RPS to queue API
Admission rate (gate-controlled): 10K inventory / 30 min ≈ 6 admits/s typical;
                                   burst-shaped to ~83/s during the first 2 min
Inventory reserves (admitted):    same ~6-83 RPS; bursts shaped by gate, not raw traffic
Orders attempted:                 ~12K (a few percent abandon at payment)
Orders confirmed:                 10K (inventory limit, by construction)
```

> [!NOTE]
> The 200K RPS poll figure is the work the **queue API** must do; the 50K RPS waiting-room hits are absorbed at the edge. The inventory and order tiers see whatever the admission gate lets through, **not** the raw arrival rate. Sizing the inventory tier off the headline 1M is the most common over-provisioning mistake.

**Storage:**

```text
Queue state: 1M users × 100 bytes = 100 MB (DynamoDB or Redis)
Order records: 10K orders × 5 KB = 50 MB (PostgreSQL)
Event logs: 10M events × 200 bytes = 2 GB / sale
```

## Design Paths

### Path A: Pre-Allocation Model (Token-Based)

**Best when:**

- Fixed, known inventory quantity
- Fairness is paramount (ticketing, limited editions)
- High-value items where overselling is catastrophic

**Architecture:**

![Path A — token-based architecture: pre-sale token mint, FIFO queue, token gate guards checkout.](./diagrams/token-based-architecture-light.svg "Path A — token-based architecture: pre-sale token mint, FIFO queue, token gate guards checkout.")
![Path A — token-based architecture: pre-sale token mint, FIFO queue, token gate guards checkout.](./diagrams/token-based-architecture-dark.svg)

**Key characteristics:**

- Tokens minted equal to inventory before sale starts.
- Each admitted user receives one token.
- A token guarantees a checkout opportunity, not a purchase — the user may still abandon.
- Tokens expire if unused and return to the pool for the next admittee.

**Trade-offs:**

- ✅ Zero overselling by construction.
- ✅ Predictable admission rate (admit at backend capacity, not request rate).
- ✅ Fair: pure FIFO, or FIFO with a randomised pre-sale window.
- ❌ Requires an accurate inventory count before the sale opens.
- ❌ Token lifecycle management (expiry, reclaim, double-submission) is non-trivial.
- ❌ Abandoned tokens dent conversion if expiry is too short or the queue is too aggressive.

> [!NOTE]
> "Pre-mint one token per unit of inventory" is one specific implementation of Path A and works well for low-stock, high-fairness sales (drops, ticketing). The other common variant — used by SeatGeek and Cloudflare Waiting Room — issues admission tokens **decoupled from inventory**, sized to backend capacity instead. The actual decrement still happens atomically at checkout. Pick by where you want the failure to land: at admission ("you didn't get a ticket") or at checkout ("we sold out while you were typing your card number").

**Real-world example:** [SeatGeek's virtual waiting room on AWS](https://aws.amazon.com/blogs/architecture/build-a-virtual-waiting-room-with-amazon-dynamodb-and-aws-lambda-at-seatgeek/) uses Lambda + DynamoDB to manage two layers of tokens: a *visitor token* assigned at entry that captures arrival timestamp for FIFO ordering, and an *access token* exchanged at the front of the queue that authorises checkout. Tokens expire when the purchase completes or the user's session ends, returning capacity to the protected zone via a leaky-bucket counter.

### Path B: Real-Time Inventory Model (Counter-Based)

**Best when:**

- Dynamic inventory (multiple warehouses, restocking)
- E-commerce flash sales with variable stock
- Lower-stakes items where occasional overselling is recoverable

**Architecture:**

![Path B — counter-based inventory: rate limiter fronts a Redis counter, atomic decrement on checkout.](./diagrams/counter-based-architecture-light.svg "Path B — counter-based inventory: rate limiter fronts a Redis counter, atomic decrement on checkout.")
![Path B — counter-based inventory: rate limiter fronts a Redis counter, atomic decrement on checkout.](./diagrams/counter-based-architecture-dark.svg)

**Key characteristics:**

- No pre-allocation — inventory is checked in real time on the checkout path.
- Atomic decrement happens at checkout, not at admission.
- Rate limiting protects backend capacity; it doesn't guarantee the user a purchase.
- Inventory can be restocked mid-sale (dynamic counters).

**Trade-offs:**

- ✅ Native support for dynamic inventory and mid-sale restocks.
- ✅ Simpler pre-sale setup — no token mint job, no token registry.
- ✅ Easier integration with multi-warehouse fulfilment systems.
- ❌ Overselling risk if counter writes desync from order persistence.
- ❌ Users admitted without a guarantee — visible "sold out at checkout" UX is harsh.
- ❌ Hot-key risk on a single popular SKU — one shard, one CPU, one tail latency.

**Real-world example:** Alibaba's flash-sale playbook on [ApsaraDB for Redis (Tair)](https://www.alibabacloud.com/help/en/redis/use-cases/use-apsaradb-for-redis-to-build-a-business-system-that-can-handle-flash-sales) uses a Lua script over a hash that encodes `Total` and `Booked` per SKU; the script performs `HMGET` to read both and `HINCRBY` to increment `Booked` only if `Booked + qty <= Total`. A master-replica Tair instance is documented to sustain >100K QPS for inventory writes and a read/write-split instance >600K QPS for cached reads. The all-up Tmall platform peaked at [583K orders per second on Singles Day 2020](https://www.alibabacloud.com/blog/system-stability-assurance-for-large-scale-flash-sales_596968) — that is a fleet-wide order TPS figure, not a single Redis instance, and it is reached by sharding hot SKUs and front-loading admission control.

### Path Comparison

| Factor            | Path A (Token)              | Path B (Counter)              |
| ----------------- | --------------------------- | ----------------------------- |
| Overselling risk  | Zero                        | Low (with proper atomicity)   |
| Setup complexity  | Higher                      | Lower                         |
| Dynamic inventory | Difficult                   | Native                        |
| User expectation  | Guaranteed opportunity      | Best effort                   |
| Fairness          | Explicit (token order)      | Implicit (first to checkout)  |
| Best for          | Ticketing, limited releases | E-commerce, restockable goods |

### This Article's Focus

This article implements **Path A (Token-Based)** for the core flow because:

1. Flash sales typically have fixed, high-value inventory
2. Fairness is a differentiator (users accept waiting if fair)
3. Zero overselling is non-negotiable for most use cases

Path B implementation details are covered in the [Variations](#variations) section.

## High-Level Design

### Component Overview

| Component            | Responsibility                               | Technology               |
| -------------------- | -------------------------------------------- | ------------------------ |
| Virtual Waiting Room | Absorb traffic spike, display queue position | Static HTML on CDN       |
| Queue Service        | Manage admission, assign tokens              | Lambda + DynamoDB        |
| Inventory Service    | Atomic inventory operations                  | Redis Cluster            |
| Order Service        | Process orders asynchronously                | ECS + SQS                |
| Payment Service      | Handle payments idempotently                 | Stripe/Adyen integration |
| Notification Service | Send confirmations                           | SES + SNS                |
| Bot Detection        | Filter non-human traffic                     | WAF + Custom rules       |

### Request Flow

![Request flow — user → CDN → queue → inventory → order → payment, with async confirmation.](./diagrams/request-flow-sequence-light.svg "Request flow — user → CDN → queue → inventory → order → payment, with async confirmation.")
![Request flow — user → CDN → queue → inventory → order → payment, with async confirmation.](./diagrams/request-flow-sequence-dark.svg)

## API Design

### Queue Service APIs

#### Join Queue

```http
POST /api/v1/queue/join
Authorization: Bearer {user_token}
X-Device-Fingerprint: {fingerprint}

{
  "sale_id": "flash-sale-2024-001",
  "product_ids": ["sku-001", "sku-002"]
}
```

**Response (202 Accepted):**

```json
{
  "queue_ticket": "qt_abc123xyz",
  "position": 15234,
  "estimated_wait_seconds": 180,
  "status_url": "/api/v1/queue/status/qt_abc123xyz"
}
```

**Error responses:**

- `400 Bad Request`: Invalid sale_id or product not in flash sale
- `403 Forbidden`: Bot detected or user already in queue
- `429 Too Many Requests`: Rate limit exceeded

#### Check Queue Status

```http
GET /api/v1/queue/status/{queue_ticket}
```

**Response (200 OK):**

```json
{
  "queue_ticket": "qt_abc123xyz",
  "status": "waiting",
  "position": 8234,
  "estimated_wait_seconds": 90,
  "poll_interval_seconds": 5
}
```

**Status values:**

- `waiting`: In queue, not yet admitted
- `admitted`: Token assigned, can proceed to checkout
- `expired`: Waited too long, removed from queue
- `completed`: Purchased or abandoned checkout

#### Token Admission (Internal)

When user reaches front of queue:

```json
{
  "queue_ticket": "qt_abc123xyz",
  "status": "admitted",
  "checkout_token": "ct_xyz789abc",
  "checkout_url": "/checkout?token=ct_xyz789abc",
  "token_expires_at": "2024-03-15T10:05:00Z"
}
```

### Checkout Service APIs

#### Start Checkout Session

```http
POST /api/v1/checkout/start
Authorization: Bearer {user_token}

{
  "checkout_token": "ct_xyz789abc",
  "product_id": "sku-001",
  "quantity": 1
}
```

**Response (201 Created):**

```json
{
  "session_id": "cs_def456",
  "reserved_until": "2024-03-15T10:05:00Z",
  "product": {
    "id": "sku-001",
    "name": "Limited Edition Sneaker",
    "price": 299.0,
    "currency": "USD"
  },
  "next_step": "payment"
}
```

**Error responses:**

- `400 Bad Request`: Invalid token or product
- `409 Conflict`: Token already used
- `410 Gone`: Token expired
- `422 Unprocessable`: Inventory exhausted (token invalid)

#### Submit Order

```http
POST /api/v1/orders
Authorization: Bearer {user_token}

{
  "session_id": "cs_def456",
  "shipping_address": {
    "line1": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "US"
  },
  "payment_method_id": "pm_card_visa"
}
```

**Response (202 Accepted):**

```json
{
  "order_id": "ord_789xyz",
  "status": "processing",
  "estimated_confirmation": "< 60 seconds",
  "tracking_url": "/api/v1/orders/ord_789xyz"
}
```

**Design note:** Returns 202 (not 201) because order processing is asynchronous. The order is durably queued but not yet confirmed.

### Pagination Strategy

Queue status uses cursor-based polling, not traditional pagination:

```json
{
  "position": 1234,
  "poll_interval_seconds": 5,
  "next_poll_after": "2024-03-15T10:01:05Z"
}
```

**Rationale:** Queue position changes continuously. Polling interval increases as position improves (less uncertainty near front).

## Data Modeling

### Queue State (DynamoDB)

```
Table: FlashSaleQueue
Partition Key: sale_id
Sort Key: queue_ticket

Attributes:
- user_id: string
- position: number (GSI for ordering)
- status: enum [waiting, admitted, expired, completed]
- joined_at: ISO8601
- admitted_at: ISO8601 | null
- checkout_token: string | null
- token_expires_at: ISO8601 | null
- device_fingerprint: string
- ip_address: string
```

**GSI:** `sale_id-position-index` for efficient position lookups.

**Why DynamoDB:** Single-digit millisecond latency at any scale, automatic scaling, TTL for expired entries.

### Inventory Counter (Redis)

```redis
SET inventory:sku-001 10000

EVAL "
  local count = tonumber(redis.call('GET', KEYS[1]) or 0)
  if count >= tonumber(ARGV[1]) then
    return redis.call('DECRBY', KEYS[1], ARGV[1])
  else
    return -1
  end
" 1 inventory:sku-001 1
```

**Why Lua:** Redis runs each [`EVAL` script atomically on a single shard](https://redis.io/docs/latest/develop/programmability/eval-intro/) — no other commands interleave. Without that, two concurrent clients can both see `count = 1`, both decrement, and oversell. Naïve `WATCH/MULTI/EXEC` works but burns retries under load; a Lua script is the canonical pattern. The pattern is sometimes called **single-flight**: the cluster serialises contending writes for the same key into one in-flight execution at a time, which is exactly what an inventory counter needs.

> [!IMPORTANT]
> One product key is one Redis shard. A flash on a single SKU is a hot-key problem disguised as a counter problem. Mitigations include client-side bucketing (split `inventory:sku-001` into `inventory:sku-001:{0..15}`, decrement a random bucket, accept slightly less even depletion) and Tair-style read/write split for warm-up traffic. See the [ApsaraDB Redis hot-key guide](https://www.alibabacloud.com/help/en/redis/user-guide/identify-and-handle-large-keys-and-hotkeys/) for the production playbook. The same pattern applies on DynamoDB via [write sharding the partition key](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html); adaptive capacity will not save you above the per-item ceiling (~1,000 WCU / 3,000 RCU).

![Hot-key sharded counter — one SKU split into N sub-keys to spread writes across Redis shards.](./diagrams/sharded-hot-key-light.svg "Hot-key sharded counter — clients pick a bucket by hashing the user; reads scatter-gather to compute remaining stock.")
![Hot-key sharded counter — one SKU split into N sub-keys to spread writes across Redis shards.](./diagrams/sharded-hot-key-dark.svg)

### Token Registry (Redis)

```redis
# Token → user mapping with TTL
SETEX token:ct_xyz789abc 300 "user_123"

# Used tokens (prevent replay)
SADD used_tokens:flash-sale-2024-001 ct_xyz789abc
```

**TTL:** 5 minutes for checkout tokens. Expired tokens return to the pool.

### Order Schema (PostgreSQL)

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    sale_id VARCHAR(50) NOT NULL,
    checkout_token VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'pending',

    -- Order details
    product_id VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Shipping
    shipping_address JSONB NOT NULL,

    -- Payment
    payment_intent_id VARCHAR(100),
    payment_status VARCHAR(20),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,

    -- Idempotency
    idempotency_key VARCHAR(100) UNIQUE
);

CREATE INDEX idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_sale ON orders(sale_id, status);
CREATE INDEX idx_orders_payment ON orders(payment_intent_id);
```

**Idempotency key:** Prevents duplicate orders if user retries during network issues. Typically `{user_id}:{checkout_token}`.

### Database Selection Matrix

| Data               | Store         | Rationale                                |
| ------------------ | ------------- | ---------------------------------------- |
| Queue state        | DynamoDB      | Single-digit ms latency, auto-scale, TTL |
| Inventory counters | Redis Cluster | Sub-ms atomic operations                 |
| Tokens             | Redis         | TTL, fast lookup                         |
| Orders             | PostgreSQL    | ACID, complex queries, durability        |
| Event logs         | Kinesis → S3  | High throughput, analytics               |
| User sessions      | Redis         | Fast auth checks                         |

## Low-Level Design

### Virtual Waiting Room

The waiting room is the first line of defense. It must:

1. Absorb millions of requests without backend load
2. Provide fair queue positioning
3. Communicate progress transparently

**Architecture:**

![Waiting room architecture — static HTML on CDN polls a Lambda-backed queue service over DynamoDB.](./diagrams/waiting-room-architecture-light.svg "Waiting room architecture — static HTML on CDN polls a Lambda-backed queue service over DynamoDB.")
![Waiting room architecture — static HTML on CDN polls a Lambda-backed queue service over DynamoDB.](./diagrams/waiting-room-architecture-dark.svg)

**Static HTML design:**

```html collapse={1-10, 25-30}
<!DOCTYPE html>
<html>
  <head>
    <title>Flash Sale - Please Wait</title>
    <meta http-equiv="Cache-Control" content="no-cache" />
  </head>
  <body>
    <div id="waiting-room">
      <h1>You're in the queue</h1>

      <!-- Key UI elements -->
      <div id="position">Position: <span id="pos-number">--</span></div>
      <div id="estimate">Estimated wait: <span id="wait-time">--</span></div>
      <div id="progress-bar">
        <div id="progress-fill" style="width: 0%"></div>
      </div>

      <!-- Status messages -->
      <div id="status-message">Please keep this tab open</div>
      <div id="redirect-notice" style="display:none">Redirecting to checkout...</div>
    </div>

    <script src="/queue-client.js"></script>
  </body>
</html>
```

**Queue polling logic:**

```typescript collapse={1-8, 40-50}
// queue-client.ts
interface QueueStatus {
  status: "waiting" | "admitted" | "expired"
  position?: number
  estimated_wait_seconds?: number
  checkout_url?: string
  poll_interval_seconds: number
}

async function pollQueueStatus(ticket: string): Promise<void> {
  const response = await fetch(`/api/v1/queue/status/${ticket}`)
  const status: QueueStatus = await response.json()

  switch (status.status) {
    case "waiting":
      updateUI(status.position, status.estimated_wait_seconds)
      // Exponential backoff near front of queue
      const interval = status.poll_interval_seconds * 1000
      setTimeout(() => pollQueueStatus(ticket), interval)
      break

    case "admitted":
      showRedirectNotice()
      // Small delay for user to see the message
      setTimeout(() => {
        window.location.href = status.checkout_url
      }, 1500)
      break

    case "expired":
      showExpiredMessage()
      break
  }
}

// Start polling on page load
const ticket = new URLSearchParams(window.location.search).get("ticket")
if (ticket) {
  pollQueueStatus(ticket)
}
```

**Design decisions:**

| Decision            | Rationale                                                               |
| ------------------- | ----------------------------------------------------------------------- |
| Static HTML on CDN  | Millions of users hitting origin would saturate it; CDN absorbs at edge |
| Client-side polling | Push (WebSocket) at this scale requires massive connection management   |
| Exponential backoff | Users near front poll more frequently; reduces total requests           |
| No refresh needed   | Single-page polling prevents users from losing position by refreshing   |

### Queue Service (Token Management)

The queue service manages the FIFO queue and token assignment.

**Lambda handler:**

```typescript collapse={1-15, 60-75}
// queue-service.ts
import { DynamoDB } from "@aws-sdk/client-dynamodb"
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb"

const ddb = DynamoDBDocument.from(new DynamoDB({}))

interface QueueEntry {
  sale_id: string
  queue_ticket: string
  user_id: string
  position: number
  status: "waiting" | "admitted" | "expired" | "completed"
  checkout_token?: string
}

export async function joinQueue(
  saleId: string,
  userId: string,
  deviceFingerprint: string,
): Promise<{ ticket: string; position: number }> {
  // Check if user already in queue
  const existing = await findUserInQueue(saleId, userId)
  if (existing) {
    return { ticket: existing.queue_ticket, position: existing.position }
  }

  // Get current queue length (approximate, for position)
  const position = await getNextPosition(saleId)

  const ticket = generateTicket()

  await ddb.put({
    TableName: "FlashSaleQueue",
    Item: {
      sale_id: saleId,
      queue_ticket: ticket,
      user_id: userId,
      position: position,
      status: "waiting",
      joined_at: new Date().toISOString(),
      device_fingerprint: deviceFingerprint,
      ttl: Math.floor(Date.now() / 1000) + 3600, // 1 hour TTL
    },
    ConditionExpression: "attribute_not_exists(queue_ticket)",
  })

  return { ticket, position }
}

export async function admitNextUsers(saleId: string, count: number): Promise<void> {
  // Invoked by EventBridge at fixed rate (e.g., every second)
  // Admits 'count' users from front of queue

  const waiting = await ddb.query({
    TableName: "FlashSaleQueue",
    IndexName: "sale_id-position-index",
    KeyConditionExpression: "sale_id = :sid",
    FilterExpression: "#status = :waiting",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":sid": saleId,
      ":waiting": "waiting",
    },
    Limit: count,
    ScanIndexForward: true, // Ascending by position (FIFO)
  })

  for (const entry of waiting.Items || []) {
    await admitUser(entry as QueueEntry)
  }
}

async function admitUser(entry: QueueEntry): Promise<void> {
  const token = generateCheckoutToken()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 min

  await ddb.update({
    TableName: "FlashSaleQueue",
    Key: { sale_id: entry.sale_id, queue_ticket: entry.queue_ticket },
    UpdateExpression: "SET #status = :admitted, checkout_token = :token, token_expires_at = :exp",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":admitted": "admitted",
      ":token": token,
      ":exp": expiresAt.toISOString(),
    },
  })

  // Also store token in Redis for fast lookup during checkout
  await redis.setex(`token:${token}`, 300, entry.user_id)
}
```

**Admission rate control:**

The admission rate must match backend capacity. EventBridge triggers `admitNextUsers` every second:

```
Admission rate = min(backend_capacity, remaining_inventory / expected_checkout_time)

Example:
- Backend can handle 1000 checkouts/sec
- Remaining inventory: 5000
- Average checkout time: 60 seconds
- Admission rate: min(1000, 5000/60) = min(1000, 83) = 83 users/sec
```

**Design decisions:**

| Decision                  | Rationale                                                   |
| ------------------------- | ----------------------------------------------------------- |
| DynamoDB for queue        | Handles millions of entries with single-digit ms latency    |
| Position as GSI           | Enables efficient "next N users" query                      |
| EventBridge for admission | Decouples admission rate from user requests                 |
| Token in Redis + DynamoDB | Redis for fast checkout validation; DynamoDB for durability |

### Inventory Service (Atomic Counters)

The inventory service prevents overselling through atomic operations.

**Redis Lua script for atomic reservation:**

```lua
-- reserve_inventory.lua
-- KEYS[1] = inventory key (e.g., "inventory:sku-001")
-- KEYS[2] = reserved set key (e.g., "reserved:sku-001")
-- ARGV[1] = user_id
-- ARGV[2] = quantity
-- ARGV[3] = reservation_id
-- ARGV[4] = ttl_seconds

local inventory_key = KEYS[1]
local reserved_key = KEYS[2]
local user_id = ARGV[1]
local quantity = tonumber(ARGV[2])
local reservation_id = ARGV[3]
local ttl = tonumber(ARGV[4])

-- Check current inventory
local available = tonumber(redis.call('GET', inventory_key) or 0)

if available < quantity then
    return { err = 'insufficient_inventory', available = available }
end

-- Atomic decrement
local new_count = redis.call('DECRBY', inventory_key, quantity)

if new_count < 0 then
    -- Race condition: restore and fail
    redis.call('INCRBY', inventory_key, quantity)
    return { err = 'race_condition' }
end

-- Track reservation for expiration
redis.call('HSET', reserved_key, reservation_id,
    cjson.encode({ user_id = user_id, quantity = quantity, created_at = redis.call('TIME')[1] }))
redis.call('EXPIRE', reserved_key, ttl)

return { ok = true, remaining = new_count, reservation_id = reservation_id }
```

**Inventory service implementation:**

```typescript collapse={1-12, 50-65}
// inventory-service.ts
import Redis from "ioredis"
import { readFileSync } from "fs"

const redis = new Redis.Cluster([
  { host: "redis-1.example.com", port: 6379 },
  { host: "redis-2.example.com", port: 6379 },
  { host: "redis-3.example.com", port: 6379 },
])

const reserveScript = readFileSync("./reserve_inventory.lua", "utf-8")

interface ReservationResult {
  success: boolean
  reservation_id?: string
  remaining?: number
  error?: string
}

export async function reserveInventory(
  productId: string,
  userId: string,
  quantity: number,
  ttlSeconds: number = 300,
): Promise<ReservationResult> {
  const reservationId = `res_${Date.now()}_${userId}`

  const result = (await redis.eval(
    reserveScript,
    2, // number of keys
    `inventory:${productId}`,
    `reserved:${productId}`,
    userId,
    quantity.toString(),
    reservationId,
    ttlSeconds.toString(),
  )) as any

  if (result.err) {
    return { success: false, error: result.err }
  }

  return {
    success: true,
    reservation_id: reservationId,
    remaining: result.remaining,
  }
}

export async function releaseReservation(productId: string, reservationId: string): Promise<void> {
  // Called when checkout times out or user abandons
  const reserved = await redis.hget(`reserved:${productId}`, reservationId)
  if (reserved) {
    const { quantity } = JSON.parse(reserved)
    await redis.incrby(`inventory:${productId}`, quantity)
    await redis.hdel(`reserved:${productId}`, reservationId)
  }
}

export async function confirmReservation(productId: string, reservationId: string): Promise<void> {
  // Called after successful payment - just remove from reserved set
  await redis.hdel(`reserved:${productId}`, reservationId)
}
```

**Reservation lifecycle:**

![Reservation state machine — Available → Reserved → Confirmed, with timeout returning stock to Available.](./diagrams/reservation-state-machine-light.svg "Reservation state machine — Available → Reserved → Confirmed, with timeout returning stock to Available.")
![Reservation state machine — Available → Reserved → Confirmed, with timeout returning stock to Available.](./diagrams/reservation-state-machine-dark.svg)

**End-to-end reservation flow:**

![Inventory reservation flow — admitted user → Lua single-flight reserve → idempotent enqueue → worker confirms or releases.](./diagrams/inventory-reservation-flow-light.svg "Inventory reservation flow — the Lua reserve is single-flight; commit/release happens out-of-band on the order worker, with TTL as a safety net.")
![Inventory reservation flow — admitted user → Lua single-flight reserve → idempotent enqueue → worker confirms or releases.](./diagrams/inventory-reservation-flow-dark.svg)

**Design decisions:**

| Decision              | Rationale                                            |
| --------------------- | ---------------------------------------------------- |
| Lua script            | Atomic read-check-decrement prevents race conditions |
| Redis Cluster         | Horizontal scaling for high throughput               |
| Reservation with TTL  | Prevents inventory lock-up from abandoned checkouts  |
| Hash for reservations | O(1) lookup/delete by reservation ID                 |

### Order Processing (Async Queue)

Orders are placed on a durable queue for async processing. This decouples order receipt from processing, preventing database overwhelm.

**Order submission flow:**

```typescript collapse={1-10, 55-70}
// order-service.ts
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { v4 as uuid } from "uuid"

const sqs = new SQSClient({})
const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL!

interface OrderRequest {
  session_id: string
  user_id: string
  product_id: string
  quantity: number
  shipping_address: Address
  payment_method_id: string
}

export async function submitOrder(request: OrderRequest): Promise<{ order_id: string }> {
  const orderId = uuid()
  const idempotencyKey = `${request.user_id}:${request.session_id}`

  // Check for duplicate submission
  const existing = await db.orders.findOne({ idempotency_key: idempotencyKey })
  if (existing) {
    return { order_id: existing.id }
  }

  // Create order record in pending state
  await db.orders.insert({
    id: orderId,
    user_id: request.user_id,
    product_id: request.product_id,
    quantity: request.quantity,
    status: "pending",
    idempotency_key: idempotencyKey,
    created_at: new Date(),
  })

  // Queue for async processing
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: ORDER_QUEUE_URL,
      MessageBody: JSON.stringify({
        order_id: orderId,
        ...request,
      }),
      MessageDeduplicationId: idempotencyKey,
      MessageGroupId: request.user_id, // Ensures per-user ordering
    }),
  )

  return { order_id: orderId }
}
```

**Order processor (worker):**

```typescript collapse={1-15, 70-85}
// order-processor.ts
import { SQSEvent, SQSRecord } from "aws-lambda"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface OrderMessage {
  order_id: string
  user_id: string
  product_id: string
  quantity: number
  shipping_address: Address
  payment_method_id: string
  session_id: string
}

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    await processOrder(record)
  }
}

async function processOrder(record: SQSRecord): Promise<void> {
  const message: OrderMessage = JSON.parse(record.body)

  try {
    // 1. Verify reservation still valid
    const reservation = await getReservation(message.product_id, message.session_id)
    if (!reservation) {
      await markOrderFailed(message.order_id, "reservation_expired")
      return
    }

    // 2. Process payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculateTotal(message.product_id, message.quantity),
      currency: "usd",
      payment_method: message.payment_method_id,
      confirm: true,
      idempotency_key: `payment_${message.order_id}`,
    })

    if (paymentIntent.status !== "succeeded") {
      await releaseReservation(message.product_id, message.session_id)
      await markOrderFailed(message.order_id, "payment_failed")
      return
    }

    // 3. Confirm inventory (remove from reserved set)
    await confirmReservation(message.product_id, message.session_id)

    // 4. Update order status
    await db.orders.update(message.order_id, {
      status: "confirmed",
      payment_intent_id: paymentIntent.id,
      confirmed_at: new Date(),
    })

    // 5. Send confirmation
    await sendOrderConfirmation(message.order_id)
  } catch (error) {
    // Let SQS retry with exponential backoff
    throw error
  }
}

async function markOrderFailed(orderId: string, reason: string): Promise<void> {
  await db.orders.update(orderId, {
    status: "failed",
    failure_reason: reason,
  })

  // Notify user
  await sendOrderFailureNotification(orderId, reason)
}
```

**Dead letter queue handling:**

Orders that fail after max retries go to a Dead Letter Queue (DLQ) for manual review:

```typescript
// dlq-processor.ts
export async function handleDeadLetter(record: SQSRecord): Promise<void> {
  const message = JSON.parse(record.body)

  // Log for investigation
  console.error("Order failed permanently", {
    order_id: message.order_id,
    attempts: record.attributes.ApproximateReceiveCount,
    error: record.attributes.DeadLetterQueueSourceArn,
  })

  // Alert ops team
  await pagerduty.createIncident({
    title: `Flash sale order failed: ${message.order_id}`,
    severity: "high",
  })

  // Release inventory back to pool
  await releaseReservation(message.product_id, message.session_id)
}
```

**Design decisions:**

| Decision                    | Rationale                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SQS FIFO + high-throughput  | Exactly-once dedup (5-min window) and per-`MessageGroupId` ordering; high-throughput mode is required above ~3K msg/sec. |
| Idempotency key             | Prevents duplicate orders on retry; mirrors the [Stripe `Idempotency-Key` contract](https://stripe.com/blog/idempotency) (24h replay window of the original response). |
| Payment before confirmation | Never confirm inventory without successful payment.                                                                      |
| DLQ for failures            | Ensures no order is silently lost; the DLQ handler must release inventory, not just log.                                 |

## Bot Detection and Fairness

### Multi-Layer Bot Defense

![Bot defence — three layers: WAF / app fingerprint / queue-level duplicate and velocity checks.](./diagrams/bot-defense-layers-light.svg "Bot defence — three layers: WAF / app fingerprint / queue-level duplicate and velocity checks.")
![Bot defence — three layers: WAF / app fingerprint / queue-level duplicate and velocity checks.](./diagrams/bot-defense-layers-dark.svg)

**Layer 1: Edge defense (WAF)**

```yaml
# AWS WAF rules for flash sale
Rules:
  - Name: RateLimitPerIP
    Action: Block
    Statement:
      RateBasedStatement:
        Limit: 100 # requests per 5 minutes per IP
        AggregateKeyType: IP

  - Name: BlockKnownBots
    Action: Block
    Statement:
      IPSetReferenceStatement:
        ARN: arn:aws:wafv2:....:ipset/known-bots

  - Name: GeoRestriction
    Action: Block
    Statement:
      NotStatement:
        Statement:
          GeoMatchStatement:
            CountryCodes: [US, CA, GB, DE] # Allowed countries
```

**Layer 2: Application-level detection**

```typescript collapse={1-5, 35-45}
// bot-detection.ts
interface BotSignals {
  score: number
  signals: string[]
}

export function detectBot(request: Request): BotSignals {
  const signals: string[] = []
  let score = 0

  // Device fingerprint consistency
  const fp = request.headers.get("x-device-fingerprint")
  if (!fp || fp.length < 32) {
    signals.push("missing_fingerprint")
    score += 30
  }

  // Behavioral signals
  const timing = parseTimingHeader(request)
  if (timing.pageLoadToAction < 500) {
    // < 500ms is suspicious
    signals.push("fast_interaction")
    score += 25
  }

  // Browser consistency
  const ua = request.headers.get("user-agent")
  const acceptLang = request.headers.get("accept-language")
  if (isHeadlessBrowser(ua) || !acceptLang) {
    signals.push("headless_indicators")
    score += 40
  }

  // Known residential proxy detection
  const ip = getClientIP(request)
  if (await isResidentialProxy(ip)) {
    signals.push("residential_proxy")
    score += 20
  }

  return { score, signals }
}

export function shouldChallenge(signals: BotSignals): boolean {
  return signals.score >= 50
}

export function shouldBlock(signals: BotSignals): boolean {
  return signals.score >= 80
}
```

**Layer 3: Queue-level protection**

```typescript
// queue-protection.ts
export async function validateQueueJoin(
  userId: string,
  deviceFingerprint: string,
  saleId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Check for duplicate user
  const existingEntry = await findUserInQueue(saleId, userId)
  if (existingEntry) {
    return { allowed: false, reason: "already_in_queue" }
  }

  // Check for fingerprint reuse (same device, different accounts)
  const fpCount = await countFingerprintInQueue(saleId, deviceFingerprint)
  if (fpCount >= 2) {
    return { allowed: false, reason: "device_limit_exceeded" }
  }

  // Velocity check: how many queues has this user joined recently?
  const recentJoins = await countRecentQueueJoins(userId, 3600) // last hour
  if (recentJoins >= 5) {
    return { allowed: false, reason: "velocity_exceeded" }
  }

  return { allowed: true }
}
```

### Fairness Mechanisms

**1. FIFO queue with randomized entry window**

Users who arrive before sale start are randomized when the sale begins (prevents "refresh at exactly 10:00:00" advantage):

```typescript
export async function openSaleQueue(saleId: string): Promise<void> {
  // Get all users who arrived in pre-sale window (e.g., last 15 minutes)
  const earlyArrivals = await getEarlyArrivals(saleId)

  // Shuffle positions randomly
  const shuffled = shuffleArray(earlyArrivals)

  // Assign positions 1, 2, 3, ...
  for (let i = 0; i < shuffled.length; i++) {
    await updatePosition(shuffled[i].queue_ticket, i + 1)
  }

  // Users arriving after sale start get position = current_max + 1 (true FIFO)
}
```

**2. Per-customer purchase limits**

```typescript
export async function validatePurchaseLimit(userId: string, productId: string, quantity: number): Promise<boolean> {
  const existingOrders = await db.orders.count({
    user_id: userId,
    product_id: productId,
    status: { $in: ["confirmed", "pending"] },
  })

  const LIMIT_PER_USER = 2
  return existingOrders + quantity <= LIMIT_PER_USER
}
```

## Frontend Considerations

### Waiting Room UX

**Critical UX decisions:**

| Decision                  | Implementation                           | Rationale                                       |
| ------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Progress indicator        | Position + estimated time + progress bar | Reduces anxiety; users know they're progressing |
| No refresh needed         | SPA with polling                         | Prevents users from losing position             |
| Transparent communication | Show exact position                      | Trust requires honesty                          |
| Graceful degradation      | Static HTML                              | Must work even if JS fails                      |

**Optimistic UI for checkout:**

```typescript
// checkout-ui.ts
async function submitOrder(orderData: OrderData): Promise<void> {
  // Optimistic: show "Processing..." immediately
  setOrderStatus("processing")
  showConfirmationPreview(orderData)

  try {
    const { order_id } = await api.submitOrder(orderData)

    // Poll for confirmation (async processing)
    pollOrderStatus(order_id, (status) => {
      if (status === "confirmed") {
        setOrderStatus("confirmed")
        showSuccessAnimation()
      } else if (status === "failed") {
        setOrderStatus("failed")
        showRetryOption()
      }
    })
  } catch (error) {
    // Revert optimistic UI
    setOrderStatus("error")
    showErrorMessage(error)
  }
}
```

### Real-Time Queue Updates

**Polling vs WebSocket decision:**

| Factor         | Polling          | WebSocket                    |
| -------------- | ---------------- | ---------------------------- |
| Scale          | Easy (stateless) | Hard (connection management) |
| Latency        | 5-10s            | Sub-second                   |
| Infrastructure | Simple           | Complex                      |
| Battery impact | Higher           | Lower                        |

**Chosen: Adaptive polling** — Poll every 5s when far from front; every 1s when close.

```typescript
function calculatePollInterval(position: number, totalAhead: number): number {
  const progressPercent = 1 - position / totalAhead

  if (progressPercent > 0.9) return 1000 // Top 10%: 1s
  if (progressPercent > 0.7) return 2000 // Top 30%: 2s
  if (progressPercent > 0.5) return 3000 // Top 50%: 3s
  return 5000 // Back 50%: 5s
}
```

### Client State Management

```typescript
// flash-sale-state.ts
interface FlashSaleState {
  // Queue state
  queueTicket: string | null
  position: number | null
  status: "idle" | "queued" | "admitted" | "checkout" | "completed" | "expired"

  // Checkout state
  checkoutToken: string | null
  checkoutExpiresAt: Date | null
  reservationId: string | null

  // Order state
  orderId: string | null
  orderStatus: "pending" | "processing" | "confirmed" | "failed" | null
}

// State persisted to localStorage for tab recovery
function persistState(state: FlashSaleState): void {
  localStorage.setItem("flash-sale-state", JSON.stringify(state))
}

// Restore on page load (handles accidental tab close)
function restoreState(): FlashSaleState | null {
  const saved = localStorage.getItem("flash-sale-state")
  if (!saved) return null

  const state = JSON.parse(saved)

  // Check if checkout token is still valid
  if (state.checkoutExpiresAt && new Date(state.checkoutExpiresAt) < new Date()) {
    return null // Expired, start fresh
  }

  return state
}
```

## Infrastructure Design

### Cloud-Agnostic Components

| Component          | Purpose                     | Requirements                      |
| ------------------ | --------------------------- | --------------------------------- |
| CDN                | Waiting room, static assets | Edge caching, high throughput     |
| Serverless compute | Queue service, APIs         | Auto-scale, pay-per-use           |
| Key-value store    | Inventory counters, tokens  | Sub-ms latency, atomic operations |
| Document store     | Queue state                 | Single-digit ms, auto-scale       |
| Message queue      | Order processing            | Durability, exactly-once          |
| Relational DB      | Orders, users               | ACID, complex queries             |

### AWS Reference Architecture

![AWS reference architecture — CloudFront + WAF, Lambda + ECS, ElastiCache + DynamoDB + RDS + SQS FIFO.](./diagrams/aws-reference-architecture-light.svg "AWS reference architecture — CloudFront + WAF, Lambda + ECS, ElastiCache + DynamoDB + RDS + SQS FIFO.")
![AWS reference architecture — CloudFront + WAF, Lambda + ECS, ElastiCache + DynamoDB + RDS + SQS FIFO.](./diagrams/aws-reference-architecture-dark.svg)

**Service configuration:**

| Service     | Configuration                                | Rationale                                |
| ----------- | -------------------------------------------- | ---------------------------------------- |
| CloudFront  | Origin: S3 (static), Cache: 1 year           | Waiting room must survive origin failure |
| API Gateway | Throttling: 10K RPS, Burst: 5K               | Protects backend during spike            |
| Lambda      | Memory: 1024MB, Timeout: 30s, Reserved: 1000 | Predictable latency under load           |
| ElastiCache | Redis Cluster, 3 nodes, r6g.large            | Sub-ms latency, failover                 |
| DynamoDB    | On-demand, Auto-scaling                      | Handles unpredictable load               |
| SQS FIFO    | High-throughput mode, 14-day retention       | Order durability + per-user ordering     |
| RDS         | Multi-AZ, db.r6g.xlarge, Read replicas       | ACID + read scaling                      |

### Self-Hosted Alternatives

| Managed Service | Self-Hosted Option   | Trade-off                                 |
| --------------- | -------------------- | ----------------------------------------- |
| ElastiCache     | Redis Cluster on EC2 | More control, operational burden          |
| DynamoDB        | Cassandra/ScyllaDB   | Cost at scale, complexity                 |
| SQS FIFO        | Kafka                | Higher throughput, operational complexity |
| Lambda          | Kubernetes + KEDA    | Fine-grained control, cold starts         |

> [!NOTE]
> The first-party [AWS Virtual Waiting Room solution](https://aws.amazon.com/solutions/implementations/virtual-waiting-room-on-aws/) was retired in November 2025. New deployments should follow the SeatGeek-style reference architecture (Lambda + DynamoDB + ElastiCache) rather than the retired CloudFormation stack.

### Production analogues

The architecture above is a synthesis of several published systems. Use these as concrete anchors when a design choice feels arbitrary.

| System                                                                                                                                                  | Architecture shape                                                                                                                                                                                              | What to copy                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [SeatGeek](https://aws.amazon.com/blogs/architecture/build-a-virtual-waiting-room-with-amazon-dynamodb-and-aws-lambda-at-seatgeek/)                     | Edge gatekeeper + DynamoDB token tables + leaky-bucket admission counter; visitor token captures arrival timestamp, access token authorises the protected zone.                                                 | Two-stage tokens, leaky-bucket admission, DynamoDB Streams → Timestream for live ops dashboards.   |
| [Shopify](https://shopify.engineering/surviving-flashes-of-high-write-traffic-using-scriptable-load-balancers-part-i)                                   | "Sorting Hat" Lua module in Nginx/OpenResty routes traffic to per-shop pods; checkout throttle is a leaky bucket implemented at the edge; signed cookie exempts admitted users from re-throttling for the rest of the session.                | Edge-scriptable throttle, signed-cookie skip-the-queue, pod isolation so one viral shop can't tank neighbours. |
| [Shopify BFCM 2024-25](https://shopify.engineering/bfcm-readiness-2025)                                                                                 | Peaked at 284M req/min on the edge and 80M req/min on app servers in BFCM 2024; BFCM 2025 reached 489M req/min on the edge per Shopify's internal recap.                                                         | Plan for ≥3× your headline forecast; chaos-test with Toxiproxy and Game Days before the on-sale.   |
| [Ticketmaster Smart Queue](https://blog.ticketmaster.com/how-ticketmaster-queue-works/)                                                                 | Public waiting room opens 15-30 min before sale; queue position is randomised when the sale opens; ~10 min checkout hold once at front; aggressive bot mitigation including Verified Fan pre-registration codes. | Pre-sale randomisation window, hard checkout hold, presale invite codes for the highest-demand events. |
| [Alibaba Tmall Singles Day](https://www.alibabacloud.com/blog/system-stability-assurance-for-large-scale-flash-sales_596968)                            | Tair (Redis-compatible) for atomic inventory deduction with sharded SKUs, cell-based isolation, and traffic queuing for the hottest SKUs. Platform peaked at 583K orders/sec in 2020; Alibaba stopped publishing peak TPS after 2022.                          | Hot-SKU sharding, traffic queuing per product, cell-based capacity planning.                       |
| [Cloudflare Waiting Room](https://blog.cloudflare.com/building-waiting-room-on-workers-and-durable-objects/)                                            | Workers + Durable Objects at the edge; per-data-centre DOs aggregate to a single global DO every few seconds; admission state lives in an encrypted cookie carrying `bucketId` + `lastCheckInTime`.              | Edge-only admission with no origin polling, eventually-consistent global counters, cookie-as-token. |

## Failure modes and operational implications

Flash sales fail in predictable shapes. Plan and rehearse for each.

![Sale-day timeline — pre-warm, T0 admission, peak depletion, drain, and post-sale postmortem.](./diagrams/sale-day-timeline-light.svg "Sale-day timeline — most failures concentrate in the first five minutes after T0; the drain window is when DLQ work and reservation-release math show up.")
![Sale-day timeline — pre-warm, T0 admission, peak depletion, drain, and post-sale postmortem.](./diagrams/sale-day-timeline-dark.svg)

| Failure mode                            | Symptom                                                              | Containment                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hot key on a single SKU                 | Redis shard CPU saturates; p99 inventory check explodes              | Bucket the SKU into N sub-keys, distribute decrements; pre-cache product detail pages at the edge; fall back to "queueing for stock" UI rather than 5xx.               |
| Token gate misconfigured (admit too fast) | Backend overload behind the gate; cascading 5xx                      | Tie admission to live healthy-worker count, not a static rate. Shed traffic via a circuit breaker that returns "still in queue" rather than failed checkouts.         |
| Token gate misconfigured (admit too slow) | Conversion drops; customer support floods with "stuck in queue"      | Watch admission rate vs remaining-inventory ratio; alert when admission falls below `inventory / target_sale_duration`.                                                |
| Reservation TTL too short               | Users lose their seat mid-payment; refund and complaint volume spikes | Make reservation TTL > p99 of payment latency observed in dress rehearsal; extend TTL on user activity pings.                                                          |
| Reservation TTL too long                | Inventory looks sold out while real users abandoned silently        | Aggressive client heartbeat to release on tab close; shorter TTL with explicit "extend" call when user enters payment details.                                         |
| SQS DLQ accumulating                    | Orders silently failing; no user-facing error                        | Alert on DLQ depth > 0 during a sale; auto-page; the DLQ handler must release inventory and notify the user, not just log.                                             |
| Payment provider degraded               | Checkout latency spikes; payment confirmations time out              | Circuit-break payment calls; queue the order with a "payment retry" status; communicate honestly in the UI ("your spot is held; we'll retry payment").                 |
| Bot wave overwhelms WAF                 | Legitimate users see 429 or CAPTCHA storms                           | Pre-warm WAF rules; rate-limit per device fingerprint not just per IP; have a "raise the difficulty" lever (require 2FA, presale code, or Verified Fan) ready to flip. |
| CDN origin shield miss                  | Spike at origin for the waiting room HTML                            | Pre-warm CDN with the exact waiting-room asset; pin a long edge TTL; serve a stale-while-revalidate fallback if origin dies.                                          |

> [!CAUTION]
> Pre-rehearse the on-sale with a realistic load test. Both [Shopify Game Days](https://shopify.engineering/bfcm-readiness-2025) and Alibaba's PTS (Performance Testing Service) are public examples. A flash sale is the worst time to discover that your queue depth metric is wrong.

### Observability under spike

The metric set you actually need on the war-room dashboard is small and ratio-based. Counters lie when traffic doubles; ratios survive.

| Signal                                                | What you watch                                                          | What you do                                                                                       |
| :---------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `admission_rate / target_admission_rate`              | Drift below 0.7 for >1 min                                              | Open the gate further, or check downstream worker health (cause is almost never the queue).       |
| `reserved_inventory / total_inventory`                | Should monotonically rise; flat = workers stalled                       | Page the order-worker oncall before the user-facing dashboard catches up.                         |
| `redis.hot_key_ops / redis.cluster_ops`               | A single key crossing ~30% of cluster ops is hot                        | Flip to the sharded-key path; raise the WAF challenge difficulty.                                 |
| `queue.dlq_depth`                                     | Any non-zero during a sale = user money silently failing                | Auto-page; DLQ handler must release inventory and notify the user.                                |
| `payment.p99` and `payment.error_rate`                | Compare against the dress-rehearsal baseline, not absolute SLOs         | Trip the payment circuit breaker; shift to "your spot is held" UI rather than failing checkouts. |
| `oversell_count` (= `confirmed_orders − inventory`)   | Must be 0 by construction; alert on >0 immediately                      | This is the contract. If it ever fires, freeze the sale and reconcile manually.                   |
| `cdn.origin_shield_miss_rate` for waiting-room HTML   | Should be ~0 once warmed                                                | Re-pin the asset, raise edge TTL, serve stale-while-revalidate.                                   |

**Graceful degradation, in priority order:**

1. **Shed the cheapest thing first.** Increase poll interval, drop ornamental queue-position estimates, hide product imagery — keep the admission decision honest.
2. **Trade UX for correctness.** Show "your spot is held; we are retrying payment" rather than failing the checkout when the payment provider is degraded.
3. **Raise the friction lever.** Force CAPTCHA or re-auth when bot scores climb; require a presale code or Verified-Fan style gate when the WAF is at capacity. Communicate that you are doing this — silence is what destroys trust, not the friction.
4. **Never undo a successful inventory reserve to make the UI nicer.** Release on TTL or explicit cancel, never on a UI timeout.

## Variations

### Path B Implementation: Real-Time Counter Model

For e-commerce with dynamic inventory, replace token-based admission with real-time inventory checks:

```typescript
// real-time-inventory.ts
export async function attemptPurchase(
  productId: string,
  userId: string,
  quantity: number,
): Promise<{ success: boolean; orderId?: string }> {
  // Rate limit first (protect backend)
  const allowed = await rateLimiter.check(userId, "purchase")
  if (!allowed) {
    return { success: false }
  }

  // Atomic inventory check + decrement
  const result = await redis.eval(
    `
    local count = redis.call('GET', KEYS[1])
    if tonumber(count) >= tonumber(ARGV[1]) then
      return redis.call('DECRBY', KEYS[1], ARGV[1])
    else
      return -1
    end
  `,
    1,
    `inventory:${productId}`,
    quantity,
  )

  if (result < 0) {
    return { success: false } // Sold out
  }

  // Proceed to order (inventory already decremented)
  const orderId = await createOrder(productId, userId, quantity)
  return { success: true, orderId }
}
```

**Key difference:** Inventory decremented at purchase attempt, not at queue admission. Higher risk of "sold out after waiting" but supports dynamic restocking.

### VIP Early Access

Add priority tiers to queue service:

```typescript
// vip-queue.ts
interface QueueEntry {
  // ... existing fields
  tier: "vip" | "member" | "standard"
  tierJoinedAt: Date
}

export async function getNextPosition(saleId: string, tier: string): Promise<number> {
  // VIPs get positions 1-1000, members 1001-10000, standard 10001+
  const tierOffsets = { vip: 0, member: 1000, standard: 10000 }
  const offset = tierOffsets[tier]

  const countInTier = await ddb.query({
    TableName: "FlashSaleQueue",
    KeyConditionExpression: "sale_id = :sid",
    FilterExpression: "tier = :tier",
    ExpressionAttributeValues: { ":sid": saleId, ":tier": tier },
  })

  return offset + (countInTier.Count || 0) + 1
}
```

### Raffle-Based Allocation

For extremely limited inventory (e.g., 100 items, 1M users), replace queue with raffle:

```typescript
// raffle-mode.ts
export async function enterRaffle(saleId: string, userId: string): Promise<void> {
  // Entry window: 1 hour before draw
  await ddb.put({
    TableName: "FlashSaleRaffle",
    Item: {
      sale_id: saleId,
      user_id: userId,
      entry_id: uuid(),
      entered_at: new Date().toISOString(),
    },
  })
}

export async function drawWinners(saleId: string, count: number): Promise<string[]> {
  // Get all entries
  const entries = await getAllEntries(saleId)

  // Cryptographically random selection
  const shuffled = cryptoShuffle(entries)
  const winners = shuffled.slice(0, count)

  // Grant checkout tokens to winners
  for (const winner of winners) {
    await grantCheckoutToken(winner.user_id, saleId)
  }

  return winners.map((w) => w.user_id)
}
```

## Conclusion

Flash sale systems require coordinated defense at every layer:

1. **Traffic absorption**: CDN-hosted waiting room prevents backend overwhelm. Static HTML + client-side polling scales infinitely at the edge.

2. **Fair admission**: Token-based queue management (Path A) guarantees purchase opportunity. FIFO with randomized early arrival prevents "refresh race."

3. **Inventory accuracy**: Redis Lua scripts provide atomic check-and-decrement. Zero overselling through construction, not hope.

4. **Order durability**: Async processing via SQS decouples order receipt from processing. DLQ ensures no order is silently lost.

5. **Bot defense**: Multi-layer detection (WAF → behavioral → queue-level) raises the bar for attackers without blocking legitimate users.

**What this design optimizes for:**

- Zero overselling (100% inventory accuracy)
- Fairness (transparent queue position)
- Durability (no lost orders)
- Scalability (1M+ concurrent users)

**What it sacrifices:**

- Latency (queue wait time)
- Simplicity (multiple coordinated services)
- Dynamic inventory (pre-allocation model)

**Known limitations:**

- Token expiration requires careful tuning (too short: frustrated users; too long: wasted inventory)
- Sophisticated bots with residential proxies remain challenging
- VIP tiers can feel unfair to standard users

## Appendix

### Prerequisites

- Distributed systems fundamentals (CAP theorem, consistency models)
- Queue theory basics (FIFO, rate limiting)
- Redis data structures and Lua scripting
- Message queue patterns (at-least-once, exactly-once)
- Payment processing (idempotency, webhooks)

### Summary

- Flash sales require a **waiting room → token gate → atomic inventory → async order queue** architecture
- **CDN-hosted waiting room** absorbs traffic spikes cheaply and reliably
- **Token-based admission** (Path A) guarantees purchase opportunity and prevents overselling by construction
- **Redis Lua scripts** provide atomic inventory operations at 500K+ ops/second
- **Async order processing** via message queues decouples order receipt from fulfillment
- **Multi-layer bot defense** (WAF + behavioral + queue-level) raises attack cost without blocking legitimate users

### References

- [Alibaba Cloud: system stability for large-scale flash sales](https://www.alibabacloud.com/blog/system-stability-assurance-for-large-scale-flash-sales_596968) — Tmall Singles Day architecture and the 583K orders/sec peak.
- [Alibaba Cloud: build a flash-sale system on Tair (Redis)](https://www.alibabacloud.com/help/en/redis/use-cases/use-apsaradb-for-redis-to-build-a-business-system-that-can-handle-flash-sales) — `HMGET` + `HINCRBY` Lua pattern, instance-level QPS numbers.
- [Alibaba Cloud: identify and handle hot keys](https://www.alibabacloud.com/help/en/redis/user-guide/identify-and-handle-large-keys-and-hotkeys/) — bucketing strategies for single-shard contention.
- [SeatGeek virtual waiting room on AWS](https://aws.amazon.com/blogs/architecture/build-a-virtual-waiting-room-with-amazon-dynamodb-and-aws-lambda-at-seatgeek/) — visitor + access tokens, leaky-bucket admission, DynamoDB Streams analytics.
- [Shopify: surviving high-write flash sales with scriptable load balancers](https://shopify.engineering/surviving-flashes-of-high-write-traffic-using-scriptable-load-balancers-part-i) — edge-level checkout throttle, signed-cookie skip-the-queue.
- [Shopify: how we prepare for BFCM 2025](https://shopify.engineering/bfcm-readiness-2025) — capacity planning, Toxiproxy chaos, BFCM 2024 peak metrics.
- [Ticketmaster: how the Smart Queue works](https://blog.ticketmaster.com/how-ticketmaster-queue-works/) — randomised entry, checkout hold window, bot mitigation tiers.
- [AWS Prime Day 2024 metrics](https://aws.amazon.com/blogs/aws/how-aws-powered-prime-day-2024-for-record-breaking-sales/) — DynamoDB at 146M req/sec, CloudFront ≥500M req/min.
- [Cloudflare: building Waiting Room on Workers and Durable Objects](https://blog.cloudflare.com/building-waiting-room-on-workers-and-durable-objects/) — per-PoP DO aggregation to a global DO, cookie-bound admission, eventually-consistent counters.
- [Stripe: designing robust APIs with idempotency](https://stripe.com/blog/idempotency) — `Idempotency-Key` semantics, response replay, 24h window.
- [Stripe: scaling APIs with rate limiters](https://stripe.com/blog/rate-limiters) — token bucket on Redis; per-user vs per-API quotas.
- [AWS: SQS FIFO exactly-once processing](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html) — `MessageDeduplicationId` semantics and the 5-minute dedup window.
- [AWS: DynamoDB write sharding](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-sharding.html) — partition-key sharding strategies for hot items.
- [Redis: programmability — EVAL atomicity](https://redis.io/docs/latest/develop/programmability/eval-intro/) — script atomicity guarantees.
- [Redis: distributed lock patterns](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) — when a Lua script is not enough.
- [AWS Virtual Waiting Room solution (retired Nov 2025)](https://aws.amazon.com/solutions/implementations/virtual-waiting-room-on-aws/) — the legacy first-party reference; do not deploy new stacks of it.
- [Martin Kleppmann: Designing Data-Intensive Applications](https://dataintensive.net/) — distributed-systems fundamentals.
