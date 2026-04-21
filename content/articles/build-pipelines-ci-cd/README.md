---
title: "Build Pipelines and CI/CD Architecture"
linkTitle: 'Build Pipelines'
description: >-
  How to design commit-to-production pipelines: stage ordering, caching and reproducibility,
  test and security gates, deployment models, observability, and the failure modes that matter
  in real systems.
publishedDate: 2026-01-24
lastUpdatedOn: 2026-04-21
tags:
  - platform-engineering
  - cicd
  - build-systems
  - reliability-engineering
---

# Build Pipelines and CI/CD Architecture

Continuous integration and delivery are not “a Jenkins server” or “some GitHub Actions YAML.” They are a **feedback and promotion system**: turn source revisions into verified, immutable release candidates, move those candidates through environments with increasing realism, and only then expose them to production traffic—with enough telemetry and guardrails to detect mistakes before they become incidents.

This article stays inside that system: **pipeline shape**, **caching and reproducibility**, **verification gates**, **deployment mechanics**, **observability**, and **trade-offs**. It assumes you already know what a container image is; it focuses on the decisions that separate fragile pipelines from ones teams can trust for years.

## Mental model: one pipeline, many environments

Treat **build** (compile, package, image layers) and **promotion** (which artifact is running where) as related but distinct concerns. A single logical pipeline usually produces **one immutable artifact set per revision** (images, packages, static assets, generated SBOMs) and then **selects** which artifact is bound to staging, canary, and production—rather than rebuilding different “flavors” per environment.

![Flow from version control through static checks, tests, build, artifact publish, security gates, non-production deploy, smoke tests, controlled production rollout, and observation](./diagrams/ci-cd-pipeline-stages-light.svg "Typical promotion flow: verify cheaply first, publish durable outputs once, gate risky changes, then roll forward with observability.")
![Flow from version control through static checks, tests, build, artifact publish, security gates, non-production deploy, smoke tests, controlled production rollout, and observation](./diagrams/ci-cd-pipeline-stages-dark.svg)

The ordering above is deliberate: **fail fast** on lint, types, and unit tests; **build once** after those pass; run **deeper security and integration checks** against artifacts you intend to ship; only then spend time on **environment-specific** work like smoke tests and progressive rollout.

## Pipeline stages: what belongs where

| Stage | Primary goal | Common failure if skipped or reordered |
| ----- | ------------ | -------------------------------------- |
| **Trigger discipline** | Every production change maps to a revision and a pipeline run | Untracked hotfixes, unrepeatable prod |
| **Static verification** | Catch deterministic mistakes in seconds | Flaky red builds masking real defects |
| **Fast tests** | Guard core invariants cheaply | Slow PR feedback, batching risky merges |
| **Build and package** | Produce bit-for-bit identifiable outputs | “Works on CI runner” binaries |
| **Artifact publication** | Central store keyed by digest | Ad-hoc SCP artifacts, unknown provenance |
| **Security and policy gates** | Block known-bad patterns before merge or promotion | Late discovery in prod |
| **Non-production deploy** | Exercise real config, network, data fakes | Green CI, red prod |
| **Production rollout** | Limit blast radius while validating SLOs | Big-bang releases |

**Pull request pipelines** should optimize for **latency and signal**: small matrices, aggressive caching, and checks that correlate with defects. **Mainline (post-merge) pipelines** can afford heavier work—broader suites, performance baselines, multi-architecture builds—because they gate **release candidates**, not every keystroke.

For high-velocity teams, **merge queues** (or equivalent “tests must pass on the intended merge result” flows) reduce the classic problem where `main` was green on isolated PRs but breaks once commits interleave. GitHub documents merge queues as a first-class branch-protection / ruleset feature ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)).

## Caching, artifacts, and reproducibility

Remote build caches and dependency caches are how pipelines stay economically viable. They are also where **subtle nondeterminism** hides: restored state that does not match what a cold build would produce, or cache keys that omit important inputs.

![Pinned inputs feed layered caches, which produce durable artifacts with digests and provenance metadata](./diagrams/reproducibility-cache-artifacts-light.svg "Pinned inputs, layered caches, and durable outputs: keep the contract explicit.")
![Pinned inputs feed layered caches, which produce durable artifacts with digests and provenance metadata](./diagrams/reproducibility-cache-artifacts-dark.svg)

**Practical rules:**

1. **Key caches on everything that affects outputs**—lockfiles, toolchain versions, CPU architecture, compiler flags, and relevant repository paths—not only on “the branch name.” CI systems document cache semantics and eviction ([Caching dependencies](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows); GitLab’s [Cache](https://docs.gitlab.com/ee/ci/caching/) behaves differently—read the platform you actually use).

2. **Treat artifacts as immutable** once they represent a release candidate. Container workflows should reference images by **digest**, not only by mutable tags. The OCI Image Format Specification defines the digest-centric content model ([OCI Image Spec](https://github.com/opencontainers/image-spec/blob/main/spec.md)).

3. **Separate “build cache” from “artifact store.”** Caches are best-effort; object storage or a registry is authoritative. Losing a cache should slow builds; losing an artifact store should trigger an incident.

4. **Reproducibility is a spectrum.** Fully hermetic builds (toolchains vendored, network fetches disabled, build graph derived from declared inputs only) are expensive—Bazel’s [Hermeticity](https://bazel.build/basics/hermeticity) and [Remote caching](https://bazel.build/remote/caching) docs are the clearest exposition of what “strict” actually costs. “Good enough” reproducibility for many services means lockfiles, pinned base images, and deterministic dependency resolution. The Reproducible Builds project catalogs the broader technique catalogue and failure modes ([Reproducible Builds](https://reproducible-builds.org/docs/)).

5. **Provenance and SBOMs** bridge the gap between “we built something” and “we can explain what it contains under audit.” SPDX is a maintained SBOM interchange format ([SPDX](https://spdx.dev/)); SLSA defines a Build track with escalating integrity guarantees—L1 requires provenance to exist, L2 adds a hosted, signing build platform, L3 adds tenant isolation and unforgeable provenance ([SLSA v1.0 build levels](https://slsa.dev/spec/v1.0/levels)).

> [!NOTE]
> Signing and attestation via [Sigstore Cosign](https://docs.sigstore.dev/cosign/signing/overview/) — where the build identity is an OIDC token from your CI provider, the certificate is short-lived, and the signature plus in-toto attestation are recorded in the Rekor transparency log — are increasingly default expectations for images and binaries. The point is not that every team faces nation-state attackers; it is that **policy engines and registries** can then enforce "only signed artifacts from pipeline X, with attested SLSA Build L3 provenance, may reach cluster Y."

![Supply-chain signing and verification flow: CI runner gets an OIDC token, Fulcio issues a short-lived cert, signature and attestation land in Rekor, image and predicates push to the registry, admission controller verifies before deploy](./diagrams/supply-chain-attestation-light.svg "Keyless signing and verification: identity comes from the CI OIDC token; the registry stores the artifact, signature, and in-toto attestations side-by-side; admission control re-checks them at deploy time.")
![Supply-chain signing and verification flow: CI runner gets an OIDC token, Fulcio issues a short-lived cert, signature and attestation land in Rekor, image and predicates push to the registry, admission controller verifies before deploy](./diagrams/supply-chain-attestation-dark.svg)

## Test gates: what to run when

Think in **layers of evidence**, not a single “test job.” Place each layer where its cost matches the question it answers, and stop reaching for higher layers once a cheaper layer can plausibly catch the regression.

![Three pipeline tiers — PR-time fast tests, candidate-time integration and smoke tests, and reserved targeted e2e — stacked by cost and run frequency](./diagrams/test-evidence-layers-light.svg "Test evidence layers: cheap and parallel on every PR, integration and smoke on the artifact, targeted e2e only where it earns its keep.")
![Three pipeline tiers — PR-time fast tests, candidate-time integration and smoke tests, and reserved targeted e2e — stacked by cost and run frequency](./diagrams/test-evidence-layers-dark.svg)

- **Unit tests** validate pure logic and small modules with minimal I/O. They should be parallel, shardable, and fast enough that developers run them locally without dread.
- **Integration tests** validate boundaries: databases, queues, HTTP APIs, with real processes but controlled fixtures. They belong after the artifact exists, when the artifact is what production will run.
- **End-to-end tests** are the most expensive and brittle; reserve them for **critical user journeys** and **deployment smoke checks**, not exhaustive coverage of every edge case.
- **Consumer-driven contract tests** often outperform giant e2e matrices for service-to-service contracts: they fail with clearer blame boundaries and run faster than full-browser flows.

**Flaky tests are a pipeline design bug.** Quarantining, auto-retrying without attribution, or “merge on yellow” trains the organization to ignore red builds—which is worse than no CI. Treat flake rate as a product metric: track per-test instability, fix or disable aggressively, and never let mainline trend toward stochastic green.

## Security gates: minimum viable rigor

Security scanning in CI is not a substitute for secure design, but it **closes the easy holes** before they ship.

| Gate | What it catches | Representative maintainer or spec docs |
| ---- | --------------- | --------------------------------------- |
| **Secret scanning** | Accidentally committed tokens | GitHub [secret scanning](https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning) |
| **Dependency review / SCA** | Known-vulnerable libraries | OWASP [Dependency-Check](https://owasp.org/www-project-dependency-check/) or vendor-native SCA |
| **SAST** | Injection, unsafe APIs, misconfigurations | Bandit (Python), ESLint security plugins, Semgrep rulesets—pick tools aligned to your languages |
| **License policy** | Copyleft or banned licenses in transitive deps | SPDX [license expressions](https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/) |

Shift **policy decisions** left: which CVE severities block merges, which CWE classes fail builds, and which findings only warn. Ambiguous policy causes either paralysis or rubber-stamping.

## Deployment strategies: blast radius versus complexity

![Three panels comparing rolling replace, blue or green cutover, and canary progressive rollout](./diagrams/deployment-strategies-overview-light.svg "Rolling, blue/green, and canary/progressive strategies differ mainly in how traffic moves and how quickly you can abort.")
![Three panels comparing rolling replace, blue or green cutover, and canary progressive rollout](./diagrams/deployment-strategies-overview-dark.svg)

Kubernetes documents controller-level rollout mechanics for Deployments, including **rolling updates** and revision history ([Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). The names below match how operators usually discuss traffic management on top of those primitives:

| Strategy | Mechanism | Strength | Cost |
| -------- | --------- | -------- | ---- |
| **Rolling replace** | Gradually replace instances with the new version | Simple, works with long-lived connections if drained carefully | Mixed versions during rollout; harder instant rollback unless you keep old replicas |
| **Blue/green** | Standby stack receives release; traffic flips atomically at the edge | Fast rollback by pointer flip; clear binary state | Double capacity or cold standby; schema migrations need care |
| **Canary / progressive** | Small slice of traffic on candidate; expand if healthy | Best blast-radius control for risky changes | Requires metrics, automation, and discipline on abort criteria |

**Database migrations** interact badly with naive rolling deploys. The default safe shape is the [expand and contract pattern](https://www.tim-wellhausen.de/papers/ExpandAndContract/ExpandAndContract.html): pre-deploy additive schema changes, ship code that tolerates both old and new shapes (the "N and N−1" rule), backfill, then contract once no version still references the old shape. Coupling breaking schema changes with the binary flip is a top source of avoidable production outages.

**Feature flags** are orthogonal to CI/CD mechanics but change rollout economics: you can ship **dark** code frequently while keeping **behavior** gated—reducing the pressure to merge gigantic, risky PRs. [OpenFeature](https://openfeature.dev/) (CNCF Incubating) standardizes feature-flag evaluation APIs across providers so the application code is no longer tied to a specific vendor SDK.

**When to prefer which strategy** is mostly a question of **rollback latency** versus **capacity and tooling cost**:

- Prefer **rolling** when the workload tolerates mixed versions for a short window (stateless HTTP workers with compatible APIs) and you want minimal extra infrastructure.
- Prefer **blue/green** when you need **instant rollback** or a hard cutover window (payments cutover, large config flips) and can afford duplicate stacks or rapid scale-to-zero on the idle color.
- Prefer **canary** when customer traffic heterogeneity means “works in staging” is insufficient and you need **SLO-driven** promotion—error rate, tail latency, or business metrics on a small slice before full exposure.

Whatever the strategy, define **abort conditions** before the rollout starts: which metrics, which comparison window, and who can override automation. Rollouts without predeclared abort rules tend to become emotional debates in incident channels.

## Runners, isolation, and parallelism

**Managed runners** (GitHub-hosted, GitLab SaaS, Cloud Build) optimize for “zero to pipeline” time and patch cadence; **self-hosted** runners optimize for **artifact locality**, **special hardware**, or **strict network egress** rules. The security contract differs: a self-hosted runner is a **persistent pet** inside your trust boundary—harden it like any build server, rotate credentials, and never reuse the same VM for untrusted forks unless you fully wipe ephemeral state between jobs. GitHub documents isolation models and forked workflow risks in [About GitHub-hosted runners](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners) and related security guides.

**Parallelism** is how you buy wall-clock time back after adding gates. Useful patterns:

- **Sharding** long test suites by file or timing data (slowest tests first in each shard).
- **Fan-out** independent jobs (lint, unit, security pre-checks) instead of one serial mega-job.
- **Matrices** only when each cell adds real coverage—duplicate work across ten Node versions “because YAML allows it” is a tax on every PR.

![Pipeline DAG fanning out cheap pre-build checks (lint, typecheck, unit shards, secret scan, dependency review), funnelling into a single immutable build, then fanning back out into integration suites, SAST on the artifact, and provenance generation before promotion](./diagrams/fan-out-parallelism-light.svg "Fan-out, build once, fan-out again: cheap checks share the trigger; expensive checks share the artifact.")
![Pipeline DAG fanning out cheap pre-build checks (lint, typecheck, unit shards, secret scan, dependency review), funnelling into a single immutable build, then fanning back out into integration suites, SAST on the artifact, and provenance generation before promotion](./diagrams/fan-out-parallelism-dark.svg)

The failure mode here is **queue starvation**: dozens of lightweight PRs blocked behind a few heavy mainline builds. Mitigations include **concurrency groups** (serialize expensive paths while keeping PR checks parallel), **separate pools** for release versus PR workloads, and **right-sizing** machines so integration tests are not artificially serialized on undersized CPUs.

## Observability and pipeline metrics

Production observability (RED/USE, distributed traces, logs) is table stakes. Pipelines also deserve **first-class telemetry**:

- **Change lead time** and **deployment frequency** (the throughput half of the [DORA metrics](https://dora.dev/guides/dora-metrics/), refreshed in the 2025 model) are directly controlled by pipeline and branching design—not vanity agile scores, but proxies for batch size and incident risk.
- **Change fail rate** and **failed deployment recovery time** (the instability half) measure whether rollbacks and fixes are practiced or theoretical; the 2025 model also adds **deployment rework rate** for unplanned redeploys following an incident.
- **Per-stage duration and cache hit rate** tell you where to invest: faster machines, better parallelism, or narrower work.

Instrument **each gate** with stable labels (`stage=unit`, `stage=integration`, `app=payments`) so regressions in duration map to engineering work, not vague “CI is slow” complaints.

**Secrets** deserve explicit mention. The default should be short-lived credentials minted at runtime via [OIDC token federation to cloud roles](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)—the trust policy in AWS / GCP / Azure pins a specific `sub` claim (`repo:org/repo:environment:prod`), so a compromised workflow on another branch cannot assume the production role. Beyond that: never echo secrets into logs, avoid long-lived PATs in repos, and pin third-party actions to commit SHAs. GitHub's [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) and GitLab's [CI/CD variables](https://docs.gitlab.com/ee/ci/variables/) document platform primitives; your job is to ensure **fork PRs** cannot exfiltrate production credentials through creative workflow expressions—`pull_request_target` and `workflow_run` are the usual footguns.

## Failure modes and trade-offs

| Failure mode | Symptom | Mitigation |
| ------------ | ------- | ---------- |
| **Cache poisoning or staleness** | Nondeterministic failures only on CI | Narrow cache keys, periodic cold builds, `cache: clear` playbooks |
| **Environment drift** | Staging passes, prod fails on same artifact | Infrastructure as code, parity checks, synthetic probes |
| **Unbounded blast radius** | Single failed step takes down all checks | Fan-out jobs, timeouts, circuit breakers on shared services |
| **Manual promotion without audit** | Who shipped what, when, and why? | Immutable artifacts + signed attestations + deployment audit logs |
| **“Green security scans,” vulnerable prod** | Scans run on wrong artifact or skipped on hotfix path | Enforce scans on digest, not tag; block emergency bypass without postmortem |
| **Flaky gates** | Random red builds | Quarantine tests, ownership, and removal—not endless retry |
| **Thundering herd on shared services** | CI spikes take down artifact registry or npm mirror | Client-side backoff, pull-through caches, rate limits, regional mirrors |
| **Unscoped workflow permissions** | A compromised dependency runs arbitrary CI with secrets | Default least privilege, OIDC federation, restricted `GITHUB_TOKEN` scopes |

**Trade-off summary:** faster feedback pushes work earlier and shrinks batch size, which improves quality and MTTR—but requires investment in **hermetic-ish builds**, **good caches**, and **ruthless test hygiene**. Heavier gates improve safety but lengthen feedback loops; the right balance depends on blast radius (payments vs internal admin UI) and regulatory posture.

### Anti-patterns worth naming

- **“Re-run until green”** as a team policy—masks infrastructure limits and real defects.
- **Production-only config** that never appears in lower environments—guarantees surprises.
- **Skipping gates for heroes** without a tracked exception—creates a two-tier reliability story.
- **Giant PRs** justified by “CI is slow”—treat that as a pipeline design debt, not a moral failure of reviewers.

## References and further reading

Official and primary sources cited above are consolidated here for quick follow-up: [DORA metrics guide](https://dora.dev/guides/dora-metrics/), [GitHub Actions caching](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows), [GitHub merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue), [GitHub Actions OIDC hardening](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect), [OCI Image Spec](https://github.com/opencontainers/image-spec/blob/main/spec.md), [SLSA v1.0 build levels](https://slsa.dev/spec/v1.0/levels), [SLSA v1.0 provenance](https://slsa.dev/spec/v1.0/provenance), [in-toto attestation framework](https://github.com/in-toto/attestation/blob/main/spec/README.md), [Sigstore Cosign signing overview](https://docs.sigstore.dev/cosign/signing/overview/), [SPDX](https://spdx.dev/), [Bazel hermeticity](https://bazel.build/basics/hermeticity), [Bazel remote caching](https://bazel.build/remote/caching), [Reproducible Builds](https://reproducible-builds.org/docs/), [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), and [OpenFeature](https://openfeature.dev/).

## Practical heuristics

1. **Build once, promote many**—rebuild per environment only when you truly need different compilation flags; otherwise you lose the guarantee that “what we tested is what we shipped.”
2. **Order gates by cost**—cheap checks first; expensive checks run on artifacts you are willing to ship.
3. **Measure flake and fix it** like production defects.
4. **Digest-pin immutable artifacts**; treat tags as UX, not security boundaries.
5. **Practice rollbacks** until they are boring; if rollback is novel during an outage, you have already lost time.

If you remember nothing else: a pipeline is **risk routing**. Design each stage to answer a narrower question about the release candidate, and design promotions so that answering “should this reach customers?” is a **measured decision**, not a ceremony.
