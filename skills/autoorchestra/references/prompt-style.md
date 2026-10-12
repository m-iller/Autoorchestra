# Prompt style

These rules come from orchestrations that ran for days without supervision. Apply all of them to every body you write.

## Voice

- Write in the second person: "You implement the one packet in the task, then stop."
- Use short declarative sentences, with one instruction per sentence.
- Name the exact path, command, section ID, or status word. Do not write "the relevant docs" or "run the tests".
- Write no motivation, no praise, and no "you are an expert". An agent needs its job, its limits, and its output.

## Structure of every agent body

1. **Job, in one or two sentences.** State what the agent does and that it stops afterwards.
2. **Negative scope.** List what it does not do: edit, commit, merge, push, launch agents, start the next unit, or read beyond its inputs. Each line closes a failure you expect.
3. **Inputs.** List what the parent passes, such as the repo root, the packet, `model`, or a block line, and what the agent reads by itself.
4. **Procedure.** Write numbered steps or short sections. Cover every branch the agent can hit.
5. **Children.** State which agents it launches, with which `model`, with what prompt, and in what order. Then state how it parses each child's result.
6. **Return block.** Write "Return only this:" followed by a fenced `text` block with fixed keys and enumerated values (`status: ready | blocked`). Then define each status in one sentence.

## Rules that prevent the common failures

- **Always pass `model`.** Every launch instruction names the model with a token: "Pass `model` `{{model:ops}}`. Do not omit it." On Cursor, an omitted model can silently fall back to the default.
- **Name what not to pass.** Write `Pass only {{all_models}}.` Name the forbidden families if the user listed any.
- **Write a one-sentence definition of done.** For example: "`ready` means the implementation is committed and the worktree is clean."
- **Pass the repo root as an absolute path.** Agents start cold. Every launch includes the absolute git root.
- **The packet is the unit.** The implementer does not choose or start another unit, and it does not survey the roadmap to find work.
- **The file list is where to start, not a limit.** This prevents both under-reading and refusing a needed file.
- **Do not weaken checks.** Forbid skipped tests, widened tolerances, removed assertions, and lint suppressions.
- **Protect destructive git commands.** Forbid `reset --hard`, `restore`, `checkout --` on uncommitted work, and force-pushes. Tell the agent to stash or save a patch instead.
- **Limit retries.** "Retry that launch once. Two identical failures in a row: return `blocked`."
- **Detect loops.** The orchestrator stops when the same block text comes back three times.
- **Never write "say when".** The orchestrator does not end its turn between units, and it does not ask permission to continue.
- **Enumerate the stop cases.** List the exact cases. Everything else is "launch the next step".
- **Keep returns short.** Allow no logs, no diffs, and no passing output. On failure, allow at most 30 lines.

## Example of the voice

> You run local checks for one unit in the git root named in the task. You do not edit source, commit, push, or launch agents.
>
> Stop at the first failing command. Return only:
>
> ```text
> status: green | red
> command: <the command>
> exit: <code>
> failure: <test or lint name, file:line, one sentence, or none>
> ```
