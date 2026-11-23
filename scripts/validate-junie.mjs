#!/usr/bin/env node
// Validates the shared agent setup used by BOTH Junie and Claude Code (Stage 7.4).
//
//   node scripts/validate-junie.mjs [--root <dir>] [--live]
//
// Checks
//   1. Frontmatter of every wrapper:
//        .junie/skills/<name>/SKILL.md   .junie/agents/<name>.md
//        .claude/skills/<name>/SKILL.md  .claude/agents/<name>.md
//      - `name` + `description` present and non-empty (we require both, even where a tool treats them as optional)
//      - `name` equals the folder / file name and matches [a-z0-9][a-z0-9_-]*
//      - only fields documented by the tool (no invented fields); tool / model values sane
//        Junie skills:  https://junie.jetbrains.com/docs/agent-skills.html
//        Junie agents:  https://junie.jetbrains.com/docs/junie-cli-subagents.html
//        Claude skills: https://code.claude.com/docs/en/skills
//        Claude agents: https://code.claude.com/docs/en/sub-agents
//   2. Parity: every Junie skill/agent has a Claude twin with the same name and vice versa, and both
//      point at the same ai-guidelines/workflows/<name>.md (skills) or ai-guidelines/roles/<name>.md (agents).
//   3. Every relative Markdown link in AGENTS.md, CLAUDE.md, ai-guidelines/**, .junie/{skills,agents},
//      .claude/{skills,agents} resolves; every `ai-guidelines/...` path in inline code exists; every
//      CLAUDE.md `@path` import resolves.
//   4. ai-guidelines/README.md links every workflows/*.md and roles/*.md (no orphans), and each has wrappers.
//   5. No banned filler words in the shared instructions (outside inline code / fenced blocks).
//   --live (optional, never in CI): checks that the `junie` and `claude` CLIs run (`--version`).
//      ASSUMPTION: neither CLI documents a command that lists project skills/agents, so --live cannot
//      prove discovery; it only proves the binaries are installed.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const ROOT = path.resolve(argVal('--root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const LIVE = args.includes('--live');

const errors = [];
const oks = [];
const err = (file, msg) => errors.push(`${path.relative(ROOT, file) || file}: ${msg}`);
const rel = (p) => path.relative(ROOT, p);
const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;
const FIELDS = {
  'junie-skill': new Set(['name', 'description']),
  'junie-agent': new Set(['name', 'description', 'tools', 'disallowedTools', 'mcpServers', 'model', 'permissionMode',
    'reasoningLevel', 'effort', 'maxTurns', 'skills', 'allowPromptArgument']),
  'claude-skill': new Set(['name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation',
    'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'hooks',
    'paths', 'shell', 'metadata', 'license', 'compatibility']),
  'claude-agent': new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns',
    'autoCompactWindow', 'skills', 'mcpServers', 'hooks', 'memory', 'background', 'omitClaudeMd', 'effort', 'isolation',
    'color', 'initialPrompt', 'experimental']),
};
const JUNIE_TOOLS = new Set(['read', 'bash', 'glob', 'grep', 'write', 'edit', 'websearch', 'webfetch', 'askuserquestion',
  'execute', 'shell', 'powershell', 'notebookread', 'multiedit', 'notebookedit', 'search', 'web', '*']);
const CLAUDE_MODEL_RE = /^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9.-]+)$/;
const BANNED = [/\bin conclusion\b/i, /\bit'?s worth noting\b/i, /\brobust(ly)?\b/i, /\bseamless(ly)?\b/i, /\bleverag(e|es|ed|ing)\b/i, /\bdelv(e|es|ed|ing)\b/i];

// --- minimal frontmatter parser (flat `key: value` / `key:` + `- item` lists; quoted strings) ---------------
function parseFrontmatter(file) {
  const text = read(file);
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { error: 'missing YAML frontmatter (--- ... ---) at the top of the file' };
  const data = {};
  let lastKey = null;
  for (const [i, raw] of m[1].split(/\r?\n/).entries()) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && lastKey) {
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(raw);
    if (!kv) return { error: `frontmatter line ${i + 2} is not \`key: value\`: ${JSON.stringify(raw)}` };
    const [, key, value = ''] = kv;
    if (key in data) return { error: `duplicate frontmatter key '${key}'` };
    const v = value.trim();
    if (!/^["']/.test(v) && /:\s/.test(v)) return { error: `frontmatter '${key}' contains ': ' unquoted (invalid YAML); quote the value` };
    data[key] = v === '' ? '' : unquote(v);
    lastKey = key;
  }
  return { data, body: text.slice(m[0].length) };
}
function unquote(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}
const listOf = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => s.trim()).filter(Boolean);

// --- markdown helpers ---------------------------------------------------------------------------------------
const stripFences = (md) => md.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
const stripCode = (md) => stripFences(md).replace(/`[^`\n]*`/g, '');
function mdLinks(md) {
  const out = [];
  const re = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|!\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const m of stripFences(md).replace(/`[^`\n]*`/g, '').matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}
const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//');

function checkLinks(file) {
  const md = read(file);
  const dir = path.dirname(file);
  const targets = [];
  for (const href of mdLinks(md)) {
    if (isExternal(href)) continue;
    const clean = decodeURIComponent(href.split('#')[0]);
    if (!clean) continue;
    const target = path.resolve(dir, clean);
    if (!target.startsWith(ROOT + path.sep) && target !== ROOT) { err(file, `link escapes the repo: ${href}`); continue; }
    if (!exists(target)) err(file, `broken link: ${href} → ${rel(target)}`);
    targets.push(target);
  }
  // inline-code paths into the shared guidelines must exist (other code spans may name planned files)
  for (const m of stripFences(md).matchAll(/`(ai-guidelines\/[^`\s<>*{}]+)`/g)) {
    if (!exists(path.join(ROOT, m[1]))) err(file, `referenced path does not exist: ${m[1]}`);
  }
  return targets;
}

function checkBanned(file) {
  const lines = stripCode(read(file)).split('\n');
  lines.forEach((line, i) => {
    for (const re of BANNED) if (re.test(line)) err(file, `line ${i + 1}: banned filler ${re} (ai-guidelines/voice-and-quality.md)`);
  });
}

const walk = (dir) => (exists(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : d.name.endsWith('.md') ? [p] : [];
}) : []);

// --- 1. wrappers ---------------------------------------------------------------------------------------------
const G = path.join(ROOT, 'ai-guidelines');
const wrappers = { skill: { junie: new Map(), claude: new Map() }, agent: { junie: new Map(), claude: new Map() } };

function collect(tool, kind) {
  const base = path.join(ROOT, `.${tool}`, kind === 'skill' ? 'skills' : 'agents');
  if (!exists(base)) { err(base, `missing directory`); return; }
  const entries = fs.readdirSync(base, { withFileTypes: true });
  for (const d of entries) {
    let file, expected;
    if (kind === 'skill') {
      if (!d.isDirectory()) continue;
      file = path.join(base, d.name, 'SKILL.md');
      expected = d.name;
      if (!exists(file)) { err(path.join(base, d.name), 'skill folder without SKILL.md'); continue; }
    } else {
      if (!d.isFile() || !d.name.endsWith('.md')) continue;
      file = path.join(base, d.name);
      expected = d.name.replace(/(\.agent)?\.md$/, '');
    }
    const fm = parseFrontmatter(file);
    if (fm.error) { err(file, fm.error); continue; }
    const { data } = fm;
    const kindKey = `${tool}-${kind}`;
    for (const k of Object.keys(data)) if (!FIELDS[kindKey].has(k)) err(file, `unknown frontmatter field '${k}' for ${kindKey} (not in the official docs)`);
    for (const k of ['name', 'description']) if (typeof data[k] !== 'string' || !data[k].trim()) err(file, `required frontmatter '${k}' missing or empty`);
    if (data.name && data.name !== expected) err(file, `name '${data.name}' must equal ${kind === 'skill' ? 'folder' : 'file'} name '${expected}'`);
    if (data.name && !NAME_RE.test(data.name)) err(file, `name '${data.name}' must match ${NAME_RE}`);
    if (data.description && data.description.length > 1024) err(file, `description longer than 1024 chars`);
    if (kindKey === 'junie-agent') {
      for (const f of ['tools', 'disallowedTools']) for (const t of listOf(data[f])) if (!JUNIE_TOOLS.has(t.toLowerCase())) err(file, `${f}: unknown Junie tool '${t}'`);
    }
    if (kindKey === 'claude-agent' && data.model && !CLAUDE_MODEL_RE.test(data.model)) err(file, `model '${data.model}' is not a Claude Code alias/ID`);
    if (kindKey === 'claude-agent' && 'tools' in data && listOf(data.tools).length === 0) err(file, `tools is empty`);

    const links = checkLinks(file);
    const sub = kind === 'skill' ? 'workflows' : 'roles';
    const target = links.find((t) => path.dirname(t) === path.join(G, sub));
    if (!target) err(file, `must link to ai-guidelines/${sub}/<name>.md`);
    else if (path.basename(target, '.md') !== expected) err(file, `links ${rel(target)} but its name is '${expected}' (expected ai-guidelines/${sub}/${expected}.md)`);
    wrappers[kind][tool].set(expected, { file, target });
  }
}
for (const tool of ['junie', 'claude']) for (const kind of ['skill', 'agent']) collect(tool, kind);

// --- 2. parity -----------------------------------------------------------------------------------------------
for (const kind of ['skill', 'agent']) {
  const j = wrappers[kind].junie;
  const c = wrappers[kind].claude;
  for (const [name, w] of j) {
    if (!c.has(name)) err(w.file, `no Claude Code twin (.claude/${kind}s/${kind === 'skill' ? `${name}/SKILL.md` : `${name}.md`})`);
    else if (w.target && c.get(name).target && w.target !== c.get(name).target) err(w.file, `points at ${rel(w.target)} but the Claude twin points at ${rel(c.get(name).target)}`);
  }
  for (const [name, w] of c) if (!j.has(name)) err(w.file, `no Junie twin (.junie/${kind}s/${kind === 'skill' ? `${name}/SKILL.md` : `${name}.md`})`);
  oks.push(`${kind}s: junie ${j.size}, claude ${c.size} (${[...j.keys()].sort().join(', ')})`);
}

// --- 3. shared docs: links, imports, banned words ---------------------------------------------------------------
const README = path.join(G, 'README.md');
if (!exists(README)) err(README, 'missing (single source of truth index)');
const shared = [path.join(ROOT, 'AGENTS.md'), path.join(ROOT, 'CLAUDE.md'), ...walk(G)].filter((f) => {
  if (exists(f)) return true;
  err(f, 'missing');
  return false;
});
let readmeTargets = [];
for (const f of shared) {
  const t = checkLinks(f);
  if (f === README) readmeTargets = t;
  checkBanned(f);
}
for (const kind of ['skill', 'agent']) for (const tool of ['junie', 'claude']) for (const { file } of wrappers[kind][tool].values()) checkBanned(file);

const claudeMd = path.join(ROOT, 'CLAUDE.md');
if (exists(claudeMd)) {
  const imports = [...stripCode(read(claudeMd)).matchAll(/(?:^|\s)@([A-Za-z0-9_./-]+\.md)\b/g)].map((m) => m[1]);
  if (!imports.includes('AGENTS.md')) err(claudeMd, 'must import @AGENTS.md (shared instructions)');
  for (const p of imports) if (!exists(path.resolve(ROOT, p))) err(claudeMd, `@${p} import does not resolve`);
  oks.push(`CLAUDE.md imports: ${imports.join(', ')}`);
}

// --- 4. README covers every workflow/role, and each has wrappers ------------------------------------------------
for (const [sub, kind] of [['workflows', 'skill'], ['roles', 'agent']]) {
  const dir = path.join(G, sub);
  const files = exists(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')) : [];
  if (files.length === 0) err(dir, 'no files');
  for (const n of files) {
    const p = path.join(dir, n);
    const name = n.replace(/\.md$/, '');
    if (!readmeTargets.includes(p)) err(README, `does not link ${rel(p)}`);
    for (const tool of ['junie', 'claude']) if (!wrappers[kind][tool].has(name)) err(p, `has no .${tool} ${kind} wrapper named '${name}'`);
  }
}
oks.push(`shared docs checked: ${shared.length} (links, ai-guidelines paths, banned filler)`);

// --- --live ---------------------------------------------------------------------------------------------------
if (LIVE) {
  console.log('live: ASSUMPTION — no documented CLI command lists project skills/agents; checking the binaries only');
  for (const [bin, a] of [['junie', ['--version']], ['claude', ['--version']]]) {
    const r = spawnSync(bin, a, { encoding: 'utf8', timeout: 30_000 });
    if (r.error || r.status !== 0) errors.push(`live: \`${bin} ${a.join(' ')}\` failed: ${r.error?.message ?? r.stderr.trim().split('\n').pop()}`);
    else oks.push(`live: ${bin} ${(r.stdout || r.stderr).trim().split('\n').pop()}`);
  }
}

for (const o of oks) console.log(`ok    ${o}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL  ${e}`);
  console.error(`\nvalidate-junie: ${errors.length} error(s)`);
  process.exit(1);
}
console.log('validate-junie: all checks passed');
