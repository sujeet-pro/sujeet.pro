---
title: 'Draft: Data Migration Strategies and Zero-Downtime Cuts'
description: >-
  Strategies for moving data between systems with zero downtime, covering
  dual-write and backfill patterns, schema compatibility risks, validation
  and reconciliation, and rollback-safe cutover plans.
publishedDate: 2026-01-24T00:00:00.000Z
lastUpdatedOn: 2026-01-24T00:00:00.000Z
tags:
  - platform-engineering
  - devops
  - infrastructure
---

# Draft: Data Migration Strategies and Zero-Downtime Cuts

Patterns for moving data without disrupting production systems.

## TLDR

- Dual writes and backfills reduce downtime risk
- Cutovers require observability and rollback plans
- Schema compatibility is the biggest hidden risk

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./diagrams/zero-downtime-migration-phases-dark.svg" />
  <img src="./diagrams/zero-downtime-migration-phases-light.svg" alt="Zero-downtime data migration phases from dual writes through cutover" />
</picture>

## Outline

1. Migration goals and risk assessment
2. Backfill and dual-write strategies
3. Schema evolution and compatibility
4. Validation and reconciliation
5. Cutover plans and rollback
6. Post-migration cleanup
