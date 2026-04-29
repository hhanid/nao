# RULES.md

> Included with every message sent to the nao agent. Keep it lean. Per-table detail belongs in `databases/<table>.md`, not here.

## Business overview

**Product**: TODO — one paragraph: what the company does + key product features.

**Business model**: TODO — one paragraph: revenue structure + customer journey.

## Data architecture

**Warehouse:** TODO (e.g. `BigQuery (nao-production)`)
**Data stack:** TODO (e.g. `dlt, dbt, no semantic layer`)
**Data layers:** TODO (e.g. `bronze / silver / gold`)

**Data sources:**

1. TODO — e.g. `**App Backend** (\`stg_app_backend\_\_\*\`): users, events`

## Core data models

### Most Used Tables

- `<table>` — TODO: one-line purpose. See `databases/.../table=<table>/`.

### Tables detail

#### `<table>`

**Purpose**: TODO
**Granularity**: One row per TODO.
**Key Columns** (cap at 10 — full schema in `databases/<table>.md`):

- `<col>`: TODO

**Use For**: TODO — which topics / metrics / question categories.

## Key Metrics Reference

> Source-of-truth pointer per metric. Detailed semantics live in `semantics/semantic.yaml` if a semantic layer is configured.

### TODO: Metric category (e.g. Revenue)

- **<metric>** → `<table>.<column>`, `<formula>`

## Date filtering

> Three example formulas. The agent extrapolates other periods from these patterns.
> Convention: TODO (e.g. "Week starts Monday; 'last X weeks' excludes the current incomplete week.")

### Last X weeks

```sql
TODO
```

### Last X days

```sql
TODO
```

### Current month

```sql
TODO
```

## Analysis Process

1. **Understand the question** — identify the metric, time period, user segments / filters.
2. **Select the right table(s)** — start from `## Core data models`. Map question category to table:
    - TODO: e.g. revenue → `fct_stripe_mrr`, activity → `fct_users_activity_daily`.
3. **Write efficient queries** — filter early (WHERE on dates / IDs), aggregate before joining, CTEs for complex logic.
4. **Validate** — NULL checks on key fields, sanity-check counts (e.g. user counts ≤ total users).
5. **Provide context** — explain what the numbers mean, flag trends / anomalies.
