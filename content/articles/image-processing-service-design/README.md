---
title: 'Image Processing Service Design: CDN, Transforms, and APIs'
linkTitle: 'Image Processing'
description: >-
  Architecture for a cloud-agnostic, multi-tenant image processing platform
  with on-the-fly transforms, content-addressed caching, signed URLs, and a
  CDN-first delivery strategy achieving sub-second response times.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-02-03T00:00:00.000Z
tags:
  - media
  - testing
  - platform-engineering
---

# Image Processing Service Design: CDN, Transforms, and APIs

This document presents the architectural design for a cloud-agnostic, multi-tenant image processing platform that provides on-the-fly transformations with enterprise-grade security, performance, and cost optimization. The platform supports hierarchical multi-tenancy (Organization → Tenant → Space), public and private image delivery, and deployment across AWS, GCP, Azure, or on-premise infrastructure. Key capabilities include deterministic transformation caching to ensure sub-second delivery, HMAC-SHA256 signed URLs for secure private access, CDN (Content Delivery Network) integration for global edge caching, and a "transform-once-serve-forever" approach that minimizes processing costs while guaranteeing HTTP 200 responses even for first-time transformation requests.

![High-level architecture: Clients request images through CDN, with cache misses handled by the Image Gateway which orchestrates transformation, caching, and storage](./diagrams/high-level-architecture-clients-request-images-through-cdn-with-cache-misses-han-light.svg "High-level architecture: Clients request images through CDN, with cache misses handled by the Image Gateway which orchestrates transformation, caching, and storage")
![High-level architecture: Clients request images through CDN, with cache misses handled by the Image Gateway which orchestrates transformation, caching, and storage](./diagrams/high-level-architecture-clients-request-images-through-cdn-with-cache-misses-han-dark.svg)

## Abstract

Image processing at scale requires balancing three competing concerns: **latency** (users expect sub-second delivery), **cost** (processing and storage grow with traffic), and **correctness** (transformations must be deterministic and secure). This architecture resolves these tensions through a layered caching strategy with content-addressed storage.

![Multi-layer caching eliminates 99.9% of redundant processing—only the first request for each unique transformation hits the Transform Engine.](./diagrams/multi-layer-caching-eliminates-99-9-of-redundant-processing-only-the-first-reque-light.svg "Multi-layer caching eliminates 99.9% of redundant processing—only the first request for each unique transformation hits the Transform Engine.")
![Multi-layer caching eliminates 99.9% of redundant processing—only the first request for each unique transformation hits the Transform Engine.](./diagrams/multi-layer-caching-eliminates-99-9-of-redundant-processing-only-the-first-reque-dark.svg)

**Core mental model:**

1. **Content-addressed storage**: Hash(original + operations) → unique derived asset. Same inputs always produce the same output, enabling infinite caching.
2. **Synchronous-first with async fallback**: Transform inline for < 5MB images (< 800ms). Queue larger images but return 202 with polling URL.
3. **Efficiency locks, not safety locks**: Redlock prevents duplicate processing but doesn't guarantee mutual exclusion. If two transforms race, both succeed—we just store one.
4. **Hierarchical policies**: Organization → Tenant → Space inheritance. Override at any level. Enforce at every layer (API, database, CDN).

**Technology selection rationale:**

| Component        | Choice                | Why                                                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| Image processor  | Sharp 0.34+ (libvips) | 26x faster than jimp, 4-5x faster than ImageMagick, ~50MB memory per worker               |
| Distributed lock | Redlock               | Sufficient for efficiency (not correctness); simpler than etcd/ZooKeeper                  |
| Formats          | AVIF → WebP → JPEG    | AVIF: 94.89% browser support, 50% smaller than JPEG. WebP: 95.93% support, 25-34% savings |
| Database         | PostgreSQL + JSONB    | Row-level security, flexible policy storage, proven at scale                              |

## System Overview

### Core Capabilities

1. **Multi-Tenancy Hierarchy**
   - **Organization**: Top-level tenant boundary
   - **Tenant**: Logical partition within organization (brands, environments)
   - **Space**: Project workspace containing assets

2. **Image Access Models**
   - **Public Images**: Direct URL access with CDN caching
   - **Private Images**: Cryptographically signed URLs with expiration

3. **On-the-Fly Processing**
   - Real-time transformations (resize, crop, format, quality, effects)
   - Named presets for common transformation patterns
   - Automatic format optimization (WebP, AVIF)
   - **Guaranteed 200 response** even on first transform request

4. **Cloud-Agnostic Design**
   - Deployment to AWS, GCP, Azure, or on-premise
   - Storage abstraction layer for portability
   - Kubernetes-based orchestration

5. **Performance & Cost Optimization**
   - Multi-layer caching (CDN → Redis → Database → Storage)
   - Transform deduplication with content-addressed storage
   - Lazy preset generation
   - Storage lifecycle management

---

## Component Naming

### Core Services

| Component         | Name                        | Purpose                              |
| ----------------- | --------------------------- | ------------------------------------ |
| Entry point       | **Image Gateway**           | API gateway, routing, authentication |
| Transform service | **Transform Engine**        | On-demand image processing           |
| Upload handler    | **Asset Ingestion Service** | Image upload and validation          |
| Admin API         | **Control Plane API**       | Tenant management, configuration     |
| Background jobs   | **Transform Workers**       | Async preset generation              |
| Metadata store    | **Registry Service**        | Asset and transformation metadata    |
| Storage layer     | **Object Store Adapter**    | Cloud-agnostic storage interface     |
| CDN layer         | **Edge Cache**              | Global content delivery              |
| URL signing       | **Signature Service**       | Private URL cryptographic signing    |

### Data Entities

| Entity            | Name              | Description                      |
| ----------------- | ----------------- | -------------------------------- |
| Uploaded file     | **Asset**         | Original uploaded image          |
| Processed variant | **Derived Asset** | Transformed image                |
| Named transform   | **Preset**        | Reusable transformation template |
| Transform result  | **Variant**       | Cached transformation output     |

---

## Architecture Principles

### 1. Cloud Portability First

- **Storage Abstraction**: Unified interface for S3, GCS, Azure Blob, MinIO
- **Queue Abstraction**: Support for SQS, Pub/Sub, Service Bus, RabbitMQ
- **Kubernetes Native**: Deploy consistently across clouds
- **No Vendor Lock-in**: Use open standards where possible

### 2. Performance SLA

- **Edge Hit**: < 50ms (CDN cache)
- **Origin Hit**: < 200ms (application cache)
- **First Transform**: < 800ms (sync processing for images < 5MB)
- **Always Return 200**: Never return 202 or redirect

### 3. Transform Once, Serve Forever

- Content-addressed transformation storage
- Idempotent processing with distributed locking
- Permanent caching with invalidation API
- Deduplication across requests

### 4. Security by Default

- Signed URLs for private content
- Row-level tenancy isolation
- Encryption at rest and in transit
- Comprehensive audit logging

### 5. Cost Optimization

- Multi-layer caching to reduce processing
- Storage lifecycle automation
- Format optimization (WebP/AVIF)
- Rate limiting and resource quotas

---

## Technology Stack

### Core Technologies

#### Image Processing Library

| Technology          | Pros                                                     | Cons                       | Recommendation             |
| ------------------- | -------------------------------------------------------- | -------------------------- | -------------------------- |
| **Sharp (libvips)** | 26x faster than jimp, low memory (~50MB), modern formats | Linux-focused build        | ✅ **Recommended**         |
| ImageMagick         | Feature-rich, mature                                     | 4-5x slower than Sharp     | Use for complex operations |
| Jimp                | Pure JavaScript, portable                                | Very slow, limited formats | Development only           |

**Choice**: **Sharp 0.34+** (latest: 0.34.5, November 2025) with libvips 8.18 for primary processing.

**Why Sharp over alternatives:**

- **Performance**: 64.42 ops/sec for JPEG processing on x64, 49.20 ops/sec on ARM64 (benchmarked without libvips caching; production performance higher)
- **Memory efficiency**: Uses streaming and memory-mapped I/O; set `MALLOC_ARENA_MAX="2"` on Linux to reduce glibc fragmentation
- **Modern format support**: AVIF, WebP, and as of libvips 8.18: UltraHDR (for HDR displays), Camera RAW via libraw, Oklab colorspace (CSS4-standard, faster than CIELAB)

**libvips 8.18 (December 2025) notable additions:**

- **UltraHDR**: Single image file displays optimally on both SDR and HDR screens via Google's libultrahdr
- **Camera RAW**: 28% faster and 40% less memory than ImageMagick when resizing CR2/NEF files
- **BigTIFF output**: Support for TIFF files > 4GB

```bash
npm install sharp
```

#### Caching Layer

| Technology | Use Case                 | Pros                      | Cons                               | Recommendation       |
| ---------- | ------------------------ | ------------------------- | ---------------------------------- | -------------------- |
| **Redis**  | Application cache, locks | Fast, pub/sub, clustering | Memory cost                        | ✅ **Primary cache** |
| Memcached  | Simple KV cache          | Faster for simple gets    | No persistence, limited data types | Skip                 |
| Hazelcast  | Distributed cache        | Java ecosystem, compute   | Complexity                         | Skip for Node.js     |

**Choice**: **Redis** (6+ with Redis Cluster for HA)

```bash
npm install ioredis
```

#### Storage Clients

| Provider             | Library                 | Notes           |
| -------------------- | ----------------------- | --------------- |
| AWS S3               | `@aws-sdk/client-s3`    | Official v3 SDK |
| Google Cloud Storage | `@google-cloud/storage` | Official SDK    |
| Azure Blob           | `@azure/storage-blob`   | Official SDK    |
| MinIO (on-prem)      | `minio` or S3 SDK       | S3-compatible   |

```bash
npm install @aws-sdk/client-s3 @google-cloud/storage @azure/storage-blob minio
```

#### Message Queue

| Provider          | Library                | Use Case                |
| ----------------- | ---------------------- | ----------------------- |
| AWS SQS           | `@aws-sdk/client-sqs`  | AWS deployments         |
| GCP Pub/Sub       | `@google-cloud/pubsub` | GCP deployments         |
| Azure Service Bus | `@azure/service-bus`   | Azure deployments       |
| RabbitMQ          | `amqplib`              | On-premise, multi-cloud |

**Choice**: Provider-specific for cloud, **RabbitMQ** for on-premise

```bash
npm install amqplib
```

#### Web Framework

| Framework   | Pros                                   | Cons                   | Recommendation     |
| ----------- | -------------------------------------- | ---------------------- | ------------------ |
| **Fastify** | Fast, low overhead, TypeScript support | Less mature ecosystem  | ✅ **Recommended** |
| Express     | Mature, large ecosystem                | Slower, callback-based | Acceptable         |
| Koa         | Modern, async/await                    | Smaller ecosystem      | Acceptable         |

**Choice**: **Fastify** for performance

```bash
npm install fastify @fastify/multipart @fastify/cors
```

#### Database

| Technology     | Pros                                 | Cons                 | Recommendation     |
| -------------- | ------------------------------------ | -------------------- | ------------------ |
| **PostgreSQL** | JSONB, full-text search, reliability | Complex clustering   | ✅ **Recommended** |
| MySQL          | Mature, simple                       | Limited JSON support | Acceptable         |
| MongoDB        | Flexible schema                      | Tenancy complexity   | Not recommended    |

**Choice**: **PostgreSQL 15+** with JSONB for policies

```bash
npm install pg
```

#### URL Signing

| Library                    | Algorithm      | Recommendation     |
| -------------------------- | -------------- | ------------------ |
| **Node crypto (built-in)** | HMAC-SHA256    | ✅ **Recommended** |
| `jsonwebtoken`             | JWT (HMAC/RSA) | Use for JWT tokens |
| `tweetnacl`                | Ed25519        | Use for EdDSA      |

**Choice**: **Built-in crypto module** for HMAC-SHA256 signatures

```javascript
import crypto from "crypto"
```

#### Distributed Locking

| Technology          | Pros                         | Cons                               | Recommendation         |
| ------------------- | ---------------------------- | ---------------------------------- | ---------------------- |
| **Redlock (Redis)** | Simple, Redis-based          | No fencing tokens, clock skew risk | ✅ For efficiency only |
| etcd                | Linearizable, fencing tokens | Separate service, higher latency   | Safety-critical use    |
| ZooKeeper           | Strong consistency, mature   | Complex operations, JVM dependency | Safety-critical use    |
| Database locks      | Simple, transactional        | Contention, less scalable          | Development only       |

**Choice**: **Redlock** with Redis for transform deduplication (efficiency), **not** for safety-critical mutual exclusion.

**Why Redlock is sufficient here:**

The image service uses locks to prevent duplicate work, not to prevent data corruption. If two workers race past the lock:

1. Both fetch the original image
2. Both apply the same transformation (deterministic)
3. Both attempt to store the result
4. One wins (upsert semantics), the other's write is a no-op

This is inefficient (wasted compute) but not incorrect. The content-addressed storage ensures idempotency.

**Why Redlock is insufficient for safety-critical scenarios** (per [Martin Kleppmann's analysis](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)):

1. **No fencing tokens**: Cannot generate monotonically increasing tokens to detect stale lock holders after process pauses/GC stops
2. **Timing assumptions**: Depends on bounded network delays and clock accuracy that frequently break in practice
3. **Clock vulnerabilities**: Uses `gettimeofday()` (not monotonic); NTP adjustments can cause time jumps

**Redis's current recommendation** (from [official docs](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)): Use N=5 Redis masters with majority voting, implement fencing tokens separately if correctness matters, monitor clock drift.

```bash
npm install redlock
```

---

## High-Level Architecture

### System Diagram

![Diagram](./diagrams/diagram-1-light.svg)
![Diagram](./diagrams/diagram-1-dark.svg)

### Request Flow: Public Image

![Diagram](./diagrams/diagram-2-light.svg)
![Diagram](./diagrams/diagram-2-dark.svg)

### Request Flow: Private Image

![Diagram](./diagrams/diagram-3-light.svg)
![Diagram](./diagrams/diagram-3-dark.svg)

### Edge Authentication Patterns

Modern CDNs support signature validation at the edge, eliminating origin round-trips for private content. This section covers three deployment patterns with different security/complexity tradeoffs.

**Pattern 1: Origin-based validation (simplest)**

All requests hit the origin, which validates signatures. The CDN caches responses keyed by the full URL including signature parameters.

- **Pros**: Simple deployment, no edge configuration
- **Cons**: Every unique signed URL generates a cache miss, origin must handle all validation
- **When to use**: Low traffic, simple deployments, or when CDN doesn't support edge compute

**Pattern 2: Edge signature validation with normalized cache keys**

The edge validates the signature, then strips signature parameters before checking the cache. This allows multiple signed URLs for the same content to share a single cache entry.

```javascript title="cloudflare-worker-auth.js" collapse={1-5, 25-40}
// Cloudflare Worker for edge signature validation
// Workers run on V8 isolates: ~1/10th memory of Node.js, <5ms cold start

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Extract and validate signature
    const sig = url.searchParams.get("sig")
    const exp = url.searchParams.get("exp")
    const kid = url.searchParams.get("kid")

    if (!sig || !exp || !kid) {
      return new Response("Missing signature", { status: 401 })
    }

    // Check expiration
    if (Date.now() / 1000 > parseInt(exp)) {
      return new Response("Signature expired", { status: 401 })
    }

    // Validate HMAC (key fetched from Workers KV or secrets)
    const key = await env.SIGNING_KEYS.get(kid)
    if (!key) {
      return new Response("Invalid key", { status: 401 })
    }

    // Reconstruct canonical string and verify
    const canonical = createCanonicalString(url.pathname, exp, url.hostname)
    const expected = await computeHmac(key, canonical)

    if (!timingSafeEqual(sig, expected)) {
      return new Response("Invalid signature", { status: 401 })
    }

    // Strip signature params for cache key normalization
    url.searchParams.delete("sig")
    url.searchParams.delete("exp")
    url.searchParams.delete("kid")

    // Fetch from origin/cache with normalized URL
    return fetch(url.toString(), {
      cf: { cacheKey: url.toString() }, // Normalized cache key
    })
  },
}
```

- **Pros**: High cache efficiency, reduced origin load, sub-5ms auth latency
- **Cons**: Requires edge compute (CloudFlare Workers, CloudFront Functions, Fastly Compute)
- **When to use**: High-traffic private content, latency-sensitive applications

**Pattern 3: JWT tokens with edge validation**

Use JWT (JSON Web Token) instead of HMAC signatures. The edge can decode and validate JWTs without origin contact, and the token can carry claims (user ID, tenant ID, allowed operations).

- **Pros**: Self-contained tokens with embedded claims, standard format
- **Cons**: Larger URLs, no revocation without short expiry or edge-stored blocklist
- **When to use**: When tokens need to carry user context, or when integrating with existing JWT infrastructure

**CDN-specific implementation notes:**

| CDN        | Edge Auth Capability                               | Cache Key Normalization        |
| ---------- | -------------------------------------------------- | ------------------------------ |
| CloudFlare | Workers (full JS), Rules (limited)                 | `cf.cacheKey` in Workers       |
| CloudFront | Functions (limited JS), Lambda@Edge (full Node.js) | `cache-policy` with query keys |
| Fastly     | Compute@Edge (Rust/JS/Go), VCL                     | `req.hash` manipulation in VCL |
| Akamai     | EdgeWorkers (JS), Property Manager                 | Cache ID modification          |

---

## Data Models

### Database Schema

```sql title="schema.sql" collapse={1-30, 110-140, 175-210}
-- Organizations (Top-level tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- Tenants (Optional subdivision within org)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,

    UNIQUE(organization_id, slug)
);

-- Spaces (Projects within tenant)
CREATE TABLE spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Default policies (inherit from tenant/org if NULL)
    default_access VARCHAR(20) DEFAULT 'private', -- 'public' or 'private'

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,

    UNIQUE(tenant_id, slug),
    CONSTRAINT valid_access CHECK (default_access IN ('public', 'private'))
);

-- Policies (Hierarchical configuration)
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope (org, tenant, or space)
    scope_type VARCHAR(20) NOT NULL, -- 'organization', 'tenant', 'space'
    scope_id UUID NOT NULL,

    -- Policy data
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(scope_type, scope_id, key),
    CONSTRAINT valid_scope_type CHECK (scope_type IN ('organization', 'tenant', 'space'))
);

-- API Keys for authentication
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    -- Key identity
    key_id VARCHAR(50) UNIQUE NOT NULL, -- kid for rotation
    name VARCHAR(255) NOT NULL,
    secret_hash VARCHAR(255) NOT NULL, -- bcrypt/argon2

    -- Permissions
    scopes TEXT[] DEFAULT ARRAY['image:read']::TEXT[],

    -- Status
    status VARCHAR(20) DEFAULT 'active',
    expires_at TIMESTAMPTZ NULL,
    last_used_at TIMESTAMPTZ NULL,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rotated_at TIMESTAMPTZ NULL
);

-- Assets (Original uploaded images)
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,

    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,

    -- File info
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,

    -- Storage
    storage_provider VARCHAR(50) NOT NULL, -- 'aws', 'gcp', 'azure', 'minio'
    storage_key VARCHAR(1000) NOT NULL UNIQUE,

    -- Content
    size_bytes BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 for deduplication

    -- Image metadata
    width INTEGER,
    height INTEGER,
    format VARCHAR(10),
    color_space VARCHAR(20),
    has_alpha BOOLEAN,

    -- Organization
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    folder VARCHAR(1000) DEFAULT '/',

    -- Access control
    access_policy VARCHAR(20) NOT NULL DEFAULT 'private',

    -- EXIF and metadata
    exif JSONB,

    -- Upload info
    uploaded_by UUID, -- Reference to user
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,

    CONSTRAINT valid_access_policy CHECK (access_policy IN ('public', 'private'))
);

-- Transformation Presets (Named transformation templates)
CREATE TABLE presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,

    -- Preset identity
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,

    -- Transformation definition
    operations JSONB NOT NULL,
    /*
    Example:
    {
        "resize": {"width": 800, "height": 600, "fit": "cover"},
        "format": "webp",
        "quality": 85,
        "sharpen": 1
    }
    */

    -- Auto-generation rules
    auto_generate BOOLEAN DEFAULT false,
    match_tags TEXT[] DEFAULT NULL,
    match_folders TEXT[] DEFAULT NULL,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, tenant_id, space_id, slug)
);

-- Derived Assets (Transformed images)
CREATE TABLE derived_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

    -- Transformation identity
    operations_canonical VARCHAR(500) NOT NULL, -- Canonical string representation
    operations_hash VARCHAR(64) NOT NULL, -- SHA-256 of (canonical_ops + asset.content_hash)

    -- Output
    output_format VARCHAR(10) NOT NULL,

    -- Storage
    storage_provider VARCHAR(50) NOT NULL,
    storage_key VARCHAR(1000) NOT NULL UNIQUE,

    -- Content
    size_bytes BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,

    -- Image metadata
    width INTEGER,
    height INTEGER,

    -- Performance tracking
    processing_time_ms INTEGER,
    access_count BIGINT DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,

    -- Cache tier for lifecycle
    cache_tier VARCHAR(20) DEFAULT 'hot', -- 'hot', 'warm', 'cold'

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(asset_id, operations_hash)
);

-- Transform Cache (Fast lookup for existing transforms)
CREATE TABLE transform_cache (
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    operations_hash VARCHAR(64) NOT NULL,
    derived_asset_id UUID NOT NULL REFERENCES derived_assets(id) ON DELETE CASCADE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY(asset_id, operations_hash)
);

-- Usage tracking (for cost and analytics)
CREATE TABLE usage_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    organization_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    space_id UUID NOT NULL,

    -- Metrics
    request_count BIGINT DEFAULT 0,
    bandwidth_bytes BIGINT DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    transform_count BIGINT DEFAULT 0,
    transform_cpu_ms BIGINT DEFAULT 0,

    UNIQUE(date, organization_id, tenant_id, space_id)
);

-- Audit logs
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL,
    tenant_id UUID,

    -- Actor
    actor_type VARCHAR(20) NOT NULL, -- 'user', 'api_key', 'system'
    actor_id UUID NOT NULL,

    -- Action
    action VARCHAR(100) NOT NULL, -- 'asset.upload', 'asset.delete', etc.
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,

    -- Context
    metadata JSONB,
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_tenants_org ON tenants(organization_id);
CREATE INDEX idx_spaces_tenant ON spaces(tenant_id);
CREATE INDEX idx_spaces_org ON spaces(organization_id);
CREATE INDEX idx_policies_scope ON policies(scope_type, scope_id);

CREATE INDEX idx_assets_space ON assets(space_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_org ON assets(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_hash ON assets(content_hash);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_assets_folder ON assets(folder);

CREATE INDEX idx_derived_asset ON derived_assets(asset_id);
CREATE INDEX idx_derived_hash ON derived_assets(operations_hash);
CREATE INDEX idx_derived_tier ON derived_assets(cache_tier);
CREATE INDEX idx_derived_access ON derived_assets(last_accessed_at);

CREATE INDEX idx_usage_date_org ON usage_metrics(date, organization_id);
CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, created_at);
```

---

## URL Design

### URL Structure Philosophy

URLs should be:

1. **Self-describing**: Clearly indicate access mode (public vs private)
2. **Cacheable**: CDN-friendly with stable cache keys
3. **Deterministic**: Same transformation = same URL
4. **Human-readable**: Easy to understand and debug

### URL Patterns

#### Public Images

```
Format:
https://{cdn-domain}/v1/pub/{org}/{tenant}/{space}/img/{asset-id}/v{version}/{operations}.{ext}

Examples:
- Original:
  https://img.example.com/v1/pub/acme/website/marketing/img/01JBXYZ.../v1/original.jpg

- Resized:
  https://img.example.com/v1/pub/acme/website/marketing/img/01JBXYZ.../v1/w_800-h_600-f_cover.webp

- With preset:
  https://img.example.com/v1/pub/acme/website/marketing/img/01JBXYZ.../v1/preset_thumbnail.webp

- Format auto-negotiation:
  https://img.example.com/v1/pub/acme/website/marketing/img/01JBXYZ.../v1/w_1200-f_auto-q_auto.jpg
```

#### Private Images (Base URL)

```
Format:
https://{cdn-domain}/v1/priv/{org}/{tenant}/{space}/img/{asset-id}/v{version}/{operations}.{ext}

Example:
https://img.example.com/v1/priv/acme/internal/confidential/img/01JBXYZ.../v1/w_800-h_600.jpg
```

#### Private Images (Signed URL)

```
Format:
{base-url}?sig={signature}&exp={unix-timestamp}&kid={key-id}

Example:
https://img.example.com/v1/priv/acme/internal/confidential/img/01JBXYZ.../v1/w_800-h_600.jpg?sig=dGVzdHNpZ25hdHVyZQ&exp=1731427200&kid=key_123

Components:
- sig: Base64URL-encoded HMAC-SHA256 signature
- exp: Unix timestamp (seconds) when URL expires
- kid: Key ID for signature rotation support
```

### Transformation Parameters

Operations are encoded as hyphen-separated key-value pairs:

```
Parameter Format: {key}_{value}

Supported Parameters:
- w_{pixels}         : Width (e.g., w_800)
- h_{pixels}         : Height (e.g., h_600)
- f_{mode}           : Fit mode - cover, contain, fill, inside, outside, pad
- q_{quality}        : Quality 1-100 or 'auto' (e.g., q_85)
- fmt_{format}       : Format - jpg, png, webp, avif, gif, 'auto'
- r_{degrees}        : Rotation - 90, 180, 270
- g_{gravity}        : Crop gravity - center, north, south, east, west, etc.
- b_{color}          : Background color for pad (e.g., b_ffffff)
- blur_{radius}      : Blur radius 0.3-1000 (e.g., blur_5)
- sharpen_{amount}   : Sharpen amount 0-10 (e.g., sharpen_2)
- bw                 : Convert to black & white (grayscale)
- flip               : Flip horizontal
- flop               : Flip vertical
- preset_{name}      : Apply named preset

Examples:
- w_800-h_600-f_cover-q_85
- w_400-h_400-f_contain-fmt_webp
- preset_thumbnail
- w_1200-sharpen_2-fmt_webp-q_90
- w_800-h_600-f_pad-b_ffffff
```

### Operation Canonicalization

To ensure cache hit consistency, operations must be canonicalized:

```javascript title="canonicalize-operations.js"
/**
 * Canonicalizes transformation operations to ensure consistent cache keys
 */
function canonicalizeOperations(opsString) {
  const ops = parseOperations(opsString)

  // Apply defaults
  if (!ops.quality && ops.format !== "png") ops.quality = 85
  if (!ops.fit && (ops.width || ops.height)) ops.fit = "cover"

  // Normalize values
  if (ops.quality) ops.quality = Math.max(1, Math.min(100, ops.quality))
  if (ops.width) ops.width = Math.floor(ops.width)
  if (ops.height) ops.height = Math.floor(ops.height)

  // Canonical order: fmt, w, h, f, g, b, q, r, sharpen, blur, bw, flip, flop
  const order = ["fmt", "w", "h", "f", "g", "b", "q", "r", "sharpen", "blur", "bw", "flip", "flop"]

  return order
    .filter((key) => ops[key] !== undefined)
    .map((key) => `${key}_${ops[key]}`)
    .join("-")
}
```

---

## Core Request Flows

### Upload Flow with Auto-Presets

![Diagram](./diagrams/diagram-4-light.svg)
![Diagram](./diagrams/diagram-4-dark.svg)

### Synchronous Transform Flow (Guaranteed 200)

![Diagram](./diagrams/diagram-5-light.svg)
![Diagram](./diagrams/diagram-5-dark.svg)

---

## Image Processing Pipeline

### Processing Implementation

```javascript title="transform-engine.js" collapse={1-17}
import sharp from "sharp"
import crypto from "crypto"

/**
 * Transform Engine - Core image processing service
 */
class TransformEngine {
  constructor(storage, registry, cache, lockManager) {
    this.storage = storage
    this.registry = registry
    this.cache = cache
    this.lockManager = lockManager
  }

  /**
   * Process image transformation with deduplication
   */
  async transform(assetId, operations, acceptHeader) {
    // 1. Canonicalize operations
    const canonicalOps = this.canonicalizeOps(operations)
    const outputFormat = this.determineFormat(operations.format, acceptHeader)

    // 2. Generate transformation hash (content-addressed)
    const asset = await this.registry.getAsset(assetId)
    const opsHash = this.generateOpsHash(canonicalOps, asset.contentHash, outputFormat)

    // 3. Check multi-layer cache
    const cacheKey = `transform:${assetId}:${opsHash}`

    // Layer 1: Redis cache
    const cached = await this.cache.get(cacheKey)
    if (cached) {
      return {
        buffer: Buffer.from(cached.buffer, "base64"),
        contentType: cached.contentType,
        fromCache: "redis",
      }
    }

    // Layer 2: Database + Storage
    const derived = await this.registry.getDerivedAsset(assetId, opsHash)
    if (derived) {
      const buffer = await this.storage.get(derived.storageKey)

      // Populate Redis cache
      await this.cache.set(
        cacheKey,
        {
          buffer: buffer.toString("base64"),
          contentType: `image/${derived.outputFormat}`,
        },
        3600,
      ) // 1 hour TTL

      // Update access metrics
      await this.registry.incrementAccessCount(derived.id)

      return {
        buffer,
        contentType: `image/${derived.outputFormat}`,
        fromCache: "storage",
      }
    }

    // Layer 3: Process new transformation (with distributed locking)
    const lockKey = `lock:transform:${assetId}:${opsHash}`
    const lock = await this.lockManager.acquire(lockKey, 60000) // 60s TTL

    try {
      // Double-check after acquiring lock
      const doubleCheck = await this.registry.getDerivedAsset(assetId, opsHash)
      if (doubleCheck) {
        const buffer = await this.storage.get(doubleCheck.storageKey)
        return {
          buffer,
          contentType: `image/${doubleCheck.outputFormat}`,
          fromCache: "concurrent",
        }
      }

      // Process transformation
      const startTime = Date.now()

      // Fetch original
      const originalBuffer = await this.storage.get(asset.storageKey)

      // Apply transformations
      const processedBuffer = await this.applyTransformations(originalBuffer, canonicalOps, outputFormat)

      const processingTime = Date.now() - startTime

      // Get metadata of processed image
      const metadata = await sharp(processedBuffer).metadata()

      // Generate storage key
      const storageKey = `derived/${asset.organizationId}/${asset.tenantId}/${asset.spaceId}/${assetId}/v${asset.version}/${opsHash}.${outputFormat}`

      // Store processed image
      await this.storage.put(storageKey, processedBuffer, `image/${outputFormat}`)

      // Compute content hash
      const contentHash = crypto.createHash("sha256").update(processedBuffer).digest("hex")

      // Save to database
      const derivedAsset = await this.registry.createDerivedAsset({
        assetId,
        operationsCanonical: canonicalOps,
        operationsHash: opsHash,
        outputFormat,
        storageProvider: this.storage.provider,
        storageKey,
        sizeBytes: processedBuffer.length,
        contentHash,
        width: metadata.width,
        height: metadata.height,
        processingTimeMs: processingTime,
      })

      // Update transform cache index
      await this.registry.cacheTransform(assetId, opsHash, derivedAsset.id)

      // Populate Redis cache
      await this.cache.set(
        cacheKey,
        {
          buffer: processedBuffer.toString("base64"),
          contentType: `image/${outputFormat}`,
        },
        3600,
      )

      return {
        buffer: processedBuffer,
        contentType: `image/${outputFormat}`,
        fromCache: "none",
        processingTime,
      }
    } finally {
      await lock.release()
    }
  }

  /**
   * Apply transformations using Sharp
   */
  async applyTransformations(inputBuffer, operations, outputFormat) {
    let pipeline = sharp(inputBuffer)

    // Rotation
    if (operations.rotation) {
      pipeline = pipeline.rotate(operations.rotation)
    }

    // Flip/Flop
    if (operations.flip) {
      pipeline = pipeline.flip()
    }
    if (operations.flop) {
      pipeline = pipeline.flop()
    }

    // Resize
    if (operations.width || operations.height) {
      const resizeOptions = {
        width: operations.width,
        height: operations.height,
        fit: operations.fit || "cover",
        position: operations.gravity || "centre",
        withoutEnlargement: true,
      }

      // Background for 'pad' fit
      if (operations.fit === "pad" && operations.background) {
        resizeOptions.background = this.parseColor(operations.background)
      }

      pipeline = pipeline.resize(resizeOptions)
    }

    // Effects
    if (operations.blur) {
      pipeline = pipeline.blur(operations.blur)
    }

    if (operations.sharpen) {
      pipeline = pipeline.sharpen(operations.sharpen)
    }

    if (operations.grayscale) {
      pipeline = pipeline.grayscale()
    }

    // Format conversion and quality
    const quality = operations.quality === "auto" ? this.getAutoQuality(outputFormat) : operations.quality || 85

    switch (outputFormat) {
      case "jpg":
      case "jpeg":
        pipeline = pipeline.jpeg({
          quality,
          mozjpeg: true, // Better compression
        })
        break

      case "png":
        pipeline = pipeline.png({
          quality,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        break

      case "webp":
        pipeline = pipeline.webp({
          quality,
          effort: 6, // Compression effort (0-6)
        })
        break

      case "avif":
        pipeline = pipeline.avif({
          quality,
          effort: 6,
        })
        break

      case "gif":
        pipeline = pipeline.gif()
        break
    }

    return await pipeline.toBuffer()
  }

  /**
   * Determine output format based on operations and Accept header
   *
   * Format selection priority (as of 2025):
   * - AVIF: 94.89% browser support, ~50% smaller than JPEG, 20-25% smaller than WebP
   * - WebP: 95.93% browser support, 25-34% smaller than JPEG
   * - JPEG: Universal fallback
   *
   * Note: JPEG XL gained Chrome support in Jan 2026 but adoption is still emerging.
   * Consider adding once browser support exceeds 80%.
   */
  determineFormat(requestedFormat, acceptHeader) {
    if (requestedFormat && requestedFormat !== "auto") {
      return requestedFormat
    }

    // Format negotiation based on Accept header
    const accept = (acceptHeader || "").toLowerCase()

    if (accept.includes("image/avif")) {
      return "avif" // Best compression: ~50% smaller than JPEG
    }

    if (accept.includes("image/webp")) {
      return "webp" // Good compression: 25-34% smaller than JPEG, slightly wider support
    }

    return "jpg" // Fallback
  }

  /**
   * Get automatic quality based on format
   *
   * Quality values are calibrated to produce visually similar output across formats.
   * AVIF and WebP compress more efficiently, so they need lower quality values
   * to achieve similar file sizes with equivalent visual quality.
   *
   * Real-world example (2000×2000 product photo):
   * - JPEG q=80: ~540 KB
   * - WebP q=85: ~350 KB (35% smaller)
   * - AVIF q=75 (CQ 28): ~210 KB (61% smaller)
   */
  getAutoQuality(format) {
    const qualityMap = {
      avif: 75, // AVIF compresses very well; q=75 ≈ JPEG q=85 visually
      webp: 80, // WebP compresses well; q=80 ≈ JPEG q=85 visually
      jpg: 85, // JPEG baseline quality
      jpeg: 85,
      png: 90, // PNG quality affects compression, not visual fidelity (lossless)
    }

    return qualityMap[format] || 85
  }

  /**
   * Generate deterministic hash for transformation
   */
  generateOpsHash(canonicalOps, assetContentHash, outputFormat) {
    const payload = `${canonicalOps};${assetContentHash};fmt=${outputFormat}`
    return crypto.createHash("sha256").update(payload).digest("hex")
  }

  /**
   * Parse color hex string to RGB object
   */
  parseColor(hex) {
    hex = hex.replace("#", "")
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
    }
  }

  /**
   * Canonicalize operations
   */
  canonicalizeOps(ops) {
    // Implementation details...
    // Return canonical string like "w_800-h_600-f_cover-q_85-fmt_webp"
  }
}

export default TransformEngine
```

### Distributed Locking

```javascript title="lock-manager.js" collapse={1-18}
import Redlock from "redlock"
import Redis from "ioredis"

/**
 * Distributed lock manager using Redlock algorithm
 *
 * IMPORTANT: This lock manager is designed for EFFICIENCY optimization, not
 * CORRECTNESS guarantees. Redlock cannot provide fencing tokens, so:
 *
 * - SAFE: Preventing duplicate transforms (if lock fails, we waste compute but don't corrupt data)
 * - UNSAFE: Protecting financial transactions, inventory updates, or any operation where
 *   concurrent execution could cause data inconsistency
 *
 * For safety-critical mutual exclusion, use etcd (Raft consensus) or ZooKeeper (ZAB protocol).
 * See: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
 */
class LockManager {
  constructor(redisClients) {
    // Initialize Redlock with multiple Redis instances (N=5 recommended for production)
    this.redlock = new Redlock(redisClients, {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 200,
      automaticExtensionThreshold: 500,
    })
  }

  /**
   * Acquire distributed lock
   */
  async acquire(key, ttl = 30000) {
    try {
      const lock = await this.redlock.acquire([`lock:${key}`], ttl)
      return lock
    } catch (error) {
      throw new Error(`Failed to acquire lock for ${key}: ${error.message}`)
    }
  }

  /**
   * Try to acquire lock without waiting
   */
  async tryAcquire(key, ttl = 30000) {
    try {
      return await this.redlock.acquire([`lock:${key}`], ttl)
    } catch (error) {
      return null // Lock not acquired
    }
  }
}

// Usage
const redis1 = new Redis({ host: "redis-1" })
const redis2 = new Redis({ host: "redis-2" })
const redis3 = new Redis({ host: "redis-3" })

const lockManager = new LockManager([redis1, redis2, redis3])

export default LockManager
```

---

## Security & Access Control

### Signed URL Implementation

```javascript title="signature-service.js" collapse={1-7}
import crypto from "crypto"

/**
 * Signature Service - Generate and verify signed URLs
 */
class SignatureService {
  constructor(registry) {
    this.registry = registry
  }

  /**
   * Generate signed URL for private images
   */
  async generateSignedUrl(baseUrl, orgId, tenantId, ttl = null) {
    // Get signing key for tenant/org
    const apiKey = await this.registry.getSigningKey(orgId, tenantId)

    // Get effective policy for TTL
    const policy = await this.registry.getEffectivePolicy(orgId, tenantId)
    const defaultTtl = policy.signed_url_ttl_default_seconds || 3600
    const maxTtl = policy.signed_url_ttl_max_seconds || 86400

    // Calculate expiry
    const requestedTtl = ttl || defaultTtl
    const effectiveTtl = Math.min(requestedTtl, maxTtl)
    const expiresAt = Math.floor(Date.now() / 1000) + effectiveTtl

    // Create canonical string for signing
    const url = new URL(baseUrl)
    const canonicalString = this.createCanonicalString(url.pathname, expiresAt, url.hostname, tenantId)

    // Generate HMAC-SHA256 signature
    const signature = crypto.createHmac("sha256", apiKey.secret).update(canonicalString).digest("base64url") // URL-safe base64

    // Append signature, expiry, and key ID to URL
    url.searchParams.set("sig", signature)
    url.searchParams.set("exp", expiresAt.toString())
    url.searchParams.set("kid", apiKey.keyId)

    return {
      url: url.toString(),
      expiresAt: new Date(expiresAt * 1000),
      expiresIn: effectiveTtl,
    }
  }

  /**
   * Verify signed URL
   */
  async verifySignedUrl(signedUrl, orgId, tenantId) {
    const url = new URL(signedUrl)

    // Extract signature components
    const signature = url.searchParams.get("sig")
    const expiresAt = parseInt(url.searchParams.get("exp"))
    const keyId = url.searchParams.get("kid")

    if (!signature || !expiresAt || !keyId) {
      return {
        valid: false,
        error: "Missing signature components",
      }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (now > expiresAt) {
      return {
        valid: false,
        expired: true,
        error: "Signature expired",
      }
    }

    // Get signing key
    const apiKey = await this.registry.getApiKeyById(keyId)
    if (!apiKey || apiKey.status !== "active") {
      return {
        valid: false,
        error: "Invalid key ID",
      }
    }

    // Verify tenant/org ownership
    if (apiKey.organizationId !== orgId || apiKey.tenantId !== tenantId) {
      return {
        valid: false,
        error: "Key does not match tenant",
      }
    }

    // Reconstruct canonical string
    url.searchParams.delete("sig")
    url.searchParams.delete("exp")
    url.searchParams.delete("kid")

    const canonicalString = this.createCanonicalString(url.pathname, expiresAt, url.hostname, tenantId)

    // Compute expected signature
    const expectedSignature = crypto.createHmac("sha256", apiKey.secret).update(canonicalString).digest("base64url")

    // Constant-time comparison to prevent timing attacks
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))

    return {
      valid,
      error: valid ? null : "Invalid signature",
    }
  }

  /**
   * Create canonical string for signing
   */
  createCanonicalString(pathname, expiresAt, hostname, tenantId) {
    return ["GET", pathname, expiresAt, hostname, tenantId].join("\n")
  }

  /**
   * Rotate signing keys
   */
  async rotateSigningKey(orgId, tenantId) {
    // Generate new secret
    const newSecret = crypto.randomBytes(32).toString("hex")
    const newKeyId = `key_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`

    // Create new key
    const newKey = await this.registry.createApiKey({
      organizationId: orgId,
      tenantId,
      keyId: newKeyId,
      name: `Signing Key (rotated ${new Date().toISOString()})`,
      secret: newSecret,
      scopes: ["signing"],
    })

    // Mark old keys for deprecation (keep valid for grace period)
    await this.registry.deprecateOldSigningKeys(orgId, tenantId, newKey.id)

    return newKey
  }
}

export default SignatureService
```

### Authentication Middleware

```javascript title="auth-middleware.js" collapse={1-5}
import crypto from "crypto"

/**
 * Authentication middleware for Fastify
 */
class AuthMiddleware {
  constructor(registry) {
    this.registry = registry
  }

  /**
   * API Key authentication
   */
  async authenticateApiKey(request, reply) {
    const apiKey = request.headers["x-api-key"]

    if (!apiKey) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "API key required",
      })
    }

    // Hash the API key
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex")

    // Look up in database
    const keyRecord = await this.registry.getApiKeyByHash(keyHash)

    if (!keyRecord) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid API key",
      })
    }

    // Check status and expiration
    if (keyRecord.status !== "active") {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "API key is inactive",
      })
    }

    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "API key has expired",
      })
    }

    // Update last used timestamp (async, don't wait)
    this.registry.updateApiKeyLastUsed(keyRecord.id).catch(console.error)

    // Attach to request context
    request.auth = {
      organizationId: keyRecord.organizationId,
      tenantId: keyRecord.tenantId,
      scopes: keyRecord.scopes,
      keyId: keyRecord.id,
    }
  }

  /**
   * Scope-based authorization
   */
  requireScope(scope) {
    return async (request, reply) => {
      if (!request.auth) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        })
      }

      if (!request.auth.scopes.includes(scope)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: `Required scope: ${scope}`,
        })
      }
    }
  }

  /**
   * Tenant boundary check
   */
  async checkTenantAccess(request, reply, orgId, tenantId, spaceId) {
    if (!request.auth) {
      return reply.code(401).send({
        error: "Unauthorized",
      })
    }

    // Check organization match
    if (request.auth.organizationId !== orgId) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Access denied to this organization",
      })
    }

    // Check tenant match (if key is tenant-scoped)
    if (request.auth.tenantId && request.auth.tenantId !== tenantId) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Access denied to this tenant",
      })
    }

    return true
  }
}

export default AuthMiddleware
```

### Rate Limiting

```javascript title="rate-limiter.js" collapse={1-5}
import Redis from "ioredis"

/**
 * Rate limiter using sliding window algorithm
 */
class RateLimiter {
  constructor(redis) {
    this.redis = redis
  }

  /**
   * Check and enforce rate limit
   */
  async checkLimit(identifier, limit, windowSeconds) {
    const key = `ratelimit:${identifier}`
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000

    // Use Redis pipeline for atomicity
    const pipeline = this.redis.pipeline()

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, "-inf", windowStart)

    // Count requests in current window
    pipeline.zcard(key)

    // Add current request
    const requestId = `${now}:${Math.random()}`
    pipeline.zadd(key, now, requestId)

    // Set expiry on key
    pipeline.expire(key, windowSeconds)

    const results = await pipeline.exec()
    const count = results[1][1] // Result of ZCARD

    const allowed = count < limit
    const remaining = Math.max(0, limit - count - 1)

    // Calculate reset time
    const oldestEntry = await this.redis.zrange(key, 0, 0, "WITHSCORES")
    const resetAt =
      oldestEntry.length > 0
        ? new Date(parseInt(oldestEntry[1]) + windowSeconds * 1000)
        : new Date(now + windowSeconds * 1000)

    return {
      allowed,
      limit,
      remaining,
      resetAt,
    }
  }

  /**
   * Rate limiting middleware for Fastify
   */
  middleware(getLimitConfig) {
    return async (request, reply) => {
      // Get limit configuration based on request context
      const { identifier, limit, window } = getLimitConfig(request)

      const result = await this.checkLimit(identifier, limit, window)

      // Set rate limit headers
      reply.header("X-RateLimit-Limit", result.limit)
      reply.header("X-RateLimit-Remaining", result.remaining)
      reply.header("X-RateLimit-Reset", result.resetAt.toISOString())

      if (!result.allowed) {
        return reply.code(429).send({
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again after ${result.resetAt.toISOString()}`,
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        })
      }
    }
  }
}

// Usage example
const redis = new Redis()
const rateLimiter = new RateLimiter(redis)

// Apply to route
app.get(
  "/v1/pub/*",
  {
    preHandler: rateLimiter.middleware((request) => ({
      identifier: `org:${request.params.org}`,
      limit: 1000, // requests
      window: 60, // seconds
    })),
  },
  handler,
)

export default RateLimiter
```

---

## Deployment Architecture

### Kubernetes Deployment

![Diagram](./diagrams/diagram-6-light.svg)
![Diagram](./diagrams/diagram-6-dark.svg)

### Storage Abstraction Layer

```javascript title="storage-adapter.js" collapse={1-33}
/**
 * Abstract storage interface
 */
class StorageAdapter {
  async put(key, buffer, contentType, metadata = {}) {
    throw new Error("Not implemented")
  }

  async get(key) {
    throw new Error("Not implemented")
  }

  async delete(key) {
    throw new Error("Not implemented")
  }

  async exists(key) {
    throw new Error("Not implemented")
  }

  async getSignedUrl(key, ttl) {
    throw new Error("Not implemented")
  }

  get provider() {
    throw new Error("Not implemented")
  }
}

// AWS S3 Implementation (imports collapsed)
// import { S3Client, PutObjectCommand, GetObjectCommand, ... } from "@aws-sdk/client-s3"
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

class S3StorageAdapter extends StorageAdapter {
  constructor(config) {
    super()
    this.client = new S3Client({
      region: config.region,
      credentials: config.credentials,
    })
    this.bucket = config.bucket
  }

  async put(key, buffer, contentType, metadata = {}) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: "AES256",
    })

    await this.client.send(command)
  }

  async get(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    const response = await this.client.send(command)
    const chunks = []

    for await (const chunk of response.Body) {
      chunks.push(chunk)
    }

    return Buffer.concat(chunks)
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    await this.client.send(command)
  }

  async exists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })

      await this.client.send(command)
      return true
    } catch (error) {
      if (error.name === "NotFound") {
        return false
      }
      throw error
    }
  }

  async getSignedUrl(key, ttl = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    return await getSignedUrl(this.client, command, { expiresIn: ttl })
  }

  get provider() {
    return "aws"
  }
}

// Google Cloud Storage Implementation (imports collapsed)
// import { Storage } from "@google-cloud/storage"

class GCSStorageAdapter extends StorageAdapter {
  constructor(config) {
    super()
    this.storage = new Storage({
      projectId: config.projectId,
      credentials: config.credentials,
    })
    this.bucket = this.storage.bucket(config.bucket)
  }

  async put(key, buffer, contentType, metadata = {}) {
    const file = this.bucket.file(key)
    await file.save(buffer, {
      contentType,
      metadata,
      resumable: false,
    })
  }

  async get(key) {
    const file = this.bucket.file(key)
    const [contents] = await file.download()
    return contents
  }

  async delete(key) {
    const file = this.bucket.file(key)
    await file.delete()
  }

  async exists(key) {
    const file = this.bucket.file(key)
    const [exists] = await file.exists()
    return exists
  }

  async getSignedUrl(key, ttl = 3600) {
    const file = this.bucket.file(key)
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + ttl * 1000,
    })
    return url
  }

  get provider() {
    return "gcp"
  }
}

// Azure Blob Storage Implementation (imports collapsed)
// import { BlobServiceClient } from "@azure/storage-blob"

class AzureBlobStorageAdapter extends StorageAdapter {
  constructor(config) {
    super()
    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString)
    this.containerClient = this.blobServiceClient.getContainerClient(config.containerName)
  }

  async put(key, buffer, contentType, metadata = {}) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key)
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
      metadata,
    })
  }

  async get(key) {
    const blobClient = this.containerClient.getBlobClient(key)
    const downloadResponse = await blobClient.download()

    return await this.streamToBuffer(downloadResponse.readableStreamBody)
  }

  async delete(key) {
    const blobClient = this.containerClient.getBlobClient(key)
    await blobClient.delete()
  }

  async exists(key) {
    const blobClient = this.containerClient.getBlobClient(key)
    return await blobClient.exists()
  }

  async getSignedUrl(key, ttl = 3600) {
    const blobClient = this.containerClient.getBlobClient(key)
    const expiresOn = new Date(Date.now() + ttl * 1000)

    return await blobClient.generateSasUrl({
      permissions: "r",
      expiresOn,
    })
  }

  async streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = []
      readableStream.on("data", (chunk) => chunks.push(chunk))
      readableStream.on("end", () => resolve(Buffer.concat(chunks)))
      readableStream.on("error", reject)
    })
  }

  get provider() {
    return "azure"
  }
}

// MinIO Implementation (S3-compatible for on-premise, imports collapsed)
// import * as Minio from "minio"

class MinIOStorageAdapter extends StorageAdapter {
  constructor(config) {
    super()
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port || 9000,
      useSSL: config.useSSL !== false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    })
    this.bucket = config.bucket
  }

  async put(key, buffer, contentType, metadata = {}) {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      "Content-Type": contentType,
      ...metadata,
    })
  }

  async get(key) {
    const stream = await this.client.getObject(this.bucket, key)

    return new Promise((resolve, reject) => {
      const chunks = []
      stream.on("data", (chunk) => chunks.push(chunk))
      stream.on("end", () => resolve(Buffer.concat(chunks)))
      stream.on("error", reject)
    })
  }

  async delete(key) {
    await this.client.removeObject(this.bucket, key)
  }

  async exists(key) {
    try {
      await this.client.statObject(this.bucket, key)
      return true
    } catch (error) {
      if (error.code === "NotFound") {
        return false
      }
      throw error
    }
  }

  async getSignedUrl(key, ttl = 3600) {
    return await this.client.presignedGetObject(this.bucket, key, ttl)
  }

  get provider() {
    return "minio"
  }
}

/**
 * Storage Factory
 */
class StorageFactory {
  static create(config) {
    switch (config.provider) {
      case "aws":
      case "s3":
        return new S3StorageAdapter(config)

      case "gcp":
      case "gcs":
        return new GCSStorageAdapter(config)

      case "azure":
        return new AzureBlobStorageAdapter(config)

      case "minio":
      case "onprem":
        return new MinIOStorageAdapter(config)

      default:
        throw new Error(`Unsupported storage provider: ${config.provider}`)
    }
  }
}

export { StorageAdapter, StorageFactory }
```

### Deployment Configuration

```yaml title="docker-compose.yml" collapse={21-40, 60-95}
# docker-compose.yml for local development
version: "3.8"

services:
  # API Gateway
  gateway:
    build: ./services/gateway
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:password@postgres:5432/imageservice
      REDIS_URL: redis://redis:6379
      STORAGE_PROVIDER: minio
      MINIO_ENDPOINT: minio
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    depends_on:
      - postgres
      - redis
      - minio

  # Transform Engine
  transform:
    build: ./services/transform
    deploy:
      replicas: 3
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/imageservice
      REDIS_URL: redis://redis:6379
      STORAGE_PROVIDER: minio
      MINIO_ENDPOINT: minio
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    depends_on:
      - postgres
      - redis
      - minio

  # Transform Workers
  worker:
    build: ./services/worker
    deploy:
      replicas: 3
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/imageservice
      RABBITMQ_URL: amqp://rabbitmq:5672
      STORAGE_PROVIDER: minio
      MINIO_ENDPOINT: minio
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    depends_on:
      - postgres
      - rabbitmq
      - minio

  # PostgreSQL
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: imageservice
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"

  # RabbitMQ
  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: password
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

  # MinIO (S3-compatible storage)
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  redis-data:
  rabbitmq-data:
  minio-data:
```

---

## Cost Optimization

### Multi-Layer Caching Strategy

![Diagram](./diagrams/diagram-7-light.svg)
![Diagram](./diagrams/diagram-7-dark.svg)

### Storage Lifecycle Management

```javascript title="lifecycle-manager.js" collapse={1-9}
/**
 * Storage lifecycle manager
 */
class LifecycleManager {
  constructor(registry, storage) {
    this.registry = registry
    this.storage = storage
  }

  /**
   * Move derived assets to cold tier based on access patterns
   */
  async moveToColdTier() {
    const coldThresholdDays = 30
    const warmThresholdDays = 7

    // Find candidates for tiering
    const candidates = await this.registry.query(`
      SELECT id, storage_key, cache_tier, last_accessed_at, size_bytes
      FROM derived_assets
      WHERE cache_tier = 'hot'
        AND last_accessed_at < NOW() - INTERVAL '${coldThresholdDays} days'
        AND deleted_at IS NULL
      ORDER BY last_accessed_at ASC
      LIMIT 1000
    `)

    for (const asset of candidates.rows) {
      try {
        // Move to cold storage tier (Glacier Instant Retrieval, Coldline, etc.)
        await this.storage.moveToTier(asset.storageKey, "cold")

        // Update database
        await this.registry.updateCacheTier(asset.id, "cold")

        console.log(`Moved asset ${asset.id} to cold tier`)
      } catch (error) {
        console.error(`Failed to move asset ${asset.id}:`, error)
      }
    }

    // Similar logic for warm tier
    const warmCandidates = await this.registry.query(`
      SELECT id, storage_key, cache_tier
      FROM derived_assets
      WHERE cache_tier = 'hot'
        AND last_accessed_at < NOW() - INTERVAL '${warmThresholdDays} days'
        AND last_accessed_at >= NOW() - INTERVAL '${coldThresholdDays} days'
      LIMIT 1000
    `)

    for (const asset of warmCandidates.rows) {
      await this.storage.moveToTier(asset.storageKey, "warm")
      await this.registry.updateCacheTier(asset.id, "warm")
    }
  }

  /**
   * Delete unused derived assets
   */
  async pruneUnused() {
    const pruneThresholdDays = 90

    const unused = await this.registry.query(`
      SELECT id, storage_key
      FROM derived_assets
      WHERE access_count = 0
        AND created_at < NOW() - INTERVAL '${pruneThresholdDays} days'
      LIMIT 1000
    `)

    for (const asset of unused.rows) {
      try {
        await this.storage.delete(asset.storageKey)
        await this.registry.deleteDerivedAsset(asset.id)

        console.log(`Pruned unused asset ${asset.id}`)
      } catch (error) {
        console.error(`Failed to prune asset ${asset.id}:`, error)
      }
    }
  }
}
```

### Cost Projection

For a service serving **10 million requests/month**:

| Component      | Without Optimization   | With Optimization       | Savings |
| -------------- | ---------------------- | ----------------------- | ------- |
| **Processing** | 1M transforms × $0.001 | 50K transforms × $0.001 | 95%     |
| **Storage**    | 100TB × $0.023         | 100TB × $0.013 (tiered) | 43%     |
| **Bandwidth**  | 100TB × $0.09 (origin) | 100TB × $0.02 (CDN)     | 78%     |
| **CDN**        | —                      | 100TB × $0.02           | —       |
| **Total**      | **$12,300/month**      | **$5,400/month**        | **56%** |

Key optimizations:

- **95% CDN hit rate** reduces origin bandwidth
- **Transform deduplication** prevents reprocessing
- **Storage tiering** moves cold data to cheaper tiers
- **Smart caching** minimizes processing costs

---

## Monitoring & Operations

### Metrics Collection

```javascript title="metrics-registry.js" collapse={1-6}
import prometheus from "prom-client"

/**
 * Metrics registry
 */
class MetricsRegistry {
  constructor() {
    this.register = new prometheus.Registry()

    // Default metrics (CPU, memory, etc.)
    prometheus.collectDefaultMetrics({ register: this.register })

    // HTTP metrics
    this.httpRequestDuration = new prometheus.Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    })

    this.httpRequestTotal = new prometheus.Counter({
      name: "http_requests_total",
      help: "Total HTTP requests",
      labelNames: ["method", "route", "status"],
    })

    // Transform metrics
    this.transformDuration = new prometheus.Histogram({
      name: "transform_duration_seconds",
      help: "Image transformation duration in seconds",
      labelNames: ["org", "format", "cached"],
      buckets: [0.1, 0.2, 0.5, 1, 2, 5, 10],
    })

    this.transformTotal = new prometheus.Counter({
      name: "transforms_total",
      help: "Total image transformations",
      labelNames: ["org", "format", "cached"],
    })

    this.transformErrors = new prometheus.Counter({
      name: "transform_errors_total",
      help: "Total transformation errors",
      labelNames: ["org", "error_type"],
    })

    // Cache metrics
    this.cacheHits = new prometheus.Counter({
      name: "cache_hits_total",
      help: "Total cache hits",
      labelNames: ["layer"], // cdn, redis, database
    })

    this.cacheMisses = new prometheus.Counter({
      name: "cache_misses_total",
      help: "Total cache misses",
      labelNames: ["layer"],
    })

    // Storage metrics
    this.storageOperations = new prometheus.Counter({
      name: "storage_operations_total",
      help: "Total storage operations",
      labelNames: ["provider", "operation"], // put, get, delete
    })

    this.storageBytesTransferred = new prometheus.Counter({
      name: "storage_bytes_transferred_total",
      help: "Total bytes transferred to/from storage",
      labelNames: ["provider", "direction"], // upload, download
    })

    // Business metrics
    this.assetsUploaded = new prometheus.Counter({
      name: "assets_uploaded_total",
      help: "Total assets uploaded",
      labelNames: ["org", "format"],
    })

    this.bandwidthServed = new prometheus.Counter({
      name: "bandwidth_served_bytes_total",
      help: "Total bandwidth served",
      labelNames: ["org", "space"],
    })

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration)
    this.register.registerMetric(this.httpRequestTotal)
    this.register.registerMetric(this.transformDuration)
    this.register.registerMetric(this.transformTotal)
    this.register.registerMetric(this.transformErrors)
    this.register.registerMetric(this.cacheHits)
    this.register.registerMetric(this.cacheMisses)
    this.register.registerMetric(this.storageOperations)
    this.register.registerMetric(this.storageBytesTransferred)
    this.register.registerMetric(this.assetsUploaded)
    this.register.registerMetric(this.bandwidthServed)
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics() {
    return await this.register.metrics()
  }
}

// Singleton instance
const metricsRegistry = new MetricsRegistry()

export default metricsRegistry
```

### Alerting Configuration

```yaml title="prometheus-alerts.yml"
groups:
  - name: image_service_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
            /
            sum(rate(http_requests_total[5m])) by (service)
          ) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # Low cache hit rate
      - alert: LowCacheHitRate
        expr: |
          (
            sum(rate(cache_hits_total{layer="redis"}[10m]))
            /
            (sum(rate(cache_hits_total{layer="redis"}[10m])) + sum(rate(cache_misses_total{layer="redis"}[10m])))
          ) < 0.70
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value | humanizePercentage }}, expected > 70%"

      # Slow transformations
      - alert: SlowTransformations
        expr: |
          histogram_quantile(0.95,
            sum(rate(transform_duration_seconds_bucket[5m])) by (le)
          ) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Slow image transformations"
          description: "P95 transform time is {{ $value }}s, expected < 2s"

      # Queue backup
      - alert: QueueBacklog
        expr: rabbitmq_queue_messages{queue="transforms"} > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Transform queue has backlog"
          description: "Queue depth is {{ $value }}, workers may be overwhelmed"

      # Storage quota warning
      - alert: StorageQuotaWarning
        expr: |
          (
            sum(storage_bytes_used) by (organization_id)
            /
            sum(storage_bytes_quota) by (organization_id)
          ) > 0.80
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Organization {{ $labels.organization_id }} approaching storage quota"
          description: "Usage is {{ $value | humanizePercentage }} of quota"
```

### Health Checks

```javascript title="health-check.js" collapse={1-8}
/**
 * Health check service
 */
class HealthCheckService {
  constructor(dependencies) {
    this.db = dependencies.db
    this.redis = dependencies.redis
    this.storage = dependencies.storage
    this.queue = dependencies.queue
  }

  /**
   * Liveness probe - is the service running?
   */
  async liveness() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }
  }

  /**
   * Readiness probe - is the service ready to accept traffic?
   */
  async readiness() {
    const checks = {
      database: false,
      redis: false,
      storage: false,
      queue: false,
    }

    // Check database
    try {
      await this.db.query("SELECT 1")
      checks.database = true
    } catch (error) {
      console.error("Database health check failed:", error)
    }

    // Check Redis
    try {
      await this.redis.ping()
      checks.redis = true
    } catch (error) {
      console.error("Redis health check failed:", error)
    }

    // Check storage
    try {
      const testKey = ".health-check"
      const testData = Buffer.from("health")
      await this.storage.put(testKey, testData, "text/plain")
      await this.storage.get(testKey)
      await this.storage.delete(testKey)
      checks.storage = true
    } catch (error) {
      console.error("Storage health check failed:", error)
    }

    // Check queue
    try {
      // Implement queue-specific health check
      checks.queue = true
    } catch (error) {
      console.error("Queue health check failed:", error)
    }

    const allHealthy = Object.values(checks).every((v) => v === true)

    return {
      status: allHealthy ? "ready" : "not ready",
      checks,
      timestamp: new Date().toISOString(),
    }
  }
}

export default HealthCheckService
```

---

## Failure Modes and Edge Cases

This section documents failure scenarios, their detection, and recovery strategies. Understanding these modes is critical for production operations.

### Transform Timeout (> 800ms SLA breach)

**Cause**: Large images (> 5MB), complex operations (multiple resize + effects), cold storage retrieval, or resource contention.

**Detection**: `transform_duration_seconds` histogram exceeds p95 threshold.

**Mitigation strategies**:

1. **Size-based routing**: Queue images > 5MB to async workers, return 202 with polling URL
2. **Operation limits**: Cap maximum output dimensions (e.g., 4096×4096), reject excessive blur/sharpen values
3. **Timeout with fallback**: Return lower-quality transform or original if timeout approaches
4. **Pre-warm cold storage**: Move frequently accessed cold-tier assets back to hot tier proactively

```javascript title="timeout-handling.js" collapse={1-5, 25-35}
async function transformWithTimeout(assetId, operations, timeoutMs = 750) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await transform(assetId, operations, { signal: controller.signal })
  } catch (error) {
    if (error.name === "AbortError") {
      // Return degraded response or queue for async processing
      metrics.transformTimeouts.inc({ org: assetId.split("/")[0] })

      // Option 1: Return original (fastest fallback)
      return { fallback: "original", reason: "timeout" }

      // Option 2: Queue and return 202
      // await queue.publish('transforms', { assetId, operations })
      // return { status: 202, pollUrl: `/v1/transforms/${jobId}` }
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
```

### Storage Tier Restoration Latency

**Cold storage retrieval** (Glacier, Coldline, Archive) adds 1-12 hours of latency. This breaks the synchronous transform guarantee.

**Mitigation**:

1. **Tier tracking in database**: `derived_assets.cache_tier` column indicates current storage tier
2. **Proactive restoration**: Cron job restores cold assets with recent `last_accessed_at` updates
3. **Graceful degradation**: For cold original assets, return 202 and trigger async restoration

```sql title="cold-restoration-query.sql"
-- Find cold assets accessed recently that should be restored
SELECT id, storage_key, cache_tier
FROM derived_assets
WHERE cache_tier = 'cold'
  AND last_accessed_at > NOW() - INTERVAL '24 hours'
ORDER BY access_count DESC
LIMIT 100;
```

### CDN Cache Invalidation Failures

**Scenario**: Asset updated, but stale version persists in CDN edge caches.

**Root causes**:

- Invalidation API rate limits exceeded
- Propagation delays (CDNs quote 0-60 seconds, but outliers exist)
- Wildcard invalidation missed specific paths

**Mitigation**:

1. **Version in URL**: Include asset version (`/v{version}/`) so updates get new cache keys automatically
2. **Soft purge with fallback**: Use CDN's stale-while-revalidate to serve stale during revalidation
3. **Invalidation monitoring**: Track invalidation success rates and propagation times
4. **Dual-write period**: For critical updates, serve from origin for 60 seconds before relying on CDN

### Lock Contention Under Load

**Scenario**: Multiple workers compete for the same transform lock, causing lock acquisition timeouts.

**Detection**: `redlock_acquisition_failures` metric spikes, `lock_wait_time` increases.

**Mitigation**:

1. **Lock-free fast path**: Check if transform exists before acquiring lock (optimistic check)
2. **Retry with jitter**: Exponential backoff with randomized jitter to prevent thundering herd
3. **Lock timeout tuning**: Set lock TTL to 2x expected transform time, not a fixed value
4. **Shard by hash prefix**: Distribute lock contention across multiple Redis masters

### Partial Upload / Corrupt Original

**Scenario**: Upload interrupted, storage contains partial file, transform fails with cryptic libvips error.

**Detection**: Sharp throws `VipsError` on invalid input; content hash doesn't match expected.

**Mitigation**:

1. **Hash verification on upload**: Compute SHA-256 during upload, verify before marking complete
2. **Input validation**: Check magic bytes and basic structure before transformation
3. **Graceful error messages**: Map libvips errors to user-friendly responses

```javascript title="input-validation.js" collapse={1-3}
import sharp from "sharp"

async function validateImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata()

    // Check for reasonable dimensions
    if (metadata.width > 50000 || metadata.height > 50000) {
      return { valid: false, error: "Image dimensions exceed maximum (50000×50000)" }
    }

    // Check for minimum size (likely corrupt if too small)
    if (buffer.length < 100) {
      return { valid: false, error: "Image file too small, possibly corrupt" }
    }

    return { valid: true, metadata }
  } catch (error) {
    return { valid: false, error: `Invalid image: ${error.message}` }
  }
}
```

### Rate Limit Exhaustion

**Scenario**: Burst traffic exhausts rate limits, legitimate requests rejected.

**Mitigation**:

1. **Tiered limits**: Higher limits for authenticated requests vs. anonymous
2. **Burst allowance**: Sliding window with small burst buffer (e.g., 110% of limit for 10 seconds)
3. **Priority queuing**: VIP tenants get separate, higher limits
4. **Graceful 429 responses**: Include `Retry-After` header with exact reset time

---

## Conclusion

This architecture provides a production-ready foundation for building a cloud-agnostic image processing platform. The key insight is that image transformation is an ideal candidate for aggressive caching: transformations are pure functions (same inputs → same outputs), making content-addressed storage highly effective.

**Critical tradeoffs made in this design:**

1. **Synchronous-first over queue-first**: We accept higher p99 latency for small images in exchange for simpler client integration (no polling). For large images, we fall back to async.

2. **Efficiency locks over safety locks**: Redlock prevents duplicate work but doesn't guarantee mutual exclusion. This is acceptable because content-addressed storage ensures idempotency—duplicate transforms are wasteful, not dangerous.

3. **Edge authentication over origin-only**: Moving signature validation to the edge adds complexity but dramatically improves private content latency and reduces origin load.

4. **Storage tiering over uniform hot storage**: Cold storage introduces retrieval latency but reduces costs by 40-60% for infrequently accessed content.

**What this architecture does not cover:**

- Video transcoding (different latency characteristics, requires different chunking strategies)
- Real-time image editing (collaborative features, operational transforms)
- AI/ML-based transformations (background removal, upscaling—requires GPU infrastructure)
- Geographic data residency requirements (beyond standard CDN region configuration)

## Appendix

### Prerequisites

- Familiarity with distributed systems concepts (caching, consistency, partitioning)
- Understanding of HTTP caching semantics (Cache-Control, ETags, CDN behavior)
- Basic knowledge of image formats and compression (JPEG, WebP, AVIF characteristics)
- Experience with at least one cloud provider's storage and CDN offerings

### Terminology

| Term                           | Definition                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **Asset**                      | An original uploaded image, stored with its content hash                                      |
| **Derived Asset**              | A transformed version of an asset, identified by the hash of (original + operations)          |
| **Content-Addressed**          | Storage keyed by content hash rather than arbitrary ID; same content → same key               |
| **Fencing Token**              | Monotonically increasing token used to detect stale lock holders                              |
| **Operations Hash**            | SHA-256 of (canonical operation string + original content hash + output format)               |
| **Signed URL**                 | URL with cryptographic signature proving authorization; includes expiration timestamp         |
| **Storage Tier**               | Access latency class: hot (ms), warm (seconds), cold (minutes to hours)                       |
| **Transform Canonicalization** | Normalizing operation parameters to ensure equivalent transforms produce identical cache keys |

### Summary

- **Multi-layer caching** (CDN → Redis → Database → Storage) eliminates 99.9% of redundant processing
- **Content-addressed storage** with deterministic hashing ensures transform idempotency
- **Sharp (libvips 8.18)** provides 26x performance over alternatives with ~50MB memory footprint
- **AVIF** (94.89% browser support) offers 50% compression improvement over JPEG; WebP (95.93%) offers 25-34%
- **Redlock** is appropriate for efficiency optimization but not safety-critical mutual exclusion
- **Edge authentication** with normalized cache keys maximizes CDN hit rates for private content
- **Hierarchical policies** (Organization → Tenant → Space) enable flexible multi-tenant isolation

### References

#### Specifications and Official Documentation

- [RFC 2104 - HMAC](https://datatracker.ietf.org/doc/html/rfc2104) - HMAC-SHA256 specification for signed URLs
- [AV1 Image File Format (AVIF)](https://aomediacodec.github.io/av1-avif/) - AOM AVIF specification
- [WebP Container Specification](https://developers.google.com/speed/webp/docs/riff_container) - Google WebP format spec
- [HTTP Caching (RFC 9111)](https://www.rfc-editor.org/rfc/rfc9111) - HTTP caching semantics

#### Core Library Documentation

- [Sharp Documentation](https://sharp.pixelplumbing.com/) - High-performance Node.js image processing
- [Sharp Performance Benchmarks](https://sharp.pixelplumbing.com/performance/) - 64.42 ops/sec JPEG, 26x faster than jimp
- [Sharp Changelog v0.34.5](https://sharp.pixelplumbing.com/changelog/) - November 2025 release notes
- [libvips 8.18 Release Notes](https://www.libvips.org/2025/12/04/What's-new-in-8.18.html) - UltraHDR, Camera RAW, Oklab support
- [Redis Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) - Official Redlock documentation

#### Design Rationale and Analysis

- [How to do Distributed Locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) - Martin Kleppmann's Redlock analysis (fencing tokens, timing assumptions)
- [Is Redlock Safe?](https://antirez.com/news/101) - Salvatore Sanfilippo's (antirez) response

#### Browser Support and Format Comparison

- [Can I Use: AVIF](https://caniuse.com/avif) - 94.89% global support (January 2026)
- [Can I Use: WebP](https://caniuse.com/webp) - 95.93% global support (January 2026)
- [JPEG XL in Chromium](https://chromestatus.com/feature/5188299478007808) - Chrome team's January 2026 merge

#### Cloud Provider SDKs

- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/) - S3 client
- [Google Cloud Storage Node.js](https://cloud.google.com/nodejs/docs/reference/storage/latest) - GCS client
- [Azure Blob Storage SDK](https://learn.microsoft.com/en-us/javascript/api/@azure/storage-blob/) - Azure Storage client

#### Edge Computing

- [CloudFlare Workers Documentation](https://developers.cloudflare.com/workers/) - Edge compute platform
- [CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html) - AWS edge compute
- [Fastly Compute@Edge](https://www.fastly.com/products/edge-compute) - Fastly edge platform

#### Frameworks and Tools

- [Fastify](https://fastify.dev/) - Low-overhead Node.js web framework
- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html) - JSON support documentation
- [Prometheus](https://prometheus.io/docs/introduction/overview/) - Monitoring and alerting toolkit
