---
name: autoorchestra
description: Generates a sequential multi-agent orchestration for the current repository. It produces subagent files, a hook that enforces models, and an orchestrator prompt meant to run on a cheaper model, for Cursor, Claude Code, or both. Use when the user asks to set up, generate, update, or re-tune subagents, an agent team, an orchestration, or an orchestrator for a project.
---

# autoorchestra

You are the architect. Run this skill on the strongest model available. You design a team of subagents for this repository and write their files. Then you hand the user an orchestrator prompt that a cheaper model runs.

You do not run the orchestration yourself. You do not change product code, tests, or CI. You write only to:

- `.orchestra/`, which holds the sources: spec, agent bodies, orchestrator body, and recon notes
- the generated outputs: `.cursor/agents/`, `.cursor/hooks/`, `.cursor/hooks.json`, `.cursor/commands/orchestrate.md`, `.cursor/orchestrator-prompt.md`, `.claude/agents/`, `.claude/hooks/`, `.claude/settings.json` (merged, never replaced), `.claude/commands/orchestrate.md`

`SKILL_DIR` below means the directory that contains this `SKILL.md`. The renderer is `SKILL_DIR/scripts/render.mjs`. The references are in `SKILL_DIR/references/`. Read a reference when its phase starts, not before.

## Ground rules

- **The setup is sequential.** The orchestrator has one unit of work in flight at a time, and one agent writes to the tree at a time. Read-only checks may run together. Do not design parallel writers.
- **Read before you ask.** Ask only what the repository cannot tell you.
- **Ask with the question tool.** In Cursor, use the ask question tool. In Claude Code, use `AskUserQuestion`. Ask multiple choice, at most 4 questions per call, and put your recommended option first. Fall back to plain text only when neither tool exists.
- **Every agent gets an explicit contract.** That means one job, a list of things it must not do, and a fixed return block. Write every prompt in the style of `references/prompt-style.md`.
- **The user approves the design once, in Phase 4.** Do not ask for approval at every step.

## Phase 0: Preflight

1. Find the git root. Every path you write is relative to it.
2. Run `node -v`. The renderer needs Node 18 or newer. If Node is missing, tell the user and stop.
3. Detect the targets. A `.cursor/` folder points to Cursor, and a `.claude/` folder or `CLAUDE.md` points to Claude Code. Confirm the targets with the user in Phase 1.
4. **Update mode.** If `.orchestra/orchestration.json` exists, this is an update. Read the spec, the bodies, and `.orchestra/recon.md`. Ask what changed: new models, new work source, new roles, or something that went wrong in a run. Redo only the affected phases, then re-render (Phase 6).
5. **Existing agents.** If `.cursor/agents/` or `.claude/agents/` already has hand-written agents, read all of them. They are the best evidence of how this user wants to work. Ask whether to absorb them into the new team (the default), replace them, or leave them untouched. Never delete a file you did not generate.

## Phase 1: Models

Read `references/platforms.md`, then `references/interview.md` section Models.

1. Confirm the targets: Cursor, Claude Code, or both.
2. Collect the model list for each target.
   - **Cursor:** the agent cannot list the user's models. Ask the user to paste the exact slugs the Task tool accepts in the `model` parameter, including any `-fast` variants. Ask which models are off-limits.
   - **Claude Code:** per-launch `model` accepts only aliases: `haiku`, `sonnet`, `opus`, and `fable` when the account has it. Full model IDs work only in agent frontmatter.
3. Map the models to four tiers, plus optional fast variants:
   - `ops`: mechanical work such as picking the next unit, running checks, merging, and updating docs. Use the cheapest model that follows a return format exactly.
   - `light`: thin wrappers, glue, and local changes.
   - `standard`: ordinary feature code.
   - `heavy`: invariants, concurrency, security, money, cross-service changes, and milestone verification.
4. Choose the **orchestrator model**. Pick the cheapest model that reliably runs a long numbered loop without drifting, which is usually `ops` or one step above. The orchestrator only routes. It never reads specs or code.
5. Decide which tiers a work packet may request (`packetTiers`). This is usually `ops`, `light`, `standard`, and `heavy`. `ops` covers commit-only and stack-start packets.

## Phase 2: Reconnaissance (read-only)

Read `references/interview.md` section Recon checklist. Explore the repository, launching read-only explore agents if that saves your context. Find:

- the stack, package managers, and workspace layout
- the **exact** format, lint, test, and build commands, both per package and for the full run
- where work comes from: roadmap, specs, ADRs, TODO lists, issue exports, or phase tables
- the guidelines: code review, commits, branching, and security
- the risk surfaces: auth, keys, money, migrations, infra, and public APIs
- the docs that track state (known gaps, simplifications, changelog) and must stay in sync
- the local services the tests need, with their ports and start commands
- the git facts: main branch name, remotes, and whether pushing is allowed

Write a one-page summary to `.orchestra/recon.md`. Cite paths, not prose.

## Phase 3: Scope interview

Read `references/interview.md` section Scope. Ask only what recon left open. Before Phase 4, these must be settled:

1. **Work source and unit.** Where the next unit of work comes from, and how big one unit is (aim for 400 changed lines or fewer).
2. **Milestone and exit.** What "finished" means for one orchestrator run, for example a phase exit, an empty backlog, or one feature.
3. **Git policy.** Branch naming, local squash-merge or pull requests, and whether pushing is allowed. Default to no push and no `gh`.
4. **Checks.** Which checks gate a unit, and which risk tier requires a security review.
5. **Stop cases.** When the run stops for the human. Default to three: the milestone is finished, a secret is missing, or a major decision comes up. Make "major decision" concrete for this project.
6. **Docs to maintain.** Which state files, if any, are updated after each unit.

## Phase 4: Design the team

Read `references/roles.md`.

1. Start from the default roster: `scope`, `implement`, `check`, `review`, `merge`, and `finish`. Add `security-review`, `docs`, or `prep` only when Phase 3 calls for them. Rename roles to the user's vocabulary if they have one (for example, `implement` becomes `slice`).
2. Apply the rules:
   - Use 3 to 8 agents. Add an agent only when it has a distinct job **and** a distinct model, permission, or tool set.
   - The orchestrator launches only the top-level agents. Checks are launched by `implement` (or `finish`), not by the orchestrator. Keep nesting at most 2 levels below the orchestrator.
   - Make an agent read-only whenever it does not need to write.
   - Pin a tier for mechanical roles. Give `implement` (and `prep` or `fill`, if present) the model `packet`, so that `scope` picks the tier per unit with a difficulty rubric written for **this** project.
   - Assign zones. `implement` owns product code on its branch. `docs` owns the state docs. `merge` owns the main branch. No other agent writes.
3. Show the user one compact table with these columns: agent, job, model, writes or read-only, launched by. Below the table, show the stop cases and the model rubric. Ask for approval with the question tool, offering "Approve", "Change roles", and "Change models". Iterate until the user approves.

## Phase 5: Write the sources

Read `references/spec-schema.md`, `references/prompt-style.md`, `references/orchestrator-template.md`, and the template for each role in `references/roles/`.

1. Write `.orchestra/orchestration.json`.
2. For each agent, write `.orchestra/agents/<name>.md`. This is the **body only**, with no frontmatter. Start from its role template and replace every `<...>` placeholder with project facts: real paths, real commands, real doc names, and real section IDs. Delete the template lines that do not apply. Keep the `{{...}}` tokens, because the renderer resolves them per platform.
3. Write `.orchestra/orchestrator.md` from the orchestrator template, filled in the same way.
4. Every status an agent can return must be handled by the agent that launches it. Write the parent's handling with the child's exact status words.

## Phase 6: Render and check

1. Run `node "SKILL_DIR/scripts/render.mjs" --root "<git root>" --check`. Fix every error, and fix the warnings unless you can justify one.
2. Run `node "SKILL_DIR/scripts/render.mjs" --root "<git root>"`. It writes the platform files and merges the hook config.
3. Audit the contracts by hand. Check every launch edge in the spec:
   - The parent passes everything the child's body says it receives, including `model` when the child is `packet`.
   - The parent handles every status in the child's return block.
   - The stop cases are worded identically in the orchestrator, `implement`, and `finish`.
   - No body tells an agent to do something its permissions forbid, such as an edit by a read-only agent or a launch by an agent that cannot launch.
4. Do a dry run. Take one realistic unit from the work source and trace one full loop through the prompts. Write the trace in 10 to 20 lines in `.orchestra/dry-run.md`. Fix any step where an agent would have to guess.

## Phase 7: Hand off

Tell the user in a few lines:

- what was generated (the list printed by `render.mjs`)
- **how to start the orchestrator:**
  - Cursor: reload the window so the hooks load. Open a new Agent chat on the orchestrator model, then type `/orchestrate`, or paste the block from `.cursor/orchestrator-prompt.md`. Do not save it as an agent.
  - Claude Code: start `claude --model <orchestrator alias>` in the repo, then run `/orchestrate`. If the session was already open, restart it so the new agents and hooks load.
- that `.orchestra/` is the source of truth. To change the setup, edit the files there and re-run the renderer, or run this skill again.
- to commit `.orchestra/` together with the generated files.

Do not start the orchestrator yourself.
