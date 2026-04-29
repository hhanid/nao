---
name: write-context-rules
description: Create or extend a nao project's RULES.md. Owns the RULES.md template. Use when the user wants to generate the initial RULES.md from synced metadata (called by setup-context), or improve their existing RULES.md. Do not use for first-time scope setup (use setup-context) or for diagnosing existing problems (use audit-context).
---

# write-context-rules

## What `RULES.md` is for

`RULES.md` is included with **every** message sent to the nao agent — it is the agent's persistent operating context. It serves two purposes:

1. **Orchestrator** — point the agent to the right context, fast: which metric maps to which table, which topic maps to which context folder, which type of question routes to which skill.
2. **Broad rules** — how to query the data and how to answer the user.

Anything else belongs in a separate file referenced from `RULES.md` (e.g. `databases/<table>.md`, `semantics/<metric>.yaml`, a domain `.md`).

Reference: [docs.getnao.io/nao-agent/context-builder/rules-context](https://docs.getnao.io/nao-agent/context-builder/rules-context).

## Standard sections

A complete `RULES.md` has these sections (see `templates/RULES.md`):

1. `## Business overview` — Product + Business model.
2. `## Data architecture` — Warehouse, data stack, data layers, data sources.
3. `## Core data models` — `### Most Used Tables` (one-line pointers) + `### Tables detail` (Purpose, Granularity, Key Columns ≤10, Use For).
4. `## Key Metrics Reference` — grouped by metric category; one line per metric (`**metric** → table, column, formula`).
5. `## Date filtering` — SQL formulas for common time periods.
6. `## Analysis Process` — 5-step decision flow (Understand → Select Table → Write Query → Validate → Context).

## Flow

**Work section by section.** Generate one section, write it to `RULES.md`, show the user, then move to the next. Don't read everything and write everything in one go — the user can't see progress and can't course-correct.

### Step 1 — Check the state of `RULES.md`

Read the existing `RULES.md` at the project root. Two paths:

- **Empty** (or only the template scaffold from `nao init`) → run the **full flow** (steps 2-9), section by section.
- **Has content** → run the **audit-and-fill flow** (bottom of this skill).

---

### Step 2 — Generate `## Business overview`

Sources, in order:

1. Search the web for the company (use the user's company name or domain — pull from `nao_config.yaml` if present).
2. Read `databases/` and synced `repos/` (especially dbt docs in `repos/<dbt>/`) for any business context the docs surface.

Write **two paragraphs**:

- **Product**: what the company does + key product features.
- **Business model**: revenue structure + customer journey.

### Step 3 — Generate `## Data architecture`

Read `databases/` and `repos/<dbt>/` to fill in:

- **Warehouse** — type, project, dataset/schema(s) (e.g. `BigQuery (nao-production)`).
- **Data stack** — ingestion + transformation + semantic layer (e.g. `dlt, dbt, no semantic layer`).
- **Data layers** — naming convention used (e.g. `bronze / silver / gold`).
- **Data sources** — numbered list, each with the source name, table prefix, and one-line description (e.g. `1. **App Backend** (\`stg_app_backend\_\_\*\`): users, events`).

### Step 4 — Generate `## Core data models`

Two subsections:

**`### Most Used Tables`** — one line per in-scope table, pointing to its full detail folder:

```
- `dim_users` — user dimension. See `databases/type=*/database=*/schema=*/table=dim_users/`.
- `fct_stripe_mrr` — MRR fact. See `databases/type=*/database=*/schema=*/table=fct_stripe_mrr/`.
```

**`### Tables detail`** — for each in-scope table, generate a block:

```
#### `dim_users`
**Purpose**: <one-line description>
**Granularity**: One row per <entity>.
**Key Columns**:
- `<col>`: <description and/or possible values>
- ... (cap at 10 most important)
**Use For**: <which topic / metric / question category this table answers>
```

Cap **Key Columns at 10 max** per table — the full schema lives in `databases/`. Pick columns that appear in user questions or that the agent will frequently filter / join on.

### Step 5 — Generate `## Key Metrics Reference`

For each metric mentioned in dbt docs, the warehouse, or `semantics/`, write one line. **Group by metric category** (Revenue, Activity, Conversion, etc.). Include the source table, column, and formula:

```
### Revenue
- **MRR** → `fct_stripe_mrr.mrr_amount`, `SUM(mrr_amount) WHERE status = 'active'`
- **ARR** → query via dbt MCP `query_metric` (semantic layer)

### Activity
- **DAU** → `fct_users_activity_daily`, `COUNT(DISTINCT user_id)`
```

If a semantic layer is configured (`add-semantic-layer`), route metrics through it rather than naming raw tables.

### Step 6 — Generate `## Date filtering` placeholder

Leave a placeholder for now — this is filled in step 9 with the user's input:

```markdown
## Date filtering

> TODO: filled in via the user-validation step below.
```

### Step 7 — Generate `## Analysis Process`

Five subsections, adapted to the project. Use the template's structure verbatim and fill in the project-specific bits:

```markdown
## Analysis Process

### 1. Understand the Question

- Identify the metric or insight requested
- Determine the time period
- Identify user segments or filters needed

### 2. Select the Right Table(s)

- **<Question category>** → Start with `<table>`
- (One bullet per major question category, e.g. revenue → fct_stripe_mrr, activity → fct_users_activity_daily)

### 3. Write Efficient Queries

- Filter early and often (WHERE clauses on dates, user_id, etc.)
- Aggregate before joining when possible
- Use CTEs for complex queries to improve readability

### 4. Validate Results

- Check for NULL values in key fields
- Verify counts make sense (e.g., user counts shouldn't exceed total users)

### 5. Provide Context

- Explain what the numbers mean for the business
- Highlight trends, anomalies, or notable patterns
```

The category → table mapping in subsection 2 is the project-specific part — derive it from `## Core data models` and `## Key Metrics Reference`.

### Step 8 — Validate metrics with the user

Tell the user: "Most of `RULES.md` is generated. Two things need your input — let's start with metrics."

For each metric in `## Key Metrics Reference`, ask the user to confirm or correct the source of truth. Update the section in place.

### Step 9 — Write the date-filtering rules with the user

Two questions decide most of the date logic — ask these first:

1. **Week boundary**: does a week start on **Sunday** (BigQuery `WEEK`, default in many warehouses) or **Monday** (`ISOWEEK`)? This decision applies to "last week", "this week", "last 8 weeks", week-over-week comparisons.
2. **Inclusion of current period**: when the user says "last 8 weeks" or "last 30 days", does the agent **include** the current (incomplete) period or **exclude** it? This is the difference between rolling-from-now (includes today) and boundary-aligned (last 8 completed weeks).

Then ask:

- Fiscal year start, if it differs from the calendar.
- Anything else specific to this org (custom fiscal calendar, week 1 definition, timezone).

**Write only three example formulas into `## Date filtering`** — the patterns the agent will compose from:

- `Last X weeks` (parameterized, e.g. last 8 weeks)
- `Last X days` (parameterized, e.g. last 30 days)
- `Current month`

That's it. Don't enumerate every period users might ask about — the agent extrapolates from these three. The two questions above should be embodied in the SQL so the agent never re-decides them at query time.

Format example (Monday-start, exclude current week):

```sql
-- Last X weeks (excludes current incomplete week)
WHERE date >= DATE_TRUNC(CURRENT_DATE - INTERVAL (X * 7) DAY, ISOWEEK)
  AND date <  DATE_TRUNC(CURRENT_DATE, ISOWEEK)
```

Add a one-line note above each block describing the convention (e.g. `> Week starts Monday. "Last X weeks" = the X most recent fully-completed ISO weeks.`) so the user can verify intent at a glance.

---

## Audit-and-fill flow (when `RULES.md` is not empty)

If `RULES.md` already has content:

1. Read it. Compare against the six standard sections above. Produce a short gap report: present, missing, thin.
2. Show the user the gap report and ask which sections to fill or improve.
3. Run **only the relevant generation steps** above (e.g. if `## Date filtering` is the only gap, run step 9; if `## Key Metrics Reference` is thin, run step 5 then step 8).
4. Show diffs before saving. Don't overwrite existing content without confirmation.

For deeper diagnostics (MECE violations, schema drift, test failure root causes), route to `audit-context`.

## Guardrails

- **Generate section by section, not all at once.** Write each section to `RULES.md` and show the user before moving on — they need to see progress and catch wrong inferences early.
- **Show diffs, don't auto-overwrite.**
- **Don't bloat `RULES.md`.** Per-table detail goes in `databases/<table>.md`, not inline.
- **Don't invent metric sources.** If a metric's source isn't clear from dbt docs / `semantics/`, list it for user validation in step 8 rather than guessing.
- **`## Date filtering` keeps three examples max.** Last X weeks, last X days, current month. Don't enumerate every period.

## Templates

This skill owns the `RULES.md` template. No other skill should write `RULES.md` directly.

- `templates/RULES.md` — lean scaffold with the six standard sections.
