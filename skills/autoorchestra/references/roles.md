# Role catalog

The templates for these roles are in `roles/`. Each template is a starting body. Fill in the `<...>` placeholders with project facts, and keep the `{{...}}` tokens.

## Default roster

| Role | Job | Model | Writes | Launched by | Launches |
|---|---|---|---|---|---|
| `scope` | Pick the next unit and return 1 or 2 packets, each with a model | `ops` | no | orchestrator | nothing |
| `implement` | Implement one packet on a branch, run checks, fix, and hand off | `packet` | code on its branch | orchestrator | `check`, `review`, `security-review`, `docs` |
| `check` | Run the local format, lint, and test commands, and return green or red | `ops` | no (runs commands) | `implement`, `finish` | nothing |
| `review` | Review the branch diff for bugs and return findings | `standard` or `heavy` | no | `implement` | nothing |
| `merge` | Gate the branch against the spec, then squash-merge it locally | `ops` | the main branch | orchestrator | nothing |
| `finish` | Verify the milestone exit and return finished or open | `heavy` | no | orchestrator | `check` |

## Optional roles

| Role | Add when | Model | Writes | Launched by |
|---|---|---|---|---|
| `security-review` | Some changes touch auth, keys, money, or other high-risk surfaces | `heavy` | no | `implement` |
| `docs` | State docs (gaps, simplifications, security issues, changelog) must stay in sync | `ops` | state docs only | `implement` |
| `prep` | Units often need a local service started, or a stand-in or stub closed first | `packet` (stack start: `ops`) | environment, small fixes | orchestrator |

## Platform built-ins

On Cursor, the user may already have built-in reviewers (for example `bugbot` or `security-review`). If they want to keep them, do not generate those roles. Have `implement` launch the built-in by its `subagent_type` with no `model`, and keep the same acceptance rules. Record the built-ins in the spec under `builtins` so that `--check` accepts them as launch targets.

## Rules

- Keep the roster between 3 and 8 agents. Merge any two roles that would share a model and a permission set.
- The orchestrator launches only `scope`, `implement`, `prep`, `merge`, and `finish`. It never launches checks.
- A role that launches children must be able to launch. On Claude Code, do not put `Agent` in that agent's `disallowedTools`.
- Rename roles freely, for example `implement` to `slice` or `finish` to `phase-finish`. The templates refer to each other by role, so update the cross-references when you rename.

## The packet: the contract between scope and the implementers

```text
kind: <prep-stack | prep | implement>
model: <one slug from {{packet_models}}>
security: required | skipped
spec: <ids or paths>
files:
- <path>            # where to start, not a limit
tests:
- <one line per test that must exist or pass>
guidelines:
- <path and section>
task: <one short paragraph>
```

`scope` sets `model` with a rubric written for this project. A typical rubric:

- **`heavy`**: the spec states an invariant, a failure mode, a concurrency rule, or a multi-step ceremony; more than one service changes; or a risk surface is touched.
- **`standard`**: ordinary service or feature code.
- **`light`**: a thin wrapper, SDK, page, or config that only calls an existing API.
- **fast variant** (Cursor only): the behavior is stated in one place and the change is local. A `heavy` packet never uses fast.
