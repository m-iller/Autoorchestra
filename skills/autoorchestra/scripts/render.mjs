#!/usr/bin/env node
// autoorchestra renderer: .orchestra/orchestration.json + bodies -> Cursor / Claude Code files.
// Zero dependencies. Node >= 18.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = path.join(SCRIPT_DIR, '..', 'assets', 'hooks', 'require-model.mjs');
const HOOK_FILE = 'require-model.mjs';
const HOOK_CFG = 'orchestra-models.json';
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const TARGETS = ['cursor', 'claude'];

const PLATFORM = {
  cursor: {
    label: 'Cursor',
    launchTool: 'Task',
    agentsDir: '.cursor/agents',
    hooksDir: '.cursor/hooks',
  },
  claude: {
    label: 'Claude Code',
    launchTool: 'Agent',
    agentsDir: '.claude/agents',
    hooksDir: '.claude/hooks',
  },
};

// ---------- CLI ----------

export function parseArgs(argv) {
  const opts = { root: process.cwd(), spec: null, target: null, check: false, dryRun: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--root') opts.root = next();
    else if (a === '--spec') opts.spec = next();
    else if (a === '--target') opts.target = next();
    else if (a === '--check') opts.check = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  opts.root = path.resolve(opts.root);
  opts.spec = path.resolve(opts.root, opts.spec || '.orchestra/orchestration.json');
  return opts;
}

const HELP = `Usage: node render.mjs [--root <git root>] [--spec <path>] [--target cursor|claude|both] [--check] [--dry-run]

  --root     Project root (default: cwd)
  --spec     Spec path (default: <root>/.orchestra/orchestration.json)
  --target   Render only this target (default: spec.targets)
  --check    Validate only, write nothing
  --dry-run  Print the files that would be written`;

// ---------- validation ----------

export function loadSpec(specPath) {
  if (!fs.existsSync(specPath)) throw new Error(`Spec not found: ${specPath}`);
  try {
    return JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    throw new Error(`Spec is not valid JSON (${specPath}): ${e.message}`);
  }
}

function modelsFor(spec, target) {
  const m = (spec.models && spec.models[target]) || {};
  return { tiers: m.tiers || {}, fast: m.fast || {}, aliases: m.aliases || {}, orchestrator: m.orchestrator };
}

function packetSlugs(spec, target) {
  const { tiers, fast } = modelsFor(spec, target);
  const out = [];
  for (const t of spec.packetTiers || []) {
    if (tiers[t]) out.push(tiers[t]);
    if (fast[t]) out.push(fast[t]);
  }
  return [...new Set(out)];
}

function allSlugs(spec, target) {
  const { tiers, fast } = modelsFor(spec, target);
  return [...new Set([...Object.values(tiers), ...Object.values(fast)])];
}

function depthOf(spec, name, seen = new Set()) {
  if (name === 'orchestrator') return 0;
  if (seen.has(name)) return Infinity;
  seen.add(name);
  const a = spec.agents.find((x) => x.name === name);
  if (!a) return Infinity;
  const parents = a.launchedBy || [];
  return 1 + Math.max(...parents.map((p) => depthOf(spec, p, new Set(seen))));
}

function globOverlap(a, b) {
  const base = (g) => g.split(/[*?[{]/)[0].replace(/\/+$/, '');
  const x = base(a);
  const y = base(b);
  if (x === '' || y === '') return true;
  return x === y || x.startsWith(y + '/') || y.startsWith(x + '/');
}

export function validate(spec, specDir, targets) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  if (spec.version !== 1) E('version must be 1');
  if (!spec.project || typeof spec.project !== 'string') E('project is required');
  if (!Array.isArray(spec.targets) || spec.targets.length === 0) E('targets must be a non-empty array');
  for (const t of spec.targets || []) if (!TARGETS.includes(t)) E(`unknown target "${t}"`);
  if (!Array.isArray(spec.agents) || spec.agents.length === 0) {
    E('agents must be a non-empty array');
    return { errors, warnings };
  }
  if (!spec.orchestrator || !spec.orchestrator.body) E('orchestrator.body is required');

  const names = new Set();
  const builtins = new Set(spec.builtins || []);
  for (const a of spec.agents) {
    const where = `agent "${a.name}"`;
    if (!a.name || !NAME_RE.test(a.name)) E(`${where}: name must be kebab-case`);
    if (names.has(a.name)) E(`${where}: duplicate name`);
    if (a.name === 'orchestrator') E(`${where}: "orchestrator" is reserved`);
    names.add(a.name);
    if (!a.description) E(`${where}: description is required`);
    if (!a.body) E(`${where}: body is required`);
    if (!a.model) E(`${where}: model is required (tier, "packet", or "inherit")`);
    if (!Array.isArray(a.launchedBy) || a.launchedBy.length === 0) E(`${where}: launchedBy must be a non-empty array`);
  }
  if (spec.agents.length > 8) W(`${spec.agents.length} agents: more than 8 usually costs more context than it saves`);
  if (spec.agents.length < 3) W(`${spec.agents.length} agents: fewer than 3 rarely needs an orchestrator`);

  for (const a of spec.agents) {
    for (const p of a.launchedBy || []) {
      if (p !== 'orchestrator' && !names.has(p)) E(`agent "${a.name}": launchedBy "${p}" is not an agent`);
      if (p === a.name) E(`agent "${a.name}": cannot launch itself`);
    }
    const d = depthOf(spec, a.name);
    if (d === Infinity) E(`agent "${a.name}": launch cycle or unreachable parent`);
    else if (d > 3) E(`agent "${a.name}": nesting depth ${d} exceeds 3 (Claude Code limit)`);
    else if (d > 2) W(`agent "${a.name}": nesting depth ${d}; keep it at 2 or less below the orchestrator`);
    if (a.readonly && spec.agents.some((c) => (c.launchedBy || []).includes(a.name)) && a.tools && !/\bAgent\b|\bTask\b/.test(a.tools))
      E(`agent "${a.name}": launches children but its tools allowlist has no Agent`);
  }

  if (spec.agents.some((a) => a.model === 'packet') && !(spec.packetTiers || []).length)
    E('packetTiers is required when an agent uses model "packet"');
  if (!spec.agents.some((a) => (a.launchedBy || []).includes('orchestrator')))
    E('no agent is launched by the orchestrator');

  for (const t of targets) {
    const m = modelsFor(spec, t);
    if (!spec.models || !spec.models[t]) {
      E(`models.${t} is missing`);
      continue;
    }
    if (!m.orchestrator) E(`models.${t}.orchestrator is required`);
    for (const a of spec.agents) {
      if (a.model !== 'packet' && a.model !== 'inherit' && !m.tiers[a.model])
        E(`agent "${a.name}": tier "${a.model}" missing in models.${t}.tiers`);
    }
    for (const pt of spec.packetTiers || []) if (!m.tiers[pt]) E(`packetTiers "${pt}" missing in models.${t}.tiers`);
    for (const ft of Object.keys(m.fast)) if (!m.tiers[ft]) W(`models.${t}.fast.${ft} has no matching tier`);
    if (t === 'claude') {
      const okAlias = /^(haiku|sonnet|opus|fable|inherit)$|^claude-[a-z0-9.-]+$/;
      for (const [tier, slug] of Object.entries(m.tiers))
        if (!okAlias.test(slug)) W(`models.claude.tiers.${tier} = "${slug}" does not look like a Claude alias or model ID`);
      for (const pt of spec.packetTiers || []) {
        const s = m.tiers[pt];
        if (s && !/^(haiku|sonnet|opus|fable)$/.test(s))
          W(`models.claude.tiers.${pt} = "${s}": per-launch model on Claude Code accepts only aliases; packet tiers should be aliases`);
      }
    }
  }

  // zone overlaps between writers
  const writers = spec.agents.filter((a) => !a.readonly && Array.isArray(a.owns));
  for (let i = 0; i < writers.length; i++)
    for (let j = i + 1; j < writers.length; j++)
      for (const g1 of writers[i].owns)
        for (const g2 of writers[j].owns)
          if (globOverlap(g1, g2)) W(`zones overlap: "${writers[i].name}" ${g1} and "${writers[j].name}" ${g2}`);

  // bodies
  const bodyFiles = [...spec.agents.map((a) => [a.name, a.body]), ['orchestrator', spec.orchestrator && spec.orchestrator.body]];
  for (const [name, rel] of bodyFiles) {
    if (!rel) continue;
    const p = path.resolve(specDir, rel);
    if (!fs.existsSync(p)) {
      E(`${name}: body not found: ${rel}`);
      continue;
    }
    const body = fs.readFileSync(p, 'utf8');
    if (/^---\s*\n/.test(body)) E(`${name}: body must not have frontmatter (${rel})`);
    if (name !== 'orchestrator' && !/return/i.test(body)) W(`${name}: body has no return block`);
    for (const t of targets) {
      for (const tok of body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
        try {
          resolveToken(tok[1], spec, t);
        } catch (e) {
          E(`${name} (${t}): ${e.message}`);
        }
      }
    }
    if (name === 'orchestrator') {
      for (const a of spec.agents.filter((x) => (x.launchedBy || []).includes('orchestrator')))
        if (!body.includes(a.name)) W(`orchestrator body never mentions "${a.name}", which it launches`);
    } else {
      for (const c of spec.agents.filter((x) => (x.launchedBy || []).includes(name)))
        if (!body.includes(c.name)) W(`${name} body never mentions child "${c.name}"`);
    }
  }
  for (const b of builtins) if (names.has(b)) W(`builtin "${b}" is also a generated agent`);

  return { errors, warnings };
}

// ---------- tokens ----------

export function resolveToken(raw, spec, target) {
  const P = PLATFORM[target];
  const m = modelsFor(spec, target);
  const parts = raw.split(':').map((s) => s.trim());
  const bt = (xs) => xs.map((x) => '`' + x + '`').join(', ');
  switch (parts[0]) {
    case 'launch_tool':
      return P.launchTool;
    case 'agents_dir':
      return P.agentsDir;
    case 'platform':
      return P.label;
    case 'orchestrator_model':
      if (!m.orchestrator) throw new Error('orchestrator model not set');
      return m.orchestrator;
    case 'packet_models':
      return bt(packetSlugs(spec, target));
    case 'all_models':
      return bt(allSlugs(spec, target));
    case 'root_marker': {
      const a = spec.agents.find((x) => x.model === 'packet') || spec.agents[0];
      return `${P.agentsDir}/${a.name}.md`;
    }
    case 'agent_file': {
      const n = parts[1];
      if (!n || !spec.agents.some((a) => a.name === n)) throw new Error(`{{agent_file:${n}}}: unknown agent`);
      return `${P.agentsDir}/${n}.md`;
    }
    case 'model': {
      const tier = parts[1];
      const slug = m.tiers[tier];
      if (!slug) throw new Error(`{{${raw}}}: tier "${tier}" not in models.${target}.tiers`);
      if (parts[2] === 'fast') return m.fast[tier] || slug;
      if (parts[2]) throw new Error(`{{${raw}}}: unknown modifier "${parts[2]}"`);
      return slug;
    }
    default:
      throw new Error(`{{${raw}}}: unknown token`);
  }
}

export function substitute(text, spec, target) {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, raw) => resolveToken(raw, spec, target));
}

// ---------- rendering ----------

function yamlScalar(s) {
  const str = String(s);
  if (/^[A-Za-z0-9 _.,()/'-]+$/.test(str) && !/^[-?]/.test(str) && !/:\s/.test(str)) return str;
  return JSON.stringify(str);
}

function frontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === false) continue;
    lines.push(`${k}: ${v === true ? 'true' : yamlScalar(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

const GEN_NOTE = (src) =>
  `<!-- Generated by autoorchestra from .orchestra/${src}. Edit the source, then re-render. -->\n\n`;

function agentFile(spec, a, target, body) {
  const m = modelsFor(spec, target);
  const pinned = a.model !== 'packet' && a.model !== 'inherit' ? m.tiers[a.model] : undefined;
  let fm;
  if (target === 'cursor') {
    fm = {
      name: a.name,
      model: pinned,
      'force-default-model': pinned ? true : undefined,
      description: a.description,
      readonly: a.readonly ? true : undefined,
    };
  } else {
    fm = {
      name: a.name,
      description: a.description,
      model: pinned || (a.model === 'inherit' ? 'inherit' : undefined),
      tools: a.tools,
      disallowedTools: a.readonly ? 'Edit, Write, NotebookEdit' : undefined,
    };
  }
  return frontmatter(fm) + GEN_NOTE(a.body) + body.trimEnd() + '\n';
}

function fence(body) {
  let n = 3;
  while (body.includes('`'.repeat(n))) n++;
  return '`'.repeat(n);
}

function orchestratorFiles(spec, target, body) {
  const m = modelsFor(spec, target);
  const desc = spec.orchestrator.description || `Run the ${spec.project} orchestration loop`;
  const files = {};
  if (target === 'cursor') {
    const f = fence(body);
    files['.cursor/orchestrator-prompt.md'] =
      `# Orchestrator prompt — ${spec.project}\n\n` +
      `Open a new Agent chat on **${m.orchestrator}**. Paste the block below as the first message, or type \`/orchestrate\`. ` +
      `This chat is the orchestrator. Do not save it as an agent, and do not start it from another agent.\n\n` +
      GEN_NOTE(spec.orchestrator.body) +
      `${f}text\n${body.trimEnd()}\n${f}\n`;
    files['.cursor/commands/orchestrate.md'] =
      GEN_NOTE(spec.orchestrator.body) +
      `<!-- Run this in a new Agent chat on ${m.orchestrator}. -->\n\n` +
      body.trimEnd() +
      '\n';
  } else {
    files['.claude/commands/orchestrate.md'] =
      frontmatter({ description: desc, model: m.orchestrator, 'argument-hint': '[task or milestone]' }) +
      GEN_NOTE(spec.orchestrator.body) +
      body.trimEnd() +
      '\n\nExtra instruction from the user for this run (may be empty): $ARGUMENTS\n';
  }
  return files;
}

function hookConfig(spec, target) {
  const m = modelsFor(spec, target);
  const pinned = {};
  for (const a of spec.agents) if (m.tiers[a.model]) pinned[a.name] = m.tiers[a.model];
  return {
    generatedBy: 'autoorchestra',
    project: spec.project,
    platform: target,
    allowed: allSlugs(spec, target),
    packetAllowed: packetSlugs(spec, target),
    aliases: m.aliases,
    packetAgents: spec.agents.filter((a) => a.model === 'packet').map((a) => a.name),
    pinned,
  };
}

function isOurHook(cmd) {
  return typeof cmd === 'string' && cmd.includes(HOOK_FILE);
}

export function mergeCursorHooks(existing, spec) {
  const cfg = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
  cfg.version = cfg.version || 1;
  cfg.hooks = cfg.hooks || {};
  const cmd = `node .cursor/hooks/${HOOK_FILE}`;
  for (const ev of ['preToolUse', 'subagentStart']) {
    cfg.hooks[ev] = (cfg.hooks[ev] || []).filter((h) => !isOurHook(h.command));
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev];
  }
  (cfg.hooks.preToolUse = cfg.hooks.preToolUse || []).push({ command: cmd, matcher: 'Task', failClosed: true });
  const packet = spec.agents.filter((a) => a.model === 'packet').map((a) => a.name);
  if (packet.length)
    (cfg.hooks.subagentStart = cfg.hooks.subagentStart || []).push({
      command: cmd,
      matcher: `^(${packet.join('|')})$`,
      failClosed: true,
    });
  return cfg;
}

export function mergeClaudeSettings(existing) {
  const cfg = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
  cfg.hooks = cfg.hooks || {};
  const list = (cfg.hooks.PreToolUse || [])
    .map((entry) => ({ ...entry, hooks: (entry.hooks || []).filter((h) => !isOurHook(h.command)) }))
    .filter((entry) => entry.hooks.length > 0);
  list.push({
    matcher: 'Agent|Task',
    hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${HOOK_FILE}"` }],
  });
  cfg.hooks.PreToolUse = list;
  return cfg;
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot merge into ${p}: invalid JSON (${e.message}). Fix it first.`);
  }
}

export function plan(spec, specDir, root, targets) {
  const files = {}; // rel path -> content string
  for (const t of targets) {
    const P = PLATFORM[t];
    for (const a of spec.agents) {
      const body = substitute(fs.readFileSync(path.resolve(specDir, a.body), 'utf8'), spec, t);
      files[`${P.agentsDir}/${a.name}.md`] = agentFile(spec, a, t, body);
    }
    const obody = substitute(fs.readFileSync(path.resolve(specDir, spec.orchestrator.body), 'utf8'), spec, t);
    Object.assign(files, orchestratorFiles(spec, t, obody));
    files[`${P.hooksDir}/${HOOK_FILE}`] = fs.readFileSync(HOOK_SRC, 'utf8');
    files[`${P.hooksDir}/${HOOK_CFG}`] = JSON.stringify(hookConfig(spec, t), null, 2) + '\n';
    if (t === 'cursor') {
      const p = path.join(root, '.cursor/hooks.json');
      files['.cursor/hooks.json'] = JSON.stringify(mergeCursorHooks(readJsonIfExists(p), spec), null, 2) + '\n';
    } else {
      const p = path.join(root, '.claude/settings.json');
      files['.claude/settings.json'] = JSON.stringify(mergeClaudeSettings(readJsonIfExists(p)), null, 2) + '\n';
    }
  }
  return files;
}

const prefixOf = (t) => (t === 'cursor' ? '.cursor/' : '.claude/');

function staleFiles(root, prevManifest, files, targets) {
  if (!prevManifest || !Array.isArray(prevManifest.files)) return [];
  const keep = new Set(Object.keys(files));
  return prevManifest.files.filter(
    (f) => targets.some((t) => f.startsWith(prefixOf(t))) && !keep.has(f) && fs.existsSync(path.join(root, f)),
  );
}

export function run(argv, log = console.log) {
  const opts = parseArgs(argv);
  if (opts.help) {
    log(HELP);
    return 0;
  }
  const spec = loadSpec(opts.spec);
  const specDir = path.dirname(opts.spec);
  let targets = spec.targets || [];
  if (opts.target && opts.target !== 'both') {
    if (!TARGETS.includes(opts.target)) throw new Error(`--target must be cursor, claude, or both`);
    if (!targets.includes(opts.target)) throw new Error(`target "${opts.target}" is not in spec.targets`);
    targets = [opts.target];
  }

  const { errors, warnings } = validate(spec, specDir, targets);
  for (const w of warnings) log(`warning: ${w}`);
  for (const e of errors) log(`error: ${e}`);
  if (errors.length) {
    log(`\n${errors.length} error(s). Nothing written.`);
    return 1;
  }
  const files = plan(spec, specDir, opts.root, targets);
  if (opts.check) {
    log(`ok: spec valid for ${targets.join(', ')} — ${Object.keys(files).length} files would be written.`);
    return 0;
  }

  const manifestPath = path.join(specDir, 'rendered.json');
  const prev = readJsonIfExists(manifestPath);
  const stale = staleFiles(opts.root, prev, files, targets);

  for (const [rel, content] of Object.entries(files)) {
    if (opts.dryRun) {
      log(`would write ${rel}`);
      continue;
    }
    const abs = path.join(opts.root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    if (!opts.quiet) log(`wrote ${rel}`);
  }
  if (!opts.dryRun) {
    const prevFiles = (prev && prev.files) || [];
    const otherTargets = prevFiles.filter((f) => !targets.some((t) => f.startsWith(prefixOf(t))));
    const all = [...new Set([...otherTargets, ...stale, ...Object.keys(files)])].sort();
    fs.writeFileSync(manifestPath, JSON.stringify({ generatedBy: 'autoorchestra', files: all }, null, 2) + '\n');
  }
  for (const s of stale) log(`stale: ${s} was generated before but is no longer in the spec. Delete it if it is unused.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
