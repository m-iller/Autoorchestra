import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, respond } from '../skills/autoorchestra/assets/hooks/require-model.mjs';

const cursor = {
  platform: 'cursor',
  allowed: ['fast-cheap', 'mid', 'big'],
  packetAllowed: ['fast-cheap', 'mid', 'big'],
  aliases: { 'big[effort=max]': 'big' },
  packetAgents: ['implement'],
  pinned: { scope: 'fast-cheap', finish: 'big' },
};
const claude = {
  platform: 'claude',
  allowed: ['haiku', 'sonnet', 'opus', 'claude-opus-5-5'],
  packetAllowed: ['haiku', 'sonnet', 'opus'],
  aliases: {},
  packetAgents: ['implement'],
  pinned: { scope: 'haiku', finish: 'claude-opus-5-5' },
};
const task = (input) => ({ tool_name: 'Task', tool_input: input });
const agent = (input) => ({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: input });

test('packet agent without model is denied', () => {
  const r = decide(task({ subagent_type: 'implement', prompt: 'task: x' }), cursor);
  assert.equal(r.action, 'deny');
  assert.equal(respond(r, 'cursor').permission, 'deny');
});

test('packet model is copied from the prompt', () => {
  const r = decide(task({ subagent_type: 'implement', prompt: 'kind: implement\nmodel: `mid`\n' }), cursor);
  assert.deepEqual(r, { action: 'update', input: { subagent_type: 'implement', prompt: 'kind: implement\nmodel: `mid`\n', model: 'mid' } });
});

test('aliases normalize to slugs', () => {
  const r = decide(task({ subagent_type: 'implement', model: 'big[effort=max]' }), cursor);
  assert.equal(r.action, 'update');
  assert.equal(r.input.model, 'big');
});

test('disallowed packet model is denied', () => {
  assert.equal(decide(task({ subagent_type: 'implement', model: 'gpt-x' }), cursor).action, 'deny');
});

test('pinned agent gets its model on cursor', () => {
  const r = decide(task({ subagent_type: 'scope' }), cursor);
  assert.equal(r.input.model, 'fast-cheap');
  assert.equal(respond(r, 'cursor').updated_input.model, 'fast-cheap');
});

test('subagentStart without tool name only allows or denies', () => {
  assert.equal(decide({ subagent_name: 'scope' }, cursor).action, 'allow');
  assert.equal(decide({ subagent_name: 'implement', model: 'mid' }, cursor).action, 'allow');
  assert.equal(decide({ subagent_name: 'implement' }, cursor).action, 'deny');
});

test('unknown agents pass through', () => {
  assert.equal(decide(task({ subagent_type: 'explore', model: 'whatever' }), cursor).action, 'allow');
});

test('claude: pinned full model id drops the per-launch model', () => {
  const r = decide(agent({ subagent_type: 'finish', model: 'haiku' }), claude);
  assert.equal(r.action, 'update');
  assert.equal('model' in r.input, false);
  const out = respond(r, 'claude');
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'allow');
});

test('claude: missing model on pinned agent leaves frontmatter in charge', () => {
  assert.equal(decide(agent({ subagent_type: 'scope' }), claude).action, 'allow');
  assert.equal(respond({ action: 'allow' }, 'claude'), null);
});

test('claude: deny uses hookSpecificOutput', () => {
  const out = respond(decide(agent({ subagent_type: 'implement' }), claude), 'claude');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /haiku, sonnet, opus/);
});
