---
name: create-context-tests
description: Generate a test suite of natural-language → SQL pairs that becomes the quality benchmark for a nao agent, then run it via `nao test`. Use when the user wants to start measuring agent reliability, extend an existing test suite, or add tests for new metrics. Tests are the only honest answer to "is the context working?". Do not use for writing rules (write-context-rules) or diagnosing failures (audit-context).
---

# create-context-tests

## About nao tests

`nao test` measures the agent's performance on a set of unit tests authored by the user. It exists to **monitor and improve context quality over time**. Each test pairs a natural-language question with the expected SQL; nao runs both, compares the answers, and reports whether the agent matched.

What it's used for:

- **Performance measurement** — execute tests against the analytics agent and verify correctness.
- **Regression detection** — catch when context changes break previously working questions.
- **Quality assurance** — validate that the agent produces accurate, data-driven answers.
- **Cost / efficiency tracking** — monitor token usage, execution time, and tool-call counts per run.

How it fits the workflow: commit `tests/` to git, run `nao test` on every context change, monitor pass rate and cost trends over time. The suite is the quality benchmark — every change to `RULES.md` is measured against it.

Reference: [docs.getnao.io/nao-agent/context-engineering/evaluation](https://docs.getnao.io/nao-agent/context-engineering/evaluation).

## How many tests

**Rule of thumb: one test per key metric in `## Key Metrics Reference`.** That's the floor — every metric the rules promise must be exercised by the suite. Beyond that, add tests only for genuine failure modes, not hypothetical ones.

## Coverage checklist

The suite should cover:

- **One question per key metric** — every entry in `## Key Metrics Reference` gets at least one test.
- **Time scoping** — last week, this month, YoY, rolling 30 days. Especially "last 8 weeks" / "last 30 days" with the current-period rule from `## Date filtering`.
- **CTE / complex queries** — questions that require sub-CTEs, multi-step logic, or transformations a simple semantic-layer call can't produce. These exercise the agent's ability to compose, not just lookup.
- **Edge cases** — NULLs, deprecated columns, empty time windows.
- **Ambiguous wording** — "our users", "active", "paying", "engaged". These validate naming-convention rules.

## Test authoring rules

Two rules govern how each test is written. Both apply to **every** test, including ones built from existing trusted queries.

### Rule 1 — Prompts reproduce real user behavior

The `prompt` field must read like something an actual user would type into chat: vague, short, low-context. **Do not leak the answer in the question** — no table names, no column names, no method hints, no time-grain specifications the agent should figure out from context.

| Bad (leaks the answer)                                                         | Good (real user phrasing)           |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| "What was the churn rate from `fct_subscriptions` in Q1 2026?"                 | "How's churn looking this quarter?" |
| "Count distinct `user_id` from `fct_users_activity_daily` last week"           | "How many active users last week?"  |
| "Compute MRR as SUM(`mrr_amount`) from `fct_stripe_mrr` where status='active'" | "What's our MRR?"                   |

The point of the test is to verify the agent can reach the right answer from the same low-context input a real user would give. Engineering-flavored prompts only validate that the agent can transcribe SQL.

### Rule 2 — Output column names encode the expected format, not the source

The names of the columns in the test's `sql` output have two jobs:

1. **Communicate the expected format / unit** of each value, so a comparison is meaningful.
2. **Not leak** which table or column the data came from.

| Bad (leaks the source)              | Good (encodes format)    |
| ----------------------------------- | ------------------------ |
| `churn_rate_from_fct_subscriptions` | `churn_rate_float_0_1`   |
| `mrr_amount_fct_stripe_mrr`         | `mrr_usd_dollars`        |
| `dau_count_users_activity`          | `active_users_count`     |
| `signup_at_dim_users`               | `signup_date_yyyy_mm_dd` |

Naming conventions to use:

- **Rates / ratios:** `<metric>_float_0_1` or `<metric>_percentage_0_100` — pick one and be explicit. `churn_rate_float_0_1` says the answer should be a 0-1 float, not a 0-100 percentage.
- **Currencies:** `<metric>_<currency>_<unit>` — e.g. `mrr_usd_dollars`, `revenue_eur_cents`.
- **Counts:** `<thing>_count`.
- **Dates:** `<thing>_date_yyyy_mm_dd` or `<thing>_timestamp_iso8601`.
- **Categorical:** `<thing>_<enum_values>` — e.g. `plan_free_pro_enterprise`.

If the format is ambiguous (e.g. a metric could reasonably be 0-1 or 0-100), the column name is what makes it unambiguous.

## Steps

### Step 1 — Ask the user about existing tests / source-of-truth queries

Before writing anything, ask:

- Do you already have tests, or saved source-of-truth SQL queries you trust (e.g. from a Looker report, a dashboard, a previous benchmark)?
- If yes, where are they?

Two paths from here.

### Step 2a — Transform existing queries into test files

If the user has trusted queries, convert each one into a test file under `tests/`:

- Read the query.
- **Rewrite the SELECT clause** to apply Rule 2: rename output columns to encode format, not source. `SELECT churn_rate AS churn_rate_float_0_1`, not `SELECT churn_rate FROM fct_subscriptions`.
- **Reverse-engineer the natural-language `prompt`** following Rule 1: vague, short, no table/column/method hints. The way a user would actually ask in chat.
- Save as a YAML test using `templates/test.yaml`.

Skip metrics that don't have a trusted query yet — they get drafted in step 2b.

### Step 2b — Draft new tests (one per key metric)

For each metric in `## Key Metrics Reference` not already covered:

- Write a natural-language `prompt` per Rule 1 — short, vague, the way a user actually phrases it in chat. No table/column/method hints.
- Write the expected `sql`, matching the rules in `RULES.md` (date scoping per `## Date filtering`, source-of-truth tables per `## Key Metrics Reference`, naming conventions).
- Apply Rule 2 to the SELECT clause: output column names encode format (e.g. `churn_rate_float_0_1`), not source.

Add complementary tests from the coverage checklist (CTE / complex, edge cases, ambiguous wording) **only after** every metric has a baseline test.

**File layout:** save all tests directly under `tests/` (flat, not subfoldered):

```
tests/
├── mrr_current.yaml
├── mrr_growth_yoy.yaml
├── active_users_last_week.yaml
├── dau_trend_30d.yaml
└── ...
```

### Step 3 — Have the user validate / enrich

Show the drafted tests to the user. Ask them to:

- Confirm each `prompt` matches how their team actually phrases the question.
- Confirm each `sql` matches their definition of truth.
- Add any tests for known agent failure modes that aren't yet covered.

Iterate until the user signs off on the suite.

### Step 4 — Run `nao test`

**Prerequisites — set these up before running:**

1. **`cd` into the project directory** (the folder containing `nao_config.yaml`). Every `nao` command runs from there.
2. **Start `nao chat` in the background** — the test runner reuses the chat infrastructure, so it has to be live in another process. Either run it in a second terminal or background it:
    ```bash
    nao chat &
    # ...wait until it reports it's serving
    ```
3. **An LLM model must be configured** in `nao_config.yaml` (the model you'll pass to `-m`).

**First run will ask for local login credentials.** The very first `nao test` invocation prompts the user to log in (the test runner hits the chat server's auth endpoint). The user has to type the credentials themselves — don't try to script around the prompt. Subsequent runs reuse the session.

Then run:

```bash
nao test -m <model_id> -t 10
```

- `-m <model_id>` — the model to evaluate (e.g. `claude-sonnet-4-7`, `gpt-4o`).
- `-t 10` — number of tests to run in parallel. 10 is a reasonable default; lower it if rate-limited.

### Step 5 — Recap the results

When the run completes, report to the user:

- **Pass rate** — % of tests where the agent's answer matched the expected SQL output.
- **Token cost** — total input + output tokens, and the dollar cost.
- **Time** — total wall-clock duration and average per test.

This is the baseline. Cite it explicitly — every future context change should be measured against it.

### Step 6 — (Optional) Diagnose failures

For each failed test, read the corresponding output file in `tests/outputs/`. For each failure, identify:

- What SQL the agent produced vs what was expected.
- Which rule in `RULES.md` (or absence of one) caused the gap.
- The minimal context change that would fix it.

Suggest the fix to the user, then route to `write-context-rules` (or `audit-context` for systemic issues) to apply it. Re-run `nao test` after each change so impact is attributable.

## Guardrails

- **Always `cd` into the project directory before running `nao` commands.** `nao_config.yaml` must be in the current working directory.
- **`nao chat` must be running before `nao test`.** The test runner uses the chat server. Start it in the background or a second terminal.
- **First `nao test` run prompts for login credentials.** Let the user type them; don't script around the prompt.
- **Don't write tests with SQL that contradicts `RULES.md`.** If you find a contradiction, stop and ask which is correct — that's a bug in either the rules or your test.
- **Never write a test you can't run.** Every test's SQL should execute against the actual warehouse without modification.
- **Use real table / column names from the user's schema in `FROM` clauses.** No `<table>` placeholders in saved tests.
- **Never leak the answer in the prompt or in output column names.** See Rule 1 (prompt) and Rule 2 (output columns) above.
- **Output column names must encode format / unit.** `churn_rate_float_0_1`, `mrr_usd_dollars`, `signup_date_yyyy_mm_dd` — never `churn_rate_from_<table>`.
- **One test per metric is the floor, not the ceiling.** Add coverage tests for CTE / edge cases / ambiguity, but only after every metric has a baseline test.
- **Apply one context fix at a time** between test runs so the pass-rate delta is attributable.

## Templates

- `templates/test.yaml` — single test entry format.
