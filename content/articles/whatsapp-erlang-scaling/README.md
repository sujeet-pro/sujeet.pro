---
title: 'WhatsApp: 2 Million Connections Per Server with Erlang'
linkTitle: 'WhatsApp + Erlang'
description: >-
  How WhatsApp pushed Erlang/BEAM and FreeBSD to 2 million concurrent connections per server, served 465 million users with ~32 engineers, and patched the VM (timer wheels, GC throttling, pg2) to keep a small fleet ahead of growth — a case study in vertical density and runtime co-design.
publishedDate: 2026-02-08T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - case-study
  - distributed-systems
  - system-design
  - erlang
  - outages
---

# WhatsApp: 2 Million Connections Per Server with Erlang

How WhatsApp scaled to a billion users on Erlang/BEAM and FreeBSD with ~32 engineers, ~550 servers, and a custom binary protocol that shrank messages an order of magnitude — by pushing per-server density to limits most teams never attempt and patching the runtime when off-the-shelf primitives ran out.

![WhatsApp's architecture evolution from an ejabberd fork to a custom Erlang runtime running in Facebook data centers.](./diagrams/architecture-evolution-light.svg "WhatsApp's architecture evolved in three phases: an ejabberd/FreeBSD foundation, a scaling phase dominated by BEAM patches and FunXMPP, and a post-acquisition era of Linux, end-to-end encryption, and the WARTS runtime fork.")
![WhatsApp's architecture evolution from an ejabberd fork to a custom Erlang runtime running in Facebook data centers.](./diagrams/architecture-evolution-dark.svg)

## Abstract

WhatsApp's architecture is a case study in radical simplicity at extreme scale. The mental model:

- **One Erlang process per connection, one connection per user.** The BEAM VM's lightweight processes — a few hundred words of initial heap, on the order of 1–3 KB for an idle process — and per-process garbage collection made 2 million concurrent connections per server viable on commodity hardware ([Erlang Efficiency Guide — Processes](https://www.erlang.org/doc/system/eff_guide_processes.html)). This is the foundation everything else builds on.
- **Vertical density before horizontal sprawl.** WhatsApp pushed each server to 2+ million connections before adding servers. Operational complexity scales with node count, not core count — so fewer, larger machines reduce the surface area for failure.
- **Custom everything where it matters.** ejabberd was rewritten. XMPP was replaced with FunXMPP (≈50–70% bandwidth reduction for typical text messages). The BEAM VM itself was patched (timer wheels, GC throttling, pg2 replacement). Standard components were kept only when they didn't bottleneck.
- **Store-and-forward with aggressive deletion.** Messages are transient — deleted from servers after confirmed delivery. 98% offline-cache hit rate; 50% of messages read within 60 seconds ([Reed, Erlang Factory 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)). The server is a router, not a database.
- **Small team, high autonomy.** ~32 engineers — of whom roughly 10 worked on the Erlang stack — served 465 million users at acquisition. Individual teams of 1–3 engineers owned entire subsystems. Erlang's fault tolerance and OTP supervision reduced operational burden to the point where this ratio was sustainable.

## Context

### The System

WhatsApp is a mobile messaging platform that handles text, photos, video, voice messages, voice calls, and video calls. Every message passes through WhatsApp's servers for routing and store-and-forward delivery, but messages are not retained after delivery confirmation.

**Tech stack at time of Facebook acquisition (February 2014):**

- **Language**: Erlang/OTP R16B01 (custom patched)
- **OS**: FreeBSD 9.2
- **Database**: Mnesia (in-memory, ~2TB across 16 partitions), MySQL (persistent user data)
- **Protocol**: FunXMPP (custom binary, evolved from XMPP)
- **Web server**: YAWS (Erlang-based, for multimedia)
- **Hosting**: SoftLayer bare metal, dual datacenter (California + Washington D.C.)

### The Trigger

WhatsApp launched in 2009 as a status-broadcasting app, pivoting to messaging within months. Growth was organic — no advertising, no marketing budget. The trigger for each scaling phase was raw user growth on a fixed, small engineering team:

**Key metrics at milestones:**

| Metric                 | Oct 2011 | Aug 2012 | Dec 2013 | Mar 2014 | Nov 2014 |
| ---------------------- | -------- | -------- | -------- | -------- | -------- |
| Monthly active users   | ~100M    | ~150M    | 400M     | 465M     | 600M+    |
| Messages/day (in+out)  | 1B       | 10B      | 18B      | ~50B     | 64B+     |
| Total servers          | ~100     | ~200     | ~400     | ~550     | ~800     |
| Total CPU cores        | —        | —        | —        | 11,000+  | —        |
| Engineers (total)      | ~20      | ~25      | ~30      | ~32      | ~35      |
| Concurrent connections | —        | —        | —        | 147M     | —        |

The Reed 2014 talk reports 19 billion inbound and 40 billion outbound messages per day at the acquisition snapshot — fan-out (group chats, multi-device delivery) is what drives the inbound/outbound asymmetry.

### Constraints

- **Team size**: Founders deliberately kept the team small. Jan Koum's philosophy: "I want to do one thing and do it well."
- **Budget**: Pre-acquisition, WhatsApp was venture-funded. SoftLayer hosting cost approximately $2 million/month for 700+ servers.
- **Target devices**: Must work on low-end phones over 2G networks in developing markets — bandwidth and battery efficiency were non-negotiable.
- **Availability**: Global 24/7 service with no maintenance windows. Any downtime affected hundreds of millions of users.
- **Organizational**: Individual engineering teams of 1-3 engineers with high autonomy. No dedicated operations staff.

## The Starting Point: ejabberd and Erlang

### Why Erlang

WhatsApp's co-founders chose Erlang indirectly — they chose ejabberd, an open-source XMPP (Extensible Messaging and Presence Protocol) server written in Erlang. Eugene Fooksman, an early WhatsApp engineer, cited the reasons: "openness, great reviews by developers, ease of start and the promise of Erlang's long-term suitability for large communication system."

The choice proved prescient for reasons the team only fully appreciated later:

1. **Lightweight processes**: A newly spawned BEAM process consumes ~338 words on a 64-bit emulator — roughly 2.7 KB, of which 233 words is the initial heap that doubles as the stack ([Erlang Efficiency Guide — Processes](https://www.erlang.org/doc/system/eff_guide_processes.html)). Two million idle processes therefore fit in ~5 GB, leaving the rest of a 100+ GB host for application state, mailboxes, ETS tables, and caches.

2. **Per-process garbage collection**: Unlike JVM-based systems where GC pauses affect the entire runtime, BEAM collects garbage per-process against a private heap ([Erlang Reference Manual — Memory](https://www.erlang.org/doc/apps/erts/erlangmemory.html)). A single slow process does not stall the millions around it — this is the architectural property that made WhatsApp's per-server density possible.

3. **Preemptive scheduling**: BEAM's reduction-based scheduler preempts long-running processes after a fixed number of function-call equivalents ([A brief BEAM primer](https://www.erlang.org/blog/a-brief-beam-primer/)). No single process can starve others — critical when one user is uploading a 10 MB video while another sends a 1-byte ack.

4. **OTP supervision trees**: When a process crashes, its supervisor restarts it according to a declared strategy ([OTP Supervision Principles](https://www.erlang.org/doc/system/sup_princ.html)). WhatsApp relied on this for self-healing: connection handlers can crash and restart without affecting other users.

5. **Hot code loading**: Erlang supports loading new module versions while the system is running ([Code Loading](https://www.erlang.org/doc/system/code_loading.html)). WhatsApp used this for bug fixes and small updates without downtime — essential for a 24/7 global service where "maintenance windows" do not exist.

Rick Reed, who joined WhatsApp in 2011 after 12 years building high-performance messaging systems in C++ at Yahoo, described his initial reaction: Erlang achieved scalability goals on single hosts that his Yahoo team "only dreamed about." Anton Lavrik, lead of WhatsApp's Erlang platform team, put it more directly: with C++, "developers have to implement half of Erlang by themselves" to achieve similar reliability.

### Why FreeBSD

The founders had extensive FreeBSD experience from Yahoo, where it was the standard server OS. WhatsApp benchmarked FreeBSD against Linux under realistic messaging load — FreeBSD's networking stack handled their workload better.

**FreeBSD kernel tuning for 2+ million connections (from WhatsApp's 2012 blog post):**

| Parameter                  | Value     | Purpose                                      |
| -------------------------- | --------- | -------------------------------------------- |
| `kern.maxfiles`            | 3,000,000 | System-wide file descriptor limit            |
| `kern.maxfilesperproc`     | 2,700,000 | Per-process file descriptor limit            |
| `kern.ipc.maxsockets`      | 2,400,000 | Maximum socket count                         |
| `net.inet.tcp.tcbhashsize` | 524,288   | TCP hash table entries for connection lookup |

> **Post-acquisition**: WhatsApp migrated from FreeBSD on SoftLayer bare metal to Linux on Facebook's data center infrastructure between 2017 and 2019. This was an organizational decision — Facebook's container orchestration and monitoring tooling required Linux — not a technical judgment against FreeBSD.

### The ejabberd Rewrite

WhatsApp didn't just configure ejabberd — they spent years rewriting it. According to Fooksman, the team spent "the next few years re-writing and modifying quite a few parts of ejabberd," including:

- **Protocol replacement**: Switched from standard XMPP to a proprietary binary protocol (FunXMPP)
- **Codebase restructuring**: Redesigned core components for their specific access patterns
- **BEAM VM patches**: Modified the Erlang runtime itself to eliminate bottlenecks
- **Storage layer**: Replaced ejabberd's default storage with Mnesia-based and file system-based backends

By 2014, the codebase retained ejabberd's ancestry but bore little resemblance to the original.

## The 2 Million Connections Milestone

### Server Specifications (January 2012)

WhatsApp published detailed server specifications when they achieved 2+ million concurrent TCP connections on a single server:

| Component  | Specification                                  |
| ---------- | ---------------------------------------------- |
| **CPU**    | Intel Xeon X5675 @ 3.07GHz, 24 logical cores   |
| **RAM**    | 103 GB                                         |
| **OS**     | FreeBSD 8.2-STABLE (64-bit)                    |
| **Erlang** | R14B03, 24 SMP threads, kernel polling enabled |

**Peak observed load:** 2,277,845 open sockets at 37.9% user CPU, 13.6% system CPU, 41.9% idle. 35 GB active memory with 27 GB free ([WhatsApp Engineering — "1 million is so 2011"](https://blog.whatsapp.com/1-million-is-so-2011)). The server had significant headroom remaining.

### Why 2 Million Mattered

WhatsApp's approach to scaling was deliberately vertical-first. Rick Reed described this as a consequence of a key insight: operational complexity scales with the number of nodes, not the number of cores per node. A cluster of 100 servers at 2 million connections each is operationally simpler than 1,000 servers at 200,000 each — fewer failure domains, fewer network partitions, fewer inter-node messages.

The BEAM VM's SMP scalability made this viable. Schedulers map 1:1 to cores with minimal cross-scheduler contention, so doubling cores on a single machine nearly doubles throughput. WhatsApp confirmed this with benchmark data showing near-linear scaling up to 24 cores.

> [!NOTE]
> By 2014, WhatsApp deliberately backed off to ~1 million connections per server. Users were sending more messages, exercising more features (photos, video, voice), and each connection cost more resources. The team chose headroom for traffic spikes over peak density ([Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)).

## BEAM VM Tuning and Custom Patches

WhatsApp didn't just use Erlang/OTP — they patched the runtime itself. Rick Reed detailed these modifications at Erlang Factory 2014. Several patches were later upstreamed to mainline OTP; others became obsolete as OTP evolved.

### Timer Wheel Contention

**Problem**: Erlang's timer system used a single timer wheel with a global lock. At millions of concurrent connections, each with keepalive timers and message timeouts, lock contention on the timer wheel became a CPU bottleneck.

**Fix**: WhatsApp implemented multiple timer wheels with independent locks, distributing timer operations across wheels to eliminate contention.

### Garbage Collection Throttling

**Problem**: When a process's message queue grows faster than it can process messages, Erlang's default behavior triggers GC on each message receive. With a queue of millions of messages (during traffic spikes), GC overhead dominates CPU time.

**Fix**: Added GC throttling when the message queue exceeds a threshold. The process defers GC until it can make progress on the queue, trading temporary memory growth for CPU availability.

### Distribution Buffer Sizing

**Problem**: The default inter-node distribution receive buffer was 4KB — far too small for WhatsApp's inter-cluster message volumes. Small buffers caused frequent blocking on inter-node communication.

**Fix**: Increased the default to 256KB and made it configurable.

### pg2 Replacement (The February 2014 Outage)

**Problem**: On 2014-02-22 — eight days after the Facebook acquisition announcement — a backend router dropped a VLAN, causing mass node disconnects and reconnects across the cluster ([TechCrunch — WhatsApp Down 210 Minutes](https://techcrunch.com/2014/02/22/whatsapp-is-down-facebooks-new-acquisition-confirms/)). The `pg2` module (Erlang's distributed process-group registry) entered a state with `n^3` messaging behavior during the reconnection storm: every node re-announced its group membership to every other node, and every announcement triggered another round. Mailboxes went from zero to 4 million in seconds; the outage lasted 210 minutes ([Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)).

**Fix**: WhatsApp first patched `pg2` with denormalized group member lists. Longer term, a fully rewritten `pg` module — authored by WhatsApp engineer Maxim Fedorov — was contributed to mainline OTP and shipped in OTP 23 (June 2020) as the replacement for `pg2`, which was deprecated in OTP 23 and removed in OTP 24 ([OTP 23 Patch Notes](https://www.erlang.org/patches/otp-23.0); [Erlang Forums discussion](https://erlangforums.com/t/did-the-whatsapp-patches-mentioned-in-a-2014-conference-make-it-into-mainstream-erlang/958)). It is one of the more visible WhatsApp contributions back to the Erlang ecosystem.

### Mnesia Transaction Manager

**Problem**: Mnesia's `mnesia_tm` dispatched all `async_dirty` transactions through a single process, serializing operations that could safely run in parallel.

**Fix**: Dispatched async_dirty transactions to separate per-table processes, enabling concurrent record updates across different tables.

### ETS Hash Improvements

**Problem**: Erlang Term Storage (ETS) used `phash2` hashing that could produce collisions under WhatsApp's workload, and the main/name tables didn't scale well with thousands of ETS tables.

**Fix**: Modified hash seeding to avoid `phash2` collisions, and improved table management scaling. The hash-salt patch was contributed upstream via [erlang/otp#2979](https://github.com/erlang/otp/pull/2979).

### Scheduler Binding

WhatsApp enabled scheduler-thread binding via the `+stbt` flag, which pins each BEAM scheduler to a specific CPU core ([erl runtime flags](https://www.erlang.org/doc/apps/erts/erl_cmd.html)). Reed reported this reduced context switching by roughly 4× — a meaningful throughput improvement from a one-line configuration change.

## The gen_industry Dispatch Pattern

### The Bottleneck

Standard Erlang `gen_server` is single-threaded — one process handles all incoming messages sequentially ([gen_server docs](https://www.erlang.org/doc/apps/stdlib/gen_server.html)). For services processing millions of operations per second from many nodes, that single mailbox becomes the limit. WhatsApp's response was a three-tier dispatch hierarchy.

![gen_server scales to a worker pool with gen_factory, then to multiple parallel dispatchers with gen_industry as fan-in grows.](./diagrams/gen-industry-pattern-light.svg "gen_server (sequential) → gen_factory (worker pool with one dispatcher) → gen_industry (multiple dispatchers feeding many workers). The bottleneck moves from the handler to the dispatcher to neither, in that order.")
![gen_server scales to a worker pool with gen_factory, then to multiple parallel dispatchers with gen_industry as fan-in grows.](./diagrams/gen-industry-pattern-dark.svg)

### gen_server → gen_factory → gen_industry

1. **gen_server**: Standard OTP behavior. Single process, sequential dispatch. Fine for low-throughput services.
2. **gen_factory**: Custom behavior. A single dispatch process distributes work across a pool of worker processes. Eliminates the processing bottleneck, but the dispatcher can saturate at high fan-in — the inbound mailbox plus the locks around the worker selection turn into the new bottleneck.
3. **gen_industry**: Custom behavior with **multiple dispatch processes** feeding multiple workers. Parallelizes both ingestion and dispatch. At very high cross-node fan-in this was needed to keep the dispatch layer from becoming the bottleneck ([Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)).

### Data Partitioning

WhatsApp's services partitioned data 2-32 ways (most services used 32-way partitioning):

1. Consistent hashing maps a record to a partition
2. Each partition maps to a Mnesia fragment
3. Each fragment maps to a factory worker process
4. All access to a single record routes to a single Erlang process

This design serializes access to individual records without transactions — the owning process is the lock. Maximum ~8 concurrent processes access any single ETS or Mnesia fragment, controlling lock contention at the storage layer.

## FunXMPP: The Custom Binary Protocol

### Why Replace XMPP

Standard XMPP is XML-based ([RFC 6120](https://datatracker.ietf.org/doc/html/rfc6120)). A short text message carries hundreds of bytes of protocol overhead — XML open/close tags, namespace declarations, attributes — before the payload. WhatsApp's target was the opposite of that profile: feature phones over 2G in developing markets, where every byte cost battery and money. They needed a protocol where the wire form was close to the information form.

### How FunXMPP Works

FunXMPP keeps the XMPP semantic model (stanzas, presence, JIDs) but replaces the XML serialization with a token-based binary encoding:

![FunXMPP replaces XMPP's XML tag soup with single-byte tokens for known stanzas and string values, plus a length-prefixed item count instead of closing tags.](./diagrams/funxmpp-encoding-light.svg "FunXMPP replaces XMPP's XML tag soup with single-byte tokens for known stanzas and string values, plus a length-prefixed item count instead of closing tags. A typical short text message shrinks from ~180 to ~20 bytes.")
![FunXMPP replaces XMPP's XML tag soup with single-byte tokens for known stanzas and string values, plus a length-prefixed item count instead of closing tags.](./diagrams/funxmpp-encoding-dark.svg)

1. **Token replacement**: Reserved XMPP words (`message`, `from`, `body`, …) and common string values (e.g. JID suffixes like `@s.whatsapp.net`) are replaced by single bytes drawn from a shared client/server token table. New tokens require coordinated rollout, which is why the table evolves slowly.
2. **Structural compression**: Instead of opening and closing XML tags, a single byte indicates the start of a structured element and a leading count tells the parser how many child items follow. The parser counts items rather than matching tag names.
3. **Length-prefixed literals**: Unknown strings (user-generated text, JIDs not yet tokenized) are written as a length prefix followed by raw bytes — no quoting or escaping needed.

The reported result is a ≈50–70% reduction in bytes on the wire for typical short messages, dropping a stanza that would be ~180 bytes in XMPP to ~20 bytes in FunXMPP.[^funxmpp] This protocol efficiency was a direct contributor to WhatsApp's dominance in bandwidth-sensitive markets.

[^funxmpp]: The exact wire format is proprietary; concrete byte values reported in third-party reverse-engineering write-ups should be treated as version-specific. The token-table mechanism and the order-of-magnitude size reduction are consistent across WhatsApp Engineering's own descriptions of the protocol.

## Storage Architecture

### Mnesia: The In-Memory Layer

WhatsApp used Mnesia, Erlang's built-in distributed database, as its primary metadata store:

| Configuration      | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Total RAM**      | ~2TB across 16 partitions                                   |
| **Total records**  | ~18 billion                                                 |
| **Node topology**  | Island architecture: 2 nodes per island (primary/secondary) |
| **Account table**  | 512 fragments                                               |
| **Cache hit rate** | 98%                                                         |

**What Mnesia stored:**

- User-to-server routing tables (which server handles which user)
- Offline message queues (messages waiting for delivery)
- User profiles and group memberships
- Multimedia metadata

**What Mnesia did not store:**

- Message content (transient — deleted after delivery confirmation)
- Bulk media files (stored on filesystem)
- Persistent user data (MySQL shards)

### Mnesia Limitations and Workarounds

Mnesia has known scalability constraints:

- `ram_copies` and `disc_copies` tables require the full dataset in memory
- `disc_copies` tables read the entire table from disk into memory on node startup — slow for large tables
- `disc_only_copies` tables are limited to 2GB each (DETS limitation)

WhatsApp worked around these with:

- **Island architecture**: Each 2-node island manages a subset of data, keeping per-island datasets manageable
- **UFS2 filesystem on FreeBSD**: Bulk data storage outside Mnesia
- **MySQL shards**: Persistent user data that doesn't need Mnesia's in-memory speed
- **async_dirty transactions**: Avoids Mnesia's full transaction protocol (which couples nodes)
- **Library directory across multiple drives**: Increased I/O throughput for Mnesia's disk operations

### Store-and-Forward Message Flow

WhatsApp's message delivery follows a store-and-forward model optimized for the common case (recipient is online and reads quickly):

![Three message-delivery paths: direct intra-cluster, inter-cluster via wandist, and offline via the Mnesia queue with replication and a 30-day TTL.](./diagrams/store-and-forward-flow-light.svg "Sender → routing layer → recipient. The Mnesia offline queue is only on the cold path; on the hot path, the message never leaves the chat servers. Acknowledgement deletes the message — the server is a router, not an archive.")
![Three message-delivery paths: direct intra-cluster, inter-cluster via wandist, and offline via the Mnesia queue with replication and a 30-day TTL.](./diagrams/store-and-forward-flow-dark.svg)

1. **Recipient online, same cluster**: Direct Erlang process-to-process message delivery (sub-millisecond).
2. **Recipient online, different cluster**: Inter-cluster forwarding over WhatsApp's `wandist` mesh (sub-second).
3. **Recipient offline**: Message stored in the Mnesia offline queue, replicated to the peer node in the island.
4. **Recipient reconnects**: Queued messages delivered in order.
5. **Delivery confirmed**: Message deleted from the server.

Messages are retained for up to 30 days if the recipient stays offline. Over 50% of messages are read within 60 seconds of storage, which is why a write-back cache in front of the offline queue achieves a 98% hit rate — the working set is overwhelmingly recent messages, and the file system rarely needs to be touched on the hot delivery path ([Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)).

### Asynchronous Optimization

WhatsApp's Erlang code favored asynchronous patterns to maximize throughput:

- **`handle_cast` over `handle_call`**: Fire-and-forget messages avoid blocking the sender
- **Timeouts instead of monitors**: Reduces the number of inter-process links and associated overhead
- **`nosuspend` on casts**: If the target process's mailbox is full, the send fails immediately rather than blocking
- **Large distribution buffers**: 256KB (up from 4KB default) absorbs network bursts without blocking sender processes
- **Separate inter-node message queues**: Isolated per destination node, preventing a slow remote node from blocking messages to healthy nodes

## Multimedia System

### Architecture

WhatsApp rebuilt its multimedia handling system in Erlang in 2012, replacing an earlier non-Erlang system. Rick Reed described this at Erlang Factory 2013.

The multimedia flow separates content from metadata:

1. Client uploads media to HTTP server (YAWS, Erlang-based) over a separate connection
2. HTTP server stores the file and returns a hash/unique ID
3. Sender transmits the hash to the recipient via the messaging server
4. Recipient downloads media from the HTTP server using the hash

This separation means the messaging server never handles large binary payloads — it only routes small metadata messages. Media servers scale independently of chat servers.

### Scale (Late 2014)

| Metric                  | Daily Volume | Peak                                |
| ----------------------- | ------------ | ----------------------------------- |
| Photos                  | 600 million  | 2 billion (New Year's Eve, 46k/s)   |
| Voice messages          | 200 million  | —                                   |
| Videos                  | 100 million  | 360 million (Christmas Eve)         |
| Peak outbound bandwidth | —            | 146 Gb/s (Christmas Eve)            |

By late 2014, WhatsApp ran approximately 250 dedicated multimedia servers and 150 chat servers — a roughly 5:3 split between media and chat — reflecting how dominant photos and video had become in messaging traffic ([Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)).

## Multi-Cluster Architecture

### Pre-Acquisition Topology

WhatsApp ran dual datacenters on SoftLayer bare metal:

- **Main clusters**: Multiple clusters in each datacenter handling chat connections
- **MMS clusters**: Dedicated multimedia clusters in each datacenter
- **Shared global cluster**: Cross-datacenter shared state
- **wandist connections**: Inter-cluster distribution links

### Island Architecture

Backend nodes were organized into "islands" — small, redundant clusters:

- Each island manages a subset of data partitions
- 2+ nodes per island (primary and secondary)
- One-way replication: primary handles all reads/writes; secondary is passive failover
- Islands operate independently, isolating failures

This design meant a node failure affected only the users mapped to that island's partitions. The blast radius of any single failure was a fraction of the total user base.

### Post-Acquisition Evolution

After the Facebook acquisition, the architecture evolved significantly:

- **Data center migration (2017–2019)**: A multi-year migration of 1.5 billion users from SoftLayer to Facebook-owned data centers, presented by Igors Istocniks at CodeBEAM SF 2019 ([slides PDF](https://codemesh.io/uploads/media/activity_slides/0001/01/f9539fb9fd3565db0de255bbbb0289ad5fe17414.pdf)). Migration ran per phone-number prefix: make the prefix read-only, accelerate database-replay repairs to flush queues, move traffic, then enable writes once persistent errors were reconciled — under 5 minutes per prefix.
- **OS migration**: FreeBSD to Linux, driven by Facebook's container orchestration and monitoring infrastructure rather than a technical judgement against FreeBSD.
- **Scale expansion**: Backend split into many clusters by function and scaled to tens of thousands of Erlang nodes serving billions of concurrent connections in aggregate.

### WARTS: WhatsApp's Runtime System

Post-acquisition, WhatsApp formalized their custom Erlang/OTP fork as **WARTS** (WhatsApp's Runtime System), now public at [github.com/WhatsApp/warts](https://github.com/WhatsApp/warts) under Apache-2.0. WARTS tracks upstream OTP and layers on performance, security, and tooling enhancements for Linux — including the `erldist_filter` NIF for filtering and logging the Erlang Distribution Protocol at very large cluster sizes ([Andrew Bennett, ElixirConf 2023](https://www.youtube.com/watch?v=VLO0ma-1uD4)).

## End-to-End Encryption and Multi-Device

### End-to-End Encryption (April 2016)

WhatsApp completed Signal Protocol integration for end-to-end encryption across all message types — text, group chats, attachments, voice messages, voice calls, and video calls — on 2016-04-05 ([Signal blog: integration is now complete](https://signal.org/blog/whatsapp-complete/); partnership announced [2014-11-18](https://signal.org/blog/whatsapp/)). After this change, WhatsApp's servers could no longer read message content.

The server architecture remained Erlang/BEAM-based. Encryption added computational overhead on the client side but did not change the server's role as a message router and store-and-forward relay.

### Multi-Device Support (July 2021)

Multi-device support required architectural changes to the server ([Meta Engineering — Multi-Device for WhatsApp](https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/), 2021-07-14):

- **Per-device identity keys**: Previously, each user account had one identity key. Now each device gets its own.
- **Client-fanout**: The sending client encrypts and transmits the message N times — once per recipient device — under a pairwise Signal session, instead of relying on server-side fan-out.
- **Device mapping**: Server maintains an account-to-device-identity mapping so senders can resolve the recipient's device list.
- **History sync**: When a companion device is linked, the primary device encrypts a bundle of recent messages and transfers them; the bundle key is delivered via an end-to-end encrypted message.
- **Voice/video calls**: Each linked device gets a random 32-byte SRTP master secret, so calls remain end-to-end encrypted across the multi-device topology.

## Options Considered

WhatsApp's key architectural decisions involved explicit trade-offs. Understanding what they considered — and rejected — reveals why the final architecture took its shape.

### Language Choice: Erlang vs Alternatives

#### Option 1: C++

**Approach**: Build a custom messaging server in C++, the standard choice for high-performance servers at the time (2009).

**Pros**:

- Maximum control over memory and CPU usage
- Mature networking libraries
- Founders had C++ experience (Yahoo)

**Cons**:

- "Developers have to implement half of Erlang by themselves" (Anton Lavrik) — supervision, hot code loading, per-connection isolation
- Manual memory management at scale of millions of connections is error-prone
- No built-in concurrency model matching one-process-per-connection

**Why not chosen**: The reliability and concurrency features that C++ developers must build from scratch are built into Erlang's runtime. At WhatsApp's team size, building these primitives was not feasible.

#### Option 2: Java/JVM

**Approach**: Use a JVM-based server framework.

**Pros**:

- Large ecosystem and talent pool
- Garbage collection handles memory management

**Cons**:

- JVM garbage collection is global — stop-the-world pauses affect all connections
- Per-connection memory overhead significantly higher than BEAM processes
- Thread-per-connection model doesn't scale to millions without complex async frameworks

**Why not chosen**: JVM's global GC was the dealbreaker. Discord's later experience with Cassandra's JVM GC pauses (covered in a separate case study) validates this concern.

#### Option 3: Erlang (Chosen)

**Why chosen**: ejabberd provided a working XMPP server to build upon, Erlang's concurrency model matched the problem (one process per connection), and the runtime's fault tolerance reduced operational burden for a tiny team.

### Scaling Strategy: Vertical-First vs Horizontal-First

#### Option: Horizontal-first (many small servers)

**Pros**: Simpler per-server capacity planning; commodity hardware
**Cons**: More nodes = more operational complexity, more network partitions, more inter-node coordination

#### Chosen: Vertical-first (fewer large servers)

**Why chosen**: Operational complexity scales with node count, not core count. BEAM's SMP scalability meant doubling cores nearly doubled throughput. 100 servers at 2M connections was operationally simpler than 1,000 servers at 200K.

### Architecture: Microservices vs Monolith

WhatsApp deliberately avoided the microservices pattern:

**Why not microservices**: At WhatsApp's team size (32 engineers), microservices would have added deployment complexity, inter-service latency, and operational overhead that a small team couldn't absorb. Erlang's process model already provides service isolation within a single BEAM node — each subsystem runs in its own supervision tree, crashes independently, and can be upgraded independently via hot code loading.

**Decision factor matrix:**

| Factor                                 | Erlang/ejabberd       | C++ Custom   | Java/JVM             | Microservices      |
| -------------------------------------- | --------------------- | ------------ | -------------------- | ------------------ |
| Time to working prototype              | Weeks                 | Months       | Months               | N/A                |
| Per-connection memory                  | ~300 bytes            | Variable     | ~KB range            | N/A                |
| GC impact on other connections         | None (per-process)    | N/A (manual) | Global STW pauses    | Varies             |
| Hot code reload                        | Built-in              | Not viable   | Possible (complex)   | Via rolling deploy |
| Fault isolation                        | Per-process           | Manual       | Per-thread (limited) | Per-service        |
| Operational complexity for 3 engineers | Low (OTP supervision) | Very High    | High                 | Very High          |

## Outcome

### Metrics at Key Milestones

| Metric                 | Early 2014 (Acquisition) | Late 2014   | 2016 | Current             |
| ---------------------- | ------------------------ | ----------- | ---- | ------------------- |
| Monthly active users   | 465M                     | 600M+       | 1B   | 3B+                 |
| Messages/day (in+out)  | ~50B                     | 64B+        | —    | 100B+               |
| Servers                | ~550                     | ~800        | —    | tens of thousands of nodes |
| Engineers (total)      | ~32                      | ~35         | ~50  | 1,000+              |
| Concurrent connections | 147M                     | —           | —    | billions            |
| Users per engineer     | ~15M                     | ~17M        | ~20M | —                   |

### Performance Numbers (2014)

| Metric                            | Value       | Source                                                                                                                                  |
| --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Peak logins/second                | 230,000     | [Reed 2014, via High Scalability](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/)            |
| Peak inbound messages/second      | 342,000     | Reed 2014                                                                                                                                |
| Peak outbound messages/second     | 712,000     | Reed 2014                                                                                                                                |
| Erlang inter-node messages/second | 70+ million | Reed 2014                                                                                                                                |
| Peak concurrent connections       | 147,000,000 | Reed 2014                                                                                                                                |

### Cost Efficiency

Pre-acquisition, WhatsApp ran ~700 servers on SoftLayer at an estimated ~$2 million/month. At 450M+ MAU, that works out to about $0.004 per user per month — orders of magnitude below competing platforms that required larger teams and richer infrastructure. Hosting cost is a tier-5 estimate from contemporary press; the headline ratio (millions of users per dollar of infra spend per month) is the conclusion that holds up regardless of the exact figure.

### Timeline

| Date      | Event                                                       |
| --------- | ----------------------------------------------------------- |
| Feb 2009  | WhatsApp Inc. incorporated                                  |
| Aug 2009  | WhatsApp 2.0 launched (messaging pivot)                     |
| Jan 2011  | 1 million connections per server achieved                   |
| Oct 2011  | 1 billion messages/day                                      |
| Jan 2012  | 2+ million connections per server ("1 million is so 2011")  |
| Aug 2012  | 10 billion messages/day                                     |
| Dec 2013  | 18 billion messages/day, 400M MAU                           |
| 2014-02-19 | Facebook acquisition announced ($19B)                      |
| 2014-02-22 | pg2 outage (210 minutes)                                   |
| Mar 2014  | Rick Reed's "Billion with a B" talk (Erlang Factory SF)     |
| Nov 2014  | 600M+ MAU, ~800 servers                                     |
| Feb 2016  | 1 billion MAU                                               |
| 2016-04-05 | End-to-end encryption rollout complete (Signal Protocol)   |
| 2017-2019 | Data center migration from SoftLayer to Facebook DCs        |
| 2021-07-14 | Multi-device support announced                             |
| 2024+     | 3B+ MAU, tens of thousands of Erlang nodes, 100B+ msgs/day  |

## Lessons Learned

### Technical Lessons

#### 1. Per-Process GC Changes the Scaling Game

**The insight**: BEAM's per-process garbage collection is the single architectural property that enabled WhatsApp's per-server density. On a JVM, 2 million connections sharing a single heap would produce catastrophic GC pauses. On BEAM, each connection's GC is independent — a process handling a heavy media message doesn't stall two million idle connections.

**How it applies elsewhere**: When evaluating runtimes for high-connection-count workloads (WebSocket servers, IoT gateways, chat systems), the GC model matters more than raw throughput benchmarks. A runtime that's 2x slower per-request but has isolated GC may support 10x more connections.

**Warning signs you need isolated GC**:

- Latency spikes correlate with GC pauses, not load
- Tail latency (p99/p999) degrades non-linearly with connection count
- Adding connections degrades performance for existing connections

#### 2. Vertical Density Reduces Operational Complexity

**The insight**: WhatsApp pushed each server to its connection limit before adding servers. This kept the cluster small — 550 servers for 450 million users. Fewer servers meant fewer failure domains, fewer inter-node messages, fewer network partitions to handle, and fewer servers for a team of 32 to monitor.

**How it applies elsewhere**: Before horizontally scaling to more nodes, verify that each node is fully utilized. Modern hardware with 128+ cores and 512+ GB RAM can serve workloads that many teams distribute across dozens of smaller instances. The operational cost of each additional node (monitoring, failover, network configuration) is often underestimated.

**Warning signs you should scale vertically first**:

- Average CPU utilization per node is below 40%
- Most operational incidents involve inter-node communication, not node overload
- Your team size is small relative to node count

#### 3. Custom Protocols Unlock Markets

**The insight**: FunXMPP's 50-70% bandwidth reduction over standard XMPP wasn't a premature optimization — it was a market-access decision. WhatsApp dominated developing markets where 2G was prevalent and per-MB data costs were high. The protocol efficiency made the product viable where competitors couldn't operate.

**How it applies elsewhere**: Protocol efficiency matters when your target environment is resource-constrained. This applies to IoT devices, mobile apps in bandwidth-limited regions, and any system where per-message cost (bandwidth, battery, compute) directly affects user experience or viability.

#### 4. Erlang's "Let It Crash" Reduces Team Size Requirements

**The insight**: OTP supervision trees meant that individual connection crashes were automatically recovered without operator intervention. This is why 32 engineers could serve 450 million users without a dedicated operations team. The runtime handles the class of failures that would otherwise require human intervention.

**How it applies elsewhere**: Fault-tolerant runtimes reduce the human operational burden. If your team spends significant time on "restart the process" or "reconnect the client" remediation, evaluate whether your runtime's error recovery model is the bottleneck.

### Process Lessons

#### 1. Start with an Open-Source Base, Then Rewrite

**What they learned**: Starting with ejabberd gave WhatsApp a functional messaging server in weeks. Over years, they rewrote nearly every component. The initial choice provided time-to-market; the rewrites provided performance at scale.

**What they'd do differently**: The choice to start with ejabberd was vindicated. The key lesson is that the starting point doesn't constrain the end state — as long as the underlying runtime (Erlang/BEAM) is sound, everything above it can be replaced incrementally.

#### 2. Patch the Runtime When Necessary

**What they learned**: WhatsApp didn't treat Erlang/OTP as a black box. When the timer wheel, GC, or process group modules became bottlenecks, they patched the runtime. Several of these patches were upstreamed, benefiting the entire Erlang ecosystem.

**What it requires**: Deep understanding of the runtime internals. WhatsApp hired engineers (like Rick Reed) who could profile and modify the BEAM VM. This capability — reading and modifying your runtime's source code — is rare but transformative at extreme scale.

### Organizational Lessons

#### 1. Team Size as a Feature

**The insight**: WhatsApp's small team wasn't a constraint to overcome — it was a deliberate design choice that shaped the architecture. A 32-person team cannot operate microservices, maintain complex deployment pipelines, or staff a 24/7 operations center. So they chose Erlang (self-healing), monolithic deployment (one artifact), and vertical scaling (fewer nodes). Every architectural decision was filtered through "can 1-3 engineers own this?"

**How it applies elsewhere**: Team size should inform architecture, not the other way around. If your team is small, choose technologies and patterns that minimize operational surface area. The worst outcome is an architecture that requires more operators than you have.

#### 2. Focus Enables Density

**The insight**: WhatsApp did one thing — messaging. No news feed, no advertising engine, no recommendation system, no content moderation pipeline (pre-acquisition). This single-product focus meant every engineering hour went toward making messaging work better at scale.

## Applying This to Your System

### When This Pattern Applies

You might face similar challenges if:

- You're building a high-connection-count server (WebSocket, MQTT, chat, IoT gateway)
- Your connection count is growing faster than your team size
- You need predictable per-connection latency regardless of total connection count
- Your target environment includes resource-constrained clients (mobile, IoT, developing markets)

### Checklist for Evaluation

- [ ] Does your runtime support per-connection (per-process/per-goroutine/per-fiber) garbage collection?
- [ ] Is your per-connection memory overhead measured in bytes or kilobytes? (WhatsApp: ~300 bytes)
- [ ] Can your servers handle 10x more connections by scaling vertically before adding nodes?
- [ ] Can your current team size sustain the operational load of your current node count?
- [ ] Have you measured your protocol overhead vs. payload size for typical messages?

### Starting Points

1. **Measure per-connection overhead**: Profile your server's memory consumption per idle connection and per active connection. If idle connections cost >1KB each, investigate whether your runtime or framework adds unnecessary overhead.
2. **Profile GC impact on tail latency**: Compare p99 latency under GC pressure vs. without. If GC pauses dominate your tail latency, evaluate runtimes with per-unit-of-work GC (BEAM, Go's goroutine-aware GC).
3. **Audit operational complexity per node**: Count the hours your team spends on per-node operational tasks (monitoring, failover, upgrades). Multiply by node count. If this exceeds available engineering hours, consider larger nodes or simpler deployment.
4. **Prototype vertical limits**: Before adding nodes, push a single server to its limit in a load test. You may discover 5-10x headroom that eliminates the need for horizontal scaling — and the complexity it brings.

## Conclusion

WhatsApp's architecture is a study in what happens when a small team makes consistently correct bets on a runtime's fundamental properties. Erlang's per-process garbage collection, lightweight processes, and OTP supervision weren't just nice features — they were the architectural foundation that made 2 million connections per server, 465 million users with ~32 engineers, and a $19 billion valuation possible.

The counterintuitive lesson is that WhatsApp's architecture was simple. No microservices. No container orchestration (pre-acquisition). No complex caching layers. One Erlang process per user, Mnesia for metadata, delete-after-delivery for messages, and a custom binary protocol for bandwidth efficiency. The complexity lived in the BEAM VM patches and the operational discipline of a small team — not in the system's architecture.

For engineers building high-connection systems today, WhatsApp's story suggests a specific investigation: before adding nodes, clusters, or architectural layers, check whether your runtime's concurrency model and GC strategy are the actual bottleneck. If they are, changing the runtime — as dramatic as that sounds — may be simpler than working around its limitations at scale.

## Appendix

### Prerequisites

- Familiarity with message broker concepts (store-and-forward, delivery guarantees)
- Basic understanding of Erlang/BEAM concurrency model (processes, message passing, supervision trees)
- Knowledge of XMPP protocol basics (stanzas, presence, roster)
- Understanding of vertical vs. horizontal scaling trade-offs

### Terminology

| Term             | Definition                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BEAM**         | Bogdan/Björn's Erlang Abstract Machine — the virtual machine that executes Erlang and Elixir code. Provides preemptive scheduling, per-process GC, and hot code loading. |
| **OTP**          | Open Telecom Platform — Erlang's standard library of behaviors (gen_server, supervisor) and tools for building fault-tolerant systems.                                   |
| **ejabberd**     | Open-source XMPP server written in Erlang. WhatsApp's starting point, heavily rewritten over subsequent years.                                                           |
| **XMPP**         | Extensible Messaging and Presence Protocol — an open XML-based protocol for real-time messaging. WhatsApp's original protocol before switching to FunXMPP.               |
| **FunXMPP**      | WhatsApp's custom binary protocol evolved from XMPP, replacing XML structure with byte tokens for 50-70% bandwidth reduction.                                            |
| **Mnesia**       | Erlang's built-in distributed database supporting in-memory and disk-based tables. WhatsApp used it for routing tables, offline queues, and user metadata.               |
| **ETS**          | Erlang Term Storage — in-memory key-value tables accessible by multiple Erlang processes. Used for fast concurrent lookups within a single node.                         |
| **gen_server**   | Standard OTP behavior for implementing a server process that handles synchronous and asynchronous requests.                                                              |
| **gen_factory**  | WhatsApp's custom OTP behavior extending gen_server with worker pool dispatch for parallelized processing.                                                               |
| **gen_industry** | WhatsApp's custom OTP behavior with multiple dispatch processes feeding multiple workers, parallelizing both ingestion and processing.                                   |
| **SMP**          | Symmetric Multi-Processing — hardware architecture where multiple CPUs share memory. BEAM's SMP support maps one scheduler per core.                                     |
| **WARTS**        | WhatsApp's Runtime System — a custom fork of Erlang/OTP focused on performance, security, and tooling for Linux environments.                                            |
| **SRTP**         | Secure Real-time Transport Protocol — encryption protocol for voice and video calls, used by WhatsApp for end-to-end encrypted media streams.                            |
| **YAWS**         | Yet Another Web Server — Erlang-based HTTP server used by WhatsApp for multimedia upload/download handling.                                                              |
| **SoftLayer**    | IBM's bare-metal cloud hosting provider where WhatsApp ran pre-acquisition. Migrated to Facebook data centers 2017-2019.                                                 |

### Summary

- WhatsApp started from ejabberd (open-source XMPP/Erlang server) in 2009 and spent years rewriting it into a custom messaging platform that served 465 million users with ~32 engineers and ~550 servers at the time of Facebook's $19 billion acquisition
- BEAM's per-process garbage collection and small per-process memory footprint (~338 words / ~2.7 KB on 64-bit) enabled 2+ million concurrent TCP connections per server — operational complexity scales with node count, not core count, so fewer large servers was deliberately chosen over many small ones
- WhatsApp patched the BEAM VM itself (timer wheels, GC throttling, distribution buffers, pg2 replacement, ETS hash improvements), with several patches upstreamed to mainline Erlang/OTP — including the new `pg` module that replaced `pg2` in OTP 23
- FunXMPP replaced XML-based XMPP with a token-based binary protocol achieving ≈50–70% bandwidth reduction for typical messages, making WhatsApp viable on 2G feature phones in developing markets
- Mnesia provided in-memory metadata storage (~2TB, 18 billion records, 98% cache hit rate) while messages were transient — deleted after delivery confirmation, with 50% read within 60 seconds
- Post-acquisition, WhatsApp migrated from FreeBSD/SoftLayer to Linux/Facebook data centers (2017–2019), scaled to tens of thousands of Erlang nodes serving billions of concurrent connections in aggregate, and formalized their runtime fork as WARTS

### References

#### Primary-source talks and posts

- [WhatsApp Blog: "1 million is so 2011"](https://blog.whatsapp.com/1-million-is-so-2011) — WhatsApp Engineering, January 2012. Server specs and 2M connection milestone.
- [Rick Reed: "That's 'Billion' with a 'B'"](https://www.infoq.com/presentations/whatsapp-scalability/) — Erlang Factory SF 2014. BEAM patches, meta-clustering, data storage. ([Slides PDF, GitHub mirror](https://github.com/reedr/reedr/blob/master/slides/efsf2014-whatsapp-scaling.pdf))
- [Rick Reed: "Scaling to Millions of Simultaneous Connections"](https://www.erlang-factory.com/upload/presentations/558/efsf2012-whatsapp-scaling.pdf) — Erlang Factory SF 2012. Initial scaling work and BEAM contention.
- [Igors Istocniks: "How WhatsApp Moved 1.5B Users Across Data Centers"](https://codemesh.io/uploads/media/activity_slides/0001/01/f9539fb9fd3565db0de255bbbb0289ad5fe17414.pdf) — CodeBEAM SF 2019.
- [Meta Engineering: Introducing Multi-Device for WhatsApp](https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/) — 2021-07-14. Multi-device architecture.
- [Andrew Bennett: "Erlang Dist Filtering and the WhatsApp Runtime System"](https://www.youtube.com/watch?v=VLO0ma-1uD4) — ElixirConf 2023. WARTS internals.
- [Eugene Fooksman Interview](https://pdincau.wordpress.com/2013/03/27/an-interview-with-eugene-fooksman-erlang/) — Paolo D'Incau, March 2013. Early architecture and ejabberd origins.
- [Anton Lavrik Interview: 20 Years of Open Source Erlang](https://www.erlang-solutions.com/blog/20-years-of-open-source-erlang-openerlang-interview-with-anton-lavrik-from-whatsapp/) — Erlang Solutions. Erlang vs alternatives.
- [Signal: "WhatsApp's Signal Protocol integration is now complete"](https://signal.org/blog/whatsapp-complete/) — 2016-04-05.

#### Standards and Erlang/OTP documentation

- [Erlang Efficiency Guide — Processes](https://www.erlang.org/doc/system/eff_guide_processes.html)
- [Erlang Memory](https://www.erlang.org/doc/apps/erts/erlangmemory.html)
- [OTP Supervision Principles](https://www.erlang.org/doc/system/sup_princ.html)
- [erl Runtime Flags](https://www.erlang.org/doc/apps/erts/erl_cmd.html) — `+stbt` and other scheduler flags
- [OTP 23.0 Patch Notes](https://www.erlang.org/patches/otp-23.0) — `pg` introduced, `pg2` deprecated
- [erlang/otp PR #2979](https://github.com/erlang/otp/pull/2979) — ETS hash-salt patch from WhatsApp

#### Secondary references

- [How WhatsApp Grew to Nearly 500 Million Users, 11,000 Cores, and 70 Million Messages a Second](https://highscalability.com/how-whatsapp-grew-to-nearly-500-million-users-11000-cores-an/) — High Scalability, 2014. Most-detailed publicly accessible summary of Reed's 2014 talk.
- [The WhatsApp Architecture Facebook Bought for $19 Billion](https://highscalability.com/the-whatsapp-architecture-facebook-bought-for-19-billion/) — High Scalability, 2014.
- [Erlang Forums: Did the WhatsApp Patches Make It Into Mainstream Erlang?](https://erlangforums.com/t/did-the-whatsapp-patches-mentioned-in-a-2014-conference-make-it-into-mainstream-erlang/958)
- [WhatsApp/WARTS on GitHub](https://github.com/WhatsApp/warts) — WhatsApp's Erlang/OTP fork.
