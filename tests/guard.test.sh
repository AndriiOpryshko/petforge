#!/usr/bin/env bash
# Feeds PreToolUse payloads to hooks/guard.sh and checks which edits it blocks and logs.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="$root/hooks/guard.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
git init -q -b feature-2/demo
git config user.email test@example.com
git config user.name test
echo "# LOG" > LOG.md
git add LOG.md && git commit -q -m init
svc="$tmp/services/core/internal"

fails=0
# expect <want exit> <name> <tool_input json>
expect() {
  local want="$1" name="$2" payload got
  payload="$(jq -n --arg cwd "$tmp" --argjson ti "$3" '{tool_name: "Edit", cwd: $cwd, tool_input: $ti}')"
  set +e
  "$guard" <<< "$payload" 2> /dev/null
  got=$?
  set -e
  if [ "$got" = "$want" ]; then echo "ok   $name"; else echo "FAIL $name: exit $got, want $want"; fails=$((fails + 1)); fi
}

mod=example.com/app/services/core
expect 2 "generated go file" "{\"file_path\": \"$svc/finance/adapters/http/gen/finance.gen.go\", \"new_string\": \"x\"}"
expect 2 "sqlc output" "{\"file_path\": \"$svc/finance/adapters/postgres/sqlcgen/models.go\", \"content\": \"x\"}"
expect 2 "orval output" "{\"file_path\": \"$tmp/apps/web/src/api/gen/model/x.ts\", \"content\": \"x\"}"
expect 2 "cross-context sub-package" "{\"file_path\": \"$svc/governance/app/meetings.go\", \"new_string\": \"import \\\"$mod/internal/finance/domain\\\"\"}"
expect 2 "cross-context from cmd" "{\"file_path\": \"$tmp/services/core/cmd/api/main.go\", \"new_string\": \"\\\"$mod/internal/finance/app\\\"\"}"
expect 2 "pgx in domain" "{\"file_path\": \"$svc/finance/domain/contract.go\", \"content\": \"import (\\n\\t\\\"github.com/jackc/pgx/v5\\\"\\n)\"}"
expect 2 "multi-edit import" "{\"file_path\": \"$svc/governance/module.go\", \"edits\": [{\"old_string\": \"a\", \"new_string\": \"\\\"$mod/internal/finance/ports\\\"\"}]}"
expect 0 "module package of another context" "{\"file_path\": \"$tmp/services/core/cmd/api/main.go\", \"new_string\": \"\\\"$mod/internal/finance\\\"\"}"
expect 0 "own context sub-package" "{\"file_path\": \"$svc/finance/app/contracts.go\", \"new_string\": \"\\\"$mod/internal/finance/domain\\\"\"}"
expect 0 "platform package" "{\"file_path\": \"$svc/finance/module.go\", \"new_string\": \"\\\"$mod/internal/platform/httpapi\\\"\"}"
expect 0 "uuid in domain" "{\"file_path\": \"$svc/finance/domain/contract.go\", \"content\": \"import \\\"github.com/google/uuid\\\"\"}"
expect 0 "domain test may import more" "{\"file_path\": \"$svc/finance/domain/contract_test.go\", \"content\": \"import \\\"github.com/stretchr/testify\\\"\"}"
expect 0 "non-go file" "{\"file_path\": \"$tmp/README.md\", \"content\": \"\\\"$mod/internal/finance/domain\\\"\"}"

logged="$(grep -c '| F2 | hook | blocked' LOG.md || true)"
if [ "$logged" = 7 ]; then echo "ok   7 blocks logged as F2"; else echo "FAIL logged $logged blocks, want 7"; fails=$((fails + 1)); fi

[ "$fails" = 0 ] || { echo "guard: $fails failing"; exit 1; }
echo "guard: all passed"
