import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { run, validate, loadSpec, substitute, mergeCursorHooks, mergeClaudeSettings } from '../skills/autoorchestra/scripts/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = path.join(ROOT, 'examples', 'sample-project');

function freshCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoorchestra-'));
  fs.cpSync(path.join(EXAMPLE, '.orchestra'), path.join(dir, '.orchestra'), { recursive: true });
  return dir;
}
const quiet = () => {};

test('example spec validates for both targets', () => {
  const spec = loadSpec(path.join(EXAMPLE, '.orchestra', 'orchestration.json'));
  const { errors } = validate(spec, path.join(EXAMPLE, '.orchestra'), ['cursor', 'claude']);
  assert.deepEqual(errors, []);
});

test('render writes agents, prompts and hooks for both platforms', () => {
  const dir = freshCopy();
  assert.equal(run(['--root', dir, '--quiet'], quiet), 0);
  for (const f of [
    '.cursor/agents/implement.md',
    '.cursor/orchestrator-prompt.md',
    '.cursor/commands/orchestrate.md',
    '.cursor/hooks.json',
    '.cursor/hooks/require-model.mjs',
    '.cursor/hooks/orchestra-models.json',
    '.claude/agents/implement.md',
    '.claude/commands/orchestrate.md',
    '.claude/settings.json',
    '.claude/hooks/require-model.mjs',
    '.orchestra/rendered.json',
  ])
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);

  const cursorScope = fs.readFileSync(path.join(dir, '.cursor/agents/scope.md'), 'utf8');
  assert.match(cursorScope, /^---\nname: scope\nmodel: composer-2\.5-fast\nforce-default-model: true/);
  assert.match(cursorScope, /readonly: true/);

  const claudeImpl = fs.readFileSync(path.join(dir, '.claude/agents/implement.md'), 'utf8');
  assert.doesNotMatch(claudeImpl, /\{\{/);
  assert.doesNotMatch(claudeImpl.split('---')[1], /model:/, 'packet agent has no frontmatter model');
  assert.match(claudeImpl, /with Agent\./);

  const claudeReview = fs.readFileSync(path.join(dir, '.claude/agents/review.md'), 'utf8');
  assert.match(claudeReview, /disallowedTools: Edit, Write, NotebookEdit/);

  const cmd = fs.readFileSync(path.join(dir, '.claude/commands/orchestrate.md'), 'utf8');
  assert.match(cmd, /model: sonnet/);
  assert.match(cmd, /\$ARGUMENTS/);
});

test('re-render is idempotent and keeps foreign hooks', () => {
  const dir = freshCopy();
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude/settings.json'),
    JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] } }),
  );
  run(['--root', dir, '--quiet'], quiet);
  const once = fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8');
  run(['--root', dir, '--quiet'], quiet);
  const twice = fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8');
  assert.equal(once, twice);
  const s = JSON.parse(twice);
  assert.deepEqual(s.permissions, { allow: ['Bash(ls)'] });
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.ok(s.hooks.PreToolUse.some((e) => e.matcher === 'Bash'));
});

test('cursor hooks merge replaces only our entries', () => {
  const spec = loadSpec(path.join(EXAMPLE, '.orchestra', 'orchestration.json'));
  const existing = { version: 1, hooks: { preToolUse: [{ command: 'py other.py', matcher: 'Shell' }, { command: 'node .cursor/hooks/require-model.mjs', matcher: 'Task' }] } };
  const out = mergeCursorHooks(existing, spec);
  assert.equal(out.hooks.preToolUse.length, 2);
  assert.equal(out.hooks.subagentStart[0].matcher, '^(implement)$');
  const claude = mergeClaudeSettings(null);
  assert.equal(claude.hooks.PreToolUse[0].matcher, 'Agent|Task');
});

test('check mode reports unknown tokens and bad tiers', () => {
  const dir = freshCopy();
  const specPath = path.join(dir, '.orchestra/orchestration.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  spec.agents[0].model = 'ultra';
  fs.writeFileSync(specPath, JSON.stringify(spec));
  fs.appendFileSync(path.join(dir, '.orchestra/agents/check.md'), '\nUse {{model:nope}}.\n');
  const lines = [];
  assert.equal(run(['--root', dir, '--check'], (l) => lines.push(l)), 1);
  const text = lines.join('\n');
  assert.match(text, /tier "ultra" missing/);
  assert.match(text, /tier "nope" not in models/);
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')), 'check writes nothing');
});

test('tokens resolve per platform', () => {
  const spec = loadSpec(path.join(EXAMPLE, '.orchestra', 'orchestration.json'));
  const src = '{{launch_tool}} {{model:heavy}} {{model:standard:fast}} {{agent_file:check}}';
  assert.equal(substitute(src, spec, 'cursor'), 'Task grok-4.7-xhigh grok-4.7-high-fast .cursor/agents/check.md');
  assert.equal(substitute(src, spec, 'claude'), 'Agent opus sonnet .claude/agents/check.md');
});

test('versions match across package.json and plugin.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(pkg.version, plugin.version);
});

test('skill frontmatter has name and description', () => {
  const md = fs.readFileSync(path.join(ROOT, 'skills/autoorchestra/SKILL.md'), 'utf8');
  const fm = md.split('---')[1];
  assert.match(fm, /\nname: autoorchestra\n/);
  assert.match(fm, /\ndescription: .{40,}/);
});

test('cli init installs the skill into a project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoorchestra-cli-'));
  fs.mkdirSync(path.join(dir, '.cursor'));
  execFileSync(process.execPath, [path.join(ROOT, 'bin/cli.mjs'), 'init'], { cwd: dir, stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(dir, '.cursor/skills/autoorchestra/SKILL.md')));
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/autoorchestra')), 'only detected tool');
});
