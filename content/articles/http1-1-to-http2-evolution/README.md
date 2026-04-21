---
title: 'HTTP/1.1 to HTTP/2: Bottlenecks, Multiplexing, and What Stayed Broken'
linkTitle: 'HTTP/1.1 → HTTP/2'
description: >-
  Why HTTP/1.1's head-of-line blocking and header redundancy forced six
  connections per origin, how HTTP/2's binary framing, HPACK, and stream
  multiplexing fixed the application layer, and which TCP-layer constraints
  still motivate HTTP/3.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - networking
  - http
  - tls
  - performance
---

# HTTP/1.1 to HTTP/2: Bottlenecks, Multiplexing, and What Stayed Broken

HTTP/1.1 evolved a set of workarounds — six connections per origin, domain sharding, sprite sheets, request concatenation — to compensate for two structural defects: **request-ordered responses on a single connection** and **plain-text headers repeated on every request**. HTTP/2 ([RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html), June 2022, obsoleting [RFC 7540](https://www.rfc-editor.org/rfc/rfc7540)) replaced the wire format with binary frames carried over independent streams, layered HPACK header compression on top, and consolidated the connection back to one. It did not, and could not, fix TCP's in-order delivery — which is why a single dropped packet still stalls every stream and why HTTP/3 had to move to QUIC.

This article reconstructs the design pressure behind each HTTP/2 mechanism, surfaces the trade-offs that drove the deprecations of priority and server push, and ends with a current operational checklist.

![How HTTP/1.1's six-connection workaround was replaced by HTTP/2's multiplexed binary streams, with TCP head-of-line blocking remaining as the constraint addressed by HTTP/3 and QUIC](./diagrams/protocol-evolution-overview-light.svg "How HTTP/1.1's six-connection workaround was replaced by HTTP/2's multiplexed binary streams, with TCP head-of-line blocking remaining as the constraint addressed by HTTP/3 and QUIC")
![How HTTP/1.1's six-connection workaround was replaced by HTTP/2's multiplexed binary streams, with TCP head-of-line blocking remaining as the constraint addressed by HTTP/3 and QUIC](./diagrams/protocol-evolution-overview-dark.svg)

## Mental model

A TCP connection is a single byte-stream the kernel must hand to userspace **in order**. HTTP/1.1 serialised one request-response per connection, so a slow response blocked everything behind it; the workaround was to open more connections. HTTP/2 cuts the byte-stream into **frames** tagged with a stream ID, lets frames from different streams interleave on the same connection, and uses a separate, application-aware compression layer (HPACK) for headers. That fixes the application-layer bottleneck. It does not change TCP: a single lost segment still blocks the kernel from delivering anything later, even on streams whose data is sitting in the receive buffer.

### Trade-offs at a glance

| Aspect              | HTTP/1.1 workaround                        | HTTP/2 mechanism                                       | Remaining limitation                                                            |
| ------------------- | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| HOL blocking        | ~6 TCP connections per origin              | Multiplexed streams over 1 connection                  | TCP delivers in order — packet loss stalls every stream until retransmit clears |
| Header overhead     | Verbose plain-text headers each request    | HPACK static + dynamic table + Huffman                 | Dynamic table state is per-connection; cold connections start uncompressed      |
| Resource priority   | Implicit by request order                  | Stream priority tree (RFC 7540 §5.3) — deprecated      | Replaced by simpler [RFC 9218](https://www.rfc-editor.org/rfc/rfc9218.html) Priority header; uneven server adoption |
| Proactive delivery  | None                                       | `PUSH_PROMISE` server push — disabled in browsers      | Replaced by [`103 Early Hints`](https://datatracker.ietf.org/doc/html/rfc8297)        |

### Practical implications

- **Consolidate origins.** HTTP/2 multiplexing only works when assets share a connection; domain sharding now hurts more than it helps[^hpbn-h2].
- **TCP loss still matters.** On lossy networks (mobile, transcontinental), HTTP/2 over TCP can underperform six independent HTTP/1.1 connections that experience independent loss[^h3-quic].
- **Don't rely on HTTP/2 priority.** Server adoption is uneven; the actively-evolving signal is the [`Priority`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Priority) header from RFC 9218, used by Chrome 124+ and Firefox 128+.

## HTTP/1.1 architectural limitations

HTTP/1.1 was first standardised in 1997 and has been re-issued multiple times — most recently as [RFC 9112 (message syntax)](https://www.rfc-editor.org/rfc/rfc9112) and [RFC 9110 (semantics)](https://www.rfc-editor.org/rfc/rfc9110) in 2022. Persistent connections (`Connection: keep-alive`) and pipelining were added early; the structural problems they tried to soften were never fully solved on the wire.

### Application-layer head-of-line blocking

A single HTTP/1.1 connection processes requests serially. A 5 MB hero image in flight blocks every later request on that connection regardless of priority:

```http title="HTTP/1.1 sequential request flow on one connection"
GET /hero.jpg HTTP/1.1   # 5 MB — currently transferring
GET /critical.css HTTP/1.1   # blocked behind hero.jpg
GET /app.js HTTP/1.1         # blocked behind critical.css
```

[Pipelining](https://www.rfc-editor.org/rfc/rfc9112#section-9.3.2) — sending requests back-to-back without waiting for responses — was specified, but never deployed at scale because:

- Responses must come back in request order, so a slow first response still blocks the rest.
- Many proxies and CDNs implement pipelining incorrectly or not at all, breaking the chain mid-flight.
- Retry semantics are ambiguous: when a connection drops mid-pipeline, the client cannot tell which requests were processed.

### Connection proliferation

To work around HOL blocking, browsers open multiple TCP connections per origin — typically capped at six in modern browsers (Chrome, Firefox, Safari)[^hpbn-tcp]. Each extra connection costs:

| Overhead         | Cost                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| TCP handshake    | 1 RTT (SYN → SYN-ACK → ACK)                                                                           |
| TLS handshake    | 1 RTT in TLS 1.3, 2 RTTs in TLS 1.2                                                                   |
| Slow start       | Initial congestion window of ~10 segments per [RFC 6928](https://datatracker.ietf.org/doc/html/rfc6928) — each connection ramps independently |
| Memory           | Per-connection socket state, kernel send/receive buffers                                              |
| Server resources | Per-connection event-loop slot, file descriptor, timer                                                |

[**Domain sharding**](https://web.dev/articles/codelab-text-compression) — distributing assets across `cdn1.example.com`, `cdn2.example.com`, `cdn3.example.com` — multiplied the per-origin cap. Each shard incurred a fresh DNS lookup, TCP handshake, and TLS handshake, and broke HTTP/2 connection coalescing once the protocol changed.

### Text framing and chunked encoding

HTTP/1.1 messages are **text-framed**: the parser scans for `\r\n` to find header boundaries and uses `Content-Length` (when known) or `Transfer-Encoding: chunked` to find the body boundary. [Chunked transfer encoding](https://www.rfc-editor.org/rfc/rfc9112#name-chunked-transfer-coding) (RFC 9112 §7.1) lets a server stream a response of unknown length by emitting a sequence of size-prefixed chunks terminated by a `0\r\n\r\n` chunk:

```http title="HTTP/1.1 chunked response — variable-length frames inside a text envelope"
HTTP/1.1 200 OK
Transfer-Encoding: chunked

7\r\n
Mozilla\r\n
9\r\n
Developer\r\n
0\r\n
\r\n
```

Two structural costs follow from text framing:

- **Parsing surface.** Whitespace folding, LF-vs-CRLF tolerance, chunk-extension parameters, and trailers create a wide ambiguity surface. Mismatches between front-end and back-end parsers underpin the [HTTP request smuggling](https://datatracker.ietf.org/doc/html/rfc9112#name-message-parsing-robustness) family of attacks (RFC 9112 §11.2).
- **No interleaving.** A chunked response still occupies the connection until the terminating chunk arrives. Chunked encoding solves "stream a response of unknown length"; it does not solve HOL blocking.

### Header redundancy

HTTP/1.1 headers are uncompressed text repeated on every request:

```http title="Typical HTTP/1.1 request — 600+ bytes of headers"
GET /api/users HTTP/1.1
Host: api.example.com
Cookie: session=abc123; tracking=xyz789; preferences=dark-mode
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...
Accept: application/json
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br
Cache-Control: no-cache
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Typical real-world headers are 500–2,000 bytes per request[^http-archive-hpack]. A page issuing 100 XHR calls with similar headers spends 50–200 KB on metadata — often exceeding TCP's 10-segment initial congestion window (10 × 1,460 = ~14.6 KB), forcing additional round trips before the first body byte arrives.

## HTTP/2 design decisions

[RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html) addressed each HTTP/1.1 limitation through binary framing and stream multiplexing, with HPACK plugged in as a separate layer for headers.

### Why binary framing

Every HTTP/2 message is carried in [9-octet framed records](https://www.rfc-editor.org/rfc/rfc9113.html#name-frame-format):

```text title="HTTP/2 frame header layout (RFC 9113 §4.1)"
+-----------------------------------------------+
|                 Length (24 bits)              |
+---------------+---------------+---------------+
|   Type (8)    |   Flags (8)   |
+---------------+---------------+---------------+
|R|            Stream Identifier (31 bits)      |
+-----------------------------------------------+
|                Frame Payload (0-16,777,215)   |
+-----------------------------------------------+
```

Design rationale:

- **No text-parsing ambiguity.** No whitespace folding, no LF-vs-CRLF edge cases, no chunked-encoding length games. Every byte boundary is computable from the length field.
- **Constant-time framing.** The fixed 9-octet header makes frame boundaries cheap to find without buffering the whole message.
- **Type-driven extensibility.** New frame types (e.g. `PRIORITY_UPDATE` from RFC 9218) can be added without renegotiating a protocol version; unknown types are dropped per [§5.5](https://www.rfc-editor.org/rfc/rfc9113.html#name-extending-http-2).
- **Stream-aware routing.** The 31-bit stream identifier lets intermediaries route frames per stream rather than per connection.

> [!NOTE]
> Binary framing is not human-readable; debugging needs `nghttp -nv`, `curl --http2 -v`, or Wireshark's HTTP/2 dissector. Plan for this when standing up new HTTP/2 services.

### Stream multiplexing

A stream is an independent, bidirectional sequence of frames identified by a 31-bit stream ID. Frames from many streams interleave freely on a single connection:

![Three independent HTTP/2 streams interleaving HEADERS and DATA frames over one TCP connection without application-layer head-of-line blocking](./diagrams/multiplexed-streams-light.svg "Three independent HTTP/2 streams interleaving HEADERS and DATA frames over one TCP connection without application-layer head-of-line blocking")
![Three independent HTTP/2 streams interleaving HEADERS and DATA frames over one TCP connection without application-layer head-of-line blocking](./diagrams/multiplexed-streams-dark.svg)

[Stream identifier rules](https://www.rfc-editor.org/rfc/rfc9113.html#name-stream-identifiers) (RFC 9113 §5.1.1):

- Client-initiated streams use **odd** identifiers (1, 3, 5, …).
- Server-initiated streams (`PUSH_PROMISE`) use **even** identifiers (2, 4, 6, …).
- Stream 0 is reserved for connection-level frames (`SETTINGS`, `PING`, `GOAWAY`, `WINDOW_UPDATE` for the whole connection).
- Identifiers monotonically increase; the maximum is 2³¹ − 1 per connection lifetime, after which the connection must be closed and replaced.

### HPACK header compression

[HPACK (RFC 7541)](https://datatracker.ietf.org/doc/html/rfc7541) replaces HTTP/1.1's plain-text headers with a stateful compressed encoding.

#### Why not DEFLATE

SPDY initially used DEFLATE for headers and was promptly broken by the [CRIME attack](https://datatracker.ietf.org/doc/html/rfc7541#section-7): an attacker who could inject chosen-plaintext into requests on the same connection observed compressed-size changes and recovered cookies one character at a time. HPACK's design [§7](https://datatracker.ietf.org/doc/html/rfc7541#section-7) explicitly forces guesses to match an entire header value before they yield a size change, raising attack cost from `O(alphabet × length)` to `O(alphabet^length)` for high-entropy secrets.

#### Encoding mechanism

| Component         | Size                          | Purpose                                                                   |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Static table      | 61 entries                    | Predefined common headers (`:method: GET`, `:status: 200`, `accept`, …)[^hpack-static] |
| Dynamic table     | Default 4 KiB per direction[^hpack-default] | FIFO cache of recently sent headers; size negotiated via `SETTINGS_HEADER_TABLE_SIZE` |
| Huffman code      | 5–30 bits per symbol          | Static code table tuned on real HTTP traffic ([RFC 7541 Appendix B](https://datatracker.ietf.org/doc/html/rfc7541#appendix-B)) |

Each dynamic-table entry costs `name_length + value_length + 32 octets` ([RFC 7541 §4.1](https://datatracker.ietf.org/doc/html/rfc7541#section-4.1)). The 32-octet constant is a budgeted allowance for implementation overhead (reference counts, pointers); a 4 KiB table typically holds 50–100 real headers.

The encoder picks one of four [representations](https://datatracker.ietf.org/doc/html/rfc7541#section-6) per header, in roughly this order:

![Decision flow that an HPACK encoder follows for each header — choosing between indexed, literal-with-indexing, and literal-never-indexed representations against the static and dynamic tables](./diagrams/hpack-encoding-decision-light.svg "Decision flow that an HPACK encoder follows for each header — choosing between indexed, literal-with-indexing, and literal-never-indexed representations against the static and dynamic tables")
![Decision flow that an HPACK encoder follows for each header — choosing between indexed, literal-with-indexing, and literal-never-indexed representations against the static and dynamic tables](./diagrams/hpack-encoding-decision-dark.svg)

A typical header set of 2–3 KB compresses to 100–300 bytes on the first request and to ~10 bytes on subsequent requests once the dynamic table is warm[^cf-hpack].

> [!IMPORTANT]
> Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`) should be encoded with the **never-indexed** literal representation ([RFC 7541 §6.2.3](https://datatracker.ietf.org/doc/html/rfc7541#section-6.2.3)). This forbids intermediaries from copying the value into their own dynamic table — important when a downstream proxy is also HTTP/2-terminating and could otherwise leak the secret on a different connection.

### Flow control

HTTP/2 implements [credit-based flow control](https://www.rfc-editor.org/rfc/rfc9113.html#name-flow-control) at both the connection and stream levels via `WINDOW_UPDATE` frames:

| Setting                   | Default                | Range            |
| ------------------------- | ---------------------- | ---------------- |
| `SETTINGS_INITIAL_WINDOW_SIZE` | 65,535 bytes (2¹⁶ − 1) | 0 to 2³¹ − 1 |
| Initial connection window | 65,535 bytes (fixed by the spec; not negotiable) | n/a |
| `SETTINGS_MAX_FRAME_SIZE` | 16,384 bytes (2¹⁴) | 2¹⁴ to 2²⁴ − 1 |

Unlike TCP's transport-layer flow control, HTTP/2's windows operate **between application endpoints**, allowing a slow consumer of one stream (e.g. a video chunk decoder behind a backpressured renderer) to throttle that stream alone. Setting a window to 2³¹ − 1 and continuously refilling it effectively disables flow control — useful for high-throughput one-way streaming.

### Stream priority — specified, then deprecated

[RFC 7540 §5.3](https://datatracker.ietf.org/doc/html/rfc7540#section-5.3) defined a dependency tree where each stream had a parent stream and a 1–256 weight. The intent was for the server to use this to schedule frame interleaving.

[RFC 9113 §5.3](https://www.rfc-editor.org/rfc/rfc9113.html#name-priority) deprecates the dependency tree because:

- Clients expressed priorities inconsistently across browsers.
- Many servers and CDNs ignored or partially propagated priority signals.
- The protocol forced a complex, stateful tree even when applications wanted a simple urgency/incremental hint.
- Real-world performance gains were marginal compared to the implementation surface.

The replacement, [RFC 9218](https://www.rfc-editor.org/rfc/rfc9218.html), defines:

- A **`Priority`** request header with `u=` (urgency, 0–7, default 3) and `i` (incremental, boolean) parameters — usable on any HTTP version.
- A **`PRIORITY_UPDATE`** frame for HTTP/2 and HTTP/3 to update priority after the request was sent.

Browser support as of early 2026: Chrome / Edge 124+, Firefox 128+, Safari not yet[^caniuse-priority]. The header is sent on both HTTP/2 and HTTP/3 connections — it is not HTTP/3-only — but server- and CDN-side implementation of the scheduling logic is what actually determines whether it changes anything[^cf-h3-prio].

### Server push — designed in, dialled out

`PUSH_PROMISE` ([RFC 9113 §6.6](https://www.rfc-editor.org/rfc/rfc9113.html#name-push_promise)) let a server initiate a stream proactively — typically to push CSS or JS the moment the HTML request arrived, saving one round trip.

Why it failed in practice:

- The server rarely knows what the client has cached. Pushing a 200 KB CSS file the client already has is pure waste.
- Pushed bytes compete for bandwidth and the connection-level flow window with explicitly-requested bytes.
- Pushes race with client requests; if the client is faster, the push is cancelled mid-flight (`RST_STREAM`).
- The implementation surface (per-resource decisions, cache awareness, push-cache plumbing in browsers) outpaced the latency gains.

Browser timeline:

| Browser | What changed | When | Source |
| ------- | ------------ | ---- | ------ |
| Chrome 106 | Server push disabled by default | September 2022 (announcement August 2022) | [Chrome blog](https://developer.chrome.com/blog/removing-push) |
| Firefox 132 | `network.http.http2.allow-push` flipped to `false` by default | October 29, 2024 | [Firefox 132 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/132) |
| HTTP/3 (any browser) | Server push never shipped in browsers | n/a | [RFC 9114 §4.6](https://www.rfc-editor.org/rfc/rfc9114#name-server-push) defines it; no browser exposes it |

The replacement is [`103 Early Hints`](https://datatracker.ietf.org/doc/html/rfc8297). The server returns a `103` informational response with `Link: …; rel=preload` headers while it is still computing the final response, letting the browser fetch critical sub-resources during server think-time without committing bytes the client may already have.

```http title="103 Early Hints — non-final response with preload hints"
HTTP/2 103 Early Hints
Link: </styles/critical.css>; rel=preload; as=style
Link: </scripts/app.js>; rel=preload; as=script

HTTP/2 200 OK
Content-Type: text/html
...
```

## TCP head-of-line blocking

HTTP/2 fixed the application layer. The transport layer remained the bottleneck.

![How a single dropped TCP segment forces all multiplexed HTTP/2 streams to wait until retransmission completes, even though their own bytes have already arrived](./diagrams/tcp-hol-blocking-light.svg "How a single dropped TCP segment forces all multiplexed HTTP/2 streams to wait until retransmission completes, even though their own bytes have already arrived")
![How a single dropped TCP segment forces all multiplexed HTTP/2 streams to wait until retransmission completes, even though their own bytes have already arrived](./diagrams/tcp-hol-blocking-dark.svg)

TCP guarantees in-order delivery to the application. When segment N is lost, segments N+1, N+2, … sit in the kernel receive buffer and the application sees nothing — even if those segments belong to different HTTP/2 streams whose data is already complete. On networks with sustained packet loss in the 1–2% range, a single HTTP/2 connection can lose to six independent HTTP/1.1 connections that absorb loss in parallel[^h3-quic].

The [RFC 9113 introduction](https://www.rfc-editor.org/rfc/rfc9113.html#name-introduction) states the constraint explicitly: *"TCP head-of-line blocking is not addressed by this protocol."* That is the primary motivation for HTTP/3's adoption of [QUIC (RFC 9000)](https://www.rfc-editor.org/rfc/rfc9000.html), which delivers each stream independently over UDP and recovers loss per stream rather than per connection.

## Protocol negotiation

### ALPN

Browsers require TLS for HTTP/2 and select the protocol via [ALPN (RFC 7301)](https://datatracker.ietf.org/doc/html/rfc7301), an extension carried inside `ClientHello`/`ServerHello`:

![How ALPN signals "h2" inside the TLS handshake so HTTP/2 starts immediately, followed by the 24-octet HTTP/2 connection preface and SETTINGS exchange](./diagrams/alpn-negotiation-light.svg "How ALPN signals \"h2\" inside the TLS handshake so HTTP/2 starts immediately, followed by the 24-octet HTTP/2 connection preface and SETTINGS exchange")
![How ALPN signals "h2" inside the TLS handshake so HTTP/2 starts immediately, followed by the 24-octet HTTP/2 connection preface and SETTINGS exchange](./diagrams/alpn-negotiation-dark.svg)

Standard protocol identifiers:

- `h2` — HTTP/2 over TLS.
- `http/1.1` — HTTP/1.1.
- `h2c` — HTTP/2 over cleartext (not supported by browsers — see below).

ALPN piggybacks on the TLS handshake, so HTTP/2 negotiation costs **zero extra round trips** versus an HTTP/1.1-only TLS connection.

### HTTP/2 connection preface

Once TLS reports `h2`, the client sends a fixed 24-octet [connection preface](https://www.rfc-editor.org/rfc/rfc9113.html#name-http-2-connection-preface) followed by a `SETTINGS` frame:

```text title="HTTP/2 client connection preface (24 octets)"
PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n
```

The server's preface is its own `SETTINGS` frame, which must be the first frame it sends. The preface string was deliberately chosen to be invalid as an HTTP/1.1 request: an HTTP/1.1-only server that received it would respond with a parse error, preventing protocol confusion if the client mis-detected the server's capabilities.

### Cleartext HTTP/2 (h2c)

[RFC 9113 §3.1](https://www.rfc-editor.org/rfc/rfc9113.html#name-starting-http-2-for-http-ur) defines a cleartext upgrade path:

```http title="h2c upgrade — server-only, never used by browsers"
GET / HTTP/1.1
Host: example.com
Connection: Upgrade, HTTP2-Settings
Upgrade: h2c
HTTP2-Settings: <base64url-encoded SETTINGS frame>
```

> [!WARNING]
> No browser supports `h2c`. In practice HTTP/2 always implies TLS in the public web. The cleartext path is only useful for backend-to-backend traffic (gRPC over h2c on a private network, ingress-to-pod inside a service mesh).

## Operational checklist

When standing up or auditing HTTP/2 in production:

- **Negotiate via ALPN with TLS 1.3.** TLS 1.3 cuts the handshake to 1 RTT and supports 0-RTT resumption; combined with ALPN there is no protocol-upgrade penalty for HTTP/2.
- **Consolidate origins.** One TLS-terminating origin per logical site beats domain sharding; HTTP/2 connection coalescing only kicks in when names share an IP and certificate.
- **Send `103 Early Hints`** for critical sub-resources during server think-time. Pair with `Link: …; rel=preload`. Avoid `PUSH_PROMISE`.
- **Set `Priority` headers** for time-sensitive requests (e.g. `Priority: u=1, i` for above-the-fold images). Recognise that server adoption is uneven — measure, don't assume.
- **Monitor TCP retransmission rate** on your edge. Above ~1–2% loss, multiple HTTP/1.1 connections can outperform a single HTTP/2 one. This is also the signal to evaluate HTTP/3.
- **Encode sensitive headers as never-indexed.** Verify your HTTP/2 server actually emits the never-indexed representation for `Authorization` and `Cookie` headers, not merely "literal with indexing".
- **Cap the dynamic header table** at 4 KiB unless you have measured benefit from raising it. Larger tables give more compression but cost memory per connection across thousands of clients.

## Appendix

### Prerequisites

- TCP three-way handshake and basic congestion control (slow start, cwnd, RTO).
- TLS handshake basics (`ClientHello`, `ServerHello`, ALPN extension).
- HTTP request-response model and the role of intermediaries (proxies, CDNs, load balancers).

### Terminology

| Abbreviation | Full form                              | Meaning                                                                                |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| HOL          | Head-of-Line                           | Blocking condition where one stalled item prevents subsequent items from progressing  |
| HPACK        | HTTP/2 header compression              | Stateful header encoding using static + dynamic tables and Huffman coding              |
| ALPN         | Application-Layer Protocol Negotiation | TLS extension that selects the application protocol during the handshake               |
| RTT          | Round-Trip Time                        | One full sender → receiver → sender packet trip                                        |
| cwnd         | Congestion Window                      | TCP sender's cap on unacknowledged in-flight bytes                                     |
| h2           | HTTP/2 over TLS                        | ALPN protocol identifier for encrypted HTTP/2                                          |
| h2c          | HTTP/2 cleartext                       | ALPN protocol identifier for unencrypted HTTP/2 (backend use only)                     |
| QUIC         | Quick UDP Internet Connections         | Transport protocol underlying HTTP/3; provides per-stream loss recovery over UDP       |

### Summary

- HTTP/1.1's serialised request-response model and its ~6-connection per-origin cap forced expensive workarounds — domain sharding, sprite sheets, asset concatenation — without ever fixing application-layer HOL blocking.
- HTTP/2's binary framing and stream multiplexing remove application-layer HOL on a single TCP+TLS connection. HPACK adds a dedicated, CRIME-resistant compression layer for headers.
- TCP's in-order delivery is unsolved by HTTP/2 — a single dropped segment stalls every multiplexed stream, motivating HTTP/3 / QUIC.
- The two HTTP/2 features that looked best on paper — the priority dependency tree and `PUSH_PROMISE` server push — were deprecated after deployment showed inconsistent implementation and marginal gains. RFC 9218's `Priority` header and `103 Early Hints` are the current replacements.
- ALPN folds protocol selection into the TLS handshake at zero extra RTT cost; `h2c` is a cleartext path that browsers never adopted.

### References

**Standards (primary sources)**

- [RFC 9113 — HTTP/2 (June 2022)](https://www.rfc-editor.org/rfc/rfc9113.html) — current HTTP/2 specification, obsoletes RFC 7540.
- [RFC 9112 — HTTP/1.1 message syntax and routing (June 2022)](https://www.rfc-editor.org/rfc/rfc9112)
- [RFC 9110 — HTTP semantics (June 2022)](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 7541 — HPACK header compression for HTTP/2 (May 2015)](https://datatracker.ietf.org/doc/html/rfc7541)
- [RFC 9218 — Extensible Prioritization Scheme for HTTP (June 2022)](https://www.rfc-editor.org/rfc/rfc9218.html)
- [RFC 8297 — 103 Early Hints (December 2017)](https://datatracker.ietf.org/doc/html/rfc8297)
- [RFC 7301 — TLS Application-Layer Protocol Negotiation (July 2014)](https://datatracker.ietf.org/doc/html/rfc7301)
- [RFC 6928 — Increasing TCP's Initial Window (April 2013)](https://datatracker.ietf.org/doc/html/rfc6928)
- [RFC 9114 — HTTP/3 (June 2022)](https://www.rfc-editor.org/rfc/rfc9114)

**Browser implementation and rollout**

- [Chrome — Removing HTTP/2 Server Push](https://developer.chrome.com/blog/removing-push)
- [Firefox 132 release notes — server push deactivated](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/132)
- [MDN — `Priority` header (RFC 9218)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Priority)
- [MDN — `103 Early Hints`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/103)

**Practitioner and secondary sources**

- [Cloudflare — HPACK: the silent killer feature of HTTP/2](https://blog.cloudflare.com/hpack-the-silent-killer-feature-of-http-2/)
- [Cloudflare — Better HTTP/3 prioritization for a faster web (RFC 9218)](https://blog.cloudflare.com/better-http-3-prioritization-for-a-faster-web/)
- [Ilya Grigorik — High Performance Browser Networking, HTTP/2 chapter](https://hpbn.co/http2/)
- [Evert Pot — HTTP/2 Server Push is dead](https://evertpot.com/http-2-push-is-dead/)

[^hpbn-h2]: Ilya Grigorik, [*High Performance Browser Networking* — HTTP/2: connection management](https://hpbn.co/http2/#one-connection-per-origin), O'Reilly. HTTP/2 connection coalescing breaks down once shards land on different IPs or certificates.
[^hpbn-tcp]: Ilya Grigorik, [*High Performance Browser Networking* — Building Blocks of TCP](https://hpbn.co/building-blocks-of-tcp/). Six is a de facto convention rather than a spec — RFC 7230 §6.4 only recommended two and was relaxed in practice.
[^cf-hpack]: Cloudflare, [HPACK: the silent killer feature of HTTP/2](https://blog.cloudflare.com/hpack-the-silent-killer-feature-of-http-2/), 2016. Reports compression ratios of 76–96% on real traffic samples.
[^cf-h3-prio]: Cloudflare, [Better HTTP/3 prioritization for a faster web](https://blog.cloudflare.com/better-http-3-prioritization-for-a-faster-web/), 2022. Confirms the `Priority` header works for HTTP/2 and HTTP/3, but only matters when the server actually implements RFC 9218 scheduling.
[^caniuse-priority]: [Can I use — `Priority` HTTP header](https://caniuse.com/mdn-http_headers_priority). Chrome/Edge 124+ (April 2024), Firefox 128+ (July 2024), Safari not yet.
[^http-archive-hpack]: [HTTP Archive — Web Almanac, HTTP chapter](https://almanac.httparchive.org/en/2024/http) reports median HTTP request header sizes well under 1 KiB and median response header sizes around 0.6–1.3 KiB on real-world pages.
[^h3-quic]: IETF Working Group, [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000.html), §1. Explicitly motivates QUIC by the inability of TCP-based HTTP/2 to recover from per-stream loss independently.
[^hpack-static]: [RFC 7541 Appendix A](https://datatracker.ietf.org/doc/html/rfc7541#appendix-A) lists all 61 entries of the HPACK static table — `:authority`, `:method GET`, `:status 200`, common `accept-*` values, etc.
[^hpack-default]: [RFC 9113 §6.5.2](https://www.rfc-editor.org/rfc/rfc9113.html#name-defined-settings) sets `SETTINGS_HEADER_TABLE_SIZE` default to 4,096 octets.
