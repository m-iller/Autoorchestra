# Working on autoorchestra

This repo ships one skill, `skills/autoorchestra/`, through three channels: `npx skills add`, the Claude Code plugin marketplace (`.claude-plugin/`), and npm (`bin/cli.mjs`).

- The skill instructions live in `skills/autoorchestra/SKILL.md`. It loads `references/*.md` lazily, phase by phase. Keep `SKILL.md` under about 200 lines.
- `scripts/render.mjs` and `assets/hooks/require-model.mjs` have zero dependencies and must run on Node 18 on Windows, macOS, and Linux. Do not add npm dependencies.
- The role templates in `references/roles/` follow `references/prompt-style.md`. Any change to a return block must also update every parent that parses it: the orchestrator template, `implement`, and `finish`.
- `examples/sample-project/.orchestra/` is the golden example. Keep it valid: `npm run check:example`.
- Run `npm test` before committing.
- When releasing, bump `version` in **both** `package.json` and `.claude-plugin/plugin.json` (a test enforces this), and add a `CHANGELOG.md` entry.
