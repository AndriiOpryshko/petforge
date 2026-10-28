#!/usr/bin/env node
// Validates an ao-break-tasks tasks.json against the feature's PRD and CONTEXT.md.
// Usage: node check-tasks.mjs <feature-dir> [--prd PRD.ao-prd.md] [--tasks tasks/tasks.json]
//                             [--context CONTEXT.md] [--json]
// Paths after the feature dir are relative to it. Exit 0 = no ERROR, 1 = ERROR found, 2 = bad input.
// Checks are listed in ../references/self-check.md.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const COURSE_LAYERS = ['migration', 'domain', 'infra', 'app', 'ports', 'ui', 'tests', 'wiring', 'docs'];
const AO_TO_COURSE = {
  wiring: 'wiring', migration: 'migration', sqlc: 'infra', domain: 'domain', app: 'app',
  http: 'ports', job: 'infra', web: 'ui', e2e: 'tests', docs: 'docs',
};
const RANK = { wiring: 0, migration: 1, sqlc: 2, domain: 2, app: 3, http: 4, job: 4, web: 5, e2e: 6, docs: 7 };
const GENERATED = /(\.gen\.go$|(^|\/)sqlcgen(\/|$)|src\/api\/gen(\/|$)|routeTree\.gen\.ts$)/;
const COMMAND = /(mise run|go test|go build|pnpm|\/roundtrip|\/promote-migration|\/green|git diff --exit-code)/;

function die(msg) {
  console.error(`check-tasks: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { prd: null, tasks: 'tasks/tasks.json', context: 'CONTEXT.md', json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (['--prd', '--tasks', '--context'].includes(a)) {
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) die(`unknown flag ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) die('usage: check-tasks.mjs <feature-dir> [--prd F] [--tasks F] [--context F] [--json]');
  opts.dir = rest[0];
  if (!opts.prd) opts.prd = existsSync(join(opts.dir, 'PRD.ao-prd.md')) ? 'PRD.ao-prd.md' : 'PRD.md';
  return opts;
}

function read(path, required) {
  if (!existsSync(path)) {
    if (required) die(`missing ${path}`);
    return null;
  }
  return readFileSync(path, 'utf8');
}

// Lines of the "## <title>" section whose heading matches re, up to the next "## " heading.
function section(lines, re) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

function parsePrd(text) {
  const lines = text.split('\n');
  const body = section(lines, /^## 5[.\s]\s*Acceptance/i) ?? section(lines, /^## 5\.? /) ?? lines;
  const acs = new Map(); // id -> stage (1 | 2)
  let deferred = false;
  for (const l of body) {
    const h = l.match(/^#{2,5}\s+(.*)$/);
    if (!h) continue;
    const ac = h[1].match(/^(AC-\d+[a-z]?)\b/);
    if (!ac) {
      if (/deferred|stage 2/i.test(h[1])) deferred = true;
      continue;
    }
    const stage2 = deferred || /_\((stage 2|dropped)/i.test(h[1]);
    acs.set(ac[1], stage2 ? 2 : 1);
  }
  const codes = new Set();
  const cat = section(lines, /^## 5\.1\b/);
  for (const l of cat ?? []) {
    const m = l.match(/^\|\s*`([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)`/);
    if (m) codes.add(m[1]);
  }
  return { acs, codes, hasCatalogue: cat !== null };
}

function parseContext(text) {
  const codes = new Set();
  if (!text) return { codes, found: false };
  const sec = section(text.split('\n'), /^## Sentinel errors/i);
  if (!sec) return { codes, found: false };
  for (const l of sec) {
    const s = l.replace(/^[\s\-*`]+/, '');
    const m = s.match(/^([a-z][a-z0-9_]*\.[a-z][a-z0-9_]+)/);
    if (m) codes.add(m[1]);
  }
  return { codes, found: true };
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-z_]+):\s*(.*?)\s*(#.*)?$/);
    if (!kv) continue;
    let v = kv[2];
    if (v === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s+-\s+/, ''));
      v = items;
    } else if (v.startsWith('[')) {
      v = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    const unq = (s) => s.replace(/^["']|["']$/g, '');
    fm[kv[1]] = Array.isArray(v) ? v.map(unq) : unq(v);
  }
  return fm;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = resolve(opts.dir);
  const tasksPath = resolve(dir, opts.tasks);
  const prd = parsePrd(read(resolve(dir, opts.prd), true));
  const ctx = parseContext(read(resolve(dir, opts.context), false));
  let plan;
  try {
    plan = JSON.parse(read(tasksPath, true));
  } catch (e) {
    die(`${tasksPath}: ${e.message}`);
  }

  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  // 1. shape
  if (typeof plan.slug !== 'string' || !plan.slug) err('top level: missing slug');
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) die(`${tasksPath}: tasks[] missing or empty`);
  const byId = new Map();
  for (const t of plan.tasks) {
    const id = t.id ?? '<no id>';
    if (!t.id) err('task without id');
    else if (byId.has(t.id)) err(`${id}: duplicate id`);
    else byId.set(t.id, t);
    if (!t.title) err(`${id}: missing title`);
    if (!COURSE_LAYERS.includes(t.layer)) err(`${id}: layer "${t.layer}" not in the implement-tasks enum`);
    for (const f of ['deps', 'acs', 'files_hint']) if (!Array.isArray(t[f])) err(`${id}: ${f} must be an array`);
    if (Array.isArray(t.files_hint) && t.files_hint.length === 0) err(`${id}: files_hint is empty`);
    if (typeof t.dod !== 'string' || !t.dod.trim()) err(`${id}: missing dod`);
    // 12. ao_layer mapping
    if (!t.ao_layer) warn(`${id}: no ao_layer (layer-order and org-filter checks skip it)`);
    else if (!(t.ao_layer in AO_TO_COURSE)) err(`${id}: unknown ao_layer "${t.ao_layer}"`);
    else if (AO_TO_COURSE[t.ao_layer] !== t.layer) err(`${id}: ao_layer ${t.ao_layer} must map to layer ${AO_TO_COURSE[t.ao_layer]}, got ${t.layer}`);
    if (!t.context) warn(`${id}: no context`);
  }
  const tasks = [...byId.values()];
  const arr = (t, f) => (Array.isArray(t[f]) ? t[f] : []);

  // 2. deps exist
  for (const t of tasks) for (const d of arr(t, 'deps')) if (!byId.has(d)) err(`${t.id}: dep ${d} does not exist`);

  // 3. acyclic (Kahn)
  const indeg = new Map(tasks.map((t) => [t.id, 0]));
  const children = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const d of arr(t, 'deps')) if (byId.has(d)) { indeg.set(t.id, indeg.get(t.id) + 1); children.get(d).push(t.id); }
  const phases = [];
  let ready = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  let seen = 0;
  while (ready.length) {
    phases.push(ready);
    seen += ready.length;
    const next = [];
    for (const id of ready) for (const c of children.get(id)) { indeg.set(c, indeg.get(c) - 1); if (indeg.get(c) === 0) next.push(c); }
    ready = next;
  }
  const acyclic = seen === tasks.length;
  if (!acyclic) err(`dependency cycle among: ${tasks.filter((t) => indeg.get(t.id) > 0).map((t) => t.id).join(', ')}`);

  // 4-5. AC membership and Stage-1 coverage
  const coverage = new Map([...prd.acs].filter(([, s]) => s === 1).map(([id]) => [id, []]));
  for (const t of tasks) for (const a of arr(t, 'acs')) {
    if (!prd.acs.has(a)) err(`${t.id}: AC ${a} is not in ${opts.prd} §5`);
    else if (prd.acs.get(a) === 2) warn(`${t.id}: AC ${a} is deferred to Stage 2`);
    else coverage.get(a).push(t.id);
  }
  for (const [a, ts] of coverage) if (ts.length === 0) err(`Stage-1 ${a} is covered by no task`);

  // 6. error codes
  const known = new Set([...prd.codes, ...ctx.codes]);
  if (!prd.hasCatalogue) warn(`${opts.prd} has no §5.1 error catalogue; codes come from CONTEXT only`);
  if (!ctx.found) warn(`${opts.context} has no "## Sentinel errors" section`);
  const used = new Map([...known].map((c) => [c, []]));
  for (const t of tasks) for (const c of arr(t, 'errors')) {
    if (!known.has(c)) warn(`${t.id}: error ${c} is in neither §5.1 nor CONTEXT`);
    else used.get(c).push(t.id);
  }
  for (const [c, ts] of used) if (ts.length === 0) err(`error code ${c} is used by no task`);

  // 7. org filter on sqlc tasks
  for (const t of tasks) if (t.ao_layer === 'sqlc' && !/association_id|org-filter: n\/a/.test(t.dod ?? ''))
    err(`${t.id}: sqlc task dod has no association_id filter line (or "org-filter: n/a <reason>")`);

  // 8. layer order
  const ancestors = new Map();
  const anc = (id, stack = new Set()) => {
    if (ancestors.has(id)) return ancestors.get(id);
    const out = new Set();
    if (stack.has(id)) return out;
    stack.add(id);
    for (const d of arr(byId.get(id), 'deps')) if (byId.has(d)) { out.add(d); for (const x of anc(d, stack)) out.add(x); }
    stack.delete(id);
    ancestors.set(id, out);
    return out;
  };
  for (const t of tasks) for (const d of arr(t, 'deps')) {
    const dt = byId.get(d);
    if (dt && t.ao_layer in RANK && dt.ao_layer in RANK && RANK[dt.ao_layer] > RANK[t.ao_layer])
      err(`${t.id} (${t.ao_layer}) depends on ${d} (${dt.ao_layer}), a later layer`);
  }
  const exists = (layer, context) => tasks.some((x) => x.ao_layer === layer && (context === undefined || x.context === context));
  const reaches = (t, layer, sameContext) => [...anc(t.id)].some((a) => { const x = byId.get(a); return x.ao_layer === layer && (!sameContext || x.context === t.context); });
  const need = (t, layer, sameContext) => {
    if (!exists(layer, sameContext ? t.context : undefined)) return;
    if (!reaches(t, layer, sameContext)) err(`${t.id} (${t.ao_layer}) does not depend on any ${layer} task${sameContext ? ` of ${t.context}` : ''}`);
  };
  if (acyclic) for (const t of tasks) {
    if (t.ao_layer === 'sqlc') need(t, 'migration', false);
    if (t.ao_layer === 'app') { need(t, 'domain', true); need(t, 'sqlc', true); }
    if (t.ao_layer === 'http' || t.ao_layer === 'job') need(t, 'app', true);
    if (t.ao_layer === 'web') need(t, 'http', false);
    if (t.ao_layer === 'e2e') need(t, exists('web') ? 'web' : 'http', false);
  }

  // 9-11. generated files, concrete dod, estimate
  for (const t of tasks) {
    for (const f of arr(t, 'files_hint')) if (GENERATED.test(f)) err(`${t.id}: files_hint ${f} is generated code`);
    if (t.dod && !COMMAND.test(t.dod)) err(`${t.id}: dod names no command`);
    const est = String(t.est ?? '');
    const hours = est.match(/^(\d+(?:\.\d+)?)\s*h$/);
    if (!/^(S|M|L)$/.test(est) && !(hours && Number(hours[1]) <= 8)) err(`${t.id}: est "${est}" is not S, M, L or ≤8h`);
  }

  // 13. markdown twins
  const tdir = dirname(tasksPath);
  const mdIds = new Set();
  for (const f of readdirSync(tdir).filter((f) => f.endsWith('.md') && !['_epic.md', 'tracker.md'].includes(f))) {
    const fm = parseFrontmatter(readFileSync(join(tdir, f), 'utf8'));
    if (!fm || !fm.id) { err(`${f}: no frontmatter id`); continue; }
    mdIds.add(fm.id);
    const t = byId.get(fm.id);
    if (!t) { err(`${f}: id ${fm.id} is not in tasks.json`); continue; }
    const a = [...(fm.deps ?? [])].sort().join(',');
    const b = [...arr(t, 'deps')].sort().join(',');
    if (a !== b) err(`${f}: deps [${a}] differ from tasks.json [${b}]`);
  }
  for (const t of tasks) if (!mdIds.has(t.id)) err(`${t.id}: no task file in ${tdir}`);

  const width = Math.max(...phases.map((p) => p.length));
  const summary = {
    tasks: tasks.length, phases: phases.length, longest_chain: phases.length, parallel_width: width,
    stage1_acs: coverage.size, covered: [...coverage.values()].filter((v) => v.length).length,
    codes: known.size, codes_used: [...used.values()].filter((v) => v.length).length,
  };
  if (opts.json) {
    console.log(JSON.stringify({ summary, errors, warnings, coverage: Object.fromEntries(coverage), phases }, null, 2));
  } else {
    console.log(`tasks=${summary.tasks} phases=${summary.phases} longest_chain=${summary.longest_chain} parallel_width=${summary.parallel_width}`);
    console.log(`Stage-1 ACs covered ${summary.covered}/${summary.stage1_acs}; error codes used ${summary.codes_used}/${summary.codes}`);
    console.log('\n| AC | Tasks |\n|---|---|');
    for (const [a, ts] of coverage) console.log(`| ${a} | ${ts.join(', ') || '**none**'} |`);
    if (acyclic) console.log(`\nphases: ${phases.map((p, i) => `${i + 1}:[${p.join(' ')}]`).join(' ')}`);
    for (const w of warnings) console.log(`WARN  ${w}`);
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log(errors.length ? `\nFAIL (${errors.length} errors)` : '\nOK');
  }
  process.exit(errors.length ? 1 : 0);
}

main();
