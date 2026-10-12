# Interview

Ask with the question tool: multiple choice, at most 4 questions per call, with the recommended option first. Skip every question that recon already answered, and state the answer you found instead.

## Models

1. **Targets**: Cursor / Claude Code / Both.
2. **Cursor slugs**, as free text: "Paste the model slugs your Task tool accepts, one per line, including `-fast` variants. Mark any you never want used."
   - If the user does not know them, tell them to open the Cursor model picker, or to run one Task launch with a guessed slug and read the error.
3. **Claude Code**: "Which aliases may agents use?" Offer haiku, sonnet, opus, and fable as a multi-select.
4. **Tier mapping.** Propose it yourself and ask for confirmation. Do not make the user build it. For example:
   - `ops` = cheapest fast model, `light` = mid, `standard` = strong, `heavy` = strongest at high effort
5. **Orchestrator model.** Propose the `ops` model or one step above. Warn that a model which skips loop steps costs more than it saves.

## Recon checklist

Look for these files, and read only the ones that exist:

- `README*`, `CONTRIBUTING*`, `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursorrules`
- `justfile`, `Makefile`, `Taskfile.yml`, `package.json` scripts, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.sln`
- `.github/workflows/`, `.gitlab-ci.yml`, and any `tools/ci/` (they show the real check commands)
- roadmap, phase, spec, ADR, or decision docs: `docs/`, `_techspecs/`, `specs/`, `adr/`, `ROADMAP*`, `TODO*`
- guideline docs covering code review, commits, branching, and security
- state docs that list known gaps, stand-ins, simplifications, security issues, or a changelog
- `docker-compose*`, `compose*.yml`, and devcontainer files (they show local services and ports)
- `git branch --show-current`, `git remote -v`, `git log --oneline -15` (they show commit style and the main branch)

Write `.orchestra/recon.md` with these sections: Stack, Commands (full and per package), Work source, Guidelines, Risk surfaces, State docs, Local services, Git.

## Scope

Ask only the questions that recon could not settle.

1. **Work source.** "Where should the orchestrator get the next unit of work?"
   - The roadmap or phase table at `<path>` (recommend this when one exists)
   - A backlog or TODO file
   - A one-off goal I give on each run
   - GitHub issues (requires `gh` and network)
2. **Milestone.** "When should one orchestrator run stop as finished?"
   - When the current phase's exit criteria are met
   - When the backlog is empty
   - After N units
3. **Git policy.** "How should finished units land?"
   - Local squash-merge into main, no push (recommended for local work)
   - Push a branch and open a PR
   - Commit on a branch and leave it for me
4. **Security review.** "Which changes need a separate security review?"
   - Only high-risk changes (auth, keys, money, `<risk surfaces from recon>`)
   - Every change
   - None
5. **Major decisions** (multi-select). "Which of these should stop the run for you?"
   - New language, datastore, broker, or vendor
   - Auth, key management, or trust-model change
   - Contradicting a written MUST in the specs
   - Anything that touches production or real money
6. **State docs.** "Should an agent keep `<state docs from recon>` in sync after each unit?" Yes / No.
7. **Local services.** "Should the pipeline start `<services>` itself when its ports are closed?" Yes, with `<command>` / No, I start them.

When a requirement contradicts what the repository shows, ask about the contradiction directly. Do not pick a side silently.
