# `.orchestra/orchestration.json`

The spec is the source of truth. The renderer reads it, together with the body files it points to, and writes the platform files.

```json
{
  "version": 1,
  "project": "my-project",
  "targets": ["cursor", "claude"],
  "models": {
    "cursor": {
      "tiers": {
        "ops": "composer-2.5-fast",
        "light": "grok-4.7-medium",
        "standard": "grok-4.7-high",
        "heavy": "grok-4.7-xhigh"
      },
      "fast": {
        "light": "grok-4.7-medium-fast",
        "standard": "grok-4.7-high-fast"
      },
      "aliases": {},
      "orchestrator": "composer-2.5"
    },
    "claude": {
      "tiers": { "ops": "haiku", "light": "sonnet", "standard": "sonnet", "heavy": "opus" },
      "orchestrator": "sonnet"
    }
  },
  "packetTiers": ["ops", "light", "standard", "heavy"],
  "builtins": [],
  "orchestrator": {
    "body": "orchestrator.md",
    "description": "Runs the sequential scope → implement → merge → finish loop."
  },
  "agents": [
    {
      "name": "scope",
      "role": "scope",
      "description": "Reads the current milestone and returns one or two packets with a model. Does not edit the tree.",
      "model": "ops",
      "readonly": true,
      "launchedBy": ["orchestrator"],
      "body": "agents/scope.md"
    },
    {
      "name": "implement",
      "role": "implement",
      "description": "Implements one packet on a branch, runs check and review until clean, and hands off. The parent passes the model.",
      "model": "packet",
      "launchedBy": ["orchestrator"],
      "owns": ["src/**", "tests/**"],
      "body": "agents/implement.md"
    }
  ]
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `version` | yes | Always `1`. |
| `project` | yes | A short name. It appears in the generated headers. |
| `targets` | yes | `cursor`, `claude`, or both. |
| `models.<target>.tiers` | yes | Must contain every tier that any agent or `packetTiers` uses. Tiers are `ops`, `light`, `standard`, and `heavy`. Custom tier names are allowed. |
| `models.<target>.fast` | no | Fast slug per tier, used by `{{model:<tier>:fast}}` and added to the allowed packet models. |
| `models.<target>.aliases` | no | Maps alternative strings to an allowed slug, for example a bracket string some tool emits mapped to its kebab slug. The hook normalizes these. |
| `models.<target>.orchestrator` | yes | The model the user selects for the orchestrator chat or session. On Claude Code, this is written as the `model:` of `/orchestrate`. |
| `packetTiers` | yes, if any agent is `packet` | The tiers `scope` may put in a packet. Include `ops` so that commit-only and `prep-stack` packets pass the hook. |
| `builtins` | no | Platform agents you launch but do not generate, such as Cursor's `bugbot`. They are accepted as launch targets. |
| `orchestrator.body` | yes | Path relative to `.orchestra/`. |
| `agents[].name` | yes | Kebab-case and unique. It becomes the file name and the `subagent_type`. |
| `agents[].role` | yes | A catalog role, or `custom`. It is informational. |
| `agents[].description` | yes | One or two sentences, used by the platform to describe the agent. Say who launches it. |
| `agents[].model` | yes | A tier name (pinned), `packet` (the parent passes it, enforced by the hook), or `inherit`. |
| `agents[].readonly` | no | `true` means it cannot edit files. |
| `agents[].launchedBy` | yes | `["orchestrator"]` and/or the names of other agents. |
| `agents[].owns` | no | Globs this agent may write. It is documentation for the zone rule and is checked for overlaps between writers. |
| `agents[].tools` | no | A Claude Code `tools` allowlist (string). Omit it to inherit all tools. |
| `agents[].body` | yes | Path relative to `.orchestra/`. The file is body only, with no frontmatter. |

`launches` is derived from `launchedBy`, so you do not write it.

## Commands

```bash
node SKILL_DIR/scripts/render.mjs --root <git root> --check   # validate only
node SKILL_DIR/scripts/render.mjs --root <git root>           # validate + write
node SKILL_DIR/scripts/render.mjs --root <git root> --target claude
```
