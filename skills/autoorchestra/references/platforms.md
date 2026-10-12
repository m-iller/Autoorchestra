# Platforms

The renderer handles every difference below. Read this file so that the bodies you write stay platform-neutral. Use the `{{...}}` tokens wherever the platforms differ.

| | Cursor | Claude Code |
|---|---|---|
| Agent files | `.cursor/agents/<name>.md` | `.claude/agents/<name>.md` |
| Launch tool | `Task` | `Agent` (`Task` still works as an alias) |
| Per-launch model | any slug the account allows, as the `model` parameter | aliases only: `haiku`, `sonnet`, `opus`, `fable` |
| Frontmatter model | slug, plus `force-default-model: true` to pin it | alias or full model ID (for example `claude-opus-5-5`), or `inherit` |
| Omitted model on launch | the child may fall back to the default (Composer), so **always pass it** | per-launch param, then frontmatter, then the main session's model |
| Read-only agent | `readonly: true` | `disallowedTools: Edit, Write, NotebookEdit` |
| Nesting | subagents can launch subagents (observed) | up to 3 levels below the main thread by default |
| Hooks config | `.cursor/hooks.json` (`preToolUse`, `subagentStart`) | `.claude/settings.json` → `hooks.PreToolUse` |
| Orchestrator start | new Agent chat on the orchestrator model, then `/orchestrate` or paste the prompt | `claude --model <alias>`, then `/orchestrate` |
| Ask-the-user tool | "ask question tool" | `AskUserQuestion` |

## Tokens the renderer resolves

| Token | Cursor | Claude Code |
|---|---|---|
| `{{launch_tool}}` | `Task` | `Agent` |
| `{{agents_dir}}` | `.cursor/agents` | `.claude/agents` |
| `{{agent_file:<name>}}` | `.cursor/agents/<name>.md` | `.claude/agents/<name>.md` |
| `{{root_marker}}` | `{{agent_file:<first packet agent>}}` | same |
| `{{model:<tier>}}` | that tier's slug | that tier's alias |
| `{{model:<tier>:fast}}` | the fast slug, or the normal slug if the tier has none | the normal alias |
| `{{packet_models}}` | backticked list of every slug a packet may use | same, as aliases |
| `{{all_models}}` | backticked list of every allowed slug | same |
| `{{orchestrator_model}}` | the orchestrator model | same |
| `{{platform}}` | `Cursor` | `Claude Code` |

A token that the renderer cannot resolve is an error. Do not hand-write a slug in a body. Write `{{model:ops}}`, so that the same body renders correctly on both platforms and survives a model change.

## Model enforcement hook

The renderer installs `require-model.mjs` together with `orchestra-models.json` for each target.

- For a `packet` agent, the hook allows the launch only when it carries an allowed model. That model is either the `model` parameter or a `model: <slug>` line in the prompt, which the hook copies into the parameter. Otherwise the hook denies the launch.
- For a pinned agent, the hook rewrites a missing or different model to the pinned one. On Claude Code, when the pinned model is a full ID, the hook removes the parameter so that the frontmatter applies.
- Launches of agents outside the spec pass through untouched.

Cursor needs a window reload after a hooks change. Claude Code needs a new session.
