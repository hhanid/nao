---
name: setup-context
description: Bootstrap a nao agent for a project — gather warehouse + scope + extra-context info in one round of questions, run nao init + nao sync with sensible defaults, set up the LLM key, and generate the first RULES.md from the synced files. Use when the user has just decided to use nao on a new project. Only for first-time setup; for editing rules, generating tests, or reviewing an existing context, use write-context-rules / create-context-tests / audit-context.
---

# setup-context

Walk the user from "I just installed nao" to "I have a synced project with a first `RULES.md`". Output: a working `nao_config.yaml`, a successful `nao sync`, an LLM key wired in, and a starter `RULES.md`.

**Be brief.** Limit elicitation to **one batch of questions**. Then act on the answers and only come back if something is genuinely blocking.

Scope guidance: **keep it under 100 tables** for the first POC. Above 100, `nao sync` gets slow and the agent's reliability drops because the per-table context budget gets thin. 20 is a great starting size, but the hard concern is the 100-table ceiling, not the 20-table floor.

## Step 1 — Ask everything you need, in one round

Send a single message asking for:

1. **Warehouse + auth** — type (BigQuery / Snowflake / Postgres / Redshift / DuckDB), project + dataset/schema, and how nao should authenticate (service-account JSON path, env vars, OAuth, key pair).
2. **Scope** — which tables go in. Two valid shapes:
    - **Broad** — gold/marts across multiple domains (best for exec / cross-functional agents).
    - **Deep** — silver + gold for one domain (best for a team-specific agent).
3. **Extra context to import** — dbt repo, ETL repo, BI repo, Notion workspace, internal docs / glossaries. **For each one, ask for the name** (not the path) — you'll resolve the path yourself.
4. **LLM** — which model the agent should use (Anthropic / OpenAI / Bedrock / etc.). The key itself comes later (Step 5).

Once you have the answers, proceed. **Don't ping-pong** — make reasonable defaults for anything not specified and flag them in the output rather than asking again.

### Resolving repo names yourself

If the user gave a repo **name** (e.g. `my-dbt-project`):

- Try `gh repo view <user>/<name>` and `gh repo view <org>/<name>` to find it on GitHub.
- Check common local paths: `~/Projects/<name>`, `~/code/<name>`, `~/dev/<name>`, the parent directory of the current project.
- Prefer a local clone if one exists. Otherwise use the git URL — `nao sync` will clone it.

Only ask the user for the path if both methods fail.

## Step 2 — Generate `nao_config.yaml` and run `nao init`

You already know what `nao init` does (it's documented below). Don't run it first to "see what it asks" — generate the config and run init non-interactively.

Approach:

1. **Write `nao_config.yaml`** from the user's answers using the structure in the appendix below.
2. **Run `nao init`** — it detects the existing yaml and offers to update; confirm. The folder scaffold gets created.
3. Don't waste a turn answering "yes" to optional providers (skills / MCPs / Notion / Slack) — say "no" to all and edit the yaml directly afterwards if anything was missed.
4. Show the user the generated `nao_config.yaml` and the folder tree.

### Database `templates` defaults

Each database in `nao_config.yaml` takes a `templates` list — what gets rendered per table during sync. The default is:

```yaml
templates: [columns, how_to_use, preview]
```

Available templates: `columns`, `preview`, `profiling`, `ai_summary`, `how_to_use`.

**Don't use `accessors` — it's deprecated** (renamed to `templates`). If you see `accessors` in an older config, rename it.

### What `nao init` creates

```
<project>/
├── nao_config.yaml
├── RULES.md             # empty, populated in step 4
├── .naoignore
├── databases/           # nao sync writes per-table schema, preview, etc.
├── repos/               # nao sync clones synced git repos here
├── docs/                # synced docs (Notion etc.)
├── semantics/           # YAML semantic-layer files
├── queries/             # saved queries
├── tests/               # test suite
└── agent/{tools,mcps,skills}/
```

## Step 3 — Run `nao sync` until it succeeds

```bash
nao sync
```

Common failures and the fix:

- Auth → fix credentials in the yaml.
- Tables not found → confirm dataset / schema casing.
- Permission denied → grant read access to the service account.
- External repo missing → adjust the `repos:` block.

Don't move on until sync exits cleanly.

## Step 4 — Generate the first `RULES.md` (no confirmation)

**Don't ask.** Hand off directly to `write-context-rules` to populate the empty `RULES.md` from the synced files (`databases/`, `repos/`, `docs/`, `semantics/`).

## Step 5 — Wire up the LLM key

The LLM key lives in `nao_config.yaml`. Two safe options:

**Preferred — env var reference:**

1. Pick the env var (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
2. Write `api_key: ${ANTHROPIC_API_KEY}` in the yaml.
3. **Tell the user to export the key in their shell themselves** — don't ask them to paste it into chat.

**If they insist on storing the key in the file:**

- Tell them to **edit `nao_config.yaml` themselves** and paste it on the `api_key` line. Don't have them paste it into the conversation — chat history goes through the LLM provider, and a leaked key is a real cost.
- Make sure `nao_config.yaml` is in `.gitignore` if the key is literal.

Either way, run `nao debug` to confirm the LLM connects.

## Step 6 — Recommend next steps

Tell the user, in this order:

1. **Smoke test** — `nao chat`, ask 3-5 real questions, see what works.
2. **Review `RULES.md`** — flag wrong inferences from synced files.
3. **Pick a next skill (recommended order):**
    - `write-context-rules` — refine the rules.
    - `create-context-tests` — build the test benchmark.
    - `audit-context` — at any time, when something seems off.
    - `add-semantic-layer` — only after tests reveal metric-reliability gaps.

## Guardrails

- **Cap at ~100 tables.** Above that, sync gets slow and reliability drops. 20 is a great starting size, but don't be dogmatic — be dogmatic about 100.
- **One batch of questions.** Don't ping-pong. Default reasonable answers and surface them.
- **Resolve repo names yourself** via `gh` and common local paths before asking.
- **Run `nao init` non-interactively.** Generate the yaml first, then run init. Don't first run init to "see what it asks".
- **Use `templates`, not `accessors`** in database configs. Default is `[columns, how_to_use, preview]`.
- **Never ask the user to paste their LLM key into chat.** Use env-var refs, or tell them to edit the file themselves.
- **Don't ask before invoking `write-context-rules`.** Just hand off.

## Appendix — `nao_config.yaml` skeleton

```yaml
project_name: <project>

databases:
    - type: bigquery # or snowflake | postgres | redshift | duckdb | clickhouse
      name: <connection-name>
      # auth fields vary by type — see nao docs for the exact shape per warehouse
      include:
          - '<dataset>.<table_pattern>' # e.g. "analytics.fct_*", "analytics.dim_*"
      exclude:
          - '<pattern>' # e.g. "*.tmp_*"
      templates: [columns, how_to_use, preview]

llm:
    provider: anthropic # or openai | bedrock | azure | ...
    model: claude-sonnet-4-7
    api_key: ${ANTHROPIC_API_KEY} # env-var reference; export it yourself

repos:
    - name: <repo-name> # e.g. "company-dbt"
      url: <git-url> # e.g. "git@github.com:org/company-dbt.git"
      # or `path: ../company-dbt` for a local clone
```

Add `notion:`, `slack:`, `mcp:` blocks only if the user explicitly wanted them in step 1.
