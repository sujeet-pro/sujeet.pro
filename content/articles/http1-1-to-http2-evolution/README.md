---
title: 'HTTP/1.1 to HTTP/2: Bottlenecks and Multiplexing'
description: >-
  How HTTP/1.1's head-of-line blocking and header redundancy led to HTTP/2's
  binary framing, HPACK compression, and stream multiplexing — along with the
  TCP-layer limitations that still motivated HTTP/3.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-02-03T00:00:00.000Z
tags:
  - networking
  - http
  - dns
  - tls
---

# HTTP/1.1 to HTTP/2: Bottlenecks and Multiplexing

How HTTP/1.1's request-response model and application-layer head-of-line (HOL) blocking led to HTTP/2's binary framing, HPACK header compression, and stream multiplexing. This article covers the architectural constraints, design trade-offs, and remaining TCP-layer limitations that motivated HTTP/3.

<figure>
<img class="only-light" src="./diagrams/http-1-1-s-workarounds-multiple-connections-text-headers-replaced-by-http-2-s-si.light.svg" alt="HTTP/1.1's workarounds (multiple connections, text headers) replaced by HTTP/2's single-connection multiplexing, with TCP HOL blocking as the remaining constraint addressed by HTTP/3" />
<img class="only-dark" src="./diagrams/http-1-1-s-workarounds-multiple-connections-text-headers-replaced-by-http-2-s-si.dark.svg" alt="HTTP/1.1's workarounds (multiple connections, text headers) replaced by HTTP/2's single-connection multiplexing, with TCP HOL blocking as the remaining constraint addressed by HTTP/3" />
<figcaption>HTTP/1.1's workarounds (multiple connections, text headers) replaced by HTTP/2's single-connection multiplexing, with TCP HOL blocking as the remaining constraint addressed by HTTP/3</figcaption>
</figure>

## Abstract

**Mental model**: HTTP/1.1 treats a TCP connection as a single-lane road where one slow response blocks everything behind it. HTTP/2 turns that road into multiple independent lanes (streams) over the same TCP connection, but the underlying TCP still delivers packets in order—so a single lost packet stalls all lanes until retransmission completes.

### Core Trade-offs

| Aspect                      | HTTP/1.1 Approach                    | HTTP/2 Solution                                  | Remaining Constraint                                  |
| --------------------------- | ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| **HOL blocking**            | Open 6 connections per domain        | Multiplex streams on 1 connection                | TCP delivers in-order; packet loss stalls all streams |
| **Header overhead**         | Repeat verbose headers every request | HPACK compression (static + dynamic tables)      | Dynamic table state must be synchronized              |
| **Resource prioritization** | None (implicit by request order)     | Stream prioritization (deprecated in RFC 9113)   | Inconsistent implementation led to deprecation        |
| **Proactive delivery**      | None                                 | Server push (removed from browsers in 2022-2024) | Wasted bandwidth; replaced by 103 Early Hints         |

### Practical Implications

- **Consolidate origins**: HTTP/2's multiplexing works best with fewer domains; domain sharding is now an anti-pattern
- **TCP loss still hurts**: On lossy networks (mobile, high-latency), HTTP/2 can underperform HTTP/1.1's multiple connections
- **Priority signals ignored**: Most servers and CDNs don't implement RFC 9218 priority; optimize critical resource order server-side

## HTTP/1.1 Architectural Limitations

HTTP/1.1 (standardized in RFC 2068, revised in RFC 9112) introduced persistent connections and pipelining, but fundamental design constraints remained.

### Application-Layer Head-of-Line Blocking

HTTP/1.1 processes requests sequentially on a connection. If a large resource (5 MB image) is in transit, subsequent requests for critical resources (CSS, JS) wait regardless of their importance.

```http
# Connection 1: Blocked waiting for large response
GET /hero-image.jpg HTTP/1.1   # 5 MB transfer
GET /critical.css HTTP/1.1      # Queued behind image
GET /app.js HTTP/1.1            # Queued behind CSS
```

**Pipelining** (sending multiple requests without waiting for responses) was specified but never adopted:

- Servers must return responses in request order—a slow first response blocks faster subsequent ones
- Intermediaries (proxies, CDNs) often don't support pipelining correctly
- Retry semantics are ambiguous: if the connection closes mid-pipeline, clients can't determine which requests succeeded

### Connection Proliferation

Browsers work around HOL blocking by opening multiple TCP connections (typically 6 per hostname). Each connection incurs:

| Overhead         | Cost                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| TCP handshake    | 1 RTT (SYN → SYN-ACK → ACK)                                           |
| TLS handshake    | 1-2 RTT (1 with TLS 1.3, 2 with TLS 1.2)                              |
| Slow start       | Exponential ramp-up from initial cwnd (~10 segments on modern stacks) |
| Memory           | Kernel buffers, socket state per connection                           |
| Server resources | Per-connection thread/event handling overhead                         |

**Domain sharding**—distributing resources across `cdn1.`, `cdn2.`, `cdn3.`—exploited the per-hostname limit but multiplied TLS negotiation costs and defeated HTTP/2 consolidation benefits.

### Header Redundancy

HTTP/1.1 headers are uncompressed text repeated on every request:

```http
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

Typical header size: 500–2000 bytes per request. For a page making 100 API calls with similar headers, that's 50–200 KB of redundant metadata—often exceeding the initial TCP congestion window (10 × 1460 = 14.6 KB), forcing multiple RTTs before data transfer begins.

## HTTP/2 Design Decisions

HTTP/2 (RFC 7540, superseded by RFC 9113 in 2022) addressed HTTP/1.1's limitations through binary framing and stream multiplexing.

### Why Binary Framing

HTTP/2 replaced text parsing with a fixed 9-octet frame header:

```
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

**Design rationale** (RFC 9113):

- Eliminates text parsing ambiguity (no whitespace handling, line folding edge cases)
- Fixed-size header enables constant-time frame boundary detection
- Type field allows protocol extensibility without version negotiation
- Stream identifier enables per-stream processing

**Trade-off**: Not human-readable; requires tooling like `nghttp2` or Wireshark's HTTP/2 dissector for debugging.

### Stream Multiplexing

Streams are independent, bidirectional sequences of frames sharing a single TCP connection:

![Diagram](./diagram-1.svg)

**Stream identifier rules** (RFC 9113 Section 5.1.1):

- Client-initiated: odd numbers (1, 3, 5, ...)
- Server-initiated (push): even numbers (2, 4, 6, ...)
- Stream 0: reserved for connection-level frames (SETTINGS, PING, GOAWAY)
- Maximum: 2³¹ - 1 streams per connection lifetime

### HPACK Header Compression

HPACK (RFC 7541) was designed specifically to avoid vulnerabilities in DEFLATE-based compression.

**Why not DEFLATE?** SPDY initially used DEFLATE, which enabled the CRIME attack: attackers could inject data and observe compressed size changes to guess header values character-by-character. HPACK forces guesses to match entire header values, making brute-force impractical for high-entropy secrets.

**Compression mechanism**:

| Component        | Size                      | Purpose                                                          |
| ---------------- | ------------------------- | ---------------------------------------------------------------- |
| Static table     | 61 entries                | Predefined common headers (`:method: GET`, `:status: 200`, etc.) |
| Dynamic table    | 4,096 bytes default       | Connection-specific header cache (FIFO eviction)                 |
| Huffman encoding | Variable (5-30 bits/char) | Static code table for string compression                         |

**Entry size calculation** (RFC 7541 Section 4.1): `name_length + value_length + 32 octets`

The 32-octet overhead accounts for implementation costs (pointers, reference counts). A dynamic table limited to 4,096 bytes typically holds 50-100 entries.

**Compression efficiency**: Typical HTTP/1.1 headers (2-3 KB) compress to 100-300 bytes. Subsequent requests with identical headers compress to ~10 bytes (index references only).

**Security: never-indexed literals** (RFC 7541 Section 6.2.3): Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`) should use never-indexed representation, preventing intermediaries from caching them in dynamic tables.

### Flow Control

HTTP/2 implements per-stream and per-connection flow control via credit-based windows:

| Setting                   | Default                | Range          |
| ------------------------- | ---------------------- | -------------- |
| Initial stream window     | 65,535 bytes (2¹⁶ - 1) | 0 to 2³¹ - 1   |
| Initial connection window | 65,535 bytes           | 0 to 2³¹ - 1   |
| Max frame size            | 16,384 bytes (2¹⁴)     | 2¹⁴ to 2²⁴ - 1 |

**Design rationale**: Prevents fast senders from overwhelming slow receivers. Unlike TCP's implicit flow control, HTTP/2's explicit windows operate between application endpoints, not transport endpoints—enabling fine-grained backpressure per stream.

**WINDOW_UPDATE frames** grant additional credit. Setting window to 2³¹ - 1 and continuously replenishing effectively disables flow control (useful for high-throughput streaming).

### Priority System (Deprecated)

RFC 7540 specified a complex dependency tree where streams could depend on others with weighted priorities (1-256).

**Why it failed** (RFC 9113 Section 5.3):

- Clients expressed priorities inconsistently
- Many server implementations ignored priority signals entirely
- CDNs and proxies often didn't propagate priority information
- Complexity didn't yield measurable performance gains

**Current status**: RFC 9113 deprecates the priority tree but maintains backward compatibility. RFC 9218 defines a simpler `Priority` header with urgency (0-7, default 3) and incremental flags, but browser support is HTTP/3 only.

### Server Push (Removed from Browsers)

Server push allowed servers to send responses proactively via PUSH_PROMISE frames.

**Design intent**: Server anticipates client needs (e.g., push CSS when HTML is requested) to eliminate a round trip.

**Why it failed**:

- Servers rarely know what clients have cached, causing wasted bandwidth
- Pushed resources compete for bandwidth with explicitly requested resources
- Push races with client requests, creating complexity
- Implementation overhead didn't justify marginal latency gains

**Browser removal timeline**:

- Chrome 106 (September 2022): Disabled server push by default
- Firefox 132 (October 2024): Removed server push support entirely
- HTTP/3: Never implemented push in browsers

**Alternative**: 103 Early Hints status code allows servers to send `Link` headers with preload hints before the full response, achieving similar latency reduction without push complexity.

## TCP Head-of-Line Blocking

HTTP/2 solved application-layer HOL blocking but exposed a transport-layer constraint: TCP's in-order delivery guarantee.

![Diagram](./diagram-2.svg)

**Impact**: A single lost packet stalls all HTTP/2 streams, even those with complete data in the receive buffer. On networks with 1-2% packet loss, HTTP/2's single connection can underperform HTTP/1.1's multiple connections (which experience independent loss).

**RFC 9113 Section 9** explicitly acknowledges: "TCP head-of-line blocking is not addressed by this protocol."

This limitation directly motivated HTTP/3's use of QUIC, which provides independent stream delivery over UDP.

## Protocol Negotiation

### ALPN (Application-Layer Protocol Negotiation)

Browsers require TLS for HTTP/2, using the ALPN extension (RFC 7301) during the TLS handshake:

![Diagram](./diagram-3.svg)

**Protocol identifiers**:

- `h2`: HTTP/2 over TLS
- `http/1.1`: HTTP/1.1
- `h2c`: HTTP/2 over cleartext (not supported by browsers)

**Key design point**: ALPN negotiation happens during TLS handshake, avoiding an extra RTT for protocol upgrade.

### HTTP/2 Connection Preface

After TLS establishes the connection, both endpoints send a connection preface:

**Client preface** (24 octets + SETTINGS frame):

```
PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n
```

This string was chosen specifically because it cannot be interpreted as a valid HTTP/1.1 request, preventing protocol confusion when connecting to HTTP/1.1-only servers.

**Server preface**: SETTINGS frame (must be first frame sent)

**Purpose**: Confirms both endpoints understand HTTP/2 before exchanging application frames.

### Cleartext HTTP/2 (h2c)

RFC 9113 defines HTTP/2 over plaintext via HTTP Upgrade:

```http
GET / HTTP/1.1
Host: example.com
Connection: Upgrade, HTTP2-Settings
Upgrade: h2c
HTTP2-Settings: <base64url-encoded SETTINGS frame>
```

**Browser reality**: No browser supports h2c. HTTP/2 requires TLS in practice, ensuring encryption and simplifying deployment (no mixed HTTP/1.1 and HTTP/2 on port 80).

## Conclusion

HTTP/2 systematically addressed HTTP/1.1's architectural bottlenecks:

- **Binary framing** eliminated text parsing ambiguity and enabled efficient multiplexing
- **Stream independence** solved application-layer HOL blocking
- **HPACK compression** reduced header overhead by 85-95% while avoiding CRIME-style attacks
- **Single connection** eliminated connection proliferation overhead

The remaining TCP HOL blocking constraint—where a single lost packet stalls all streams—motivated HTTP/3's move to QUIC. Features that seemed promising (server push, complex priority trees) were deprecated after real-world deployment revealed implementation inconsistencies and marginal gains.

For deployments: enable HTTP/2 with TLS 1.3, consolidate domains to maximize multiplexing, and monitor TCP retransmission rates on high-loss networks where HTTP/1.1's multiple connections may still outperform.

## Appendix

### Prerequisites

- TCP connection establishment (3-way handshake, congestion control basics)
- TLS handshake fundamentals (ClientHello, ServerHello, ALPN)
- HTTP request-response model

### Terminology

| Abbreviation | Full Form                              | Definition                                                                           |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| HOL          | Head-of-Line                           | Blocking condition where one stalled item prevents subsequent items from progressing |
| HPACK        | HTTP/2 Header Compression              | Header compression algorithm using static/dynamic tables and Huffman encoding        |
| ALPN         | Application-Layer Protocol Negotiation | TLS extension for agreeing on application protocol during handshake                  |
| RTT          | Round-Trip Time                        | Time for a packet to travel from sender to receiver and back                         |
| cwnd         | Congestion Window                      | TCP's limit on unacknowledged in-flight data                                         |
| h2           | HTTP/2 over TLS                        | Protocol identifier for encrypted HTTP/2                                             |
| h2c          | HTTP/2 Cleartext                       | Protocol identifier for unencrypted HTTP/2 (not used by browsers)                    |

### Summary

- HTTP/1.1's sequential request processing and per-hostname connection limits forced domain sharding and resource concatenation workarounds
- HTTP/2's binary framing enables stream multiplexing over a single TCP connection, eliminating application-layer HOL blocking
- HPACK header compression reduces header overhead from kilobytes to hundreds of bytes, specifically designed to prevent CRIME-style attacks
- TCP's in-order delivery creates transport-layer HOL blocking that HTTP/2 cannot solve—motivating HTTP/3/QUIC
- Server push and complex priorities were deprecated due to implementation inconsistency and marginal real-world benefit
- ALPN negotiation during TLS handshake enables HTTP/2 without extra round trips

### References

**Specifications (Primary Sources)**

- [RFC 9113: HTTP/2](https://www.rfc-editor.org/rfc/rfc9113) — Current HTTP/2 specification (supersedes RFC 7540)
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112) — HTTP/1.1 message syntax and routing
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) — Version-independent HTTP semantics
- [RFC 7541: HPACK](https://www.rfc-editor.org/rfc/rfc7541) — Header compression for HTTP/2
- [RFC 9218: Extensible Prioritization Scheme for HTTP](https://www.rfc-editor.org/rfc/rfc9218) — Replacement for deprecated RFC 7540 priorities
- [RFC 7301: TLS ALPN](https://www.rfc-editor.org/rfc/rfc7301) — Application-Layer Protocol Negotiation Extension

**Browser Implementation**

- [Chrome: Removing HTTP/2 Server Push](https://developer.chrome.com/blog/removing-push) — Rationale for push removal
- [MDN: Priority header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Priority) — RFC 9218 browser support status

**Historical Context**

- [HTTP/2 Server Push is Dead](https://evertpot.com/http-2-push-is-dead/) — Analysis of push deprecation
- [RFC 7540: HTTP/2](https://www.rfc-editor.org/rfc/rfc7540) — Original HTTP/2 specification (obsoleted by RFC 9113)
