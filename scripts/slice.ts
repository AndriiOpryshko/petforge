#!/usr/bin/env node
// Vertical-slice generator for a Go modular monolith laid out as
// services/<svc>/internal/<context>/{domain,app,ports,adapters/http,adapters/postgres}.
//
// Usage:
//   node slice.ts check    <spec.json> [--service <dir>]   validate the spec, list what would change
//   node slice.ts scaffold <spec.json> [--service <dir>]   write the slice
//
// The spec describes one entity in a new bounded context (see skills/slice-plan/SKILL.md).
// After scaffold, run the project's codegen (oapi-codegen, sqlc, orval) and build.
// Runs on Node 24+ without dependencies (native TypeScript type stripping).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

type FieldType = 'text' | 'int64' | 'bool' | 'enum' | 'date' | 'timestamptz';

interface Field {
  name: string;
  type: FieldType;
  nullable?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  default?: string | number | boolean;
  example?: string | number | boolean;
  description?: string;
}

interface Spec {
  context: string;
  contextDescription?: string;
  entity: string;
  plural?: string;
  summary?: string;
  fields: Field[];
  // Cross-field invariants in plain words; implemented by the slice-tests skill, not generated.
  rules?: string[];
}

// ---------- naming ----------

const initialisms = new Set(['id', 'url', 'uuid', 'api', 'http', 'json', 'sql', 'ip']);
const parts = (snake: string) => snake.split('_').filter(Boolean);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Go identifiers we own and sqlc's naming: initialisms upper-cased (held_at_id -> HeldAtID).
const goName = (snake: string) => parts(snake).map((p) => (initialisms.has(p) ? p.toUpperCase() : cap(p))).join('');
// oapi-codegen's property naming: plain camel case (id -> Id).
const apiName = (snake: string) => parts(snake).map(cap).join('');
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const snakeOf = (pascal: string) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// ---------- spec ----------

function fail(msg: string): never {
  console.error(`slice: ${msg}`);
  process.exit(1);
}

function loadSpec(path: string): Spec {
  const spec = JSON.parse(readFileSync(path, 'utf8')) as Spec;
  if (!/^[a-z][a-z0-9]*$/.test(spec.context)) fail('context must be lower-case letters/digits, e.g. "governance"');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(spec.entity)) fail('entity must be PascalCase, e.g. "Meeting"');
  if (!Array.isArray(spec.fields) || spec.fields.length === 0) fail('fields must be a non-empty array');
  const reserved = new Set(['id', 'created_at', 'updated_at']);
  const seen = new Set<string>();
  for (const f of spec.fields) {
    if (!/^[a-z][a-z0-9_]*$/.test(f.name)) fail(`field "${f.name}": name must be snake_case`);
    if (reserved.has(f.name)) fail(`field "${f.name}" is added automatically`);
    if (seen.has(f.name)) fail(`field "${f.name}" is duplicated`);
    seen.add(f.name);
    if (!['text', 'int64', 'bool', 'enum', 'date', 'timestamptz'].includes(f.type)) fail(`field "${f.name}": unknown type ${f.type}`);
    if (f.type === 'enum' && (!f.values || f.values.length === 0)) fail(`field "${f.name}": enum needs values`);
    if (f.type === 'enum' && f.nullable) fail(`field "${f.name}": nullable enums are not supported`);
    if (f.nullable && f.default !== undefined) fail(`field "${f.name}": a field is either nullable or has a default`);
  }
  return spec;
}

// ---------- derived model ----------

interface Ctx {
  spec: Spec;
  svc: string; // service dir, e.g. services/core
  module: string; // Go module path of the service
  ctx: string; // context, e.g. governance
  E: string; // Meeting
  e: string; // meeting
  P: string; // Meetings
  table: string; // meetings
  fields: Field[];
}

function derive(spec: Spec, svc: string): Ctx {
  const gomod = readFileSync(join(svc, 'go.mod'), 'utf8');
  const module = /^module\s+(\S+)/m.exec(gomod)?.[1] ?? fail(`no module line in ${svc}/go.mod`);
  const table = spec.plural ?? `${snakeOf(spec.entity)}s`;
  return {
    spec, svc, module, ctx: spec.context, E: spec.entity, e: lowerFirst(spec.entity),
    P: goName(table), table, fields: spec.fields,
  };
}

const required = (f: Field) => !f.nullable && f.default === undefined;
const enumType = (c: Ctx, f: Field) => `${c.E}${goName(f.name)}`;
const constrained = (f: Field) =>
  (f.type === 'text' && (f.min !== undefined || f.max !== undefined)) ||
  (f.type === 'int64' && (f.min !== undefined || f.max !== undefined)) ||
  f.type === 'enum';

function sample(c: Ctx, f: Field): string | number | boolean {
  if (f.example !== undefined) return f.example;
  switch (f.type) {
    case 'text': {
      const s = `Sample ${f.name.replace(/_/g, ' ')}`;
      return f.max !== undefined ? s.slice(0, f.max) : s;
    }
    case 'int64': return f.min !== undefined ? Math.max(f.min, 1) : 1;
    case 'bool': return f.default === undefined ? true : !f.default;
    case 'enum': return f.values![0];
    case 'date': return '2026-01-15';
    case 'timestamptz': return '2026-01-15T10:00:00Z';
  }
}

// ---------- SQL ----------

function sqlType(f: Field): string {
  return { text: 'text', int64: 'bigint', bool: 'boolean', enum: 'text', date: 'date', timestamptz: 'timestamptz' }[f.type];
}

function sqlLiteral(f: Field, v: string | number | boolean): string {
  return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v);
}

function migration(c: Ctx): string {
  const cols: string[] = ['id uuid PRIMARY KEY DEFAULT gen_random_uuid()'];
  for (const f of c.fields) {
    let col = `${f.name} ${sqlType(f)}`;
    if (!f.nullable) col += ' NOT NULL';
    if (f.default !== undefined) col += ` DEFAULT ${sqlLiteral(f, f.default)}`;
    const checks: string[] = [];
    if (f.type === 'text') {
      if (f.min !== undefined && f.max !== undefined) checks.push(`char_length(${f.name}) BETWEEN ${f.min} AND ${f.max}`);
      else if (f.min !== undefined) checks.push(`char_length(${f.name}) >= ${f.min}`);
      else if (f.max !== undefined) checks.push(`char_length(${f.name}) <= ${f.max}`);
    }
    if (f.type === 'int64') {
      if (f.min !== undefined) checks.push(`${f.name} >= ${f.min}`);
      if (f.max !== undefined) checks.push(`${f.name} <= ${f.max}`);
    }
    if (f.type === 'enum') checks.push(`${f.name} IN (${f.values!.map((v) => sqlLiteral(f, v)).join(', ')})`);
    if (checks.length) col += ` CHECK (${checks.join(' AND ')})`;
    cols.push(col);
  }
  cols.push('created_at timestamptz NOT NULL DEFAULT now()', 'updated_at timestamptz NOT NULL DEFAULT now()');
  return `-- +goose Up
CREATE TABLE ${c.table} (
    ${cols.join(',\n    ')}
);

CREATE TRIGGER ${c.table}_set_updated_at BEFORE UPDATE ON ${c.table}
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TABLE ${c.table};
`;
}

function queries(c: Ctx): string {
  const names = c.fields.map((f) => f.name);
  const params = names.map((_, i) => `$${i + 1}`);
  return `-- name: Create${c.E} :one
INSERT INTO ${c.table} (${names.join(', ')})
VALUES (${params.join(', ')})
RETURNING *;

-- name: Get${c.E} :one
SELECT * FROM ${c.table} WHERE id = $1;

-- name: List${c.P} :many
-- Pages newest first by the (created_at, id) keyset; a NULL after_created_at
-- starts from the top.
SELECT * FROM ${c.table}
WHERE sqlc.narg(after_created_at)::timestamptz IS NULL
   OR (created_at, id) < (sqlc.narg(after_created_at)::timestamptz, sqlc.narg(after_id)::uuid)
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(row_limit);
`;
}

// ---------- OpenAPI ----------

function oasField(c: Ctx, f: Field, forResponse: boolean): string[] {
  const lines: string[] = [];
  if (f.type === 'enum') {
    lines.push(`$ref: "#/components/schemas/${enumType(c, f)}"`);
    return lines;
  }
  const base = { text: 'string', int64: 'integer', bool: 'boolean', date: 'string', timestamptz: 'string' }[f.type as Exclude<FieldType, 'enum'>];
  lines.push(f.nullable ? `type: [${base}, "null"]` : `type: ${base}`);
  if (f.type === 'int64') lines.push('format: int64');
  if (f.type === 'date') lines.push('format: date');
  if (f.type === 'timestamptz') lines.push('format: date-time');
  if (!forResponse) {
    if (f.type === 'text' && f.min !== undefined) lines.push(`minLength: ${f.min}`);
    if (f.type === 'text' && f.max !== undefined) lines.push(`maxLength: ${f.max}`);
    if (f.type === 'int64' && f.min !== undefined) lines.push(`minimum: ${f.min}`);
    if (f.type === 'int64' && f.max !== undefined) lines.push(`maximum: ${f.max}`);
    if (f.default !== undefined) lines.push(`default: ${JSON.stringify(f.default)}`);
  }
  if (f.description) lines.push(`description: ${JSON.stringify(f.description)}`);
  return lines;
}

function oasSchemas(c: Ctx): string {
  const ind = (n: number, lines: string[]) => lines.map((l) => ' '.repeat(n) + l).join('\n');
  const prop = (f: Field, forResponse: boolean) => `${' '.repeat(8)}${f.name}:\n${ind(10, oasField(c, f, forResponse))}`;
  const out: string[] = [];
  for (const f of c.fields.filter((f) => f.type === 'enum')) {
    out.push(`    ${enumType(c, f)}:\n      type: string\n      enum: [${f.values!.join(', ')}]`);
  }
  const req = c.fields.filter(required).map((f) => f.name);
  out.push(`    New${c.E}:
      type: object
      additionalProperties: false${req.length ? `\n      required: [${req.join(', ')}]` : ''}
      properties:
${c.fields.map((f) => prop(f, false)).join('\n')}`);
  const all = ['id', ...c.fields.map((f) => f.name), 'created_at', 'updated_at'];
  out.push(`    ${c.E}:
      type: object
      required: [${all.join(', ')}]
      properties:
        id: { type: string, format: uuid }
${c.fields.map((f) => prop(f, true)).join('\n')}
        created_at: { type: string, format: date-time }
        updated_at: { type: string, format: date-time }`);
  out.push(`    ${c.E}Page:
      type: object
      required: [items, next_cursor]
      properties:
        items:
          type: array
          items: { $ref: "#/components/schemas/${c.E}" }
        next_cursor:
          type: [string, "null"]
          description: Pass as cursor to get the next page; null on the last page.`);
  return out.join('\n') + '\n';
}

function oasPaths(c: Ctx): string {
  const words = snakeOf(c.E).replace(/_/g, ' ');
  return `  /${c.ctx}/${c.table}:
    post:
      operationId: create${c.E}
      tags: [${c.ctx}]
      summary: ${c.spec.summary ?? `Create a ${words}`}
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/New${c.E}" }
      responses:
        "201":
          description: The ${words} was created.
          content:
            application/json:
              schema: { $ref: "#/components/schemas/${c.E}" }
        "422": { $ref: "#/components/responses/UnprocessableEntity" }
    get:
      operationId: list${c.P}
      tags: [${c.ctx}]
      summary: List ${c.table.replace(/_/g, ' ')}, newest first, one page at a time
      parameters:
        - name: limit
          in: query
          description: Page size.
          schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
        - name: cursor
          in: query
          description: Opaque cursor from a previous page's next_cursor; omit for the first page.
          schema: { type: string, minLength: 1 }
      responses:
        "200":
          description: One page of ${c.table.replace(/_/g, ' ')}.
          content:
            application/json:
              schema: { $ref: "#/components/schemas/${c.E}Page" }
        "422": { $ref: "#/components/responses/UnprocessableEntity" }
  /${c.ctx}/${c.table}/{id}:
    get:
      operationId: get${c.E}
      tags: [${c.ctx}]
      summary: Get one ${words}
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        "200":
          description: The ${words}.
          content:
            application/json:
              schema: { $ref: "#/components/schemas/${c.E}" }
        "404": { $ref: "#/components/responses/NotFound" }
        "422": { $ref: "#/components/responses/UnprocessableEntity" }
`;
}

function patchOpenAPI(c: Ctx, src: string): string {
  const lines = src.split('\n');
  const at = (re: RegExp) => {
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) fail(`openapi.yaml: cannot find ${re}`);
    return i;
  };
  // Order matters: insert from the bottom up so earlier indexes stay valid.
  const schemasAt = at(/^  schemas:\s*$/);
  lines.splice(schemasAt + 1, 0, ...oasSchemas(c).trimEnd().split('\n'));
  const componentsAt = at(/^components:\s*$/);
  lines.splice(componentsAt, 0, ...oasPaths(c).trimEnd().split('\n'));
  const pathsAt = at(/^paths:\s*$/);
  const desc = c.spec.contextDescription ?? `The ${c.ctx} context.`;
  lines.splice(pathsAt, 0, `  - name: ${c.ctx}`, `    description: ${desc}`);
  return lines.join('\n');
}

// ---------- Go: domain ----------

function domainGoType(c: Ctx, f: Field): string {
  const t = { text: 'string', int64: 'int64', bool: 'bool', enum: enumType(c, f), date: 'time.Time', timestamptz: 'time.Time' }[f.type];
  return f.nullable ? `*${t}` : t;
}

function goLit(v: string | number | boolean): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

function domainFile(c: Ctx): string {
  const usesRunes = c.fields.some((f) => f.type === 'text' && (f.min !== undefined || f.max !== undefined));
  const usesFmt = c.fields.some((f) => f.type === 'text' && f.max !== undefined);
  // time is always needed for CreatedAt/UpdatedAt.
  const imports = ['errors', ...(usesFmt ? ['fmt'] : []), 'strings', 'time', ...(usesRunes ? ['unicode/utf8'] : [])];
  const enums = c.fields.filter((f) => f.type === 'enum').map((f) => {
    const T = enumType(c, f);
    const consts = f.values!.map((v) => `\t${T}${goName(v.toLowerCase())} ${T} = ${JSON.stringify(v)}`).join('\n');
    const cases = f.values!.map((v) => `${T}${goName(v.toLowerCase())}`).join(', ');
    return `type ${T} string

const (
${consts}
)

func (v ${T}) Valid() bool {
\tswitch v {
\tcase ${cases}:
\t\treturn true
\t}
\treturn false
}
`;
  });
  const fieldConsts = c.fields.filter(constrained).map((f) => `\tField${goName(f.name)} = ${JSON.stringify(f.name)}`);
  const limits = c.fields.flatMap((f) => {
    const out: string[] = [];
    if (f.type === 'text' && f.max !== undefined) out.push(`\tMax${goName(f.name)}Len = ${f.max}`);
    return out;
  });
  const checks = c.fields.filter(constrained).map((f) => {
    const name = `t.${goName(f.name)}`;
    const val = f.nullable ? `*${name}` : name;
    let body = '';
    if (f.type === 'text') {
      const lo = f.min ?? 0;
      const conds: string[] = [];
      if (f.min !== undefined) conds.push(`n < ${f.min}`);
      if (f.max !== undefined) conds.push(`n > Max${goName(f.name)}Len`);
      const msg = f.max !== undefined ? `fmt.Sprintf("must be ${lo} to %d characters", Max${goName(f.name)}Len)` : `"must be at least ${f.min} characters"`;
      body = `if n := utf8.RuneCountInString(${val}); ${conds.join(' || ')} {\n\t\tv.add(Field${goName(f.name)}, ${msg})\n\t}`;
    } else if (f.type === 'int64') {
      const conds: string[] = [];
      if (f.min !== undefined) conds.push(`${val} < ${f.min}`);
      if (f.max !== undefined) conds.push(`${val} > ${f.max}`);
      const msg = f.min !== undefined && f.max !== undefined ? `must be between ${f.min} and ${f.max}` : f.min !== undefined ? `must be at least ${f.min}` : `must be at most ${f.max}`;
      body = `if ${conds.join(' || ')} {\n\t\tv.add(Field${goName(f.name)}, ${JSON.stringify(msg)})\n\t}`;
    } else {
      body = `if !${val}.Valid() {\n\t\tv.add(Field${goName(f.name)}, ${JSON.stringify(`must be one of ${f.values!.join(', ')}`)})\n\t}`;
    }
    return f.nullable ? `\tif ${name} != nil {\n\t\t${body.replace(/\n/g, '\n\t')}\n\t}` : `\t${body}`;
  });
  const termFields = c.fields.map((f) => `\t${goName(f.name)} ${domainGoType(c, f)}`).join('\n');
  return `// Package domain holds the ${c.ctx} context's model. It imports only the standard library and uuid.
package domain

import (
${imports.map((i) => `\t"${i}"`).join('\n')}

\t"github.com/google/uuid"
)

// Err${c.E}NotFound is returned when no ${c.e} has the requested ID.
var Err${c.E}NotFound = errors.New("${snakeOf(c.E).replace(/_/g, ' ')} not found")

${enums.join('\n')}${limits.length ? `const (\n${limits.join('\n')}\n)\n\n` : ''}${fieldConsts.length ? `// Field names reported in a ValidationError.\nconst (\n${fieldConsts.join('\n')}\n)\n\n` : ''}// ${c.E}Fields is everything a caller provides to create a ${c.e}.
type ${c.E}Fields struct {
${termFields}
}

// Validate checks every invariant and reports all broken ones at once as a
// *ValidationError.
func (t ${c.E}Fields) Validate() error {
\tvar v ValidationError
${checks.join('\n')}
\tif len(v.Fields) > 0 {
\t\treturn &v
\t}
\treturn nil
}

// ${c.E} is a stored ${c.e}: its fields plus the identity and timestamps the store assigns.
type ${c.E} struct {
\tID uuid.UUID
\t${c.E}Fields
\tCreatedAt time.Time
\tUpdatedAt time.Time
}

type FieldError struct {
\tField  string
\tDetail string
}

// ValidationError lists the invariants a ${c.E}Fields breaks.
type ValidationError struct {
\tFields []FieldError
}

func (e *ValidationError) Error() string {
\tparts := make([]string, len(e.Fields))
\tfor i, f := range e.Fields {
\t\tparts[i] = f.Field + ": " + f.Detail
\t}
\treturn "invalid ${snakeOf(c.E).replace(/_/g, ' ')}: " + strings.Join(parts, "; ")
}

func (e *ValidationError) add(field, detail string) {
\te.Fields = append(e.Fields, FieldError{Field: field, Detail: detail})
}
`;
}

function domainTest(c: Ctx): string {
  const valid = c.fields.map((f) => {
    const v = sample(c, f);
    const lit = f.type === 'enum' ? `${enumType(c, f)}${goName(String(v).toLowerCase())}`
      : f.type === 'date' ? `mustTime(time.DateOnly, ${goLit(v)})`
      : f.type === 'timestamptz' ? `mustTime(time.RFC3339, ${goLit(v)})`
      : f.type === 'int64' ? `int64(${goLit(v)})` : goLit(v);
    return f.nullable ? `\t\t${goName(f.name)}: ptr(${lit}),` : `\t\t${goName(f.name)}: ${lit},`;
  });
  const cases: string[] = [`\t\t{name: "valid", edit: func(*${c.E}Fields) {}},`];
  for (const f of c.fields.filter(constrained)) {
    const G = goName(f.name);
    const set = (expr: string) => (f.nullable ? `x.${G} = ptr(${expr})` : `x.${G} = ${expr}`);
    if (f.type === 'text') {
      if (f.min !== undefined && f.min > 0) cases.push(`\t\t{name: "${f.name} too short", edit: func(x *${c.E}Fields) { ${set(`strings.Repeat("x", ${f.min - 1})`)} }, wantFields: []string{Field${G}}},`);
      if (f.max !== undefined) {
        cases.push(`\t\t{name: "${f.name} at max in multibyte runes", edit: func(x *${c.E}Fields) { ${set(`strings.Repeat("ї", ${f.max})`)} }},`);
        cases.push(`\t\t{name: "${f.name} too long", edit: func(x *${c.E}Fields) { ${set(`strings.Repeat("x", ${f.max + 1})`)} }, wantFields: []string{Field${G}}},`);
      }
    }
    if (f.type === 'int64') {
      if (f.min !== undefined) cases.push(`\t\t{name: "${f.name} below min", edit: func(x *${c.E}Fields) { ${set(`int64(${f.min - 1})`)} }, wantFields: []string{Field${G}}},`);
      if (f.max !== undefined) cases.push(`\t\t{name: "${f.name} above max", edit: func(x *${c.E}Fields) { ${set(`int64(${f.max + 1})`)} }, wantFields: []string{Field${G}}},`);
    }
    if (f.type === 'enum') cases.push(`\t\t{name: "${f.name} unknown", edit: func(x *${c.E}Fields) { x.${G} = "UNKNOWN" }, wantFields: []string{Field${G}}},`);
  }
  const needsStrings = cases.some((l) => l.includes('strings.Repeat'));
  const needsTime = c.fields.some((f) => f.type === 'date' || f.type === 'timestamptz');
  const needsPtr = c.fields.some((f) => f.nullable);
  return `package domain

import (
\t"errors"
\t"slices"
${needsStrings ? '\t"strings"\n' : ''}\t"testing"
${needsTime ? '\t"time"\n' : ''})
${needsTime ? `
func mustTime(layout, s string) time.Time {
\tt, err := time.Parse(layout, s)
\tif err != nil {
\t\tpanic(err)
\t}
\treturn t
}
` : ''}${needsPtr ? '\nfunc ptr[T any](v T) *T { return &v }\n' : ''}
func valid() ${c.E}Fields {
\treturn ${c.E}Fields{
${valid.join('\n')}
\t}
}

func TestValidate(t *testing.T) {
\ttests := []struct {
\t\tname       string
\t\tedit       func(*${c.E}Fields)
\t\twantFields []string
\t}{
${cases.join('\n')}
\t}
\tfor _, tt := range tests {
\t\tt.Run(tt.name, func(t *testing.T) {
\t\t\tx := valid()
\t\t\ttt.edit(&x)
\t\t\terr := x.Validate()
\t\t\tif len(tt.wantFields) == 0 {
\t\t\t\tif err != nil {
\t\t\t\t\tt.Fatalf("Validate() = %v, want nil", err)
\t\t\t\t}
\t\t\t\treturn
\t\t\t}
\t\t\tvar v *ValidationError
\t\t\tif !errors.As(err, &v) {
\t\t\t\tt.Fatalf("Validate() = %v, want *ValidationError", err)
\t\t\t}
\t\t\tvar got []string
\t\t\tfor _, f := range v.Fields {
\t\t\t\tgot = append(got, f.Field)
\t\t\t}
\t\t\tif !slices.Equal(got, tt.wantFields) {
\t\t\t\tt.Errorf("fields = %v, want %v", got, tt.wantFields)
\t\t\t}
\t\t})
\t}
}
`;
}

// ---------- Go: ports, app ----------

function portsFile(c: Ctx): string {
  return `// Package ports declares what the ${c.ctx} context needs from the outside world.
package ports

import (
\t"context"
\t"time"

\t"github.com/google/uuid"

\t"${c.module}/internal/${c.ctx}/domain"
)

// ${c.E}Key is a ${c.e}'s position in the newest-first listing order.
type ${c.E}Key struct {
\tCreatedAt time.Time
\tID        uuid.UUID
}

// ${c.E}Repository stores ${c.table.replace(/_/g, ' ')}.
type ${c.E}Repository interface {
\t// Create stores already validated fields and returns the stored ${c.e}.
\tCreate(ctx context.Context, fields domain.${c.E}Fields) (domain.${c.E}, error)
\t// Get returns domain.Err${c.E}NotFound when no ${c.e} has the id.
\tGet(ctx context.Context, id uuid.UUID) (domain.${c.E}, error)
\t// List returns up to limit ${c.table.replace(/_/g, ' ')} ordered by created_at, then id, both
\t// descending, starting strictly after the key (from the top when nil).
\tList(ctx context.Context, after *${c.E}Key, limit int) ([]domain.${c.E}, error)
}
`;
}

function appFile(c: Ctx): string {
  return `// Package app holds the ${c.ctx} context's use cases.
package app

import (
\t"context"
\t"encoding/base64"
\t"errors"
\t"fmt"
\t"strconv"
\t"strings"
\t"time"

\t"github.com/google/uuid"

\t"${c.module}/internal/${c.ctx}/domain"
\t"${c.module}/internal/${c.ctx}/ports"
)

const (
\tDefaultPageSize = 20
\tMaxPageSize     = 100
)

// ErrInvalidCursor is returned when a list cursor was not issued by List.
var ErrInvalidCursor = errors.New("invalid cursor")

// ${c.E}Page is one slice of the newest-first ${c.e} listing.
type ${c.E}Page struct {
\tItems []domain.${c.E}
\t// NextCursor resumes the listing after Items; empty on the last page.
\tNextCursor string
}

type ${c.E}Service struct {
\trepo ports.${c.E}Repository
}

func New${c.E}Service(repo ports.${c.E}Repository) *${c.E}Service {
\treturn &${c.E}Service{repo: repo}
}

// Create validates the fields and stores them. Broken invariants come back as
// *domain.ValidationError.
func (s *${c.E}Service) Create(ctx context.Context, fields domain.${c.E}Fields) (domain.${c.E}, error) {
\tif err := fields.Validate(); err != nil {
\t\treturn domain.${c.E}{}, err
\t}
\treturn s.repo.Create(ctx, fields)
}

// Get returns domain.Err${c.E}NotFound when no ${c.e} has the id.
func (s *${c.E}Service) Get(ctx context.Context, id uuid.UUID) (domain.${c.E}, error) {
\treturn s.repo.Get(ctx, id)
}

// List returns up to limit ${c.table.replace(/_/g, ' ')} after cursor, newest first. A limit
// outside 1..MaxPageSize falls back to DefaultPageSize or MaxPageSize; an
// empty cursor starts from the top.
func (s *${c.E}Service) List(ctx context.Context, limit int, cursor string) (${c.E}Page, error) {
\tswitch {
\tcase limit <= 0:
\t\tlimit = DefaultPageSize
\tcase limit > MaxPageSize:
\t\tlimit = MaxPageSize
\t}
\tvar after *ports.${c.E}Key
\tif cursor != "" {
\t\tkey, err := decodeCursor(cursor)
\t\tif err != nil {
\t\t\treturn ${c.E}Page{}, err
\t\t}
\t\tafter = &key
\t}

\t// One extra row tells whether another page follows.
\titems, err := s.repo.List(ctx, after, limit+1)
\tif err != nil {
\t\treturn ${c.E}Page{}, err
\t}
\tpage := ${c.E}Page{Items: items}
\tif len(items) > limit {
\t\tpage.Items = items[:limit]
\t\tlast := page.Items[limit-1]
\t\tpage.NextCursor = encodeCursor(ports.${c.E}Key{CreatedAt: last.CreatedAt, ID: last.ID})
\t}
\treturn page, nil
}

// A cursor is "<created_at unix microseconds>:<id>" in unpadded base64url.
// Microseconds match the precision Postgres stores for timestamptz.
func encodeCursor(k ports.${c.E}Key) string {
\traw := strconv.FormatInt(k.CreatedAt.UnixMicro(), 10) + ":" + k.ID.String()
\treturn base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(s string) (ports.${c.E}Key, error) {
\traw, err := base64.RawURLEncoding.DecodeString(s)
\tif err != nil {
\t\treturn ports.${c.E}Key{}, fmt.Errorf("%w: %v", ErrInvalidCursor, err)
\t}
\tmicros, id, ok := strings.Cut(string(raw), ":")
\tif !ok {
\t\treturn ports.${c.E}Key{}, ErrInvalidCursor
\t}
\tus, err := strconv.ParseInt(micros, 10, 64)
\tif err != nil {
\t\treturn ports.${c.E}Key{}, fmt.Errorf("%w: %v", ErrInvalidCursor, err)
\t}
\tuid, err := uuid.Parse(id)
\tif err != nil {
\t\treturn ports.${c.E}Key{}, fmt.Errorf("%w: %v", ErrInvalidCursor, err)
\t}
\treturn ports.${c.E}Key{CreatedAt: time.UnixMicro(us), ID: uid}, nil
}
`;
}

// ---------- Go: postgres adapter ----------

const pgNullable: Record<string, [string, string]> = {
  text: ['pgtype.Text', 'String'], enum: ['pgtype.Text', 'String'], int64: ['pgtype.Int8', 'Int64'],
  bool: ['pgtype.Bool', 'Bool'], date: ['pgtype.Date', 'Time'], timestamptz: ['pgtype.Timestamptz', 'Time'],
};

function toPg(c: Ctx, f: Field, src: string): string {
  const v = `${src}.${goName(f.name)}`;
  if (f.nullable) return `${lowerFirst(pgNullable[f.type][0].replace('pgtype.', ''))}Of(${v})`;
  switch (f.type) {
    case 'enum': return `string(${v})`;
    case 'date': return `pgtype.Date{Time: ${v}, Valid: true}`;
    case 'timestamptz': return `pgtype.Timestamptz{Time: ${v}, Valid: true}`;
    default: return v;
  }
}

function fromPg(c: Ctx, f: Field, src: string): string {
  const v = `${src}.${goName(f.name)}`;
  if (f.nullable) return `${lowerFirst(pgNullable[f.type][0].replace('pgtype.', ''))}Ptr(${v})`;
  switch (f.type) {
    case 'enum': return `domain.${enumType(c, f)}(${v})`;
    case 'date': case 'timestamptz': return `${v}.Time`;
    default: return v;
  }
}

function postgresFile(c: Ctx): string {
  const nullableKinds = [...new Set(c.fields.filter((f) => f.nullable).map((f) => f.type))];
  const usesTime = nullableKinds.some((k) => k === 'date' || k === 'timestamptz');
  const helpers = nullableKinds.map((k) => {
    const [pg, member] = pgNullable[k];
    const base = lowerFirst(pg.replace('pgtype.', ''));
    const goT = { text: 'string', enum: 'string', int64: 'int64', bool: 'bool', date: 'time.Time', timestamptz: 'time.Time' }[k];
    return `func ${base}Of(v *${goT}) ${pg} {
\tif v == nil {
\t\treturn ${pg}{}
\t}
\treturn ${pg}{${member}: *v, Valid: true}
}

func ${base}Ptr(v ${pg}) *${goT} {
\tif !v.Valid {
\t\treturn nil
\t}
\tout := v.${member}
\treturn &out
}
`;
  });
  // Nullable enums are rejected by the spec loader, so enum helpers never need a domain cast.
  const params = c.fields.map((f) => `\t\t${goName(f.name)}: ${toPg(c, f, 'f')},`).join('\n');
  const mapped = c.fields.map((f) => `\t\t\t${goName(f.name)}: ${fromPg(c, f, 'r')},`).join('\n');
  return `// Package postgres implements the ${c.ctx} context's ports on Postgres.
package postgres

import (
\t"context"
\t"errors"
${usesTime ? '\t"time"\n' : ''}
\t"github.com/google/uuid"
\t"github.com/jackc/pgx/v5"
\t"github.com/jackc/pgx/v5/pgtype"
\t"github.com/jackc/pgx/v5/pgxpool"

\t"${c.module}/internal/${c.ctx}/adapters/postgres/sqlcgen"
\t"${c.module}/internal/${c.ctx}/domain"
\t"${c.module}/internal/${c.ctx}/ports"
)

type ${c.P} struct {
\tq *sqlcgen.Queries
}

var _ ports.${c.E}Repository = (*${c.P})(nil)

func New${c.P}(pool *pgxpool.Pool) *${c.P} {
\treturn &${c.P}{q: sqlcgen.New(pool)}
}

func (s *${c.P}) Create(ctx context.Context, f domain.${c.E}Fields) (domain.${c.E}, error) {
\trow, err := s.q.Create${c.E}(ctx, sqlcgen.Create${c.E}Params{
${params}
\t})
\tif err != nil {
\t\treturn domain.${c.E}{}, err
\t}
\treturn toDomain(row), nil
}

func (s *${c.P}) Get(ctx context.Context, id uuid.UUID) (domain.${c.E}, error) {
\trow, err := s.q.Get${c.E}(ctx, pgtype.UUID{Bytes: id, Valid: true})
\tif errors.Is(err, pgx.ErrNoRows) {
\t\treturn domain.${c.E}{}, domain.Err${c.E}NotFound
\t}
\tif err != nil {
\t\treturn domain.${c.E}{}, err
\t}
\treturn toDomain(row), nil
}

func (s *${c.P}) List(ctx context.Context, after *ports.${c.E}Key, limit int) ([]domain.${c.E}, error) {
\t// limit is bounded by app.MaxPageSize, so it fits int32.
\targ := sqlcgen.List${c.P}Params{RowLimit: int32(limit)}
\tif after != nil {
\t\targ.AfterCreatedAt = pgtype.Timestamptz{Time: after.CreatedAt, Valid: true}
\t\targ.AfterID = pgtype.UUID{Bytes: after.ID, Valid: true}
\t}
\trows, err := s.q.List${c.P}(ctx, arg)
\tif err != nil {
\t\treturn nil, err
\t}
\tout := make([]domain.${c.E}, len(rows))
\tfor i, r := range rows {
\t\tout[i] = toDomain(r)
\t}
\treturn out, nil
}

func toDomain(r sqlcgen.${c.E}) domain.${c.E} {
\treturn domain.${c.E}{
\t\tID: r.ID.Bytes,
\t\t${c.E}Fields: domain.${c.E}Fields{
${mapped}
\t\t},
\t\tCreatedAt: r.CreatedAt.Time,
\t\tUpdatedAt: r.UpdatedAt.Time,
\t}
}
${helpers.length ? '\n' + helpers.join('\n') : ''}`;
}

// ---------- Go: HTTP handler ----------

function handlerFile(c: Ctx): string {
  const usesDate = c.fields.some((f) => f.type === 'date');
  const fromBody: string[] = [];
  const after: string[] = [];
  for (const f of c.fields) {
    const G = goName(f.name);
    const A = apiName(f.name);
    const b = `b.${A}`;
    if (f.default !== undefined) {
      const def = f.type === 'enum' ? `domain.${enumType(c, f)}(${goLit(f.default)})` : goLit(f.default);
      const val = f.type === 'enum' ? `domain.${enumType(c, f)}(*${b})` : f.type === 'date' ? `${b}.Time` : `*${b}`;
      fromBody.push(`\t\t${G}: ${def},`);
      after.push(`\tif ${b} != nil {\n\t\tfields.${G} = ${val}\n\t}`);
    } else if (f.nullable) {
      if (f.type === 'date') after.push(`\tif ${b} != nil {\n\t\td := ${b}.Time\n\t\tfields.${G} = &d\n\t}`);
      else fromBody.push(`\t\t${G}: ${b},`);
    } else {
      const val = f.type === 'enum' ? `domain.${enumType(c, f)}(${b})` : f.type === 'date' ? `${b}.Time` : b;
      fromBody.push(`\t\t${G}: ${val},`);
    }
  }
  const toApi: string[] = [];
  const toApiAfter: string[] = [];
  for (const f of c.fields) {
    const G = goName(f.name);
    const A = apiName(f.name);
    const v = `x.${G}`;
    if (f.nullable) {
      if (f.type === 'date') toApiAfter.push(`\tif ${v} != nil {\n\t\tout.${A} = &openapi_types.Date{Time: *${v}}\n\t}`);
      else if (f.type === 'timestamptz') toApiAfter.push(`\tif ${v} != nil {\n\t\tt := ${v}.UTC()\n\t\tout.${A} = &t\n\t}`);
      else toApi.push(`\t\t${A}: ${v},`);
    } else {
      const val = f.type === 'enum' ? `gen.${enumType(c, f)}(${v})` : f.type === 'date' ? `openapi_types.Date{Time: ${v}}` : f.type === 'timestamptz' ? `${v}.UTC()` : v;
      toApi.push(`\t\t${A}: ${val},`);
    }
  }
  const pointers = c.fields.filter(constrained).map((f) => `\tdomain.Field${goName(f.name)}: "/${f.name}",`);
  const words = snakeOf(c.E).replace(/_/g, ' ');
  return `// Package http adapts the ${c.ctx} context's use cases to the generated strict server.
package http

import (
\t"context"
\t"errors"
\t"net/http"
${usesDate ? '\n\topenapi_types "github.com/oapi-codegen/runtime/types"\n' : ''}
\t"${c.module}/internal/${c.ctx}/adapters/http/gen"
\t"${c.module}/internal/${c.ctx}/app"
\t"${c.module}/internal/${c.ctx}/domain"
)

type Handler struct {
\t${lowerFirst(c.P)} *app.${c.E}Service
}

var _ gen.StrictServerInterface = (*Handler)(nil)

func NewHandler(${lowerFirst(c.P)} *app.${c.E}Service) *Handler {
\treturn &Handler{${lowerFirst(c.P)}: ${lowerFirst(c.P)}}
}

func (h *Handler) Create${c.E}(ctx context.Context, req gen.Create${c.E}RequestObject) (gen.Create${c.E}ResponseObject, error) {
\t// The request validator rejects a missing body before this runs.
\tb := req.Body
\tfields := domain.${c.E}Fields{
${fromBody.join('\n')}
\t}
${after.join('\n')}${after.length ? '\n' : ''}\tx, err := h.${lowerFirst(c.P)}.Create(ctx, fields)
\tif v, ok := errors.AsType[*domain.ValidationError](err); ok {
\t\treturn gen.Create${c.E}422ApplicationProblemPlusJSONResponse{
\t\t\tUnprocessableEntityApplicationProblemPlusJSONResponse: validationProblem(v),
\t\t}, nil
\t}
\tif err != nil {
\t\treturn nil, err
\t}
\treturn gen.Create${c.E}201JSONResponse(toAPI(x)), nil
}

func (h *Handler) Get${c.E}(ctx context.Context, req gen.Get${c.E}RequestObject) (gen.Get${c.E}ResponseObject, error) {
\tx, err := h.${lowerFirst(c.P)}.Get(ctx, req.Id)
\tif errors.Is(err, domain.Err${c.E}NotFound) {
\t\treturn gen.Get${c.E}404ApplicationProblemPlusJSONResponse{
\t\t\tNotFoundApplicationProblemPlusJSONResponse: gen.NotFoundApplicationProblemPlusJSONResponse{
\t\t\t\tType:   "about:blank",
\t\t\t\tTitle:  "Not Found",
\t\t\t\tStatus: http.StatusNotFound,
\t\t\t\tDetail: ptr("no ${words} with id " + req.Id.String()),
\t\t\t},
\t\t}, nil
\t}
\tif err != nil {
\t\treturn nil, err
\t}
\treturn gen.Get${c.E}200JSONResponse(toAPI(x)), nil
}

func (h *Handler) List${c.P}(ctx context.Context, req gen.List${c.P}RequestObject) (gen.List${c.P}ResponseObject, error) {
\tvar limit int
\tif req.Params.Limit != nil {
\t\tlimit = *req.Params.Limit
\t}
\tvar cursor string
\tif req.Params.Cursor != nil {
\t\tcursor = *req.Params.Cursor
\t}
\tpage, err := h.${lowerFirst(c.P)}.List(ctx, limit, cursor)
\tif errors.Is(err, app.ErrInvalidCursor) {
\t\treturn gen.List${c.P}422ApplicationProblemPlusJSONResponse{
\t\t\tUnprocessableEntityApplicationProblemPlusJSONResponse: gen.UnprocessableEntityApplicationProblemPlusJSONResponse{
\t\t\t\tType:   "about:blank",
\t\t\t\tTitle:  "Validation failed",
\t\t\t\tStatus: http.StatusUnprocessableEntity,
\t\t\t\tErrors: &[]gen.FieldError{{Pointer: "/query/cursor", Detail: "is not a cursor returned by this endpoint"}},
\t\t\t},
\t\t}, nil
\t}
\tif err != nil {
\t\treturn nil, err
\t}
\tout := gen.List${c.P}200JSONResponse{Items: make([]gen.${c.E}, len(page.Items))}
\tfor i, x := range page.Items {
\t\tout.Items[i] = toAPI(x)
\t}
\tif page.NextCursor != "" {
\t\tout.NextCursor = &page.NextCursor
\t}
\treturn out, nil
}

// bodyPointers maps domain fields to their JSON pointer in New${c.E}, the
// same pointer shape the request validator reports.
var bodyPointers = map[string]string{
${pointers.join('\n')}
}

func validationProblem(v *domain.ValidationError) gen.UnprocessableEntityApplicationProblemPlusJSONResponse {
\terrs := make([]gen.FieldError, len(v.Fields))
\tfor i, f := range v.Fields {
\t\terrs[i] = gen.FieldError{Pointer: bodyPointers[f.Field], Detail: f.Detail}
\t}
\treturn gen.UnprocessableEntityApplicationProblemPlusJSONResponse{
\t\tType:   "about:blank",
\t\tTitle:  "Validation failed",
\t\tStatus: http.StatusUnprocessableEntity,
\t\tErrors: &errs,
\t}
}

func toAPI(x domain.${c.E}) gen.${c.E} {
\tout := gen.${c.E}{
\t\tId:        x.ID,
${toApi.join('\n')}
\t\tCreatedAt: x.CreatedAt.UTC(),
\t\tUpdatedAt: x.UpdatedAt.UTC(),
\t}
${toApiAfter.join('\n')}${toApiAfter.length ? '\n' : ''}\treturn out
}

func ptr[T any](v T) *T { return &v }
`;
}

// ---------- Go: module and integration tests ----------

function moduleFile(c: Ctx): string {
  const desc = c.spec.contextDescription ? `: ${lowerFirst(c.spec.contextDescription.replace(/\.$/, ''))}` : '';
  return `// Package ${c.ctx} is the ${c.ctx} bounded context${desc}.
//
// module.go is the only package other contexts and cmd/ may import from this
// context; everything below it is private to the context (enforced by depguard).
package ${c.ctx}

import (
\t"fmt"

\t"github.com/go-chi/chi/v5"
\t"github.com/jackc/pgx/v5/pgxpool"

\t${c.ctx}http "${c.module}/internal/${c.ctx}/adapters/http"
\t"${c.module}/internal/${c.ctx}/adapters/http/gen"
\t"${c.module}/internal/${c.ctx}/adapters/postgres"
\t"${c.module}/internal/${c.ctx}/app"
\t"${c.module}/internal/platform/httpapi"
)

type Module struct {
\thandler *${c.ctx}http.Handler
}

func New(pool *pgxpool.Pool) *Module {
\t${lowerFirst(c.P)} := app.New${c.E}Service(postgres.New${c.P}(pool))
\treturn &Module{handler: ${c.ctx}http.NewHandler(${lowerFirst(c.P)})}
}

// Routes attaches the context's routes to r inside their own group, validated
// against the context's tag-pruned spec.
func (m *Module) Routes(r chi.Router) error {
\tspec, err := gen.GetSpec()
\tif err != nil {
\t\treturn fmt.Errorf("${c.ctx}: load spec: %w", err)
\t}
\tr.Group(func(r chi.Router) {
\t\tr.Use(httpapi.RequestValidator(spec))
\t\tstrict := gen.NewStrictHandlerWithOptions(m.handler, nil, gen.StrictHTTPServerOptions{
\t\t\tRequestErrorHandlerFunc:  httpapi.StrictRequestError,
\t\t\tResponseErrorHandlerFunc: httpapi.StrictResponseError,
\t\t})
\t\tgen.HandlerWithOptions(strict, gen.ChiServerOptions{BaseRouter: r, ErrorHandlerFunc: httpapi.ParamBindError})
\t})
\treturn nil
}
`;
}

function goValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

function integrationTest(c: Ctx): string {
  const body = c.fields.map((f) => `\t\t${JSON.stringify(f.name)}: ${goValue(sample(c, f))},`).join('\n');
  const invalid: string[] = [];
  for (const f of c.fields) {
    const p = `/${f.name}`;
    if (required(f)) invalid.push(`\t\t{"missing ${f.name}", func(b map[string]any) { delete(b, ${JSON.stringify(f.name)}) }, ${JSON.stringify(p)}},`);
    if (f.type === 'text' && f.min !== undefined && f.min > 0) invalid.push(`\t\t{"${f.name} too short", func(b map[string]any) { b[${JSON.stringify(f.name)}] = strings.Repeat("x", ${f.min - 1}) }, ${JSON.stringify(p)}},`);
    if (f.type === 'text' && f.max !== undefined) invalid.push(`\t\t{"${f.name} too long", func(b map[string]any) { b[${JSON.stringify(f.name)}] = strings.Repeat("x", ${f.max + 1}) }, ${JSON.stringify(p)}},`);
    if (f.type === 'int64' && f.min !== undefined) invalid.push(`\t\t{"${f.name} below min", func(b map[string]any) { b[${JSON.stringify(f.name)}] = ${f.min - 1} }, ${JSON.stringify(p)}},`);
    if (f.type === 'int64' && f.max !== undefined) invalid.push(`\t\t{"${f.name} above max", func(b map[string]any) { b[${JSON.stringify(f.name)}] = ${f.max + 1} }, ${JSON.stringify(p)}},`);
    if (f.type === 'enum') invalid.push(`\t\t{"${f.name} unknown", func(b map[string]any) { b[${JSON.stringify(f.name)}] = "UNKNOWN" }, ${JSON.stringify(p)}},`);
  }
  invalid.push(`\t\t{"unknown property", func(b map[string]any) { b["not_a_field"] = 1 }, ""},`);
  const needsStrings = invalid.some((l) => l.includes('strings.Repeat'));
  const base = `/${c.ctx}/${c.table}`;
  return `package ${c.ctx}_test

import (
\t"bytes"
\t"encoding/json"
\t"fmt"
\t"maps"
\t"net/http"
\t"net/http/httptest"
${needsStrings ? '\t"strings"\n' : ''}\t"testing"

\t"${c.module}/internal/${c.ctx}"
\t"${c.module}/internal/platform/httpapi"
\t"${c.module}/internal/platform/testdb"
)

// newServer serves the context through the same router, validator and
// generated handlers as production, on a real migrated database.
func newServer(t *testing.T) *httptest.Server {
\tt.Helper()
\tr := httpapi.NewRouter()
\tif err := ${c.ctx}.New(testdb.New(t)).Routes(r); err != nil {
\t\tt.Fatal(err)
\t}
\tsrv := httptest.NewServer(r)
\tt.Cleanup(srv.Close)
\treturn srv
}

// validBody is a request body that passes every rule.
func validBody() map[string]any {
\treturn map[string]any{
${body}
\t}
}

type problem struct {
\tStatus int \`json:"status"\`
\tErrors []struct {
\t\tPointer string \`json:"pointer"\`
\t} \`json:"errors"\`
}

// do sends a request and decodes the JSON response into out, failing the test
// unless the status is want.
func do(t *testing.T, method, url string, body any, want int, out any) {
\tt.Helper()
\tvar buf bytes.Buffer
\tif body != nil {
\t\tif err := json.NewEncoder(&buf).Encode(body); err != nil {
\t\t\tt.Fatal(err)
\t\t}
\t}
\treq, err := http.NewRequest(method, url, &buf)
\tif err != nil {
\t\tt.Fatal(err)
\t}
\tif body != nil {
\t\treq.Header.Set("Content-Type", "application/json")
\t}
\tresp, err := http.DefaultClient.Do(req)
\tif err != nil {
\t\tt.Fatal(err)
\t}
\tdefer resp.Body.Close()
\tvar raw json.RawMessage
\t_ = json.NewDecoder(resp.Body).Decode(&raw)
\tif resp.StatusCode != want {
\t\tt.Fatalf("%s %s: status = %d, want %d; body %s", method, url, resp.StatusCode, want, raw)
\t}
\tif want >= 400 {
\t\tif ct := resp.Header.Get("Content-Type"); ct != "application/problem+json" {
\t\t\tt.Errorf("Content-Type = %q, want application/problem+json", ct)
\t\t}
\t}
\tif out != nil {
\t\tif err := json.Unmarshal(raw, out); err != nil {
\t\t\tt.Fatalf("decode %s: %v", raw, err)
\t\t}
\t}
}

func TestCreateAndGet${c.E}(t *testing.T) {
\tsrv := newServer(t)
\tsent := validBody()

\tvar created map[string]any
\tdo(t, "POST", srv.URL+"${base}", sent, http.StatusCreated, &created)
\tfor _, k := range []string{"id", "created_at", "updated_at"} {
\t\tif s, _ := created[k].(string); s == "" {
\t\t\tt.Errorf("created[%q] = %v, want a value", k, created[k])
\t\t}
\t}
\tfor k, want := range sent {
\t\tif fmt.Sprint(created[k]) != fmt.Sprint(want) {
\t\t\tt.Errorf("created[%q] = %v, want %v", k, created[k], want)
\t\t}
\t}

\tvar got map[string]any
\tdo(t, "GET", srv.URL+"${base}/"+created["id"].(string), nil, http.StatusOK, &got)
\tif !maps.EqualFunc(got, created, func(a, b any) bool { return fmt.Sprint(a) == fmt.Sprint(b) }) {
\t\tt.Errorf("got = %v, want the created ${c.e} %v", got, created)
\t}
}

func TestCreate${c.E}RejectsInvalidBody(t *testing.T) {
\tsrv := newServer(t)

\ttests := []struct {
\t\tname        string
\t\tedit        func(map[string]any)
\t\twantPointer string
\t}{
${invalid.join('\n')}
\t}
\tfor _, tt := range tests {
\t\tt.Run(tt.name, func(t *testing.T) {
\t\t\tbody := validBody()
\t\t\ttt.edit(body)
\t\t\tvar p problem
\t\t\tdo(t, "POST", srv.URL+"${base}", body, http.StatusUnprocessableEntity, &p)
\t\t\tif tt.wantPointer == "" {
\t\t\t\treturn
\t\t\t}
\t\t\tfor _, e := range p.Errors {
\t\t\t\tif e.Pointer == tt.wantPointer {
\t\t\t\t\treturn
\t\t\t\t}
\t\t\t}
\t\t\tt.Errorf("errors = %+v, want pointer %s", p.Errors, tt.wantPointer)
\t\t})
\t}
}

func TestGetUnknown${c.E}(t *testing.T) {
\tsrv := newServer(t)
\tdo(t, "GET", srv.URL+"${base}/00000000-0000-4000-8000-000000000000", nil, http.StatusNotFound, nil)
}

func TestList${c.P}Paginates(t *testing.T) {
\tsrv := newServer(t)
\tfor range 3 {
\t\tdo(t, "POST", srv.URL+"${base}", validBody(), http.StatusCreated, nil)
\t}

\ttype page struct {
\t\tItems      []map[string]any \`json:"items"\`
\t\tNextCursor *string          \`json:"next_cursor"\`
\t}
\tvar first page
\tdo(t, "GET", srv.URL+"${base}?limit=2", nil, http.StatusOK, &first)
\tif len(first.Items) != 2 || first.NextCursor == nil {
\t\tt.Fatalf("first page: %d items, cursor %v; want 2 items and a cursor", len(first.Items), first.NextCursor)
\t}
\tvar second page
\tdo(t, "GET", srv.URL+"${base}?limit=2&cursor="+*first.NextCursor, nil, http.StatusOK, &second)
\tif len(second.Items) != 1 || second.NextCursor != nil {
\t\tt.Fatalf("second page: %d items, cursor %v; want 1 item and no cursor", len(second.Items), second.NextCursor)
\t}
\tif second.Items[0]["id"] == first.Items[0]["id"] || second.Items[0]["id"] == first.Items[1]["id"] {
\t\tt.Errorf("second page repeats an item from the first")
\t}
}

func TestList${c.P}RejectsForeignCursor(t *testing.T) {
\tsrv := newServer(t)
\tdo(t, "GET", srv.URL+"${base}?cursor=bm90LWEtY3Vyc29y", nil, http.StatusUnprocessableEntity, nil)
}
`;
}

// ---------- Bruno ----------

function bruno(c: Ctx): Record<string, string> {
  const base = `{{baseUrl}}/${c.ctx}/${c.table}`;
  const body = JSON.stringify(Object.fromEntries(c.fields.map((f) => [f.name, sample(c, f)])), null, 2)
    .split('\n').map((l) => '  ' + l).join('\n');
  const idVar = `${c.e}Id`;
  return {
    [`create-${snakeOf(c.E).replace(/_/g, '-')}.bru`]: `meta {
  name: Create ${snakeOf(c.E).replace(/_/g, ' ')}
  type: http
  seq: 1
}

post {
  url: ${base}
  body: json
  auth: none
}

body:json {
${body}
}

assert {
  res.status: eq 201
  res.body.id: isString
}

script:post-response {
  bru.setVar("${idVar}", res.body.id);
}
`,
    [`get-${snakeOf(c.E).replace(/_/g, '-')}.bru`]: `meta {
  name: Get ${snakeOf(c.E).replace(/_/g, ' ')}
  type: http
  seq: 2
}

get {
  url: ${base}/{{${idVar}}}
  body: none
  auth: none
}

assert {
  res.status: eq 200
  res.body.id: eq {{${idVar}}}
}
`,
    [`list-${c.table.replace(/_/g, '-')}.bru`]: `meta {
  name: List ${c.table.replace(/_/g, ' ')}
  type: http
  seq: 3
}

get {
  url: ${base}?limit=20
  body: none
  auth: none
}

params:query {
  limit: 20
}

assert {
  res.status: eq 200
  res.body.items: isArray
}
`,
  };
}

// ---------- wiring edits ----------

function patchSqlc(c: Ctx, src: string): string {
  return src.trimEnd() + `
  - name: ${c.ctx}
    engine: postgresql
    schema: migrations
    queries: internal/${c.ctx}/adapters/postgres/queries
    gen:
      go:
        package: sqlcgen
        out: internal/${c.ctx}/adapters/postgres/sqlcgen
        sql_package: pgx/v5
`;
}

function patchGolangci(c: Ctx, src: string): string {
  const rule = `        ${c.ctx}-private:
          files:
            - $all
            - "!**/internal/${c.ctx}/**"
          deny:
            - pkg: ${c.module}/internal/${c.ctx}/
              desc: import the ${c.ctx} context only through its module package (internal/${c.ctx})`;
  const lines = src.split('\n');
  const excl = lines.findIndex((l) => /^  exclusions:/.test(l));
  if (excl < 0) fail('.golangci.yml: no "exclusions:" section after the depguard rules');
  lines.splice(excl, 0, ...rule.split('\n'));
  let out = lines.join('\n');
  out = out.replace(/text: \(?([a-z0-9|]+)\)?-private/, (_m, names: string) => `text: (${[...names.split('|'), c.ctx].join('|')})-private`);
  return out;
}

function patchMain(c: Ctx, src: string): string {
  const imp = `\t"${c.module}/internal/${c.ctx}"`;
  const lines = src.split('\n');
  const own = lines.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith(`\t"${c.module}/internal/`));
  if (own.length === 0) fail('cmd/api/main.go: no internal imports found');
  const before = own.find(([l]) => l > imp);
  lines.splice(before ? before[1] : own[own.length - 1][1] + 1, 0, imp);
  const start = lines.findIndex((l) => /modules := \[\]module\{/.test(l));
  if (start < 0) fail('cmd/api/main.go: no "modules := []module{" list');
  const end = lines.findIndex((l, i) => i > start && /^\t\}\s*$/.test(l));
  lines.splice(end, 0, `\t\t${c.ctx}.New(pool),`);
  return lines.join('\n');
}

function oapiConfig(c: Ctx): string {
  return `# Paths are relative to ${c.svc}; run through scripts/gen.sh.
package: gen
output: internal/${c.ctx}/adapters/http/gen/${c.ctx}.gen.go
generate:
  models: true
  chi-server: true
  strict-server: true
  embedded-spec: true
output-options:
  include-tags: [${c.ctx}]
compatibility:
  # Enum constants become <Type><Value> so two enums in one context never
  # collide on a shared value.
  always-prefix-enum-values: true
`;
}

function nextMigration(svc: string, table: string): string {
  const dir = join(svc, 'migrations');
  const nums = readdirSync(dir).map((f) => /^(\d+)_/.exec(f)?.[1]).filter(Boolean).map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return join(dir, `${String(next).padStart(5, '0')}_create_${table}.sql`);
}

// ---------- main ----------

function plan(c: Ctx): { writes: Record<string, string>; edits: Record<string, (s: string) => string> } {
  const bc = join(c.svc, 'internal', c.ctx);
  if (existsSync(bc)) fail(`context ${c.ctx} already exists at ${bc}; adding an entity to an existing context is not supported yet`);
  const writes: Record<string, string> = {
    [nextMigration(c.svc, c.table)]: migration(c),
    [join(bc, 'adapters/postgres/queries', `${c.table}.sql`)]: queries(c),
    [join(bc, 'adapters/http/gen/oapi-codegen.yaml')]: oapiConfig(c),
    [join(bc, 'domain', `${snakeOf(c.E)}.go`)]: domainFile(c),
    [join(bc, 'domain', `${snakeOf(c.E)}_test.go`)]: domainTest(c),
    [join(bc, 'ports/ports.go')]: portsFile(c),
    [join(bc, 'app', `${c.table}.go`)]: appFile(c),
    [join(bc, 'adapters/postgres', `${c.table}.go`)]: postgresFile(c),
    [join(bc, 'adapters/http/handler.go')]: handlerFile(c),
    [join(bc, 'module.go')]: moduleFile(c),
    [join(bc, `${c.table}_test.go`)]: integrationTest(c),
  };
  for (const [name, content] of Object.entries(bruno(c))) writes[join(c.svc, 'api/bruno', c.ctx, name)] = content;
  const edits = {
    [join(c.svc, 'api/openapi.yaml')]: (s: string) => patchOpenAPI(c, s),
    [join(c.svc, 'sqlc.yaml')]: (s: string) => patchSqlc(c, s),
    [join(c.svc, '.golangci.yml')]: (s: string) => patchGolangci(c, s),
    [join(c.svc, 'cmd/api/main.go')]: (s: string) => patchMain(c, s),
  };
  return { writes, edits };
}

function findService(arg?: string): string {
  if (arg) return arg;
  const services = existsSync('services') ? readdirSync('services').filter((d) => existsSync(join('services', d, 'api/openapi.yaml'))) : [];
  if (services.length !== 1) fail(`pass --service <dir>; found ${services.length} services with api/openapi.yaml`);
  return join('services', services[0]);
}

function main() {
  const [cmd, specPath, ...rest] = process.argv.slice(2);
  if (!['check', 'scaffold'].includes(cmd ?? '') || !specPath) {
    console.error('usage: node slice.ts check|scaffold <spec.json> [--service <dir>]');
    process.exit(2);
  }
  const si = rest.indexOf('--service');
  const svc = findService(si >= 0 ? rest[si + 1] : undefined);
  const c = derive(loadSpec(specPath), svc);
  const { writes, edits } = plan(c);
  for (const p of Object.keys(writes)) if (existsSync(p)) fail(`${p} already exists`);
  for (const p of Object.keys(edits)) if (!existsSync(p)) fail(`${p} not found`);
  // Run every edit before writing anything, so a failing edit leaves the tree untouched.
  const edited = Object.fromEntries(Object.entries(edits).map(([p, fn]) => [p, fn(readFileSync(p, 'utf8'))]));

  if (cmd === 'check') {
    console.log(`ok: ${c.E} in new context ${c.ctx} (${svc})`);
    for (const p of Object.keys(writes)) console.log(`  create ${relative('.', p)}`);
    for (const p of Object.keys(edits)) console.log(`  edit   ${relative('.', p)}`);
    return;
  }
  for (const [p, content] of Object.entries(writes)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  for (const [p, content] of Object.entries(edited)) writeFileSync(p, content);
  const goFiles = [...Object.keys(writes), ...Object.keys(edited)].filter((p) => p.endsWith('.go'));
  const fmt = spawnSync('gofmt', ['-w', ...goFiles], { stdio: 'inherit' });
  if (fmt.status !== 0) console.warn('slice: gofmt did not run cleanly; format the Go files before linting');
  console.log(`scaffolded ${c.E} in context ${c.ctx}: ${Object.keys(writes).length} files created, ${Object.keys(edits).length} edited`);
  console.log('next: run the codegen (mise run gen), then go build ./... and the context tests');
}

main();
