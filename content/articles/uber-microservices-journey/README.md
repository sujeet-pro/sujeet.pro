---
title: 'Uber: From Monolith to Domain-Oriented Microservices'
linkTitle: 'Uber Microservices'
description: >-
  Uber's three-phase architecture evolution — from a Python/Node.js monolith to 4,000+ microservices to Domain-Oriented Microservice Architecture (DOMA) — showing how each phase solved scaling bottlenecks while creating new organizational challenges.
publishedDate: 2026-02-16T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - case-study
  - architecture
  - system-design
  - microservices
---

# Uber: From Monolith to Domain-Oriented Microservices

How Uber evolved from two monolithic services to 4,000+ microservices and then restructured into domain-oriented architecture, demonstrating that the hardest part of microservices is not splitting the monolith but managing what comes after. Each architectural phase solved real scaling bottlenecks while creating new organizational and operational challenges at the next order of magnitude.

![Uber's three architectural phases. Each transition was triggered by the previous architecture hitting its operational limits at the next order of magnitude.](./diagrams/uber-s-three-architectural-phases-each-transition-was-triggered-by-the-previous--light.svg "Uber's three architectural phases. Each transition was triggered by the previous architecture hitting its operational limits at the next order of magnitude.")
![Uber's three architectural phases. Each transition was triggered by the previous architecture hitting its operational limits at the next order of magnitude.](./diagrams/uber-s-three-architectural-phases-each-transition-was-triggered-by-the-previous--dark.svg)

## Abstract

Uber's architecture evolution follows a pattern common to hypergrowth companies: the monolith works until organizational scaling demands decomposition, the resulting microservices work until their sheer number creates a new class of problems, and the response is not to go back but to add structure on top.

The core mental model has three phases:

- **Monolith (2009-2013)**: Two services (Python API + Node.js Dispatch) sharing a single PostgreSQL instance. Worked for one city and one product. Failed when concurrent engineers and concurrent cities made single-deployment and single-database models untenable.
- **Microservices explosion (2013-2018)**: Aggressive decomposition drove service count from 1 to 4,000+ in five years. Enabled 10x engineering growth (200 to 2,000 engineers in 18 months) but produced a "death star" dependency graph, cascading failures across deep call chains, and cognitive overload from thousands of independently structured services.
- **DOMA (2018-2020)**: Domain-Oriented Microservice Architecture grouped 2,200 critical services into 70 domains with gateway interfaces, five dependency layers, and an extension model. Did not reduce service count but imposed structure that cut onboarding time by 25-50% and platform support costs by an order of magnitude.

The key insight: microservices were Uber's answer to **organizational scaling**, not primarily a traffic-handling problem. As Matt Ranney, Uber's Chief Systems Architect, framed it in his 2016 QCon talk, microservices are "[a way of replacing human communication with API coordination][hsranney]" — an attractive trade once you have hundreds of engineers on a single shared codebase, and a costly one once you have thousands of services nobody can fully reason about.

## Context

### The System

Uber's platform connects riders with drivers in real time across a global marketplace. The core technical challenge is a two-sided matching problem with tight latency budgets: hot-path geospatial services like geofence-lookup operate in single-digit milliseconds at the P95, dispatch decisions happen in real time, and supply/demand dynamics shift continuously across thousands of cities.

### Scale at Key Inflection Points

| Metric | 2013 (End of Monolith) | 2016 (Peak Microservices) | 2020-2023 (DOMA era) |
|--------|----------------------|--------------------------|-------------|
| Cities | ~65 | ~400 across 70 countries | 10,000+ |
| Engineers | ~100 | ~2,000 | ~4,000 |
| Microservices | 2 (monoliths) | 1,000+ ([early March 2016][hsranney]) | 2,200 critical / 4,000+ total ([2019 monitoring][cncf-4000]) |
| Source repos | A handful | 8,000+ git repos ([Ranney, 2016][hsranney]) | Consolidated into language monorepos (Go monorepo: ~50M LoC, ~2,100 services by 2023[^uber-go-monorepo]) |
| Deployments/week | Single deploy | Hundreds | 100,000+ across 4,500 services and 4,000 engineers (Sep 2023)[^uber-up-2023] |
| Trips milestone | — | 2 billionth ([18 Jun 2016][reuters-2b]) | 10 billionth ([10 Jun 2018][mashable-10b]) |

[hsranney]: https://highscalability.com/lessons-learned-from-scaling-uber-to-2000-engineers-1000-ser/
[cncf-4000]: https://www.cncf.io/blog/2019/02/05/how-uber-monitors-4000-microservices/
[reuters-2b]: https://www.reuters.com/article/business/uber-reaches-2-billion-rides-six-months-after-hitting-its-first-billion-idUSKCN0ZY1T8/
[mashable-10b]: https://mashable.com/article/uber-10-billion-trips-milestone

[^uber-go-monorepo]: ["Building Uber's Go Monorepo with Bazel"](https://www.uber.com/us/en/blog/go-monorepo-bazel/) and ["Data Race Patterns in Go"](https://www.uber.com/us/en/blog/data-race-patterns-in-go/), Uber Engineering.

[^uber-up-2023]: ["Up: Portable Microservices Ready for the Cloud"](https://www.uber.com/us/en/blog/up-portable-microservices-ready-for-the-cloud/), Uber Engineering, Sep 2023.

### The Trigger

Uber's architecture did not evolve on a planned schedule. Each phase transition was forced by a specific scaling crisis:

- **2013**: The single PostgreSQL database was running out of capacity. Engineers estimated the infrastructure would fail to function by the end of 2014.
- **2016**: The "death star" dependency graph made the system unpredictable. A latency spike in any of hundreds of dependencies could cascade across the entire platform.
- **2018**: Feature velocity was declining despite growing headcount. Engineers needed to navigate ~50 services across 12 teams to investigate a single production issue.

## Phase 1: The Monolith (2009-2013)

### Architecture

Uber launched in 2009 on a LAMP stack. By 2011 the architecture had settled into two monolithic services[^uber-tech-stack]:

- **API service**: Python on Flask/uWSGI, owning all business logic — rider management, billing, payments, driver onboarding — backed by a single PostgreSQL instance.
- **Dispatch service**: Node.js, handling real-time driver-rider matching and location tracking. Uber was one of the earliest large-scale adopters of Node.js. Initial state lived in MongoDB and later moved to Redis.

Both services shared the same PostgreSQL database for persistent state. An intermediate layer called "ON" (Object Node) sat between Dispatch and the API service for resilience.

[^uber-tech-stack]: ["The Uber Engineering Tech Stack, Part I: The Foundation"](https://www.uber.com/blog/tech-stack-part-one-foundation/), Uber Engineering Blog.

### Why It Worked Initially

For a single product (UberBLACK) in a single city (San Francisco), this architecture was sufficient. Deployments were simple -- one team, one codebase, one database. The entire engineering team could hold the system model in their heads.

### Why It Broke

As Uber expanded from 1 city to 65 cities and from 1 product to multiple product lines, four problems compounded:

**Database saturation**: The single PostgreSQL instance could not handle the write volume from exponential trip growth. Write amplification was severe -- updating a single field required writing a new tuple plus updating all secondary indexes. Cross-datacenter WAL-based replication consumed prohibitive bandwidth.

**Deployment coupling**: Every code change required deploying the entire monolith. With dozens of engineers committing daily, the deployment queue became a bottleneck. A bug in billing code could take down dispatch.

**Organizational scaling**: "Tribal knowledge was required before attempting to make a single change." New engineers could not contribute safely without understanding the entire codebase. Components were tightly coupled with implicit dependencies.

**Concurrency bugs**: The dispatch system suffered from race conditions -- dispatching two cars to one rider, or matching one driver to multiple simultaneous requests. These bugs were symptoms of a monolith doing too many things in a single process.

## Phase 2: The Microservices Explosion (2013-2018)

### The Decision

In 2013, following the well-publicised paths of Amazon, Netflix, and Twitter, Uber's engineering leadership decided to decompose the monolith. The [2015 SOA blog post](https://www.uber.com/blog/service-oriented-architecture/) is explicit about the goal: enabling teams to deploy independently without coordinating with every other team. Traffic was a constraint, but it was not _the_ constraint.

### Migration Approach

Uber did not do a big-bang rewrite. Services were extracted incrementally from the monolith, starting with the most painful coupling points:

**Timeline of service growth:**

| Date | Services | Key milestone |
|------|----------|---------------|
| Mid-2014 | ~100 | Schemaless replaces PostgreSQL |
| September 2015 | 500+ | SOA blog post published; goal to eliminate monolith repo by year end |
| March 2016 | 1,000+ | 1,000th production service deployed |
| Early 2017 | 2,000+ | Jaeger tracing integrated across hundreds of services |
| 2018-2019 | 4,000+ | Peak service count |

**Key technology choices:**

- **Apache Thrift** as the IDL (Interface Definition Language) for cross-service contracts, giving every service a typed schema instead of a hand-rolled JSON envelope.
- **[TChannel](https://github.com/uber/tchannel)**: A custom TCP multiplexing protocol for RPC, designed so that slow requests do not head-of-line-block faster ones on the same connection. Distributed tracing was promoted to a first-class protocol concern: every `call req` and `error` frame carries a 25-byte Dapper-style trace context (`spanid`, `parentid`, `traceid`, `traceflags`) embedded in the binary header[^tchannel-spec], which removed the "did you remember to propagate the trace?" failure mode that plagues HTTP-based stacks.
- **[Ringpop](https://www.uber.com/blog/ringpop-open-source-nodejs-library/)**: Application-layer consistent hashing library that used a SWIM-style gossip protocol for cluster membership, so services could self-organize into sharded clusters without an external coordinator. It became the substrate for many of Uber's high-throughput real-time services.
- **Hyperbahn**: An overlay network of routers built on Ringpop and TChannel. Services registered by name; consumers reached producers without knowing hosts or ports, and the routers provided fault tolerance, rate limiting, and circuit breaking.

[^tchannel-spec]: [TChannel Protocol Specification](https://tchannel.readthedocs.io/en/latest/protocol/) — `tracing` block layout and frame types.

### Infrastructure Built During This Phase

The microservices explosion forced Uber to build an entire platform stack. Each system below solved a specific scaling bottleneck:

**Storage — [Schemaless (2014)](https://www.uber.com/blog/schemaless-part-one-mysql-datastore/)**: When PostgreSQL hit capacity, Uber built Schemaless: an append-only sparse three-dimensional hash map on top of sharded MySQL. Cells are addressed by `(row_key UUID, column_name string, ref_key integer)` and contain immutable JSON. Updates write a new cell with a higher `ref_key` rather than mutating in place, which sidesteps update amplification at the cost of needing background compaction. Buffered writes went to both the primary and a randomly-chosen secondary cluster, so a master failure did not lose recent writes[^schemaless-arch]. Schemaless later [evolved into Docstore](https://www.uber.com/blog/schemaless-sql-database/), a general-purpose distributed SQL database with Raft-based replication and partition-level strict serializability. Together, these systems now store [tens of petabytes and serve tens of millions of requests per second](https://www.uber.com/blog/mysql-to-myrocks-migration-in-uber-distributed-datastores/).

**Tracing — [Jaeger (2015)](https://www.uber.com/blog/distributed-tracing/)**: Created by Yuri Shkuro to replace Merckx, a Python-monolith-era tracer that pulled spans from a Kafka stream and could not propagate context across services. Jaeger inverted the model: local agents on every host receive spans over UDP and forward them. Uber chose to build rather than adopt Zipkin because they lacked operational experience with Zipkin's then-dependencies (Scribe and Cassandra) and because Zipkin's tree-shaped span model did not support key-value logging or DAG-shaped traces. Jaeger [graduated from the CNCF in October 2019][cncf-jaeger] (the 7th top-level project). At Uber's scale, individual production traces routinely contain tens of thousands of spans.

**Metrics — [M3 (2015)](https://www.uber.com/blog/m3/)**: Replaced a Graphite/Carbon/Whisper + Cassandra stack that lacked native replication, required manual resharding, and lost data on any single-node disk failure. M3 stores over **6.6 billion time series**, aggregates **500 million metrics per second** in flight, and persists **20 million resulting datapoints per second** to storage. Custom **M3TSZ** compression — an optimization of Facebook's Gorilla algorithm for `float64` values — combined with a move from Cassandra to M3DB delivered roughly a 7-10× reduction in hardware footprint.

**Workflow orchestration — [Cadence (2017)](https://www.uber.com/blog/announcing-cadence/)**: Built by Maxim Fateev and Samar Abbas, who previously built AWS Simple Workflow Service. Traditional workflow engines exposed a DSL that became unwieldy past trivial flows; Cadence inverted that — workflows are written in native Go or Java and the engine handles persistence, queues, timers, retries, and recovery. At Uber it processes over 12 billion executions and 270 billion actions per month across more than 1,000 services. Fateev and Abbas left Uber in October 2019 to fork Cadence into [Temporal](https://temporal.io/blog/samars-journey).

**Container distribution — [Kraken (2018)](https://www.uber.com/blog/introducing-kraken/)**: A P2P Docker registry inspired by BitTorrent. Standard registries could not feed deploys at Uber's cluster scale because every host was pulling from a small pool of registry servers. Kraken pushes blobs peer-to-peer: at peak it distributes **20,000 blobs (100 MB-1 GB each) in under 30 seconds** across clusters of 8,000+ hosts, with cluster size having minimal effect on per-host throughput.

[^schemaless-arch]: ["The Architecture of Schemaless"](https://www.uber.com/blog/schemaless-part-two-architecture/) describes the buffered-write protocol and master/replica topology.

[cncf-jaeger]: https://www.cncf.io/announcements/2019/10/31/cloud-native-computing-foundation-announces-jaeger-graduation/

### The Language Migration

Uber started with Python (Flask/uWSGI) for the API monolith and Node.js for dispatch. Both hit performance walls as services proliferated:

**Python problems**: Flask blocked on network calls and I/O. The uWSGI worker model required provisioning more capacity and more services than the workload warranted.

**Node.js problems**: Single-threaded event loop tied up CPUs during compute-intensive operations (geospatial calculations, serialization). Background data refreshes caused query latency spikes because both competed for the same thread.

**Go adoption (~2015)**: The geofence service — Uber's highest-QPS service — became the public proof point. On [New Year's Eve 2015](https://www.uber.com/blog/go-geofence-highest-query-per-second-service/), it handled **170,000 QPS on 40 machines at 35% CPU**, with P95 latency under 5 ms and P99 under 50 ms. Go's goroutines let background data refreshes run concurrently with foreground queries instead of competing for the same Node.js event-loop tick.

By 2018, Uber had effectively standardized on **Go and Java** for new backend services. The Go monorepo has since grown to roughly 50 million lines of code and ~2,100 unique Go services, with monthly active Go developers growing from fewer than 10 in the early days to nearly 900 by the time of the Bazel migration writeup[^uber-go-monorepo].

### The "Death Star" Problem

By 2016, with 1,000+ services, the architecture had produced exactly the complexity it was supposed to eliminate. Matt Ranney, Uber's Chief Systems Architect, described the dependency graph as "wildly complicated" — the visualization of service-to-service calls resembled a death star with tangled, opaque connections.[^ranney-qcon]

![Direct service-to-service calls produce an N×M dependency graph (left). A domain gateway collapses N×M into N+M.](./diagrams/death-star-vs-gateway-light.svg "Direct service-to-service calls produce an N×M dependency graph (left). A domain gateway collapses N×M into N+M.")
![Direct service-to-service calls produce an N×M dependency graph (left). A domain gateway collapses N×M into N+M.](./diagrams/death-star-vs-gateway-dark.svg)

[^ranney-qcon]: Matt Ranney, ["What Comes After Microservices?"](https://www.infoq.com/presentations/microservices-future/), QCon SF 2016. The companion [HighScalability summary](https://highscalability.com/lessons-learned-from-scaling-uber-to-2000-engineers-1000-ser/) preserves the headline metrics and quotes.

**Cascading failures**: With 100 interdependent services each responding slowly 1% of the time, the probability of at least one slow response per request is $1 - 0.99^{100} \approx 63.4\%$. Retries then amplify rather than absorb the problem. A single slow dependency could surface as user-visible latency several call hops upstream.

**Cognitive overload**: Investigating a single production issue could require navigating tens of services across a dozen teams. Each service was structured differently, with no consistent patterns for discovery, error handling, or API contracts.

**Reliability paradox**: Uber was most reliable on weekends — the highest-traffic period for riders — because engineers were not deploying. Ranney's blunt summary: ["The time when Uber is most reliable is on the weekends because that is when the Uber engineers aren't making changes."][hsranney]

**Repository explosion**: 8,000+ git repositories growing by roughly 1,000 per month. Finding the right service, understanding its API, and knowing who owned it became significant engineering overhead.

**Technology fragmentation**: Multiple message queues, varying databases, different communication protocols, and multiple languages fragmented engineering culture into competing technical tribes.

Ranney's QCon SF 2016 talk, ["What Comes After Microservices?"][ranney-qcon-talk], openly questioned whether microservices were solving more problems than they created at this scale — a striking thing to hear from the Chief Systems Architect of one of the most-cited microservices success stories of the era.

[ranney-qcon-talk]: https://qconsf.com/sf2016/sf2016/presentation/what-comes-after-microservices.html

## Phase 3: DOMA -- Domain-Oriented Microservice Architecture (2018-2020)

### The Insight

The answer to microservice complexity was not fewer services or a return to monoliths. It was adding a layer of organizational structure on top of existing services.

Published in July 2020, DOMA was the result of two years of work by 60+ engineers. The key observation: microservices at Uber had a **1.5-year half-life** -- 50% of services were created or deprecated every 18 months. Imposing structure at the service level was futile because services were too ephemeral. Structure had to exist at a higher abstraction: **domains**.

### Architecture

DOMA introduced four concepts:

**Domains**: Collections of one or more microservices tied to a logical grouping of functionality. Uber classified 2,200 critical microservices into 70 domains. A domain represents a bounded context in Domain-Driven Design (DDD) terms -- a coherent unit of business capability.

**Layers**: Five dependency layers with strict rules about which layers can call which:

| Layer | Purpose | Example |
|-------|---------|---------|
| Edge | Safely exposes services to the outside world; mobile-aware | API gateways, partner APIs |
| Presentation | Consumer-facing application features | Mobile app screens, web views |
| Product | Functionality for a specific line of business | Rides, Eats, Freight |
| Business | Uber-wide logic not specific to a single product | Maps, payments, identity |
| Infrastructure | Generic engineering capabilities any org could use | Storage, networking, compute |

Dependencies flow downward: Edge calls Presentation, Presentation calls Product, and so on down to Infrastructure. Lateral calls within a layer go through that domain's gateway. Upward calls are prohibited — that one rule is what bounds blast radius and makes platform rewrites tractable.

![DOMA's five dependency layers. Calls flow downward; lateral calls within a layer go through the target domain's gateway; upward calls are prohibited.](./diagrams/doma-layered-architecture-light.svg "DOMA's five dependency layers. Calls flow downward; lateral calls within a layer go through the target domain's gateway; upward calls are prohibited.")
![DOMA's five dependency layers.](./diagrams/doma-layered-architecture-dark.svg)

**Gateways**: A single entry point into each domain. Upstream consumers call the gateway — never individual services inside the domain. The gateway exposes three stable interface shapes: RPC APIs, messaging events, and queries. This indirection let two major Uber platform rewrites happen entirely "behind gateways" without forcing hundreds of upstream services to migrate.

**Extensions**: A mechanism allowing domains to be extended without modifying the domain's own code. Two types:

- **Logic extensions**: A plugin/provider pattern where the domain defines extension points and consumers register implementations.
- **Data extensions**: Uses Protocol Buffers' [`Any`](https://protobuf.dev/programming-guides/proto3/#any) type so callers can attach arbitrary, opaque context to domain entities without the domain having to know about (or deserialize) that data.

![A single DOMA domain: the gateway is the only externally addressable surface; extension points let consumers add behaviour without forking the domain.](./diagrams/domain-anatomy-light.svg "A single DOMA domain: the gateway is the only externally addressable surface; extension points let consumers add behaviour without forking the domain.")
![A single DOMA domain.](./diagrams/domain-anatomy-dark.svg)

### Implementation

DOMA did not require rewriting services. It imposed structure on top of existing ones:

1. **Domain classification**: Each of 2,200 services was assigned to one of 70 domains based on its business capability
2. **Gateway deployment**: Each domain received a gateway service that became the sole external interface
3. **Dependency enforcement**: Tooling validated that cross-domain calls went through gateways and respected layer ordering
4. **Extension registration**: Domains that needed cross-cutting behavior registered extension points rather than accepting direct calls

At the time of the July 2020 blog post, approximately 50% of domains had been implemented.

### Why Not Just Merge Services?

DOMA explicitly avoided consolidating microservices back into larger services. The reasoning: microservices' independent deployment, clear ownership, and technology flexibility were real benefits worth preserving. The problem was not the services themselves but the lack of structure in how they related to each other. Domains provided that structure without sacrificing service-level autonomy.

> [!NOTE]
> The concept of domain organization draws from DDD, Clean Architecture, Service-Oriented Architecture (SOA), and object-oriented interface design. DOMA is Uber's synthesis of these patterns for their specific scale and organizational structure.

### Organizational Mapping

Critically, domains do not always follow company org chart boundaries. The Uber Maps organization, for example, spans three domains with 80 microservices across three gateways. This reflects logical business boundaries rather than reporting hierarchies -- a deliberate choice to avoid Conway's Law forcing suboptimal technical architecture.

## Outcome

### Metrics Comparison

All numbers in this table come from the [July 2020 DOMA blog post](https://www.uber.com/blog/microservice-architecture/) unless otherwise noted; treat them as Uber-reported, not independently audited.

| Metric | Before DOMA (~2018) | After DOMA (~2020) | Improvement |
|--------|-------------------|-------------------|-------------|
| Feature integration time (early platform consumer of the extension model) | ~3 days | ~3 hours | ~24× faster |
| New engineer onboarding | Baseline | 25-50% faster | 1.3-2× |
| Platform support cost | Baseline | Order-of-magnitude reduction | ~10× |
| Services to call for a new feature | Many downstream services | 1 domain gateway | Dramatic simplification |
| Microservice half-life | ~1.5 years | ~1.5 years (unchanged) | Structure tolerates churn rather than reducing it |

### Timeline

- **Total DOMA project duration**: ~2 years (2018-2020)
- **Engineering effort**: 60+ engineers contributed
- **Adoption at publication**: ~50% of domains implemented

### Unexpected Benefits

- **Platform rewrites behind gateways**: Two major platform rewrites occurred without upstream migration -- gateways absorbed the internal changes
- **Extension model velocity**: Feature integration that previously required coordinating across multiple teams reduced to registering an extension with a single domain
- **Reduced tribal knowledge dependency**: Gateway APIs provided discoverable, documented entry points instead of requiring engineers to know which of thousands of services to call

### Remaining Limitations

- Service count remained high (4,000+) -- DOMA manages complexity, it does not eliminate it
- The 1.5-year half-life of services means domain assignments require continuous maintenance
- Extension points require upfront design investment that not all domain teams had completed
- Cross-domain transactions remain architecturally complex

## Lessons Learned

### Technical Lessons

#### 1. Microservices Are an Organizational Tool, Not Primarily a Technical One

**The insight**: Uber decomposed into microservices not because the monolith could not handle the traffic but because the engineering organisation — growing from 200 to 2,000 engineers in roughly 18 months[^hs-engineers] — could not safely share a single codebase at the deployment rate the business demanded. The point of decomposition was to "[replace human communication with API coordination][hsranney]", as Ranney put it.

[^hs-engineers]: The 200 → 2,000 engineers in ~1.5 years figure is from Ranney's QCon SF 2016 talk, summarised on [HighScalability][hsranney].

**How it applies elsewhere:**

- Evaluate microservice adoption based on team size and deployment frequency, not request volume
- A 10-person team rarely benefits from microservices; a 200-person team almost always does
- Microservices replace human communication with API contracts -- this is a feature when communication does not scale, and overhead when it does

**Warning signs to watch for:**

- Deployment queue wait times growing despite stable codebase size
- "Tribal knowledge" becoming a prerequisite for contributions
- Merge conflicts and test failures increasing with team size, not code complexity

#### 2. Service Count Will Exceed Your Ability to Reason About the System

**The insight**: Uber crossed 1,000 services in early 2016 -- just three years after starting decomposition. At that scale, no individual could hold the system model in their head. The "death star" was not a design failure but an inevitable consequence of unconstrained decomposition.

**How it applies elsewhere:**

- Plan for service-level structure (domains, bounded contexts, platform teams) before you need it
- Invest in observability (tracing, dependency mapping) before the graph becomes opaque
- The transition from "I can reason about this" to "nobody can reason about this" happens faster than expected

**Warning signs to watch for:**

- Engineers cannot explain the end-to-end request path for common user flows
- Incident investigation requires consulting more than three teams
- New services are created faster than documentation or runbooks can cover them

#### 3. Build Infrastructure Only When Forced

**The insight**: Uber built Schemaless when PostgreSQL ran out of space, Jaeger when Merckx could not trace across services, M3 when Graphite lost data on disk failures, and Kraken when Docker registries could not keep up. Each infrastructure investment was a response to a concrete, measured bottleneck -- not speculative future-proofing.

**How it applies elsewhere:**

- Adopt off-the-shelf solutions until they demonstrably fail at your scale
- When you must build custom infrastructure, solve the specific bottleneck, not a generalized problem
- Open-source your solutions -- Uber's Jaeger, Cadence, M3, and Kraken all became significant community projects

#### 4. Gateways Absorb Internal Architecture Changes

**The insight**: Two major Uber platform rewrites happened behind domain gateways without any upstream service migrations. The gateway pattern decoupled internal evolution from external contracts.

**How it applies elsewhere:**

- Place gateways at domain boundaries before you need to refactor behind them
- Design gateway APIs around business capabilities, not internal service structures
- Gateways trade latency (one extra hop) for evolvability -- at Uber's scale, this was clearly worth it

### Process Lessons

#### 1. Mandates to Migrate Are Counterproductive

**What Uber learned**: Ranney advocated a "[pure carrots, no sticks][hsranney]" approach — provide tools so obviously superior that adoption becomes intuitive rather than mandated. Forced migrations create resentment and corner-cutting. The Go migration succeeded because Go demonstrably outperformed Python and Node.js for Uber's hottest workloads (the geofence service is the canonical proof point), not because the older languages were banned.

**What they would do differently**: Start language standardization earlier. Multiple languages fragmented engineering culture into competing "tribes" and complicated cross-service debugging and platform investment.

### Organizational Lessons

#### 1. Conway's Law Is a Force to Harness, Not Fight

**The insight**: Uber's microservice boundaries naturally mirrored team boundaries. DOMA worked because it aligned domain boundaries with business capabilities rather than org chart hierarchy. The Maps organization spanning three domains with three gateways shows that logical architecture should drive organizational grouping, not the reverse.

**How organization structure affected the outcome**: When "Company > Team > Self" priority inverted -- when individual or team interests overrode organizational benefit -- that is when political dysfunction occurred and architectural decisions became suboptimal.

## Applying This to Your System

### When This Pattern Applies

You might face similar challenges if:

- Your engineering team is growing faster than 2x per year
- Deployment frequency is limited by coordination overhead, not technical constraints
- Your monolith codebase requires "tribal knowledge" for safe changes
- You already have microservices but cannot trace end-to-end request flows

### When This Pattern Does NOT Apply

- Teams under ~50 engineers rarely need formal domain structure
- If your deployment pipeline handles your current coordination needs, decomposition adds overhead without benefit
- If your services communicate primarily through async events rather than synchronous RPC, the "death star" problem is less acute

### Checklist for Evaluation

- [ ] Can any engineer explain the end-to-end path of your most common request?
- [ ] Do incident investigations regularly require more than two teams?
- [ ] Are new services being created without clear domain ownership?
- [ ] Is your service dependency graph visualizable and understandable?
- [ ] Can you deploy a feature without coordinating with more than one other team?

### Starting Points

1. **Map your dependency graph** before decomposing or restructuring. Tools like Jaeger, Zipkin, or commercial APM (Application Performance Monitoring) platforms can generate service maps from production traffic.
2. **Identify natural domain boundaries** by analyzing which services always change together. High co-change frequency indicates they belong in the same domain.
3. **Start with gateways** for your highest-traffic cross-team boundaries. Even one gateway reduces the blast radius of future changes.
4. **Measure what matters**: Track deployment frequency, lead time for changes, mean time to recovery, and cross-team coordination overhead. These are the metrics that reveal whether your architecture is serving your organization.

## Conclusion

Uber's journey from monolith to 4,000+ microservices to domain-oriented architecture is not a cautionary tale about microservices. It is a demonstration that architecture must evolve with organizational scale, and that each architectural phase creates the conditions for the next.

The monolith worked for one city. Microservices worked for 400 cities. DOMA works for 10,000+ cities. None of these were wrong choices -- they were appropriate choices for their scale. The lesson is not which architecture to choose but when to recognize that your current architecture has reached its limits, and how to evolve without stopping the system.

The most transferable insight is Ranney's observation that scaling traffic is not the hard problem. Scaling the team -- enabling hundreds or thousands of engineers to ship independently without breaking each other's work -- is what drives every architectural decision. If you remember one thing from Uber's journey, let it be this: architect for the organization you are becoming, not the traffic you are serving.

## Appendix

### Prerequisites

- Familiarity with microservices patterns (service discovery, API gateways, circuit breakers)
- Understanding of distributed systems fundamentals (CAP theorem, eventual consistency)
- Basic knowledge of Domain-Driven Design concepts (bounded contexts, aggregates)

### Terminology

| Term | Definition |
|------|-----------|
| DOMA | Domain-Oriented Microservice Architecture -- Uber's framework for organizing microservices into domains with gateways and layers |
| DDD | Domain-Driven Design -- a software design approach that models software around business domains |
| SOA | Service-Oriented Architecture -- the predecessor pattern to microservices with coarser-grained services |
| SWIM | Scalable Weakly-consistent Infection-style Process Group Membership Protocol -- gossip protocol used by Ringpop |
| IDL | Interface Definition Language -- a specification language for defining service contracts (e.g., Thrift, Protocol Buffers) |
| CDC | Change Data Capture -- a pattern for tracking and propagating data changes |
| QPS | Queries Per Second -- throughput measurement for request-handling systems |
| APM | Application Performance Monitoring -- tools for tracking application performance and tracing requests |

### Summary

- Uber's monolith (2 services, 1 PostgreSQL instance) worked for 1 city but could not scale past 65 cities due to deployment coupling and database saturation
- Microservices decomposition (2013-2018) grew to 4,000+ services and enabled 10x engineering team growth, but produced cascading failures, cognitive overload, and a "death star" dependency graph
- DOMA (2018-2020) grouped 2,200 critical services into 70 domains with gateways, five dependency layers, and an extension model -- reducing onboarding time by 25-50% and platform support costs by 10x
- Custom infrastructure (Schemaless, Jaeger, M3, Cadence, Kraken) was built reactively when existing solutions hit measured limits, not speculatively
- The language migration from Python/Node.js to Go/Java delivered dramatically better latency on hot paths (the Go geofence service ran at 170k QPS, P95 < 5 ms, on 40 machines) and enabled standardized tooling across roughly 2,100 Go services
- Microservices are fundamentally an organizational scaling tool -- evaluate them based on team size and deployment frequency, not traffic volume

### References

- [Service-Oriented Architecture: Scaling the Uber Engineering Codebase As We Grow](https://www.uber.com/blog/service-oriented-architecture/) - Uber Engineering Blog, September 2015
- [Introducing Domain-Oriented Microservice Architecture](https://www.uber.com/en-US/blog/microservice-architecture/) - Adam Gluck, Uber Engineering Blog, July 2020
- [What Comes After Microservices? (QCon SF 2016)](https://www.infoq.com/presentations/uber-scalability-services/) - Matt Ranney, InfoQ
- [Lessons Learned from Scaling Uber to 2000 Engineers, 1000 Services, and 8000 Git Repositories](https://highscalability.com/lessons-learned-from-scaling-uber-to-2000-engineers-1000-ser/) - High Scalability
- [The Uber Engineering Tech Stack, Part I: The Foundation](https://www.uber.com/blog/tech-stack-part-one-foundation/) - Uber Engineering Blog
- [Designing Schemaless, Uber Engineering's Scalable Datastore Using MySQL](https://www.uber.com/blog/schemaless-part-one-mysql-datastore/) - Uber Engineering Blog
- [Evolving Distributed Tracing at Uber Engineering](https://www.uber.com/blog/distributed-tracing/) - Yuri Shkuro, Uber Engineering Blog
- [M3: Uber's Open Source, Large-scale Metrics Platform for Prometheus](https://www.uber.com/blog/m3/) - Uber Engineering Blog
- [Announcing Cadence 1.0](https://www.uber.com/blog/announcing-cadence/) - Uber Engineering Blog, June 2023
- [Introducing Kraken, an Open Source Peer-to-Peer Docker Registry](https://www.uber.com/blog/introducing-kraken/) - Uber Engineering Blog
- [How We Built Uber Engineering's Highest Query per Second Service Using Go](https://www.uber.com/blog/go-geofence-highest-query-per-second-service/) - Uber Engineering Blog
- [Code Migration in Production: Rewriting the Sharding Layer of Uber's Schemaless Datastore](https://www.uber.com/blog/schemaless-rewrite/) - Uber Engineering Blog
- [Up: Portable Microservices Ready for the Cloud](https://www.uber.com/blog/up-portable-microservices-ready-for-the-cloud/) - Uber Engineering Blog
- [Building Uber's Go Monorepo with Bazel](https://www.uber.com/blog/go-monorepo-bazel/) - Uber Engineering Blog
- [Peloton: Uber's Unified Resource Scheduler](https://www.uber.com/blog/resource-scheduler-cluster-management-peloton/) - Uber Engineering Blog
- [CNCF Announces Jaeger Graduation](https://www.cncf.io/announcements/2019/10/31/cloud-native-computing-foundation-announces-jaeger-graduation/) - CNCF, October 2019
- [Ringpop: Consistent Hashing Library](https://www.uber.com/blog/ringpop-open-source-nodejs-library/) - Uber Engineering Blog
