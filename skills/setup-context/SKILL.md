---
name: setup-context
description: Bootstrap a nao agent for a project — gather warehouse + scope + extra-context info in one round of questions, run nao init + nao sync with sensible defaults, set up the LLM key, and generate the first RULES.md from the synced files. Use when the user has just decided to use nao on a new project. Only for first-time setup; for editing rules, generating tests, or reviewing an existing context, use write-context-rules / create-context-tests / audit-context.
---

# setup-context

Take the user from `pip install nao-core` to a synced project with a starter `RULES.md`.

**Be brief.** One batch of questions, then act. Don't ping-pong.

**Scope ceiling: ≤100 tables.** Above that, sync gets slow and per-table context budget gets thin. 20 is a great target.

## Step 1 — Ask everything in one round

Send a single message asking for:

1. **Warehouse + auth** — type (BigQuery / Snowflake / Postgres / Redshift / DuckDB / Databricks), project + dataset/schema, auth method.
2. **Scope** — which tables. Two valid shapes:
    - **Broad** — gold/marts across multiple domains (exec / cross-functional agents).
    - **Deep** — silver + gold for one domain (team-specific agents).
3. **Extra context** — dbt / ETL / BI repos, Notion, internal docs. **Ask for the name; resolve the path yourself.**
4. **LLM** — provider + model. Key comes later (Step 5).

**Resolving repo names:** try `gh repo view <user>/<name>` and `gh repo view <org>/<name>`; check `~/Projects/<name>`, `~/code/<name>`, `~/dev/<name>`. Prefer a local clone; otherwise use the git URL (sync will clone). Only ask for a path if both fail.

## Step 2 — Generate `nao_config.yaml` and run `nao init`

Don't run `nao init` first to "see what it asks". You know the flow.

1. **Write `nao_config.yaml`** from the answers (skeleton in appendix below).
2. **Run `nao init`** — it detects the existing yaml and offers to update; confirm. Folder scaffold gets created.
3. Say "no" to optional providers (skills / MCPs / Notion / Slack); edit the yaml directly afterwards if needed.
4. Show the user the yaml + folder tree.

**Database `templates` field** (per database in the yaml): default to `[columns, how_to_use, preview]`. Available: `columns`, `preview`, `profiling`, `ai_summary`, `how_to_use`. **Don't use `accessors` — deprecated.**

`nao init` creates: `nao_config.yaml`, empty `RULES.md`, `.naoignore`, and folders `databases/`, `repos/`, `docs/`, `semantics/`, `queries/`, `tests/`, `agent/{tools,mcps,skills}/`.

## Step 3 — `nao sync`

```bash
cd <project>   # where nao_config.yaml lives — every nao command runs from here
nao sync
```

Common failures: auth (fix yaml), tables not found (check schema casing), permission denied (grant read access), repo missing (fix `repos:` block). Don't move on until sync is clean.

## Step 4 — Generate `RULES.md` (no confirmation)

Hand off directly to `write-context-rules`. Don't ask.

## Step 5 — Wire up the LLM key

The key lives in `nao_config.yaml`. Two safe options:

- **Preferred:** env-var ref. Write `api_key: ${ANTHROPIC_API_KEY}`; tell the user to export the key in their shell.
- **If they insist on a literal:** tell them to edit the yaml themselves and add it to `.gitignore`. **Never** ask them to paste a key into chat.

Then `nao debug` to confirm.

### Known issue — `AI_APICallError: Not Found`

If `nao chat` / `nao debug` / `nao test` fails with that error and the URL is `https://api.anthropic.com/messages` (no `/v1/`), the parent agentic CLI (Claude Code, Cursor, Codex) is leaking `ANTHROPIC_BASE_URL` into the child env. Fix:

```bash
unset ANTHROPIC_BASE_URL ANTHROPIC_API_KEY
nao chat   # or debug / test
```

Regular human terminals aren't affected.

## Step 6 — Recommend next steps

1. Smoke test: `nao chat`, ask 3-5 real questions.
2. Review `RULES.md` for wrong inferences.
3. Pick a next skill: `write-context-rules` (refine), `create-context-tests` (benchmark), `audit-context` (anytime), `add-semantic-layer` (only after tests reveal metric-reliability gaps).

## Guardrails

- **`cd` into the project directory before any `nao` command.**
- **Cap at ~100 tables.**
- **One batch of questions.** Resolve repo names yourself.
- **Run `nao init` non-interactively** with the yaml pre-written.
- **Use `templates`, not `accessors`.** Default `[columns, how_to_use, preview]`.
- **Never have the user paste their LLM key into chat.**
- **Don't ask before invoking `write-context-rules`** — just hand off.

## Appendix — `nao_config.yaml` skeleton

```yaml
project_name: <project>

databases:
    - type: bigquery # snowflake | postgres | redshift | duckdb | clickhouse | databricks
      name: <connection-name>
      include: ['<dataset>.<table_pattern>'] # e.g. "analytics.fct_*"
      exclude: ['<pattern>']
      templates: [columns, how_to_use, preview]

llm:
    provider: anthropic # openai | bedrock | azure | gemini | mistral | ollama
    model: claude-sonnet-4-7
    api_key: ${ANTHROPIC_API_KEY}

repos:
    - name: <repo-name>
      url: <git-url> # or `path: ../company-dbt` for a local clone
```
