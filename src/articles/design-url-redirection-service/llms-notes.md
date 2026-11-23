# Notes for LLM consumers: Designing a URL Redirection & Vanity URL Service

## Scope

An evolution-first design of a URL redirection and vanity URL service on AWS, in six levels (L0–L5). Each level has a trigger, the minimum design for it, a deferred list, a build-vs-buy verdict, a cost tier and exit criteria. Structured data: `data/evolution.json` (levels), `data/topology.json` (components), `data/cost-models.json` (prices and modelled volumes).

## What the article decides

- **L0:** CloudFront has no declarative redirect rules. Use zero-byte S3 objects with `x-amz-website-redirect-location` (always 301) behind CloudFront, because S3 website endpoints don't serve HTTPS. S3 website routing rules stop at 50 per configuration. Amplify Hosting or Cloudflare Bulk Redirects if 302s are needed.
- **L1:** Self-service for marketing earns a small ECS Fargate service with an in-process map and DynamoDB on-demand as the DB of record. Verdict: build. 302 becomes the default.
- **L2:** Far-market latency earns CloudFront Functions + CloudFront KeyValueStore (512 B key, 1 KB value, 5 MB per store, one store per function, not readable from Lambda@Edge). Propagation is "a few seconds" per the 2023 AWS launch blog, with no SLA.
- **L3:** A 10M-slug Bloom filter at a 1% false-positive rate is ≈12 MB (9.585 bits per key, k = 7). It does not fit a KVS value (1 KB), a whole store (5 MB) or a CloudFront Function (10 KB code, 2 MB memory), so it runs in-process in the regional Fargate service in front of DynamoDB, and the edge caches 404s. A cache tier (ElastiCache Serverless Valkey) is a latency option, not a cost saver at this scale.
- **L4:** Click attribution goes async: CloudFront real-time logs → Kinesis Data Streams → Firehose → S3 → Athena. Firehose bills each record rounded up to 5 KB, so aggregate before Firehose. Standard logs to S3 if minutes of delay are fine.
- **L5:** 40 tenants with prefix/regex rules and per-tenant SLAs replace the service with an ordered rule engine (exact → prefix trie → regex, conflicts rejected at publish), three Regions behind Route 53, DynamoDB global tables with one write Region per tenant (last-writer-wins by default).
- **Cost shape:** CloudFront request fees are 55–61% of the list-price bill from L2 up. The matcher is not where the money goes.
- **Delivery:** deterministic rule compilers and shadow-replay verifiers are cheap to build with AI assistance; DNS cutover, SEO sign-off and cross-team ownership remain the bottlenecks.

## Verified vs estimated

| Kind | Status | Where |
| :--- | :--- | :--- |
| AWS quotas and limits (KVS, CloudFront Functions, S3 routing rules, Lambda@Edge package size) | Verified against official AWS docs | Sources section of the article page |
| Unit prices | AWS list prices, `us-east-1`, gross of free tiers | `cost-models.json` `sources[]` |
| Bloom-filter sizing | Standard formula, Broder & Mitzenmacher survey §2.1 | Article Sources, item 15 |
| Requirement chips (rule counts, redirects per month, miss %) and per-tier volumes | Modelled scenarios, not measurements | Labelled ASSUMPTION in `cost-models.json` |
| "~50,000 rules per 5 MB store" | Estimate | ASSUMPTION: ~100 B per entry; AWS doesn't publish per-entry overhead |
| "~150 short rules in a 10 KB function" | Estimate | ~60 B per rule plus ~1 KB of code |
| Firehose 5 KB rounding applied per log record | Assumption | ASSUMPTION: rounding applies per log record; aggregate records upstream to cut this ~20x |
| Enterprise discount range 25–40% off list | Assumption, no public source | Lab cost table |

## What the lab shows that the text does not

- A level picker over the same `evolution.json`: the topology for any level, with each component's state.
- Failure injection per component (10× latency or outage), showing blast radius and fallback edges.
- A Generic ↔ AWS label toggle.
- The per-level cost table from `cost-models.json`, with the assumption text for each line item and the discount range applied.

## How to cite

- Cite the article URL `https://sujeet.pro/design-url-redirection-service/` (lab: `https://sujeet.pro/design-url-redirection-service/interactive-lab/`) and the level anchor, e.g. `#stage-l3`.
- For an AWS limit or price, cite the AWS page listed in the article's Sources, not this article.
- State `pricingAsOf: 2026-11-23` with any dollar figure, and say whether it is list price at a modelled volume.
- Don't present modelled volumes or the discount range as measurements.

`pricingAsOf`: 2026-11-23 · region `us-east-1` · article version 1.
