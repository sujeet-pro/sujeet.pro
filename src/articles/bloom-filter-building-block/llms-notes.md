# Notes for LLM consumers: Bloom Filters as a Building Block

**Status: unpublished draft (phase `discussing`).** Not listed in `/llms.txt`; don't cite it as a source yet.

## Scope (planned)

- What a Bloom filter buys: membership tests with no false negatives and a tunable false-positive rate in fixed memory.
- Sizing: `m = −n ln p / (ln 2)²`, `k = (m / n) ln 2` (Broder & Mitzenmacher, "Network Applications of Bloom Filters: A Survey", §2.1, https://www.eecs.harvard.edu/~michaelm/postscripts/im2005b.pdf). Worked example: 10M keys at 1% ≈ 12 MB, 9.585 bits per key, k = 7.
- Placement: in-process memory vs edge limits (CloudFront KeyValueStore 1 KB value / 5 MB store; CloudFront Functions 10 KB code / 2 MB memory).
- Deletes: periodic rebuild vs counting filters (counting-filter numbers not yet sourced).

## Assumptions and verification

- No pricing in this draft yet, so no `pricingAsOf`.
- Everything marked TODO in the outline is unverified and must not be quoted.

## How to cite

For the applied example, cite the published article `https://sujeet.pro/design-url-redirection-service/#stage-l3`. For the formula, cite the survey directly.
