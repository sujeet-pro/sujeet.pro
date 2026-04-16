---
title: Design an Issue Tracker (Jira/Linear)
description: >-
  System design for an issue tracker like Jira or Linear, covering fractional
  indexing (LexoRank) for drag-and-drop ordering, project-specific workflow
  definitions, per-column cursor pagination, and WebSocket-based real-time board sync.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-02-03T00:00:00.000Z
tags:
  - system-design
  - interview-prep
---

# Design an Issue Tracker (Jira/Linear)

A comprehensive system design for an issue tracking and project management tool covering API design for dynamic workflows, efficient kanban board pagination, drag-and-drop ordering without full row updates, concurrent edit handling, and real-time synchronization. This design addresses the challenges of project-specific column configurations while maintaining consistent user-defined ordering across views.

![High-level architecture: API gateway routing to domain services, with WebSocket-based real-time sync and Redis pub/sub for broadcast.](./diagrams/high-level-architecture-api-gateway-routing-to-domain-services-with-websocket-ba-light.svg "High-level architecture: API gateway routing to domain services, with WebSocket-based real-time sync and Redis pub/sub for broadcast.")
![High-level architecture: API gateway routing to domain services, with WebSocket-based real-time sync and Redis pub/sub for broadcast.](./diagrams/high-level-architecture-api-gateway-routing-to-domain-services-with-websocket-ba-dark.svg)

## Abstract

Issue tracking systems solve three interconnected problems: **flexible workflows** (each project defines its own statuses and transitions), **efficient ordering** (issues maintain user-defined positions without expensive reindexing), and **concurrent editing** (multiple users can update the same issue simultaneously).

**Core architectural decisions:**

| Decision           | Choice                                | Rationale                                       |
| ------------------ | ------------------------------------- | ----------------------------------------------- |
| Ordering algorithm | Fractional indexing (LexoRank)        | O(1) insertions without row updates             |
| API style          | GraphQL with REST fallback            | Flexible field selection for varied board views |
| Pagination         | Per-column cursor-based               | Ensures all columns load incrementally          |
| Concurrency        | Optimistic locking with version field | Low conflict rate in practice                   |
| Real-time sync     | WebSocket + last-write-wins           | Sub-200ms propagation, simple conflict model    |
| Workflow storage   | Polymorphic per-project               | Projects own their status definitions           |

**Key trade-offs accepted:**

- Denormalized board state in Redis for fast reads, with async consistency
- LexoRank strings grow unbounded, requiring periodic rebalancing
- Last-write-wins may lose concurrent edits (acceptable for most fields)

**What this design optimizes:**

- Drag-and-drop reordering updates exactly one row
- Board loads show issues across all columns immediately
- Workflow changes don't require schema migrations

## Requirements

### Functional Requirements

| Requirement                   | Priority | Notes                                        |
| ----------------------------- | -------- | -------------------------------------------- |
| Create/edit/delete issues     | Core     | Title, description, assignee, type, priority |
| Project-specific workflows    | Core     | Custom statuses and transitions per project  |
| Kanban board view             | Core     | Drag-drop between columns and within columns |
| Issue ordering within columns | Core     | Persist user-defined order                   |
| Real-time updates             | Core     | See changes from other users immediately     |
| Search and filter             | Core     | Full-text search, JQL-style queries          |
| Comments and activity         | Extended | Threaded comments, activity timeline         |
| Attachments                   | Extended | File upload and preview                      |
| Sprints/iterations            | Extended | Time-boxed groupings                         |
| Custom fields                 | Extended | Project-specific metadata                    |

### Non-Functional Requirements

| Requirement                | Target          | Rationale                          |
| -------------------------- | --------------- | ---------------------------------- |
| Availability               | 99.9% (3 nines) | User-facing, productivity critical |
| Board load time            | p99 < 500ms     | Must feel instant                  |
| Issue update latency       | p99 < 200ms     | Drag-drop must be responsive       |
| Real-time propagation      | p99 < 300ms     | Collaborative editing feel         |
| Search latency             | p99 < 100ms     | Autocomplete responsiveness        |
| Concurrent users per board | 100             | Team collaboration scenario        |

### Scale Estimation

**Users:**

- Total users: 10M (Jira-scale)
- Daily Active Users (DAU): 2M (20%)
- Peak concurrent users: 500K

**Projects and Issues:**

- Projects: 1M
- Issues per project (active): 1,000 avg, 100,000 max
- Total issues: 1B
- Issues per board view: 200-500 typical

**Traffic:**

- Board loads: 2M DAU × 10 loads/day = 20M/day = ~230 RPS
- Issue updates: 2M DAU × 20 updates/day = 40M/day = ~460 RPS
- Peak multiplier: 3x → 700 RPS board loads, 1,400 RPS updates

**Storage:**

- Issue size: 5KB avg (metadata + description)
- Total issue storage: 1B × 5KB = 5TB
- Attachments: 50TB (separate object storage)
- Activity log: 20TB (append-only)

## Design Paths

### Path A: Server-Authoritative with REST API

**Best when:**

- Team familiar with REST patterns
- Simpler infrastructure requirements
- Offline support not critical
- Moderate real-time requirements

**Architecture:**

![Diagram](./diagrams/diagram-1-light.svg)
![Diagram](./diagrams/diagram-1-dark.svg)

**Trade-offs:**

- ✅ Simple mental model
- ✅ Standard tooling and caching
- ✅ Easy to debug
- ❌ Over-fetching/under-fetching without careful design
- ❌ Multiple round trips for complex operations
- ❌ Real-time requires separate WebSocket layer

**Real-world example:** Jira Cloud uses REST API with LexoRank for ordering and WebSocket for real-time updates.

### Path B: Local-First with Sync Engine

**Best when:**

- Offline support is critical
- Sub-100ms UI responsiveness required
- Team can invest in sync infrastructure
- Users on unreliable networks

**Architecture:**

![Diagram](./diagrams/diagram-2-light.svg)
![Diagram](./diagrams/diagram-2-dark.svg)

**Trade-offs:**

- ✅ Instant UI response (local-first)
- ✅ Full offline support
- ✅ Minimal network traffic (deltas only)
- ❌ Complex sync logic
- ❌ Conflict resolution complexity
- ❌ Larger client-side footprint

**Real-world example:** Linear loads all issues into IndexedDB on startup, achieving 0ms search latency. Their sync engine uses last-write-wins for most fields with CRDTs for rich text descriptions.

### Path C: GraphQL with Optimistic Updates

**Best when:**

- Varied client needs (web, mobile, integrations)
- Complex data relationships
- Need flexibility without over-fetching
- Subscriptions for real-time

**Architecture:**

```graphql
mutation MoveIssue($input: MoveIssueInput!) {
  moveIssue(input: $input) {
    issue {
      id
      status {
        id
        name
      }
      rank
      updatedAt
    }
  }
}

subscription OnBoardUpdate($boardId: ID!) {
  boardUpdated(boardId: $boardId) {
    issue {
      id
      status {
        id
      }
      rank
    }
    action
  }
}
```

**Trade-offs:**

- ✅ Flexible queries for different views
- ✅ Built-in subscriptions for real-time
- ✅ Single endpoint simplifies client
- ❌ Caching more complex
- ❌ Rate limiting harder
- ❌ Learning curve for teams

**Real-world example:** Linear uses GraphQL for all API operations—the same schema powers their web app, mobile app, and public API.

### Path Comparison

| Factor                    | REST     | Local-First | GraphQL  |
| ------------------------- | -------- | ----------- | -------- |
| Implementation complexity | Low      | High        | Medium   |
| UI responsiveness         | Medium   | Excellent   | Good     |
| Offline support           | Limited  | Native      | Limited  |
| Client flexibility        | Low      | Low         | High     |
| Real-time complexity      | Separate | Built-in    | Built-in |
| Caching                   | Simple   | Complex     | Medium   |

### This Article's Focus

This article focuses on **Path C (GraphQL with REST fallback)** because:

1. Flexible field selection suits varied board configurations
2. Subscriptions provide native real-time support
3. REST endpoints can coexist for webhooks and simple integrations
4. Most modern issue trackers (Linear, Notion) use this approach

## High-Level Design

### Component Overview

![Diagram](./diagrams/diagram-3-light.svg)
![Diagram](./diagrams/diagram-3-dark.svg)

### Issue Service

Handles core issue CRUD operations and ordering.

**Responsibilities:**

- Create, read, update, delete issues
- Rank calculation for ordering
- Status transitions with workflow validation
- Optimistic locking for concurrent updates

**Key design decisions:**

| Decision    | Choice                  | Rationale                                  |
| ----------- | ----------------------- | ------------------------------------------ |
| Primary key | UUID                    | Distributed ID generation, no coordination |
| Ordering    | LexoRank string         | O(1) reordering without cascading updates  |
| Versioning  | Monotonic version field | Optimistic locking for concurrent edits    |

### Project Service

Manages project configuration including workflows.

**Responsibilities:**

- Project CRUD
- Workflow definition per project
- Status and transition management
- Board configuration (columns, filters)

**Design decision:** Each project owns its workflow definition. Statuses are project-scoped, not global. This allows teams to customize without affecting others.

### Board Service

Optimizes board view queries by maintaining denormalized state.

**Responsibilities:**

- Cache board state in Redis
- Compute issue counts per column
- Handle board-level operations (collapse column, set WIP limits)

**Why separate service:** Board queries require joining issues, statuses, and users. Denormalizing into Redis achieves sub-50ms board loads.

### Workflow Service

Enforces workflow rules and transitions.

**Responsibilities:**

- Validate status transitions
- Execute transition side effects (webhooks, automations)
- Maintain workflow history

**Transition validation flow:**

![Diagram](./diagrams/diagram-4-light.svg)
![Diagram](./diagrams/diagram-4-dark.svg)

## API Design

### GraphQL Schema (Core Types)

```graphql
type Issue {
  id: ID!
  key: String! # e.g., "PROJ-123"
  title: String!
  description: String
  status: Status!
  assignee: User
  reporter: User!
  priority: Priority!
  issueType: IssueType!
  rank: String! # LexoRank for ordering
  version: Int! # Optimistic locking
  project: Project!
  comments(first: Int, after: String): CommentConnection!
  activity(first: Int, after: String): ActivityConnection!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Status {
  id: ID!
  name: String!
  category: StatusCategory! # TODO, IN_PROGRESS, DONE
  color: String!
  position: Int! # Column order
}

type Project {
  id: ID!
  key: String!
  name: String!
  workflow: Workflow!
  statuses: [Status!]!
  issueTypes: [IssueType!]!
}

type Workflow {
  id: ID!
  name: String!
  statuses: [Status!]!
  transitions: [Transition!]!
}

type Transition {
  id: ID!
  name: String!
  fromStatus: Status
  toStatus: Status!
  conditions: [TransitionCondition!]
}

enum StatusCategory {
  TODO
  IN_PROGRESS
  DONE
}

enum Priority {
  LOWEST
  LOW
  MEDIUM
  HIGH
  HIGHEST
}
```

### Board Query with Per-Column Pagination

The key challenge: fetch issues across multiple columns where each column can have different numbers of issues.

**Naive approach (problematic):**

```graphql
# BAD: Fetches all issues, client groups by status
query {
  issues(projectId: "proj-1", first: 100) {
    nodes {
      id
      status {
        id
      }
    }
  }
}
# Problem: If 90 issues are in "To Do", other columns appear empty
```

**Per-column pagination approach:**

```graphql
type BoardColumn {
  status: Status!
  issues(first: Int!, after: String): IssueConnection!
  totalCount: Int!
}

type Board {
  id: ID!
  project: Project!
  columns: [BoardColumn!]!
}

query GetBoard($projectId: ID!, $issuesPerColumn: Int!) {
  board(projectId: $projectId) {
    columns {
      status {
        id
        name
        color
      }
      totalCount
      issues(first: $issuesPerColumn) {
        nodes {
          id
          key
          title
          assignee {
            id
            name
            avatar
          }
          priority
          rank
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
```

**Response structure:**

```json
{
  "data": {
    "board": {
      "columns": [
        {
          "status": { "id": "status-1", "name": "To Do", "color": "#grey" },
          "totalCount": 45,
          "issues": {
            "nodes": [
              /* first 20 issues */
            ],
            "pageInfo": { "hasNextPage": true, "endCursor": "cursor-abc" }
          }
        },
        {
          "status": { "id": "status-2", "name": "In Progress", "color": "#blue" },
          "totalCount": 12,
          "issues": {
            "nodes": [
              /* first 12 issues - no more pages */
            ],
            "pageInfo": { "hasNextPage": false, "endCursor": "cursor-xyz" }
          }
        },
        {
          "status": { "id": "status-3", "name": "Done", "color": "#green" },
          "totalCount": 89,
          "issues": {
            "nodes": [
              /* first 20 issues */
            ],
            "pageInfo": { "hasNextPage": true, "endCursor": "cursor-def" }
          }
        }
      ]
    }
  }
}
```

**Load more for specific column:**

```graphql
query LoadMoreIssues($statusId: ID!, $after: String!) {
  column(statusId: $statusId) {
    issues(first: 20, after: $after) {
      nodes {
        id
        key
        title
        rank
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
```

### Issue Mutations

**Move Issue (status change + reorder):**

```graphql
input MoveIssueInput {
  issueId: ID!
  toStatusId: ID!
  rankAfterId: ID # Issue to position after (null = top)
  rankBeforeId: ID # Issue to position before (null = bottom)
  version: Int! # For optimistic locking
}

type MoveIssuePayload {
  issue: Issue
  error: MoveIssueError
}

type MoveIssueError {
  code: MoveIssueErrorCode!
  message: String!
}

enum MoveIssueErrorCode {
  ISSUE_NOT_FOUND
  INVALID_TRANSITION
  VERSION_CONFLICT
  PERMISSION_DENIED
}

mutation MoveIssue($input: MoveIssueInput!) {
  moveIssue(input: $input) {
    issue {
      id
      status {
        id
        name
      }
      rank
      version
      updatedAt
    }
    error {
      code
      message
    }
  }
}
```

**Update Issue:**

```graphql
input UpdateIssueInput {
  issueId: ID!
  title: String
  description: String
  assigneeId: ID
  priority: Priority
  version: Int!
}

mutation UpdateIssue($input: UpdateIssueInput!) {
  updateIssue(input: $input) {
    issue {
      id
      title
      description
      assignee {
        id
        name
      }
      priority
      version
      updatedAt
    }
    error {
      code
      message
    }
  }
}
```

### Real-time Subscriptions

```graphql
type BoardEvent {
  issue: Issue!
  action: BoardAction!
  previousStatusId: ID # For status changes
  previousRank: String # For reorders
}

enum BoardAction {
  CREATED
  UPDATED
  MOVED
  DELETED
}

subscription OnBoardChange($projectId: ID!) {
  boardChanged(projectId: $projectId) {
    issue {
      id
      key
      title
      status {
        id
      }
      rank
      assignee {
        id
        name
      }
      version
    }
    action
    previousStatusId
  }
}
```

### REST API Fallback

For webhooks and simple integrations:

**Move Issue:**

```http
PATCH /api/v1/issues/{issueId}/move
Content-Type: application/json
If-Match: "version-5"

{
  "statusId": "status-3",
  "rankAfterId": "issue-456",
  "rankBeforeId": null
}
```

**Response:**

```http
HTTP/1.1 200 OK
ETag: "version-6"

{
  "id": "issue-123",
  "key": "PROJ-123",
  "status": { "id": "status-3", "name": "Done" },
  "rank": "0|i002bc",
  "version": 6,
  "updatedAt": "2024-02-03T10:00:00Z"
}
```

**Error Responses:**

| Code | Error                 | When                                      |
| ---- | --------------------- | ----------------------------------------- |
| 400  | `INVALID_TRANSITION`  | Workflow doesn't allow this status change |
| 404  | `NOT_FOUND`           | Issue or target status doesn't exist      |
| 409  | `VERSION_CONFLICT`    | Version mismatch (concurrent edit)        |
| 412  | `PRECONDITION_FAILED` | ETag mismatch                             |

## Data Modeling

### Core Schema (PostgreSQL)

```sql
-- Projects with embedded workflow reference
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(10) UNIQUE NOT NULL,      -- e.g., "PROJ"
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Statuses are project-scoped
CREATE TABLE statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,        -- 'todo', 'in_progress', 'done'
    color VARCHAR(7) DEFAULT '#808080',
    position INT NOT NULL,                -- Column order
    is_initial BOOLEAN DEFAULT FALSE,     -- Default for new issues
    UNIQUE (project_id, name)
);

CREATE INDEX idx_statuses_project ON statuses(project_id, position);

-- Workflow transitions define allowed status changes
CREATE TABLE workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    from_status_id UUID REFERENCES statuses(id) ON DELETE CASCADE,  -- NULL = any
    to_status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    opsbar_sequence INT DEFAULT 10,       -- UI ordering
    UNIQUE (project_id, from_status_id, to_status_id)
);

-- Issue types (Epic, Story, Task, Bug)
CREATE TABLE issue_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7),
    UNIQUE (project_id, name)
);

-- Issues with LexoRank ordering
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    issue_type_id UUID NOT NULL REFERENCES issue_types(id),
    status_id UUID NOT NULL REFERENCES statuses(id),

    -- Issue key: computed from project key + sequence
    issue_number INT NOT NULL,

    title VARCHAR(500) NOT NULL,
    description TEXT,

    assignee_id UUID REFERENCES users(id),
    reporter_id UUID NOT NULL REFERENCES users(id),

    priority VARCHAR(20) DEFAULT 'medium',

    -- LexoRank for ordering within status
    -- Format: "0|hzzzzz" (bucket | alphanumeric)
    rank VARCHAR(255) NOT NULL,

    -- Optimistic locking
    version INT DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (project_id, issue_number)
);

-- Primary query: issues by status, ordered by rank
CREATE INDEX idx_issues_board ON issues(project_id, status_id, rank);

-- Secondary: issues by assignee
CREATE INDEX idx_issues_assignee ON issues(assignee_id, updated_at DESC);

-- Issue key lookup
CREATE INDEX idx_issues_key ON issues(project_id, issue_number);

-- Comments
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_issue ON comments(issue_id, created_at);

-- Activity log (append-only)
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,     -- 'status_change', 'assignment', etc.
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_issue ON activity_log(issue_id, created_at DESC);
```

### Database Selection Rationale

| Data Type        | Store              | Rationale                              |
| ---------------- | ------------------ | -------------------------------------- |
| Issues, Projects | PostgreSQL         | ACID, complex queries, JOIN capability |
| Board cache      | Redis              | Sub-ms reads, TTL for staleness        |
| Search index     | Elasticsearch      | Full-text search, faceted filtering    |
| Activity log     | PostgreSQL → Kafka | Append-only, stream processing         |
| Attachments      | S3                 | Cost-effective blob storage            |

### Denormalized Board Cache (Redis)

**Why cache:** Board queries join issues, statuses, and users. Caching avoids expensive JOINs on every load.

**Structure:**

```redis
# Board metadata
HSET board:{project_id}:meta
    columns_json "[{\"status_id\":\"s1\",\"name\":\"To Do\"}...]"
    total_issues 156
    last_updated 1706886400000

# Per-column issue list (sorted set by rank)
ZADD board:{project_id}:column:{status_id} {rank_score} {issue_id}

# Issue card data (hash - denormalized for fast read)
HSET issue:{issue_id}:card
    key "PROJ-123"
    title "Implement login"
    status_id "status-2"
    assignee_id "user-456"
    assignee_name "Alice"
    priority "high"
    rank "0|i000ab"
    version 5
```

**Cache invalidation strategy:**

- Write-through: Update cache immediately after DB write
- TTL: 5 minutes as safety net
- Pub/Sub: Broadcast invalidation to all service instances

## Low-Level Design: LexoRank Ordering

### Why LexoRank?

Traditional integer-based ordering has a fundamental problem:

```
Before: [A:1, B:2, C:3, D:4]
Insert X between B and C:
After:  [A:1, B:2, X:3, C:4, D:5]  ← Must update C, D
```

With N items and frequent reorders, this is O(N) updates per operation.

**LexoRank solution:** Use lexicographically sortable strings where you can always find a value between any two existing values.

```
Before: [A:"aaa", B:"bbb", C:"ccc"]
Insert X between B and C:
After:  [A:"aaa", B:"bbb", X:"bbc", C:"ccc"]  ← Only X updated
```

### LexoRank Format

Jira's LexoRank uses the format: `bucket|value`

```
0|hzzzzz
│ └─ Alphanumeric value (base-36)
└── Bucket (0, 1, or 2)
```

**Bucket rotation:** Three buckets enable rebalancing without locking. While bucket 0 rebalances, new operations use bucket 1.

### Rank Calculation Algorithm

```typescript collapse={1-15}
// Simplified LexoRank implementation
const LEXORANK_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"
const BASE = LEXORANK_CHARS.length // 36

interface LexoRank {
  bucket: number
  value: string
}

function parseLexoRank(rank: string): LexoRank {
  const [bucket, value] = rank.split("|")
  return { bucket: parseInt(bucket), value }
}

function formatLexoRank(rank: LexoRank): string {
  return `${rank.bucket}|${rank.value}`
}

function getMidpoint(a: string, b: string): string {
  // Ensure same length by padding with '0's
  const maxLen = Math.max(a.length, b.length)
  const aPadded = a.padEnd(maxLen, "0")
  const bPadded = b.padEnd(maxLen, "0")

  // Convert to numbers (treating as base-36)
  let result = ""
  let carry = 0

  for (let i = maxLen - 1; i >= 0; i--) {
    const aVal = LEXORANK_CHARS.indexOf(aPadded[i])
    const bVal = LEXORANK_CHARS.indexOf(bPadded[i])
    const sum = aVal + bVal + carry
    const mid = Math.floor(sum / 2)
    carry = sum % 2
    result = LEXORANK_CHARS[mid] + result
  }

  // If a and b are adjacent, extend with midpoint
  if (result === aPadded) {
    result += LEXORANK_CHARS[Math.floor(BASE / 2)] // 'i'
  }

  return result.replace(/0+$/, "") // Trim trailing zeros
}

function calculateNewRank(before: string | null, after: string | null, bucket: number = 0): string {
  if (!before && !after) {
    // First item - use middle of range
    return formatLexoRank({ bucket, value: "i" })
  }

  if (!before) {
    // Insert at top - find value before 'after'
    const afterRank = parseLexoRank(after!)
    const newValue = getMidpoint("0", afterRank.value)
    return formatLexoRank({ bucket, value: newValue })
  }

  if (!after) {
    // Insert at bottom - find value after 'before'
    const beforeRank = parseLexoRank(before)
    const newValue = getMidpoint(beforeRank.value, "z")
    return formatLexoRank({ bucket, value: newValue })
  }

  // Insert between two items
  const beforeRank = parseLexoRank(before)
  const afterRank = parseLexoRank(after)
  const newValue = getMidpoint(beforeRank.value, afterRank.value)
  return formatLexoRank({ bucket, value: newValue })
}
```

### Rebalancing Strategy

LexoRank strings grow as items are repeatedly inserted between adjacent values:

```
Initial:  "i"
After 1:  "ii"
After 2:  "iii"
...
After 50: "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii"
```

**Jira's rebalancing thresholds:**

1. Rank length > 64 chars → Schedule rebalance within 12 hours
2. Second trigger within 12 hours → Immediate rebalance
3. Rank length > 254 chars → Disable ranking until complete

**Rebalancing algorithm:**

```typescript collapse={1-5}
async function rebalanceColumn(projectId: string, statusId: string): Promise<void> {
  // 1. Lock column for writes (or use different bucket)
  const lockKey = `rebalance:${projectId}:${statusId}`
  await redis.set(lockKey, "1", "EX", 300) // 5 min lock

  try {
    // 2. Fetch all issues ordered by current rank
    const issues = await db.query(
      `
      SELECT id, rank
      FROM issues
      WHERE project_id = $1 AND status_id = $2
      ORDER BY rank
    `,
      [projectId, statusId],
    )

    // 3. Assign evenly-spaced new ranks
    const newBucket = (parseInt(issues[0]?.rank?.split("|")[0] || "0") + 1) % 3
    const step = Math.floor(BASE / (issues.length + 1))

    const updates = issues.map((issue, index) => {
      const position = step * (index + 1)
      const newValue = position.toString(36).padStart(6, "0")
      return {
        id: issue.id,
        newRank: `${newBucket}|${newValue}`,
      }
    })

    // 4. Batch update
    await db.transaction(async (tx) => {
      for (const { id, newRank } of updates) {
        await tx.query("UPDATE issues SET rank = $1 WHERE id = $2", [newRank, id])
      }
    })

    // 5. Invalidate cache
    await invalidateBoardCache(projectId)
  } finally {
    await redis.del(lockKey)
  }
}
```

## Low-Level Design: Concurrent Edit Handling

### Optimistic Locking Flow

![Diagram](./diagrams/diagram-5-light.svg)
![Diagram](./diagrams/diagram-5-dark.svg)

### Implementation

```typescript collapse={1-20}
interface UpdateIssueInput {
  issueId: string
  title?: string
  description?: string
  assigneeId?: string
  version: number
}

interface UpdateResult {
  success: boolean
  issue?: Issue
  error?: { code: string; message: string }
}

async function updateIssue(input: UpdateIssueInput): Promise<UpdateResult> {
  const { issueId, version, ...updates } = input

  // Build dynamic UPDATE query
  const setClause = Object.entries(updates)
    .filter(([_, v]) => v !== undefined)
    .map(([k, _], i) => `${toSnakeCase(k)} = $${i + 3}`)
    .join(", ")

  const values = Object.values(updates).filter((v) => v !== undefined)

  const result = await db.query(
    `
    UPDATE issues
    SET ${setClause}, version = version + 1, updated_at = NOW()
    WHERE id = $1 AND version = $2
    RETURNING *
  `,
    [issueId, version, ...values],
  )

  if (result.rowCount === 0) {
    // Check if issue exists
    const exists = await db.query("SELECT version FROM issues WHERE id = $1", [issueId])

    if (exists.rowCount === 0) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Issue not found" },
      }
    }

    const currentVersion = exists.rows[0].version
    return {
      success: false,
      error: {
        code: "VERSION_CONFLICT",
        message: `Version mismatch. Expected ${version}, current is ${currentVersion}`,
      },
    }
  }

  // Broadcast change
  await publishBoardEvent(result.rows[0].project_id, {
    action: "UPDATED",
    issue: result.rows[0],
  })

  return { success: true, issue: result.rows[0] }
}
```

### Conflict Resolution Strategies

| Strategy              | Use Case                                | Trade-off                       |
| --------------------- | --------------------------------------- | ------------------------------- |
| **Last-Write-Wins**   | Most fields (title, assignee, priority) | May lose edits, but simple      |
| **Field-Level Merge** | Non-conflicting field updates           | More complex, preserves more    |
| **Manual Resolution** | Description (rich text)                 | Best fidelity, worst UX         |
| **CRDT**              | Concurrent rich text editing            | Complex, best for collaboration |

**Field-level merge example:**

```typescript
// Client 1 updates title (version 5 → 6)
// Client 2 updates assignee (version 5 → conflict)
// Instead of rejecting, merge if fields don't overlap

async function mergeUpdate(input: UpdateIssueInput, currentIssue: Issue): Promise<UpdateResult> {
  const { version, ...updates } = input

  // Find which fields changed since client's version
  const changedFields = await getChangedFieldsSince(input.issueId, version, currentIssue.version)

  // Check for conflicts
  const conflictingFields = Object.keys(updates).filter((f) => changedFields.includes(f))

  if (conflictingFields.length > 0) {
    return {
      success: false,
      error: {
        code: "FIELD_CONFLICT",
        message: `Conflicting fields: ${conflictingFields.join(", ")}`,
      },
    }
  }

  // No conflicts - apply update to latest version
  return updateIssue({
    ...input,
    version: currentIssue.version,
  })
}
```

### Move Operation (Status + Rank)

Moving an issue involves two atomic changes: status and rank.

```typescript collapse={1-10}
interface MoveIssueInput {
  issueId: string
  toStatusId: string
  rankAfterId?: string
  rankBeforeId?: string
  version: number
}

async function moveIssue(input: MoveIssueInput): Promise<UpdateResult> {
  const { issueId, toStatusId, rankAfterId, rankBeforeId, version } = input

  return db.transaction(async (tx) => {
    // 1. Lock and fetch current issue
    const issue = await tx.query("SELECT * FROM issues WHERE id = $1 FOR UPDATE", [issueId])

    if (!issue.rows[0]) {
      return { success: false, error: { code: "NOT_FOUND", message: "Issue not found" } }
    }

    if (issue.rows[0].version !== version) {
      return {
        success: false,
        error: { code: "VERSION_CONFLICT", message: "Concurrent modification" },
      }
    }

    const currentIssue = issue.rows[0]

    // 2. Validate transition
    const transitionValid = await validateTransition(tx, currentIssue.project_id, currentIssue.status_id, toStatusId)

    if (!transitionValid) {
      return {
        success: false,
        error: { code: "INVALID_TRANSITION", message: "Workflow does not allow this transition" },
      }
    }

    // 3. Calculate new rank
    let newRank: string

    if (rankAfterId) {
      const afterIssue = await tx.query("SELECT rank FROM issues WHERE id = $1", [rankAfterId])
      const beforeIssue = rankBeforeId ? await tx.query("SELECT rank FROM issues WHERE id = $1", [rankBeforeId]) : null

      newRank = calculateNewRank(afterIssue.rows[0]?.rank, beforeIssue?.rows[0]?.rank)
    } else if (rankBeforeId) {
      const beforeIssue = await tx.query("SELECT rank FROM issues WHERE id = $1", [rankBeforeId])
      newRank = calculateNewRank(null, beforeIssue.rows[0]?.rank)
    } else {
      // Default: bottom of column
      const lastInColumn = await tx.query(
        `
        SELECT rank FROM issues
        WHERE project_id = $1 AND status_id = $2
        ORDER BY rank DESC LIMIT 1
      `,
        [currentIssue.project_id, toStatusId],
      )

      newRank = calculateNewRank(lastInColumn.rows[0]?.rank, null)
    }

    // 4. Update issue
    const result = await tx.query(
      `
      UPDATE issues
      SET status_id = $1, rank = $2, version = version + 1, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [toStatusId, newRank, issueId],
    )

    // 5. Log activity
    await tx.query(
      `
      INSERT INTO activity_log (issue_id, user_id, action_type, old_value, new_value)
      VALUES ($1, $2, 'status_change', $3, $4)
    `,
      [
        issueId,
        getCurrentUserId(),
        JSON.stringify({ status_id: currentIssue.status_id }),
        JSON.stringify({ status_id: toStatusId }),
      ],
    )

    // 6. Broadcast (after commit)
    setImmediate(() => {
      publishBoardEvent(currentIssue.project_id, {
        action: "MOVED",
        issue: result.rows[0],
        previousStatusId: currentIssue.status_id,
      })
    })

    return { success: true, issue: result.rows[0] }
  })
}
```

## Low-Level Design: Workflow and Status Management

### Workflow Data Model

Each project has its own workflow, defined by statuses and transitions.

![Diagram](./diagrams/diagram-6-light.svg)
![Diagram](./diagrams/diagram-6-dark.svg)

### Fetching Workflow Configuration

```graphql
query GetProjectWorkflow($projectId: ID!) {
  project(id: $projectId) {
    workflow {
      statuses {
        id
        name
        category
        color
        position
      }
      transitions {
        id
        name
        fromStatus {
          id
        }
        toStatus {
          id
        }
      }
    }
  }
}
```

**Response structure:**

```json
{
  "project": {
    "workflow": {
      "statuses": [
        { "id": "s1", "name": "To Do", "category": "TODO", "color": "#808080", "position": 1 },
        { "id": "s2", "name": "In Progress", "category": "IN_PROGRESS", "color": "#0052cc", "position": 2 },
        { "id": "s3", "name": "In Review", "category": "IN_PROGRESS", "color": "#8777d9", "position": 3 },
        { "id": "s4", "name": "Done", "category": "DONE", "color": "#36b37e", "position": 4 }
      ],
      "transitions": [
        { "id": "t1", "name": "Start Progress", "fromStatus": { "id": "s1" }, "toStatus": { "id": "s2" } },
        { "id": "t2", "name": "Submit for Review", "fromStatus": { "id": "s2" }, "toStatus": { "id": "s3" } },
        { "id": "t3", "name": "Approve", "fromStatus": { "id": "s3" }, "toStatus": { "id": "s4" } },
        { "id": "t4", "name": "Reject", "fromStatus": { "id": "s3" }, "toStatus": { "id": "s2" } },
        { "id": "t5", "name": "Reopen", "fromStatus": { "id": "s4" }, "toStatus": { "id": "s1" } }
      ]
    }
  }
}
```

### Workflow Mutation API

```graphql
# Add a new status
mutation AddStatus($input: AddStatusInput!) {
  addStatus(input: $input) {
    status {
      id
      name
      category
      position
    }
  }
}

# Add a transition
mutation AddTransition($input: AddTransitionInput!) {
  addTransition(input: $input) {
    transition {
      id
      name
      fromStatus {
        id
      }
      toStatus {
        id
      }
    }
  }
}

# Reorder statuses (columns)
mutation ReorderStatuses($input: ReorderStatusesInput!) {
  reorderStatuses(input: $input) {
    statuses {
      id
      position
    }
  }
}
```

### Client-Side Workflow Validation

To provide instant feedback, clients cache workflow rules:

```typescript collapse={1-10}
interface WorkflowCache {
  statuses: Map<string, Status>
  transitions: Map<string, Set<string>> // fromStatusId → Set<toStatusId>
}

class WorkflowValidator {
  private cache: WorkflowCache

  constructor(workflow: Workflow) {
    this.cache = {
      statuses: new Map(workflow.statuses.map((s) => [s.id, s])),
      transitions: new Map(),
    }

    // Build transition map
    for (const t of workflow.transitions) {
      const fromId = t.fromStatus?.id || "*" // null = any status
      if (!this.cache.transitions.has(fromId)) {
        this.cache.transitions.set(fromId, new Set())
      }
      this.cache.transitions.get(fromId)!.add(t.toStatus.id)
    }
  }

  canTransition(fromStatusId: string, toStatusId: string): boolean {
    // Check specific transition
    if (this.cache.transitions.get(fromStatusId)?.has(toStatusId)) {
      return true
    }
    // Check wildcard (from any status)
    if (this.cache.transitions.get("*")?.has(toStatusId)) {
      return true
    }
    return false
  }

  getAvailableTransitions(fromStatusId: string): Status[] {
    const specific = this.cache.transitions.get(fromStatusId) || new Set()
    const wildcard = this.cache.transitions.get("*") || new Set()
    const available = new Set([...specific, ...wildcard])

    return Array.from(available)
      .map((id) => this.cache.statuses.get(id)!)
      .filter(Boolean)
  }
}
```

## Frontend Considerations

### Board State Management

**Normalized data structure:**

```typescript
interface BoardState {
  // Entities by ID
  issues: Record<string, Issue>
  statuses: Record<string, Status>
  users: Record<string, User>

  // Ordering
  columnOrder: string[] // Status IDs in display order
  issueOrder: Record<string, string[]> // statusId → issueIds in rank order

  // Pagination
  columnCursors: Record<string, string | null>
  columnHasMore: Record<string, boolean>

  // UI state
  draggingIssueId: string | null
  dropTargetColumn: string | null
  dropTargetIndex: number | null
}
```

**Why normalized:**

- Moving an issue updates two arrays, not nested objects
- React reference equality works for memoization
- Easier to apply real-time updates

### Optimistic Updates for Drag-and-Drop

```typescript collapse={1-20}
function useMoveIssue() {
  const [boardState, setBoardState] = useState<BoardState>(initialState)
  const pendingMoves = useRef<Map<string, { previousState: BoardState }>>(new Map())

  const moveIssue = async (issueId: string, toStatusId: string, toIndex: number) => {
    const issue = boardState.issues[issueId]
    const fromStatusId = issue.statusId

    // 1. Save previous state for rollback
    const previousState = structuredClone(boardState)
    pendingMoves.current.set(issueId, { previousState })

    // 2. Optimistic update
    setBoardState((state) => {
      const newState = { ...state }

      // Remove from old column
      newState.issueOrder = {
        ...state.issueOrder,
        [fromStatusId]: state.issueOrder[fromStatusId].filter((id) => id !== issueId),
      }

      // Add to new column at index
      const newColumnOrder = [...(state.issueOrder[toStatusId] || [])]
      newColumnOrder.splice(toIndex, 0, issueId)
      newState.issueOrder[toStatusId] = newColumnOrder

      // Update issue status
      newState.issues = {
        ...state.issues,
        [issueId]: { ...issue, statusId: toStatusId },
      }

      return newState
    })

    // 3. Server request
    const rankAfterId = toIndex > 0 ? boardState.issueOrder[toStatusId]?.[toIndex - 1] : null
    const rankBeforeId = boardState.issueOrder[toStatusId]?.[toIndex] || null

    try {
      const result = await api.moveIssue({
        issueId,
        toStatusId,
        rankAfterId,
        rankBeforeId,
        version: issue.version,
      })

      if (!result.success) {
        throw new Error(result.error?.message || "Move failed")
      }

      // 4. Update with server-assigned rank and version
      setBoardState((state) => ({
        ...state,
        issues: {
          ...state.issues,
          [issueId]: { ...state.issues[issueId], ...result.issue },
        },
      }))

      pendingMoves.current.delete(issueId)
    } catch (error) {
      // 5. Rollback on failure
      const pending = pendingMoves.current.get(issueId)
      if (pending) {
        setBoardState(pending.previousState)
        pendingMoves.current.delete(issueId)
      }
      toast.error("Failed to move issue. Please try again.")
    }
  }

  return { boardState, moveIssue }
}
```

### Real-time Update Handling

```typescript collapse={1-15}
function useBoardSubscription(projectId: string) {
  const [boardState, setBoardState] = useState<BoardState>(initialState)

  useEffect(() => {
    const subscription = graphqlClient
      .subscribe({
        query: BOARD_CHANGED_SUBSCRIPTION,
        variables: { projectId },
      })
      .subscribe({
        next: ({ data }) => {
          const event = data.boardChanged

          setBoardState((state) => {
            // Skip if this is our own optimistic update
            if (pendingMoves.current.has(event.issue.id)) {
              return state
            }

            switch (event.action) {
              case "MOVED":
                return handleRemoteMove(state, event)
              case "UPDATED":
                return handleRemoteUpdate(state, event)
              case "CREATED":
                return handleRemoteCreate(state, event)
              case "DELETED":
                return handleRemoteDelete(state, event)
              default:
                return state
            }
          })
        },
      })

    return () => subscription.unsubscribe()
  }, [projectId])

  return boardState
}

function handleRemoteMove(state: BoardState, event: BoardEvent): BoardState {
  const { issue, previousStatusId } = event
  const newState = { ...state }

  // Remove from previous column
  if (previousStatusId && state.issueOrder[previousStatusId]) {
    newState.issueOrder = {
      ...state.issueOrder,
      [previousStatusId]: state.issueOrder[previousStatusId].filter((id) => id !== issue.id),
    }
  }

  // Add to new column in correct position based on rank
  const currentColumnOrder = state.issueOrder[issue.statusId] || []
  const insertIndex = findInsertIndex(currentColumnOrder, issue.rank, state.issues)

  const newColumnOrder = [...currentColumnOrder]
  newColumnOrder.splice(insertIndex, 0, issue.id)
  newState.issueOrder[issue.statusId] = newColumnOrder

  // Update issue data
  newState.issues = {
    ...state.issues,
    [issue.id]: issue,
  }

  return newState
}
```

### Column Virtualization

For boards with many issues per column, virtualize the issue list:

```typescript collapse={1-10}
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedColumn({
  statusId,
  issueIds
}: {
  statusId: string;
  issueIds: string[]
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: issueIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated card height
    overscan: 5             // Render 5 extra items for smooth scrolling
  });

  return (
    <div ref={parentRef} className="column-scroll-container">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <IssueCard issueId={issueIds[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Infrastructure

### Cloud-Agnostic Components

| Component      | Purpose               | Options                               |
| -------------- | --------------------- | ------------------------------------- |
| API Gateway    | Request routing, auth | Kong, Nginx, Traefik                  |
| GraphQL Server | Query execution       | Apollo Server, Mercurius              |
| Message Queue  | Event streaming       | Kafka, RabbitMQ, NATS                 |
| Cache          | Board state, sessions | Redis, Memcached, KeyDB               |
| Search         | Full-text search      | Elasticsearch, Meilisearch, Typesense |
| Object Storage | Attachments           | MinIO, Ceph, S3-compatible            |
| Database       | Primary store         | PostgreSQL, CockroachDB               |

### AWS Reference Architecture

![Diagram](./diagrams/diagram-7-light.svg)
![Diagram](./diagrams/diagram-7-dark.svg)

**Service configurations:**

| Service             | Configuration          | Rationale                              |
| ------------------- | ---------------------- | -------------------------------------- |
| GraphQL (Fargate)   | 2 vCPU, 4GB RAM        | Stateless, scale on request rate       |
| WebSocket (Fargate) | 2 vCPU, 4GB RAM        | Connection-bound, ~10K per instance    |
| Workers (Spot)      | 1 vCPU, 2GB RAM        | Cost optimization for async            |
| RDS PostgreSQL      | db.r6g.xlarge Multi-AZ | Primary store, read replicas for scale |
| ElastiCache         | r6g.large cluster      | Board cache, pub/sub                   |
| OpenSearch          | m6g.large.search × 3   | Search index, 3 nodes for HA           |

### Scaling Considerations

**Read-heavy workload:**

- Read replicas for PostgreSQL
- Redis caching for board state
- CDN for static assets

**WebSocket connections:**

- Sticky sessions to WebSocket servers
- Redis pub/sub for cross-instance broadcast
- ~10K connections per 4GB instance

**Search indexing:**

- Async indexing via Kafka
- Dedicated OpenSearch domain
- Index aliases for zero-downtime reindexing

## Conclusion

This design provides a flexible issue tracking system with:

1. **O(1) reordering** via LexoRank eliminates cascading updates
2. **Per-column pagination** ensures all columns load incrementally
3. **Optimistic locking** handles concurrent edits with minimal conflict
4. **Project-scoped workflows** allow team customization without global impact
5. **Real-time sync** via GraphQL subscriptions provides sub-300ms propagation

**Key architectural decisions:**

- LexoRank for ordering trades storage (growing strings) for write efficiency
- Per-column pagination over global pagination ensures balanced board views
- Last-write-wins is acceptable for most fields; CRDTs reserved for rich text
- Denormalized Redis cache trades consistency for read performance

**Known limitations:**

- LexoRank requires periodic rebalancing (background job)
- Last-write-wins may lose concurrent edits on same field
- Large boards (>1000 issues) need virtualization

**Future enhancements:**

- Local-first architecture for offline support (Linear-style sync engine)
- Field-level CRDTs for conflict-free concurrent editing
- GraphQL federation for microservices decomposition

## Appendix

### Prerequisites

- Distributed systems fundamentals (eventual consistency, optimistic locking)
- GraphQL basics (queries, mutations, subscriptions)
- React state management patterns
- SQL and database design

### Terminology

| Term                        | Definition                                                               |
| --------------------------- | ------------------------------------------------------------------------ |
| **LexoRank**                | Lexicographically sortable string for ordering without cascading updates |
| **Optimistic locking**      | Concurrency control using version numbers to detect conflicts            |
| **Workflow**                | Set of statuses and allowed transitions between them                     |
| **Fractional indexing**     | Using real numbers (or strings) for ordering with O(1) insertions        |
| **Cursor-based pagination** | Using opaque cursors instead of offsets for stable pagination            |
| **Last-write-wins (LWW)**   | Conflict resolution where the latest timestamp wins                      |

### Summary

- **LexoRank ordering** enables O(1) drag-and-drop without updating other rows
- **Per-column pagination** with cursor-based approach ensures balanced board loading
- **Optimistic locking** with version field detects concurrent modifications
- **Project-scoped workflows** allow custom statuses without schema changes
- **GraphQL subscriptions** provide real-time updates with sub-300ms propagation
- **Denormalized Redis cache** trades consistency for fast board reads

### References

**Issue Tracker APIs:**

- [Jira Software Cloud REST API](https://developer.atlassian.com/cloud/jira/software/rest/intro/) - Board and agile endpoints
- [Jira Cloud Platform REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) - Issue and workflow endpoints
- [Linear Developers - GraphQL API](https://linear.app/developers/graphql) - GraphQL schema and patterns
- [Asana Developers](https://developers.asana.com/reference/) - Task and section ordering

**Ordering Algorithms:**

- [Figma Blog - Realtime Editing of Ordered Sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/) - Fractional indexing at scale
- [Understanding LexoRank](https://support.atlassian.com/jira/kb/understanding-and-managing-lexorank-in-jira-server/) - Jira's ranking system
- [LexoRank Explained](https://tmcalm.nl/blog/lexorank-jira-ranking-system-explained/) - Detailed algorithm walkthrough
- [rocicorp/fractional-indexing](https://github.com/rocicorp/fractional-indexing) - Reference implementation

**Sync and Real-time:**

- [Scaling the Linear Sync Engine](https://linear.app/now/scaling-the-linear-sync-engine) - Local-first architecture
- [Reverse Engineering Linear's Sync Engine](https://github.com/wzhudev/reverse-linear-sync-engine) - Technical deep-dive
- [Conflict-free Replicated Data Types](https://crdt.tech/) - CRDT resources

**System Design:**

- [Optimistic Concurrency Control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control) - Concurrency patterns
- [Cursor-based Pagination](https://relay.dev/graphql/connections.htm) - Relay connection specification
