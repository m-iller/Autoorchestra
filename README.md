# autoorchestra

**Your strongest model designs the agent team once, and your cheapest model runs it for hours.**

autoorchestra is a skill for **Cursor** and **Claude Code**. It interviews you about your models, reads your repository, and designs a sequential team of subagents. It then writes everything the team needs to run unattended:

- one subagent file per role, each with a strict contract and a fixed return format
- an **orchestrator prompt** for a cheap model, which loops scope → implement → merge → finish until the milestone is done
- a **model-enforcement hook**, so that no agent silently runs on the wrong model
- a single source of truth in `.orchestra/`, so you can re-tune the team later without starting over

```
 strong model (once)                     cheap model (every run)
┌──────────────────────┐                ┌──────────────────────────────────────────────┐
│ /autoorchestra       │   generates    │ /orchestrate                                 │
│  1 models            │ ─────────────▶ │  scope ─▶ implement ─▶ merge ─▶ … ─▶ finish  │
│  2 read the repo     │                │            ├─ check   (ops model)            │
│  3 interview         │                │            ├─ review  (standard model)       │
│  4 design the team   │                │            └─ docs    (ops model)            │
│  5 write + render    │                │  one unit in flight, stops only for you      │
└──────────────────────┘                └──────────────────────────────────────────────┘
```

---

## Install

Pick one. Each method installs the same skill.

### Any agent, via the skills CLI (recommended)

```bash
npx skills add m-iller/Autoorchestra              # auto-detect your agent
npx skills add m-iller/Autoorchestra -a cursor
npx skills add m-iller/Autoorchestra -a claude-code
npx skills add m-iller/Autoorchestra -g           # global, for all your projects
```

### Claude Code plugin

```bash
claude plugin marketplace add m-iller/Autoorchestra
claude plugin install autoorchestra@autoorchestra
```

Or, inside a session, run `/plugin marketplace add m-iller/Autoorchestra` and then `/plugin install autoorchestra@autoorchestra`.

### npm

```bash
npx autoorchestra init                # installs for whichever of .cursor/ / .claude/ exists here
npx autoorchestra init --cursor       # only Cursor
npx autoorchestra init --claude       # only Claude Code
npx autoorchestra init --global       # ~/.cursor/skills and ~/.claude/skills
npx github:m-iller/Autoorchestra init   # straight from GitHub, without npm publish
```

### Manual

Copy `skills/autoorchestra/` to one of these:

| Agent | Project | Global |
|---|---|---|
| Cursor | `.cursor/skills/autoorchestra/` or `.agents/skills/autoorchestra/` | `~/.cursor/skills/autoorchestra/` |
| Claude Code | `.claude/skills/autoorchestra/` | `~/.claude/skills/autoorchestra/` |

**Requirements:** Node.js 18 or newer, which the renderer and the hook use, and a git repository.

---

## Use

### 1. Generate the team (once, on your strongest model)

Open your project and select your **strongest** model, then run:

| Where | Command |
|---|---|
| Cursor | `/autoorchestra` |
| Claude Code (skill) | `/autoorchestra` |
| Claude Code (plugin) | `/autoorchestra:autoorchestra` |

Or just ask: *"set up an agent orchestration for this repo"*.

The skill then:

1. **Asks which models you can use.** On Cursor, you paste your model slugs. On Claude Code, you pick from `haiku` / `sonnet` / `opus` / `fable`. It maps them to four tiers: `ops`, `light`, `standard`, and `heavy`.
2. **Reads the repository**: stack, exact check commands, roadmap or specs, guidelines, risk areas, state docs, and git setup.
3. **Asks only what the repository can't answer**: work source, milestone, git policy, stop cases, and which changes need security review.
4. **Designs the team** from a role catalog and shows you one table to approve.
5. **Writes and renders** the files, validates every contract, and dry-runs one loop on paper.

### 2. Run the orchestrator (every time, on a cheap model)

**Cursor:** reload the window so the hooks load. Open a **new Agent chat** on the orchestrator model you chose, then type `/orchestrate` or paste the block from `.cursor/orchestrator-prompt.md`. Do not save it as an agent.

**Claude Code:**

```bash
claude --model sonnet      # or whatever orchestrator model you picked
> /orchestrate
> /orchestrate phase 3     # optional extra instruction
```

The orchestrator works one unit at a time and never asks between units. It stops only when:

- the milestone's exit criteria are met
- an agent needs a secret it does not have
- a **major decision** comes up (you define what counts during the interview)

---

## What gets generated

```
.orchestra/                      ← source of truth (commit this)
  orchestration.json             models, tiers, roster, who launches whom
  orchestrator.md                orchestrator body
  agents/<name>.md               agent bodies (no frontmatter)
  recon.md                       what the skill learned about the repo
  dry-run.md                     one traced loop
  rendered.json                  list of generated files

.cursor/                         ← when targeting Cursor
  agents/<name>.md               frontmatter: model, force-default-model, readonly
  orchestrator-prompt.md         paste-able orchestrator prompt
  commands/orchestrate.md        /orchestrate
  hooks/require-model.mjs        model enforcement
  hooks/orchestra-models.json
  hooks.json                     merged (your other hooks are kept)

.claude/                         ← when targeting Claude Code
  agents/<name>.md               frontmatter: model, disallowedTools
  commands/orchestrate.md        /orchestrate, with model: <orchestrator>
  hooks/require-model.mjs
  hooks/orchestra-models.json
  settings.json                  merged (your settings and hooks are kept)
```

### The default team

| Agent | Job | Model |
|---|---|---|
| `scope` | Picks the next unit and returns 1–2 *packets*, each with a model chosen by difficulty | `ops` |
| `implement` | Implements one packet on a branch, runs `check` and `review` until clean, then commits | from the packet |
| `check` | Runs your exact format, lint, and test commands, and returns green or red | `ops` |
| `review` | Reviews the branch diff for real defects | `standard` |
| `merge` | Compares the branch to the spec, then squash-merges it locally | `ops` |
| `finish` | Verifies the milestone's exit criteria | `heavy` |

Optional roles are `security-review`, `docs` (keeps gap or changelog docs in sync), and `prep` (starts local services, closes stand-ins). The skill adds them only when your project needs them, and renames roles to your vocabulary.

### Model enforcement

Some agents have a fixed model. Others, such as `implement`, take the model from the packet. On Cursor, an omitted `model` can silently fall back to the default model. The hook closes that gap:

- **Packet agents** must receive an allowed model, either as the parameter or as a `model:` line in the prompt. Otherwise the launch is denied with a message telling the orchestrator what to do.
- **Pinned agents** get their pinned model, whatever the caller passed.
- **Other agents** pass through untouched.

---

## Change the team later

Edit the sources in `.orchestra/` and re-render:

```bash
npx autoorchestra render --root .               # or:
node <skill dir>/scripts/render.mjs --root .
node <skill dir>/scripts/render.mjs --root . --check   # validate only
```

You can also run `/autoorchestra` again. It detects the existing spec and asks what changed, for example new models, a new role, or something that went wrong in a run.

`<skill dir>` is wherever the skill was installed: `.agents/skills/autoorchestra` (skills CLI), `.cursor/skills/autoorchestra`, or `.claude/skills/autoorchestra`.

Bodies use tokens such as `{{model:ops}}`, `{{launch_tool}}`, and `{{agent_file:check}}`. The same sources therefore render correctly for both platforms and survive a model swap.

---

## Uninstall

```bash
npx skills remove autoorchestra                  # skills CLI
claude plugin uninstall autoorchestra            # Claude Code plugin
npx autoorchestra uninstall                      # npm installer
```

Uninstalling removes the skill only. To remove a generated team, delete `.orchestra/` and the files listed in `.orchestra/rendered.json`, then remove the `require-model.mjs` entries from `.cursor/hooks.json` or `.claude/settings.json`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/autoorchestra` is not listed | Cursor: Settings → Rules, Skills, Subagents, and check that `SKILL.md` is in `skills/autoorchestra/`. Claude Code: restart the session. For the plugin, the command is `/autoorchestra:autoorchestra`. |
| Hook not firing | Cursor: reload the window. Claude Code: start a new session, then check with `/hooks`. Make sure `node` is on PATH. |
| "Blocked implement launch" loops | The scope packet has no valid `model:` line. Check that `packetTiers` in the spec includes every tier scope can emit, re-render, and restart. |
| Orchestrator stops and asks "continue?" | The orchestrator model is too weak for the loop. Pick a model one tier up and re-render. |
| Agents run on the wrong model in Claude Code | Per-launch `model` accepts only `haiku` / `sonnet` / `opus` / `fable`. Use full model IDs only for pinned tiers. |

---

## Development

```bash
npm test                  # renderer + hook tests (node:test, zero deps)
npm run check:example     # validate the golden example
npm run render:example    # render it into examples/sample-project/
claude plugin validate .  # validate the Claude Code plugin manifests
```

Layout:

```
skills/autoorchestra/
  SKILL.md                       the generator workflow (7 phases)
  references/                    loaded phase by phase
    interview.md  platforms.md  prompt-style.md  roles.md
    orchestrator-template.md  spec-schema.md
    roles/  scope implement check review security-review merge finish docs prep
  scripts/render.mjs             spec → platform files (zero deps)
  assets/hooks/require-model.mjs model-enforcement hook (zero deps)
bin/cli.mjs                      npx installer
.claude-plugin/                  Claude Code plugin + marketplace manifests
examples/sample-project/         golden example spec
tests/
```

### Publishing checklist

1. Bump `version` in both `package.json` and `.claude-plugin/plugin.json`, then update `CHANGELOG.md`.
2. Run `npm test` and `claude plugin validate .`.
3. Push to GitHub. That alone enables `npx skills add` and the plugin marketplace.
4. Run `npm publish` to enable `npx autoorchestra init`.

## License

MIT
