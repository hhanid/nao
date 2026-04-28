---
name: setup-context
description: Bootstrap a nao agent for a project — configure the warehouse, define the data scope, run nao init + nao sync, and generate the first RULES.md from the synced files. Use when the user has just decided to use nao on a new project. Only for first-time setup; for editing rules, generating tests, or reviewing an existing context, use write-context-rules / create-context-tests / audit-context.
---

# setup-context

Walk the user from "I just installed nao" to "I have a synced project with a first `RULES.md` I can iterate on." Output: a working `nao_config.yaml`, a successful `nao sync`, and a starter `RULES.md`.

The core constraint everywhere: **≤20 tables for the first POC.** Reliability collapses past that, and iteration slows down. Stay small.

## Step 1 — Configure the warehouse

Ask:

- Which warehouse? (BigQuery / Snowflake / Postgres / Redshift / DuckDB / etc.)
- How will nao authenticate? (service account JSON, env vars, OAuth, key pair, etc.)
- Confirm the user has read access for that auth.

Capture all of this — it goes into `nao_config.yaml` in step 4.

## Step 2 — Define the data scope

Ask:

- Which project / dataset / schema(s)?
- Which tables go in scope?

There are two valid shapes for a first POC, both capped at 20 tables. Recommend one based on what the user is trying to do:

| Strategy  | Shape                                                          | Recommend when                                                                                          |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Broad** | All tables of `gold` / marts, across multiple domains.         | The agent serves execs / CEO / cross-functional questions. Breadth matters more than depth.             |
| **Deep**  | Tables of `silver` + `gold` for **one** domain (e.g. finance). | The agent serves a specific team with deep, domain-specific questions. Depth matters more than breadth. |

Pick one. Mixing (e.g. "silver + gold across all domains") blows the 20-table budget and degrades quality.

The goal is **every table in scope has proper context** — better to have 12 well-documented tables than 20 half-documented ones.

## Step 3 — Identify extra context to import

Ask about **each** of these — most users have at least one:

- **Existing git repos** that document the data:
    - dbt project (`schema.yml`, docs blocks, semantic models / MetricFlow).
    - ETL / ingestion pipelines (Airbyte, Fivetran configs, custom loaders).
    - Semantic layer (Cube, dbt semantic, LookML).
    - BI repo (Looker views, Metabase, Hex notebooks).
- **Existing skills** they want to import (e.g. a custom skill from another project, a published nao skill).
- **Internal docs**: glossaries, runbooks, Notion workspace, README files describing the data.

For each one, capture the local path, git URL, or Notion workspace ID. These will be referenced from `nao_config.yaml` so `nao sync` pulls them into context.

## Step 4 — Install nao-core and run `nao init`

```bash
pip install nao-core
nao init
```

`nao init` is interactive. It walks the user through configuring databases, LLM, and optional providers (skills, MCPs, Notion, Slack, repos) — feed it the answers from steps 1-3. It then writes `nao_config.yaml` and scaffolds the project folder structure.

### What `nao init` creates

```
<project>/
├── nao_config.yaml      # the configuration written from your prompts
├── RULES.md             # empty — populated in step 6
├── .naoignore           # ignore patterns (templates/, *.j2, tests/)
│
├── databases/           # nao sync writes per-table schema, preview rows, profiling here
├── repos/               # nao sync clones / pulls every configured external repo here
├── docs/                # nao sync writes synced documentation here (e.g. Notion)
├── semantics/           # YAML semantic-layer files (used by add-semantic-layer)
├── queries/             # saved queries
├── tests/               # test suite (used by create-context-tests)
└── agent/
    ├── tools/           # custom tools the agent can call
    ├── mcps/            # MCP server configs
    └── skills/          # project-specific skills
```

Confirm the structure exists before moving to `nao sync`. Then optionally run `nao debug` to verify connectivity to the warehouse and LLM before syncing.

## Step 5 — Run `nao sync` until it succeeds

```bash
nao sync
```

Common issues to handle:

- Auth failure → fix credentials in step 1.
- Tables not found → confirm dataset / schema casing, confirm tables actually exist.
- Permission denied → grant read access to the service account.
- External repo path missing → fix paths from step 3.

Don't move on until `nao sync` exits cleanly. The synced files are what step 6 consumes.

## Step 6 — Generate a first simple `RULES.md`

After `nao sync`, the project file system contains everything the next step needs. The empty `RULES.md` from `nao init` now gets populated.

Folders to read:

- **`databases/`** — per-table schema, preview rows, and profiling.
- **`repos/`** — every synced git repo (dbt, ETL, semantic layer, BI).
- **`docs/`** — synced documentation (e.g. Notion workspace), if configured.
- **`semantics/`** — semantic-layer YAMLs, if any were imported.

**Hand off to the `write-context-rules` skill.** It will detect the empty `RULES.md` and run its full flow — generating `## Business overview`, `## Data architecture`, `## Core data models`, `## Key Metrics Reference`, `## Analysis Process` from the synced files, then walking the user through metric source-of-truth validation and date-filtering rules.

The `write-context-rules` skill owns the `RULES.md` template and is the only skill that writes to `RULES.md`. This skill (`setup-context`) only orchestrates.

## Step 7 — Recommend next steps

Tell the user, in this order:

1. **Smoke test** — run `nao chat` and ask 3-5 questions you'd expect the agent to handle. See what works.
2. **Review the generated `RULES.md`** — flag obvious wrong inferences from synced files.
3. **Pick a next skill (recommended order):**
    - `write-context-rules` — generate the six standard sections of `RULES.md` (business overview, data architecture, core data models, key metrics reference, date filtering, analysis process), then walk through metric source-of-truth and date-filtering rules with the user.
    - `create-context-tests` — build the 20-question benchmark so you can measure each rule change.
    - `audit-context` — only relevant if an existing context was merged in and needs review.
    - `add-semantic-layer` — wire in dbt MetricFlow, Cube, Snowflake views, or nao YAML semantic files as the source of truth for metrics. Do this once rules + tests are in place; the semantic layer routing then gets layered on top.

## Guardrails

- **Cap at 20 tables.** If the user pushes higher, walk through the trade-off (token bloat, slower iteration, lower reliability) before agreeing.
- **One scope strategy at a time.** Don't mix broad + deep — it blows the table budget and the agent ends up shallow everywhere.
- **Don't write `RULES.md` directly.** Step 6 hands off to `write-context-rules`. This skill orchestrates; that skill owns the template.
- **Don't move past `nao sync` until it succeeds.** The synced files are the foundation for everything after.
- **Don't overwrite an existing `RULES.md` or `nao_config.yaml`.** If found, stop and route to `audit-context`.
