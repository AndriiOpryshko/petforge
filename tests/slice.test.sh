#!/usr/bin/env bash
# Runs scripts/slice.ts against a minimal fake service and checks what it writes and patches.
# Compiling the result needs the real toolchain; that is covered by using the plugin on spilno.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
slice="$root/scripts/slice.ts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

svc="$tmp/services/core"
mkdir -p "$svc/api" "$svc/cmd/api" "$svc/migrations" "$svc/internal/system"
echo "module example.com/app/services/core" > "$svc/go.mod"
cat > "$svc/api/openapi.yaml" <<'YAML'
openapi: 3.1.0
info: { title: t, version: 0.1.0 }
tags:
  - name: system
    description: Health.
paths:
  /system/health:
    get: { operationId: getHealth, tags: [system], responses: { "200": { description: ok } } }
components:
  schemas:
    Problem: { type: object }
YAML
printf 'version: "2"\nsql:\n  - name: system\n' > "$svc/sqlc.yaml"
cat > "$svc/.golangci.yml" <<'YAML'
linters:
  settings:
    depguard:
      rules:
        system-private:
          deny:
            - pkg: example.com/app/services/core/internal/system/
  exclusions:
    rules:
      - path: _test\.go
        text: system-private
YAML
cat > "$svc/cmd/api/main.go" <<'GO'
package main

import (
	"example.com/app/services/core/internal/platform/config"
	"example.com/app/services/core/internal/system"
)

func run() {
	modules := []module{
		system.New(pool),
	}
}
GO
echo "-- +goose Up" > "$svc/migrations/00001_init.sql"
cat > "$tmp/spec.json" <<'JSON'
{
  "context": "governance",
  "entity": "BoardMeeting",
  "fields": [
    { "name": "title", "type": "text", "min": 1, "max": 200 },
    { "name": "kind", "type": "enum", "values": ["REGULAR", "EXTRA"], "default": "REGULAR" },
    { "name": "held_at", "type": "timestamptz" },
    { "name": "minutes_url", "type": "text", "nullable": true }
  ]
}
JSON

cd "$tmp"
fails=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }

node "$slice" check spec.json > check.out
check "check lists the migration" "grep -q 'create services/core/migrations/00002_create_board_meetings.sql' check.out"
check "check writes nothing" "[ ! -d services/core/internal/governance ]"

node "$slice" scaffold spec.json > /dev/null
bc=services/core/internal/governance
for f in module.go board_meetings_test.go domain/board_meeting.go domain/board_meeting_test.go ports/ports.go \
  app/board_meetings.go adapters/postgres/board_meetings.go adapters/postgres/queries/board_meetings.sql \
  adapters/http/handler.go adapters/http/gen/oapi-codegen.yaml; do
  check "creates $f" "[ -s $bc/$f ]"
done
check "creates bruno requests" "[ \$(ls services/core/api/bruno/governance | wc -l) -eq 3 ]"
check "migration has enum check and default" "grep -q \"kind text NOT NULL DEFAULT 'REGULAR' CHECK (kind IN ('REGULAR', 'EXTRA'))\" services/core/migrations/00002_create_board_meetings.sql"
check "openapi tag" "grep -q '  - name: governance' services/core/api/openapi.yaml"
check "openapi paths before components" "awk '/\\/governance\\/board_meetings:/{p=NR} /^components:/{c=NR} END{exit !(p && p<c)}' services/core/api/openapi.yaml"
check "openapi enum schema" "grep -q '    BoardMeetingKind:' services/core/api/openapi.yaml"
check "openapi nullable text" "grep -q 'type: \\[string, \"null\"\\]' services/core/api/openapi.yaml"
check "sqlc entry" "grep -q 'out: internal/governance/adapters/postgres/sqlcgen' services/core/sqlc.yaml"
check "depguard rule" "grep -q 'governance-private:' services/core/.golangci.yml"
check "depguard test exclusion" "grep -q 'text: (system|governance)-private' services/core/.golangci.yml"
check "main imports context in order" "grep -n 'internal/' services/core/cmd/api/main.go | head -1 | grep -q governance"
check "main registers module" "grep -q 'governance.New(pool),' services/core/cmd/api/main.go"
check "second scaffold refuses existing context" "! node '$slice' scaffold spec.json 2> /dev/null"

[ "$fails" = 0 ] || { echo "slice: $fails failing"; exit 1; }
echo "slice: all passed"
