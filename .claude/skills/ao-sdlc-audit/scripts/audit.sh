#!/usr/bin/env bash
# Inspect one feature folder and print the status of the 9 SDLC artifacts as TSV.
#
# Usage: audit.sh <feature-dir> [--code <artifact>=<path>]...
#   <artifact> is one of: data-model, openapi, api-sync-report, tasks, any
#   Example: audit.sh docs/features/billing --code data-model=migrations --code openapi=internal/http
#
# Code paths are resolved in this order: --code flags, <feature-dir>/.audit-paths
# (lines "<artifact>: <path>"), then files_hint entries from tasks.json.
#
# Output columns: artifact, status, path, date, basis, notes
#   status: PRESENT | MISSING | STALE | INCOMPLETE | EXTERNAL | N/A
# Layout is detected: sdlc (idea-brief.md + PRD.md) or sdd (spec.md).
# Bash 3.2 compatible (stock macOS).

set -u

feature_dir="${1:-}"
if [ -z "$feature_dir" ] || [ ! -d "$feature_dir" ]; then
  echo "usage: audit.sh <feature-dir> [--code <artifact>=<path>]..." >&2
  exit 2
fi
shift
feature_dir="$(cd "$feature_dir" && pwd)"
repo_root="$(git -C "$feature_dir" rev-parse --show-toplevel 2>/dev/null || echo "$feature_dir")"

code_specs=""
while [ $# -gt 0 ]; do
  case "$1" in
    --code) code_specs="$code_specs
$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$code_specs" ] && [ -f "$feature_dir/.audit-paths" ]; then
  code_specs="$(sed -n 's/^\([a-z-]*\):[[:space:]]*\(.*\)$/\1=\2/p' "$feature_dir/.audit-paths")"
  code_source=".audit-paths"
elif [ -n "$code_specs" ]; then
  code_source="--code"
else
  code_source="tasks.json files_hint"
fi

# --- helpers ---------------------------------------------------------------

# First existing path among the arguments (relative to feature dir).
first_existing() {
  for p in "$@"; do
    if [ -e "$feature_dir/$p" ]; then echo "$p"; return; fi
  done
}

frontmatter_field() { # file field
  awk -v f="$2" 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit}
    NR>1 { split($0, kv, ":"); if (kv[1]==f) { sub("^[^:]*:[[:space:]]*", ""); gsub(/"/, ""); print; exit } }' "$1"
}

git_date() { # path relative to repo or absolute
  git -C "$repo_root" log -1 --format=%cs -- "$1" 2>/dev/null
}

mtime_date() { date -r "$1" +%F 2>/dev/null; }

# Content date of one file: frontmatter updated_at, else last git commit, else mtime.
# Sets: d_date, d_basis, d_note
file_date() {
  local f="$1" fm g
  d_note=""
  fm="$(frontmatter_field "$f" updated_at | cut -c1-10)"
  g="$(git_date "$f")"
  if [ -n "$fm" ]; then
    d_date="$fm"; d_basis="updated_at"
    if [ -n "$g" ] && [[ "$g" > "$fm" ]]; then d_note="updated_at not bumped (git $g)"; fi
  elif fm="$(grep -m1 -oE '(Run at|Generated at|generated_at)[^0-9]*[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')" && [ -n "$fm" ]; then
    d_date="$fm"; d_basis="run-at"
  elif [ -n "$g" ]; then
    d_date="$g"; d_basis="git"
  else
    d_date="$(mtime_date "$f")"; d_basis="mtime"
  fi
}

# Newest content date across files of a directory (top level *.md, *.json, *.yaml).
dir_date() {
  local best="" bb="" f
  for f in "$1"/*.md "$1"/*.json "$1"/*.yaml; do
    [ -f "$f" ] || continue
    file_date "$f"
    if [ -z "$best" ] || [[ "$d_date" > "$best" ]]; then best="$d_date"; bb="$d_basis"; fi
  done
  d_date="$best"; d_basis="$bb"; d_note=""
}

# Code paths for an artifact kind, newline-separated.
code_paths_for() {
  local kind="$1"
  if [ "$code_source" != "tasks.json files_hint" ]; then
    printf '%s\n' "$code_specs" | grep -E "^($kind|any)=" | sed 's/^[^=]*=//'
    return
  fi
  local tj
  tj="$(first_existing tasks/tasks.json tasks.json)"
  [ -n "$tj" ] || return
  local hints
  hints="$(grep -o '"files_hint"[^]]*]' "$feature_dir/$tj" | grep -o '"[^"]*"' | tr -d '"' | grep -v '^files_hint$' | sort -u)"
  # sdd stages migrations under docs/features/<slug>/migrations/ and implement promotes them
  # into the live tree; the staged copy never changes again, so track the live dirs instead.
  local live=""
  if printf '%s\n' "$hints" | grep -q '^docs/features/.*/migrations/'; then
    live="$(git -C "$repo_root" ls-files '*.sql' | grep -E '(^|/)migrations?/' | grep -v '^docs/' \
      | while IFS= read -r f; do dirname "$f"; done | sort -u)"
    hints="$(printf '%s\n' "$hints" | grep -v '^docs/features/.*/migrations/')"
  fi
  case "$kind" in
    data-model) printf '%s\n%s\n' "$hints" "$live" | grep -E '(^|/)migrations?(/|$)|\.sql$|schema' ;;
    openapi)    printf '%s\n' "$hints" | grep -Ei 'handler|http|api|route|controller' ;;
    tasks)      printf '%s\n%s\n' "$hints" "$live" ;;
  esac
}

# Newest git commit date across existing code paths. Sets c_date, c_found, c_missing.
code_date() {
  local p best="" g
  c_found=0; c_missing=0
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    if [ -e "$repo_root/$p" ]; then
      c_found=$((c_found + 1))
      g="$(git_date "$p")"
      [ -z "$g" ] && g="$(mtime_date "$repo_root/$p")"
      if [ -z "$best" ] || [[ "$g" > "$best" ]]; then best="$g"; fi
    else
      c_missing=$((c_missing + 1))
    fi
  done
  c_date="$best"
}

tbd_count() { grep -c 'TBD' "$1" 2>/dev/null || true; }

emit() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$@"; }

# Artifacts kept outside the repo, declared in <feature-dir>/.audit-external
# (lines "<artifact>: <where>", e.g. "sad: Confluence HLD page"). They are reported as
# EXTERNAL instead of MISSING: the script cannot check their content or dates.
emit_missing() { # id, path, note
  local ext=""
  [ -f "$feature_dir/.audit-external" ] && ext="$(sed -n "s#^$1:[[:space:]]*##p" "$feature_dir/.audit-external" | head -1)"
  if [ -n "$ext" ]; then
    emit "$1" "EXTERNAL" "-" "-" "-" "$ext - not checked; no copy in repo"
  else
    emit "$1" "MISSING" "$2" "-" "-" "$3"
  fi
}

join_notes() { # skip empty args, join with "; "
  local out="" n
  for n in "$@"; do [ -n "$n" ] && out="${out:+$out; }$n"; done
  echo "$out"
}

# Dates of artifacts already scanned, used for upstream comparisons.
date_of() { eval "echo \"\${DATE_$(echo "$1" | tr '-' '_')-}\""; }
remember() { eval "DATE_$(echo "$1" | tr '-' '_')=\"$2\"; BASIS_$(echo "$1" | tr '-' '_')=\"$3\""; }
basis_of() { eval "echo \"\${BASIS_$(echo "$1" | tr '-' '_')-}\""; }
remember_status() { eval "STATUS_$(echo "$1" | tr '-' '_')=\"$2\""; }
status_of() { eval "echo \"\${STATUS_$(echo "$1" | tr '-' '_')-}\""; }

# Lines that point to a document outside the repo, and the .audit-external entry if any.
external_refs() { # id, file
  local n ext=""
  n="$(grep -ciE 'atlassian\.net/[^ )|]|notion\.so/[^ )|]|docs\.google\.com/[^ )|]|sharepoint\.com/[^ )|]|(see|in|on) (the )?(confluence|notion)|confluence (hld|page)|not copied here' "$2" || true)"
  [ -f "$feature_dir/.audit-external" ] && ext="$(sed -n "s#^$1:[[:space:]]*##p" "$feature_dir/.audit-external" | head -1)"
  join_notes "${ext:+partly external: $ext}" "$([ "$n" -gt 0 ] && echo "$n line(s) point to an external doc")"
}

# Compare artifact date with upstream artifacts. Sets up_strong (same date basis)
# and up_weak (mixed basis, e.g. updated_at vs git: copy/rebase commits make git dates noisy).
upstream_reasons() {
  local mine="$1" mine_b="$2"; shift 2
  local up ud ub
  up_strong=""; up_weak=""
  for up in "$@"; do
    ud="$(date_of "$up")"; ub="$(basis_of "$up")"
    if [ -n "$ud" ] && [ -n "$mine" ] && [[ "$ud" > "$mine" ]]; then
      if [ "$ub" = "$mine_b" ] || { [ "$ub" != git ] && [ "$ub" != mtime ] && [ "$mine_b" != git ] && [ "$mine_b" != mtime ]; }; then
        up_strong="${up_strong:+$up_strong; }older than $up ($ud)"
      else
        up_weak="${up_weak:+$up_weak; }maybe older than $up ($ud, $ub vs $mine_b)"
      fi
    fi
  done
}

# sdlc plugin: idea-brief.md + PRD.md; sdd plugin: spec.md (idea + requirements in one file).
if [ -f "$feature_dir/spec.md" ] && [ ! -f "$feature_dir/PRD.md" ] && [ ! -f "$feature_dir/prd.md" ]; then
  layout="sdd"; req_file="spec.md"
else
  layout="sdlc"; req_file="PRD.md"
fi

size="$(tr -d '[:space:]' 2>/dev/null < "$feature_dir/.size")"
[ -z "$size" ] && size="$(frontmatter_field "$feature_dir/$req_file" feature_size 2>/dev/null)"

# --- per-artifact scan -----------------------------------------------------

scan_file() { # id, upstream-list, code-kind, candidate paths...
  local id="$1" ups="$2" ck="$3"; shift 3
  local p status notes reason code_reason="" tbd lines
  p="$(first_existing "$@")"
  if [ -z "$p" ]; then
    local opt=""
    case "$id" in
      data-model|api-sync-report) case "$size" in XS|S) opt="optional for $size if no DB change";; esac ;;
    esac
    emit_missing "$id" "$1" "$(join_notes "expected at $1" "$opt")"
    return
  fi
  file_date "$feature_dir/$p"
  remember "$id" "$d_date" "$d_basis"
  local fm_note="$d_note"
  # shellcheck disable=SC2086
  upstream_reasons "$d_date" "$d_basis" $ups
  reason="$up_strong"
  if [ -n "$ck" ]; then
    code_date < <(code_paths_for "$ck")
    if [ "$c_found" -gt 0 ] && [[ "$c_date" > "$d_date" ]]; then
      code_reason="code changed $c_date after artifact"
    elif [ "$c_found" -eq 0 ] && [ "$c_missing" -gt 0 ]; then
      code_reason="code paths not in repo ($c_missing hinted) - code staleness unchecked"
    fi
  fi
  status="PRESENT"
  [ -n "$reason" ] && status="STALE"
  case "$code_reason" in "code changed"*) status="STALE";; esac

  lines="$(grep -cv '^[[:space:]]*$' "$feature_dir/$p")"
  tbd="$(tbd_count "$feature_dir/$p")"
  local q=""
  [ "$lines" -lt 5 ] && { q="near-empty ($lines lines)"; status="INCOMPLETE"; }
  local st
  st="$(frontmatter_field "$feature_dir/$p" status 2>/dev/null)"
  local gate=""
  if [ "$id" = "idea-brief" ] && [ -n "$st" ] && [ "$st" != "Confirmed" ]; then
    gate="status $st, gate needs Confirmed"; [ "$status" = "PRESENT" ] && status="INCOMPLETE"
  fi
  local stnote=""
  [ -n "$st" ] && [ "$id" != "idea-brief" ] && stnote="status $st"
  local tbdnote=""
  [ "$tbd" -gt 0 ] && tbdnote="$tbd TBD marker(s)"
  # A report or contract derived from a stale artifact is stale too, whatever its date says.
  local up stale_up=""
  for up in $ups; do
    [ "$(status_of "$up")" = "STALE" ] && stale_up="${stale_up:+$stale_up, }$up"
  done
  if [ -n "$stale_up" ]; then
    [ "$status" = "PRESENT" ] && status="STALE"
    stale_up="derived from stale $stale_up"
  fi
  remember_status "$id" "$status"
  emit "$id" "$status" "$p" "$d_date" "$d_basis" "$(join_notes "$reason" "$up_weak" "$stale_up" "$code_reason" "$q" "$gate" "$stnote" "$tbdnote" "$(external_refs "$id" "$feature_dir/$p")" "$fm_note")"
}

scan_context() {
  local p where=""
  p="$(first_existing CONTEXT.md)"
  if [ -z "$p" ] && [ -f "$repo_root/CONTEXT.md" ]; then
    p="$repo_root/CONTEXT.md"; where="repo-root only"
  elif [ -n "$p" ]; then
    p="$feature_dir/$p"
  fi
  if [ -z "$p" ]; then
    emit_missing "CONTEXT" "CONTEXT.md" "no feature-level or repo-root glossary"
    return
  fi
  file_date "$p"
  local terms
  terms="$(awk '/^## /{g=($0 ~ /^## Glossary/)} g && /^- /{n++} END{print n+0}' "$p")"
  local reason="" status="PRESENT"
  local prd
  prd="$(date_of PRD)"
  # Glossary is living: flag only when it lags behind the newest of PRD / sad.
  local sad newest
  sad="$(date_of sad)"
  newest="$prd"; [[ "$sad" > "$newest" ]] && newest="$sad"
  if [ -n "$newest" ] && [[ "$newest" > "$d_date" ]]; then
    reason="glossary older than PRD/sad ($newest) - check new terms"; status="STALE"
  fi
  [ "$terms" -eq 0 ] && status="INCOMPLETE"
  emit "CONTEXT" "$status" "${p#"$feature_dir"/}" "$d_date" "$d_basis" "$(join_notes "$where" "$terms glossary terms" "$reason" "$d_note")"
}

scan_adr() {
  if [ ! -d "$feature_dir/adr" ] || [ -z "$(ls "$feature_dir"/adr/*.md 2>/dev/null)" ]; then
    emit_missing "adr/" "adr/" "no ADR files; for M+ expect 5-12, XS/S 2-4"
    return
  fi
  local n proposed f st
  n=0; proposed=""
  for f in "$feature_dir"/adr/*.md; do
    n=$((n + 1))
    st="$(frontmatter_field "$f" status)"
    [ -z "$st" ] && st="$(grep -m1 -i '^\*\*status' "$f" | sed 's/.*: *//')"
    case "$st" in Accepted|accepted|Superseded*|Deprecated*) ;; *) proposed="${proposed:+$proposed, }$(basename "$f" .md) ($st)";; esac
  done
  dir_date "$feature_dir/adr"
  local status="PRESENT" notes="$n ADR(s)"
  if [ -n "$proposed" ]; then status="INCOMPLETE"; notes="$notes; not Accepted: $proposed"; fi
  emit "adr/" "$status" "adr/" "$d_date" "$d_basis" "$notes"
}

scan_tasks() {
  if [ ! -d "$feature_dir/tasks" ]; then
    emit_missing "tasks/" "tasks/" "no tasks/ (tracker.md + tasks.json)"
    return
  fi
  dir_date "$feature_dir/tasks"
  local date="$d_date" basis="$d_basis" status="PRESENT" notes=""
  [ -f "$feature_dir/tasks/tracker.md" ] || { notes="no tracker.md"; status="INCOMPLETE"; }
  [ -f "$feature_dir/tasks/tasks.json" ] || [ -f "$feature_dir/tasks.json" ] || { notes="$(join_notes "$notes" "no tasks.json")"; status="INCOMPLETE"; }
  if [ -f "$feature_dir/tasks/tracker.md" ]; then
    local total done_n
    # A task row is any table row with a status cell; works for sdlc and sdd tracker layouts.
    total="$(grep -ciE '^\|.*\| *\**(todo|in_progress|in progress|blocked|review|done)\** *\|' "$feature_dir/tasks/tracker.md" || true)"
    done_n="$(grep -ciE '^\|.*\| *\**done\** *\|' "$feature_dir/tasks/tracker.md" || true)"
    TRACKER_TOTAL="$total"; TRACKER_DONE="$done_n"
    notes="$(join_notes "$notes" "tracker: $done_n/$total done")"
  fi
  local reason
  upstream_reasons "$date" "$basis" sad openapi
  reason="$up_strong"
  code_date < <(code_paths_for tasks)
  local code_reason=""
  if [ "$c_found" -gt 0 ] && [[ "$c_date" > "$date" ]]; then
    code_reason="code changed $c_date after tracker"
  elif [ "$c_found" -eq 0 ] && [ "$c_missing" -gt 0 ]; then
    code_reason="none of $c_missing hinted code paths exist in repo"
  fi
  if [ "$status" = "PRESENT" ]; then
    [ -n "$reason" ] && status="STALE"
    case "$code_reason" in "code changed"*) status="STALE";; esac
  fi
  emit "tasks/" "$status" "tasks/" "${date:--}" "${basis:--}" "$(join_notes "$notes" "$reason" "$up_weak" "$code_reason")"
}

# Order matters: upstream artifacts are scanned before downstream ones.
echo "# feature=$feature_dir layout=$layout size=${size:-unknown} code_paths_from=$code_source"
printf 'artifact\tstatus\tpath\tdate\tbasis\tnotes\n'
if [ "$layout" = "sdd" ] && [ ! -f "$feature_dir/idea-brief.md" ]; then
  emit "idea-brief" "N/A" "spec.md" "-" "-" "sdd layout: the idea lives in spec.md §1 (interview writes no file)"
else
  scan_file idea-brief "" "" idea-brief.md
fi
scan_file PRD "idea_brief" "" PRD.md prd.md spec.md
scan_file sad "PRD" "" sad.md SAD.md
scan_adr
scan_file data-model "sad PRD" data-model data-model.md
scan_file openapi "data_model" openapi contracts/openapi.yaml openapi.yaml contracts/openapi.yml
scan_file api-sync-report "openapi data_model" "" contracts/api-sync-report.md api-sync-report.md
scan_tasks
scan_context

# Cross-artifact gate consistency: a later gate must not be passed while an earlier one is open.
scan_gates() {
  local issues="" r v f prd_st
  r=""
  for f in "$feature_dir"/_review/review-*.md; do [ -f "$f" ] && r="$f"; done  # glob is sorted: last = newest
  if [ -n "$r" ]; then
    v="$(frontmatter_field "$r" status)"
    if [ "$v" = "PASS" ] && [ -n "${TRACKER_TOTAL-}" ] && [ "${TRACKER_DONE:-0}" -lt "$TRACKER_TOTAL" ]; then
      issues="$(join_notes "$issues" "review PASS ($(basename "$r")) but tracker $TRACKER_DONE/$TRACKER_TOTAL done")"
    fi
    # A PASS only covers the code that existed when it was given.
    local rd
    rd="$(frontmatter_field "$r" date | cut -c1-10)"
    [ -z "$rd" ] && rd="$(basename "$r" .md | sed 's/^review-//')"
    code_date < <(code_paths_for tasks)
    if [ "$v" = "PASS" ] && [ "$c_found" -gt 0 ] && [[ "$c_date" > "$rd" ]]; then
      issues="$(join_notes "$issues" "code changed $c_date after review $rd - PASS does not cover it")"
    fi
  fi
  prd_st="$(frontmatter_field "$feature_dir/$req_file" status 2>/dev/null)"
  if [ "$prd_st" = "Draft" ] && [ -n "$(date_of sad)" ]; then
    issues="$(join_notes "$issues" "$req_file still Draft while sad.md exists")"
  fi
  if [ -n "$issues" ]; then emit "gates" "INCONSISTENT" "-" "-" "-" "$issues"; else emit "gates" "OK" "-" "-" "-" ""; fi
}
scan_gates
