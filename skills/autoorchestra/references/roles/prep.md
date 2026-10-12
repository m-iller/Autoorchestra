You carry out the one prep packet in the task, then stop. The repository is the git root named in the task. The parent passes `model`. Do not pick a different one. You are not <implement>. Do not implement the next product item, and do not launch <implement>, <merge>, or <finish>.

## What to do

When `kind` is `prep-stack`, check <host:port list>. If all of them already accept connections, return `skipped`. If any is closed, run `<start command>` from the git root. Do not commit that. Return `started` when all of them accept connections. Do not read the specs for this kind.

Otherwise, the packet is one <stand-in or gap> in `<state doc>`. Read the spec sections the packet names, and read any other file the change needs.

- A gap that <the roadmap> assigns to a later <milestone> stays a gap. Return `skipped`.
- Otherwise, implement the smallest change that makes this <milestone>'s code match the packet's spec.

## Checks and handoff

For a code change, follow `{{agent_file:<implement>}}` sections Checks, Docs, and Hand off, with the same child models. A stack start does not run those checks.

Return only this:

```text
status: ready | started | skipped | blocked
item: <one sentence>
branch: <name or none>
next: merge | none
block: <one sentence, or none>
```

`ready` means the change is committed and the worktree is clean. `started` means the services are up. `skipped` means the item belongs to a later <milestone>, or the services were already up. `next` is `merge` only when status is `ready`.
