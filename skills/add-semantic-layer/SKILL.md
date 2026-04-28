---
name: add-semantic-layer
description: Wire a semantic layer into a nao agent so that metric queries are routed through a single source of truth. Supports dbt MetricFlow (Core or Cloud Semantic Layer), Cube, Snowflake (views or semantic views via MCP), an in-house nao YAML semantic layer, or other tools (via MCP discovery). Installs the right MCP server, updates RULES.md to route metric queries through the semantic layer, and (for the nao YAML option) generates starter metric files. Use after a first round of tests has shown the agent struggling with metric reliability. Do not use for raw rule writing (write-context-rules) or first-time setup (setup-context).
---

# add-semantic-layer

Connect a semantic layer to the nao agent so the semantic layer becomes the canonical source of truth for metrics — agents query it instead of computing metrics from raw tables.

## When to add a semantic layer

**nao recommendation: only add a semantic layer after a first round of `nao test` has shown evidence that the agent struggles to understand or compute key metrics reliably.** Don't add one preemptively.

Why this ordering:

- A semantic layer **increases reliability and stability** of answers — every query goes through one definition.
- But it **reduces the scope of answerable questions** — anything outside the semantic layer becomes harder for the agent to answer (or impossible, depending on configuration).

If the agent passes its tests with `RULES.md` alone, the trade-off isn't worth it. Add a semantic layer when the failures are concentrated on metric definitions, not on schema gaps or date logic.

### Semantic layer vs metric store

Two terms users often conflate. The skill works with both, but the distinction matters for tool choice:

- **Semantic layer** — a file (typically Markdown or YAML) defining metrics: name, formula, source table/column, dimensions, filters. The agent reads it as context and writes its own SQL.
- **Metric store** — a framework that exposes metrics through an API. The agent doesn't write SQL — it calls a function (e.g. `query_metric(metric="MRR", dimensions=["plan"], time_grain="month")`) and the framework converts that to SQL behind the scenes.

dbt MetricFlow (Cloud Semantic Layer mode) and Cube are metric stores. dbt Core, Snowflake views, and `nao semantic files` are semantic layers. The reliability gain is bigger with a metric store; the scope reduction is also bigger.

## Step 1 — Pick the tool

Ask the user which they want:

| Option                               | Type                                          | When                                                                    |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| **dbt MetricFlow**                   | Metric store (Cloud) or semantic layer (Core) | Already running dbt with `metrics/` or `semantic_models/`.              |
| **Cube**                             | Metric store                                  | Already running a Cube deployment.                                      |
| **Snowflake views / semantic views** | Semantic layer                                | On Snowflake; using curated views or Snowflake's native semantic views. |
| **nao semantic files**               | Semantic layer                                | No existing semantic layer. Want a lightweight in-repo YAML approach.   |
| **Other**                            | Varies                                        | Anything else (Looker / LookML, AtScale, etc.).                         |

Then branch.

---

## Path A — dbt MetricFlow (dbt Cloud with Semantic Layer)

Use this when MetricFlow is the source of truth for metrics. The agent calls `query_metric` and similar tools rather than writing SQL.

> Requires dbt Cloud with the Semantic Layer enabled. dbt Core (local-only) is not supported by this skill — there's no metric-store API in that mode, so there's nothing to route through.

Add to `.claude/mcp.json`:

```json
{
	"mcpServers": {
		"dbt-mcp": {
			"command": "uvx",
			"args": ["dbt-mcp"],
			"env": {
				"DBT_HOST": "us1.dbt.com",
				"MULTICELL_ACCOUNT_PREFIX": "your_prefix",
				"DBT_TOKEN": "${DBT_TOKEN}",
				"DBT_PROD_ENV_ID": "your_env_id",
				"DISABLE_SEMANTIC_LAYER": "false",
				"DISABLE_DISCOVERY": "true",
				"DISABLE_SQL": "true",
				"DISABLE_ADMIN_API": "true",
				"DISABLE_REMOTE": "false"
			}
		}
	}
}
```

### Steps

1. Drop the config block into `.claude/mcp.json`. Substitute `MULTICELL_ACCOUNT_PREFIX`, `DBT_PROD_ENV_ID`, and `DBT_HOST` from the user's dbt Cloud account.
2. Set `DBT_TOKEN` in the user's shell environment, **not** committed to the repo.
3. Restart the Claude session and confirm the MCP connects (list metrics).
4. Document available tools — note which MCP tool to call for `list_metrics`, `query_metric`, etc.
5. **Update `RULES.md`** (hand off to `write-context-rules`):
    - In `## Key Metrics Reference`: for every metric available in MetricFlow, route it through the MCP (e.g. `MRR → query via dbt MCP query_metric (semantic layer)`).
    - In `## Analysis Process`: add a step instructing the agent to use the dbt MCP semantic-layer tools for any metric known to MetricFlow, instead of querying raw tables.

---

## Path B — Cube

Install the Cube MCP server. Add to `.claude/mcp.json`:

```json
{
	"mcpServers": {
		"cube": {
			"command": "npx",
			"args": ["-y", "@cubejs/mcp-server"],
			"env": {
				"CUBE_API_URL": "https://your-deployment.cubecloud.dev/cubejs-api/v1",
				"CUBE_API_TOKEN": "${CUBE_API_TOKEN}"
			}
		}
	}
}
```

> Verify package name against the latest Cube MCP release. Some deployments use `@cube-dev/mcp` or a self-hosted alternative.

### Steps

1. Drop the config into `.claude/mcp.json`. Get `CUBE_API_URL` and a token from the user (Cube Cloud → API tokens).
2. Set `CUBE_API_TOKEN` in the user's shell environment.
3. Restart the session. Confirm the MCP connects (list cubes, list measures).
4. **Update `RULES.md`** (hand off to `write-context-rules`): for every measure exposed by Cube, add a source-of-truth rule routing through the Cube MCP. Note the dimension hierarchy so the agent picks the right grain.

---

## Path C — Snowflake views / semantic views

Install the Snowflake MCP server (Snowflake Labs maintains an official one). Add to `.claude/mcp.json`:

```json
{
	"mcpServers": {
		"snowflake": {
			"command": "uvx",
			"args": ["mcp-server-snowflake"],
			"env": {
				"SNOWFLAKE_ACCOUNT": "your_account",
				"SNOWFLAKE_USER": "your_user",
				"SNOWFLAKE_PASSWORD": "${SNOWFLAKE_PASSWORD}",
				"SNOWFLAKE_WAREHOUSE": "your_warehouse",
				"SNOWFLAKE_DATABASE": "your_database",
				"SNOWFLAKE_SCHEMA": "your_schema",
				"SNOWFLAKE_ROLE": "your_role"
			}
		}
	}
}
```

For Snowflake's native semantic views (Cortex Analyst), use the Cortex MCP variant if available, with `SEMANTIC_VIEW` set to the view name.

> Verify the package name and required env vars against the latest Snowflake MCP docs — auth options (key pair, OAuth, password) vary by version.

### Steps

1. Drop the config into `.claude/mcp.json`. Get account, warehouse, role, and auth from the user.
2. Set secrets (`SNOWFLAKE_PASSWORD` or key-pair location) in the user's shell environment.
3. Restart the session. Confirm the MCP connects.
4. Identify the semantic surface — list curated views (e.g. `analytics.metrics.*`) or Snowflake semantic views in scope.
5. **Update `RULES.md`** (hand off to `write-context-rules`): for each curated view / semantic view, add a source-of-truth rule pointing the agent at the view, never the underlying tables.

---

## Path D — Other (semantic layer with no obvious MCP)

1. **Search for an existing MCP** that fits the user's tool. Check the MCP registry, the tool's own docs, and the user's installed MCPs.
2. **If a fit exists**: install it, configure credentials following the pattern from paths A-C (config block in `.claude/mcp.json`, secrets in shell env, restart, test, update `RULES.md` to route through MCP).
3. **If no fit exists**: tell the user honestly. Recommend one of:
    - Falling back to **Path E** (nao semantic files) as a stopgap.
    - Building a thin MCP wrapper themselves.

---

## Path E — nao semantic files

For users who don't have a semantic layer yet but want one. Create a single `semantics/semantic.yaml` file holding all the important dimensions and metrics.

1. **Create one file** at `semantics/semantic.yaml` using `templates/semantic.yaml` as the schema. Everything goes in this one file — dimensions and metrics together — so the agent has a single source to read.

2. **Walk through the user's dimensions first**. Dimensions are the slice axes (date, plan, country, segment, etc.). For each, capture: `name`, `type` (date / categorical / numeric), `description`, and (for categorical) the allowed values.

3. **Then the user's top metrics.** For each, capture: `name`, `definition`, source `table` + `column` + `aggregation`, `grain` (finest meaningful time grain), which `dimensions` it can be sliced by, and any default `filters`.

4. **Update `RULES.md`** (hand off to `write-context-rules`): in `## Key Metrics Reference`, point every metric at `semantics/semantic.yaml`. The agent reads that one file to resolve metric definitions.

---

## Validate

After any path:

1. Re-read `RULES.md` — confirm every metric the user cares about now has a routing rule.
2. Run `nao chat` and ask one of the user's top questions. Confirm the agent uses the semantic layer (calls the MCP / reads the YAML), not raw tables.
3. Run `nao test` and **compare the pass rate to the baseline before adding the semantic layer**. The whole point of this skill is reliability — measure it.

## Recommend next step

- If `tests/` doesn't exist yet → route to `create-context-tests`.
- If reliability dropped → route to `audit-context`.
- Otherwise → return to `write-context-rules` to refine other sections.

## Guardrails

- **Only add a semantic layer after tests show metric-reliability failures.** Don't add preemptively. Cite the failing tests when the user asks "should we add one?"
- **One semantic layer at a time.** Don't wire two competing layers — it creates MECE violations the agent resolves unpredictably.
- **Don't write `RULES.md` directly.** Hand off rule writes to `write-context-rules`. This skill orchestrates and configures MCPs.
- **Don't store credentials in `.claude/mcp.json` literals.** Use `${ENV_VAR}` references and remind the user to set them in their shell. Add `.claude/mcp.json` to `.gitignore` if it contains anything sensitive.
- **Don't invent metrics for the nao semantic files path.** Only encode metrics the user explicitly defines. `TODO:` markers are fine.

## Templates

- `templates/semantic.yaml` — single-file schema for the nao semantic layer (Path E). Holds all dimensions and metrics for the project.
