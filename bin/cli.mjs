#!/usr/bin/env node
// autoorchestra installer: copies the skill into Cursor and/or Claude Code skill folders.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'autoorchestra';
const SKILL_SRC = path.join(PKG_ROOT, 'skills', SKILL);
const VERSION = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;

const HELP = `autoorchestra ${VERSION}

Usage:
  npx autoorchestra init [--cursor] [--claude] [--global] [--force]
  npx autoorchestra uninstall [--cursor] [--claude] [--global]
  npx autoorchestra render [render.mjs options]
  npx autoorchestra where

init       Install the skill. Without --cursor/--claude it installs for every
           tool whose folder exists here (.cursor/, .claude/), or both if none.
--global   Install into ~/.cursor/skills and ~/.claude/skills instead of the project.
--force    Overwrite an existing install.
render     Run the renderer (same as node skills/autoorchestra/scripts/render.mjs).
where      Print the install locations.

Then open your agent on its strongest model and run /autoorchestra.`;

function parse(argv) {
  const o = { cmd: argv[0] || 'help', cursor: false, claude: false, global: false, force: false, rest: argv.slice(1) };
  for (const a of o.rest) {
    if (a === '--cursor') o.cursor = true;
    else if (a === '--claude') o.claude = true;
    else if (a === '--both') o.cursor = o.claude = true;
    else if (a === '--global' || a === '-g') o.global = true;
    else if (a === '--force' || a === '-f') o.force = true;
  }
  return o;
}

function destinations(o, cwd = process.cwd()) {
  const base = o.global ? os.homedir() : cwd;
  let cursor = o.cursor;
  let claude = o.claude;
  if (!cursor && !claude) {
    cursor = fs.existsSync(path.join(base, '.cursor'));
    claude = fs.existsSync(path.join(base, '.claude')) || fs.existsSync(path.join(base, 'CLAUDE.md'));
    if (!cursor && !claude) cursor = claude = true;
  }
  const out = [];
  if (cursor) out.push(['Cursor', path.join(base, '.cursor', 'skills', SKILL)]);
  if (claude) out.push(['Claude Code', path.join(base, '.claude', 'skills', SKILL)]);
  return out;
}

function init(o) {
  for (const [label, dest] of destinations(o)) {
    if (fs.existsSync(dest) && !o.force) {
      console.log(`skip  ${label}: ${dest} exists (use --force to overwrite)`);
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(SKILL_SRC, dest, { recursive: true });
    console.log(`ok    ${label}: ${dest}`);
  }
  console.log('\nNext: open the project in your agent on its strongest model and run /autoorchestra.');
}

function uninstall(o) {
  for (const [label, dest] of destinations({ ...o, cursor: o.cursor || !o.claude, claude: o.claude || !o.cursor })) {
    if (!fs.existsSync(dest)) continue;
    fs.rmSync(dest, { recursive: true, force: true });
    console.log(`removed ${label}: ${dest}`);
  }
  console.log('Generated orchestration files (.orchestra/, agents, hooks) were left in place.');
}

async function main() {
  const o = parse(process.argv.slice(2));
  switch (o.cmd) {
    case 'init':
    case 'install':
      return init(o);
    case 'uninstall':
    case 'remove':
      return uninstall(o);
    case 'render': {
      const mod = await import(pathToFileURL(path.join(SKILL_SRC, 'scripts', 'render.mjs')).href);
      process.exitCode = mod.run(o.rest);
      return;
    }
    case 'where':
      for (const [label, dest] of destinations({ ...o, cursor: true, claude: true })) console.log(`${label}: ${dest}`);
      return;
    case '-v':
    case '--version':
      console.log(VERSION);
      return;
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
