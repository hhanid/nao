---
name: audit-context
description: Diagnose the health of a nao context at any stage of its lifecycle. Use when the user wants a structured review of what's been synced, how RULES.md compares to the target structure, whether every table is documented, whether the data model is MECE, whether tests exist and what their failures reveal, and whether context files are bloated. Outputs a structured audit report with ranked recommendations. Do not use for first-time setup (setup-context) or routine rule writing (write-context-rules).
---

# audit-context

Diagnose a nao context. Find gaps, inconsistencies, failure root causes, and bloat. Produce a single audit report with recommendations ranked by impact.

**Can be run at any stage** — right after `setup-context`, mid-build, before a release, or whenever the agent's behavior gets surprising. **Apply nothing without confirmation** — this skill diagnoses, the user (or a follow-up call to `write-context-rules` / `add-semantic-layer`) fixes.

## Run these checks in order

### Step 1 — Audit synced context

Look at what's actually wired into the project.

- Read `nao_config.yaml`. What's configured? (warehouse, repos, Notion, semantic layer, MCPs.)
- What's **missing** that could improve agent reliability? Common gaps:
    - dbt repo not synced.
    - ETL repo (Airbyte / Fivetran configs / custom loaders) not synced.
    - BI repo (Looker / Metabase / Hex) not synced.
    - Internal docs (Notion, glossaries) not synced.
- Has `nao sync` actually run? Check that `databases/`, `repos/`, `docs/` (if Notion is configured), and `semantics/` (if applicable) are populated. Empty folders = sync hasn't run or failed.
- Does the scope follow nao context-engineering rules?
    - **<100 datasets, ideally <20** in scope.
    - Each in-scope table must be well-documented (see Step 3).
    - Better 12 well-documented tables than 80 half-documented ones.

Flag oversized scope explicitly. It's the single biggest predictor of reliability failure and the hardest thing to fix later.

### Step 2 — Audit `RULES.md` against the target structure

Compare the existing `RULES.md` against the six standard sections produced by the `write-context-rules` skill:

1. `## Business overview` (Product + Business model)
2. `## Data architecture` (Warehouse, Data stack, Data layers, Data sources)
3. `## Core data models` (Most Used Tables + Tables detail)
4. `## Key Metrics Reference` (grouped by category)
5. `## Date filtering` (SQL formulas — not placeholders)
6. `## Analysis Process` (5 subsections)

For each section: **Present? Missing? Thin?** List specific gaps:

- Sections entirely absent.
- Subsections that are placeholders / `TODO:`.
- Date-filtering blocks that are still empty.
- Metric entries with no source-of-truth pointer.

### Step 3 — Context coverage (per table)

For **every table** in `databases/`, check that the agent has enough context to use it:

- Is it referenced in `## Core data models / ### Most Used Tables` in `RULES.md`?
- Does it have a block in `## Core data models / ### Tables detail` with Purpose, Granularity, Key Columns, Use For?
- Is there dbt context for it (look in `repos/<dbt>/models/**/schema.yml`)?
- Are there extra `.md` files describing it (e.g. `docs/<table>.md`, domain-specific files)?

Then check what's **missing per table**:

- Columns the agent will frequently reference but have no description.
- Calculated fields with no explanation.
- Foreign keys with no relation documented.
- Common filters / WHERE clauses not mentioned anywhere.

A table with no documentation anywhere is a high-priority finding.

### Step 4 — Data model consistency (MECE)

Audit the data model itself, not just the docs.

- **Mutually exclusive?** Are there multiple tables that compute the same thing differently? (E.g. two tables claiming to hold MRR, two tables of "active users" with different definitions.)
- **Collectively exhaustive?** Are there metrics users ask about that no in-scope table can answer?
- **Duplicated columns?** Same logical field under different names across tables (`user_id` vs `customer_id` vs `account_id` for the same entity).
- **Ambiguous columns?** Columns whose name doesn't make their semantics clear (e.g. `amount` without unit, `status` without enum values).

Flag every MECE violation. Conflicting definitions are the most damaging issue — the agent will pick one unpredictably.

### Step 5 — Test coverage

Two paths.

**If `tests/` is empty or missing:**

- Recommend running `create-context-tests`. The audit can't measure reliability without tests.

**If tests exist:**

- Read `tests/outputs/` for the most recent run. Categorize each failure using this taxonomy:

| Category              | Looks like                       | Root cause                                | Fix                                                                                 |
| --------------------- | -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| **Data model**        | Wrong column / wrong table       | Unclear or incomplete schema docs         | Add column descriptions; clarify granularity.                                       |
| **Date selection**    | Wrong period / wrong week start  | Ambiguous date rule                       | Add explicit DO/DON'T SQL in `## Date filtering`.                                   |
| **Test issue**        | Test SQL itself is wrong         | Flawed test                               | Fix the test, not the context.                                                      |
| **Interpretation**    | Reasonable but different reading | Ambiguous term                            | Add to naming conventions or `## Key Metrics Reference`.                            |
| **Metric definition** | Wrong formula / wrong source     | Missing or inconsistent metric definition | Tighten `## Key Metrics Reference`, or add a semantic layer (`add-semantic-layer`). |

For each failure, propose the **smallest** rule change that would fix it. Sort recommendations by impact (number of tests affected).

### Step 6 — Token optimization

Look for context bloat.

- File sizes — flag any single context file >40KB. `RULES.md` should stay well under that.
- Per-table detail blocks in `RULES.md` that exceed 10 key columns (the cap from `write-context-rules`).
- Duplicated definitions between `RULES.md` and `databases/<table>.md` (the same content in two places).
- In-scope tables with no mention in any test or recent user question — candidates for trimming.
- Raw / staging tables that snuck into scope.

If `RULES.md` is bloated, suggest moving per-table detail out into `databases/<table>.md` and keeping only the one-line pointer in `## Core data models / ### Most Used Tables`. If multiple distinct domains are in `RULES.md`, suggest a per-domain file map (e.g. `nao/<domain>/rules.md` referenced from `RULES.md`). Show the proposed structure before moving anything.

## Output: audit report (in conversation, not a file)

Report inline in the chat. **Don't create files.** The user reads it once and acts on it — saving it to disk adds clutter for no real benefit.

### Structure

Lead with a **one-paragraph summary** covering four things at a glance:

- **Sync state** — complete / partial / not run.
- **Scope wideness** — N tables in scope, vs. the ≤100 ceiling (and whether it's wide and shallow vs. narrow and deep).
- **Rules quality** — N/6 standard sections present and substantive.
- **Test coverage** — N tests, X% passing (or "no tests yet").

Then **deep-dive one section at a time** (Steps 1-6 above), each as a short block. Skip a section entirely if it's clean — don't pad.

End with a **prioritized action plan** ordered easiest-win → biggest-work, so the user can pick a starting point:

```
## Plan

1. (easy / 5 min) <quickest meaningful fix>
2. (small / 30 min) <next>
3. (medium / 1-2 hr) <next>
4. (large / multi-session) <biggest item>
```

Each item should name the skill that does the work (`write-context-rules`, `create-context-tests`, `add-semantic-layer`) so the user can route directly.

### Per-section formatting hints (use only when there's something to report)

- **Synced context / RULES.md vs target / Token bloat** — bulleted gaps.
- **Context coverage** — small table: Table | RULES.md | dbt docs | Extra .md | Gap.
- **Data model consistency** — bulleted MECE violations / duplicates / ambiguities.
- **Test failures** — small table: Test | Category | Proposed fix.

Skip any section that's clean. Don't write empty subheadings.

## Guardrails

- **Apply one change at a time.** Re-run tests between fixes so impact is attributable.
- **Tests are the source of truth for "is the context working."** If the user says "it's working," ask for the latest `nao test` pass rate before believing it.
- **Don't move or split files without explicit confirmation.** Show the proposed file map first.
- **Don't fix in this skill.** Diagnose, recommend, then route to `write-context-rules` / `add-semantic-layer` / `create-context-tests` for the actual edit.
