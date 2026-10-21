#!/usr/bin/env bash
# Runs the ao-sdlc-audit scanner on a throwaway sdd-layout feature and checks the statuses.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
audit="$root/.claude/skills/ao-sdlc-audit/scripts/audit.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q
git config user.email test@example.com
git config user.name test
commit() { GIT_AUTHOR_DATE="$1T12:00:00" GIT_COMMITTER_DATE="$1T12:00:00" git commit -q -m "$1"; }

f=docs/features/demo
mkdir -p "$f/adr" "$f/contracts" "$f/migrations" "$f/tasks" "$f/_review" app/migrations
fm() { printf -- '---\nstatus: %s\nupdated_at: "%s"\nfeature_size: M\n---\n\n# %s\n\nline\nline\nline\n' "$1" "$2" "$3"; }

fm Approved 2026-07-01 Spec > "$f/spec.md"
fm Living 2026-07-01 Context > "$f/CONTEXT.md"
printf '\n## Glossary\n\n- term — one meaning. NOT other: another meaning.\n' >> "$f/CONTEXT.md"
{ fm Approved 2026-07-02 SAD; echo "Deployment: see Confluence HLD (not copied here)."; } > "$f/sad.md"
fm Accepted 2026-07-02 ADR-1 > "$f/adr/0001-a.md"
fm Proposed 2026-07-02 ADR-2 > "$f/adr/0002-b.md"
fm Approved 2026-07-03 Model > "$f/data-model.md"
echo "CREATE TABLE t (id int);" > "$f/migrations/0001_t.up.sql"
printf 'openapi: 3.1.0\ninfo:\n  title: demo\n  version: 0.1.0\npaths: {}\n' > "$f/contracts/openapi.yaml"
printf '# Sync\n\nRun at: 2026-07-04\n\n- [x] fields\n- [x] errors\n- [x] ACs\n\nVerdict: in sync.\n' > "$f/contracts/api-sync-report.md"
cat > "$f/tasks.json" <<'EOF'
{"slug": "demo", "tasks": [
  {"id": "T1", "files_hint": ["docs/features/demo/migrations/0001_t.up.sql"]},
  {"id": "T2", "files_hint": ["app/http/handler.go"]}
]}
EOF
printf '| # | Task | Status |\n|---|---|---|\n| T1 | a | done |\n| T2 | b | review |\n' > "$f/tasks/tracker.md"
printf -- '---\nstatus: PASS\ndate: "2026-07-10"\n---\n\nGate: PASS\n' > "$f/_review/review-2026-07-10.md"
cp "$f/migrations/0001_t.up.sql" app/migrations/
mkdir -p app/http && echo "package http" > app/http/handler.go
git add -A && commit 2026-07-05

# Post-review change in the live migration tree only.
echo "ALTER TABLE t ADD COLUMN c int;" > app/migrations/0002_c.up.sql
git add -A && commit 2026-07-20

out="$(bash "$audit" "$f")"

fail=0
expect() { # artifact, status, optional note fragment
  local row
  row="$(printf '%s\n' "$out" | awk -F'\t' -v a="$1" '$1 == a')"
  if [ "$(printf '%s' "$row" | cut -f2)" != "$2" ]; then
    echo "FAIL $1: want $2, got: $row"; fail=1
  elif [ -n "${3:-}" ] && ! printf '%s' "$row" | grep -qF "$3"; then
    echo "FAIL $1: note lacks '$3': $row"; fail=1
  fi
}

expect idea-brief N/A
expect PRD PRESENT
expect sad PRESENT "point to an external doc"
expect adr/ INCOMPLETE "0002-b"
expect data-model STALE "code changed 2026-07-20"
expect openapi STALE "derived from stale"
expect api-sync-report STALE "derived from stale"
expect tasks/ STALE "tracker: 1/2 done"
expect gates INCONSISTENT "PASS does not cover it"

[ "$fail" -eq 0 ] || { printf '%s\n' "$out"; exit 1; }
echo "ok ao-sdlc-audit"
