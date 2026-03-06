#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/pr-metadata-sync.sh --pr <number> --issue <number> [options]

Required:
  --pr <number>
  --issue <number>

Optional (defaults):
  --repo <slug>        gabe-dalmolin/grantledger-platform
  --owner <owner>      john-dalmolin
  --project <number>   6
  --milestone <name>   Architecture Improve
  --assignee <login>   john-dalmolin
  --label <name>       Architecture Hardening
  --status <value>     Review
  --priority <value>   P1
  --area <value>       platform
  --type <value>       architecture
  --wave <value>       Update
  --risk <value>       low
USAGE
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

gh_retry_capture() {
  local attempt=1
  local max=4
  local out
  local rc

  while true; do
    out=$("$@" 2>&1)
    rc=$?
    if [ "$rc" -eq 0 ]; then
      printf '%s' "$out"
      return 0
    fi

    if [ "$attempt" -ge "$max" ]; then
      printf '%s\n' "$out" >&2
      return "$rc"
    fi

    sleep $((attempt * 2))
    attempt=$((attempt + 1))
  done
}

gh_retry_run() {
  local attempt=1
  local max=4
  local rc

  while true; do
    if "$@"; then
      return 0
    fi
    rc=$?

    if [ "$attempt" -ge "$max" ]; then
      return "$rc"
    fi

    sleep $((attempt * 2))
    attempt=$((attempt + 1))
  done
}

sanitize_json() {
  tr -d '\000-\031'
}

project_capture_json() {
  local command_name="$1"
  shift
  local out

  if out=$(gh_retry_capture gh project "$command_name" "$PROJECT_NUMBER" --owner "$OWNER" "$@" --format json); then
    PROJECT_OWNER_USED="$OWNER"
    printf '%s' "$out"
    return 0
  fi

  if [ "$OWNER" != "@me" ]; then
    if out=$(gh_retry_capture gh project "$command_name" "$PROJECT_NUMBER" --owner "@me" "$@" --format json); then
      PROJECT_OWNER_USED="@me"
      printf '%s' "$out"
      return 0
    fi
  fi

  fail "Unable to read project metadata for project #$PROJECT_NUMBER"
}

project_add_item() {
  if gh_retry_run gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$PR_URL" >/dev/null 2>&1; then
    PROJECT_OWNER_USED="$OWNER"
    return 0
  fi

  if [ "$OWNER" != "@me" ]; then
    if gh_retry_run gh project item-add "$PROJECT_NUMBER" --owner "@me" --url "$PR_URL" >/dev/null 2>&1; then
      PROJECT_OWNER_USED="@me"
      return 0
    fi
  fi

  fail "Unable to add PR item to project #$PROJECT_NUMBER"
}

REPO="gabe-dalmolin/grantledger-platform"
OWNER="john-dalmolin"
PROJECT_NUMBER="6"
MILESTONE="Architecture Improve"
ASSIGNEE="john-dalmolin"
LABEL="Architecture Hardening"
STATUS_VALUE="Review"
PRIORITY_VALUE="P1"
AREA_VALUE="platform"
TYPE_VALUE="architecture"
WAVE_VALUE="Update"
RISK_VALUE="low"
PR_NUMBER=""
ISSUE_NUMBER=""
PROJECT_OWNER_USED="$OWNER"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pr)
      PR_NUMBER="${2:-}"
      shift 2
      ;;
    --issue)
      ISSUE_NUMBER="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --owner)
      OWNER="${2:-}"
      PROJECT_OWNER_USED="$OWNER"
      shift 2
      ;;
    --project)
      PROJECT_NUMBER="${2:-}"
      shift 2
      ;;
    --milestone)
      MILESTONE="${2:-}"
      shift 2
      ;;
    --assignee)
      ASSIGNEE="${2:-}"
      shift 2
      ;;
    --label)
      LABEL="${2:-}"
      shift 2
      ;;
    --status)
      STATUS_VALUE="${2:-}"
      shift 2
      ;;
    --priority)
      PRIORITY_VALUE="${2:-}"
      shift 2
      ;;
    --area)
      AREA_VALUE="${2:-}"
      shift 2
      ;;
    --type)
      TYPE_VALUE="${2:-}"
      shift 2
      ;;
    --wave)
      WAVE_VALUE="${2:-}"
      shift 2
      ;;
    --risk)
      RISK_VALUE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[ -n "$PR_NUMBER" ] || fail "Missing required --pr"
[ -n "$ISSUE_NUMBER" ] || fail "Missing required --issue"

for cmd in gh jq rg tr mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
done

PR_URL="https://github.com/${REPO}/pull/${PR_NUMBER}"

echo "Syncing PR metadata for ${PR_URL}"

gh_retry_run gh pr edit "$PR_NUMBER" --repo "$REPO" --milestone "$MILESTONE" --add-assignee "$ASSIGNEE" --add-label "$LABEL" >/dev/null

BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

gh_retry_capture gh pr view "$PR_NUMBER" --repo "$REPO" --json body --jq '.body // ""' > "$BODY_FILE"

if ! rg -q "Closes #${ISSUE_NUMBER}" "$BODY_FILE"; then
  printf '\n\nCloses #%s\n' "$ISSUE_NUMBER" >> "$BODY_FILE"
  gh_retry_run gh pr edit "$PR_NUMBER" --repo "$REPO" --body-file "$BODY_FILE" >/dev/null
fi

project_add_item

PROJECT_JSON=$(project_capture_json view | sanitize_json)
FIELDS_JSON=$(project_capture_json field-list | sanitize_json)
ITEMS_JSON=$(project_capture_json item-list --limit 200 | sanitize_json)

PROJECT_ID=$(printf '%s' "$PROJECT_JSON" | jq -r '.id // empty')
ITEM_ID=$(printf '%s' "$ITEMS_JSON" | jq -r --arg URL "$PR_URL" '.items[]? | select((.content.url // "") == $URL) | .id' | head -n1)

[ -n "$PROJECT_ID" ] || fail "Could not resolve PROJECT_ID"
[ -n "$ITEM_ID" ] || fail "Could not resolve ITEM_ID for ${PR_URL}"

set_project_field() {
  local field_name="$1"
  local field_value="$2"
  local field_json
  local field_id
  local option_id

  field_json=$(printf '%s' "$FIELDS_JSON" | jq -c --arg n "$field_name" '(.fields[]? // .[]?) | select(.name==$n)' | head -n1)
  [ -n "$field_json" ] || fail "Project field not found: ${field_name}"

  field_id=$(printf '%s' "$field_json" | jq -r '.id // empty')
  [ -n "$field_id" ] || fail "Project field id missing: ${field_name}"

  option_id=$(printf '%s' "$field_json" | jq -r --arg v "$field_value" '.options[]? | select(.name==$v) | .id' | head -n1)

  if [ -z "$option_id" ]; then
    echo "ERROR: Option '${field_value}' not found for field '${field_name}'. Available options:" >&2
    printf '%s' "$field_json" | jq -r '.options[]?.name' >&2
    exit 1
  fi

  gh_retry_run gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$field_id" --single-select-option-id "$option_id" >/dev/null
  echo "OK ${field_name}=${field_value}"
}

set_project_field "Status" "$STATUS_VALUE"
set_project_field "Priority" "$PRIORITY_VALUE"
set_project_field "Area" "$AREA_VALUE"
set_project_field "Type" "$TYPE_VALUE"
set_project_field "Wave" "$WAVE_VALUE"
set_project_field "Risk" "$RISK_VALUE"

echo
echo "PR metadata synchronized successfully."
echo "Project owner used: ${PROJECT_OWNER_USED}"
echo "Project ID: ${PROJECT_ID}"
echo "Item ID: ${ITEM_ID}"
echo
echo "PR summary:"
gh_retry_capture gh pr view "$PR_NUMBER" --repo "$REPO" --json number,title,url,milestone,assignees,labels --jq '{number,title,url,milestone:.milestone.title,assignees:[.assignees[].login],labels:[.labels[].name]}'
echo
echo "Project fields applied:"
echo "Status=${STATUS_VALUE}"
echo "Priority=${PRIORITY_VALUE}"
echo "Area=${AREA_VALUE}"
echo "Type=${TYPE_VALUE}"
echo "Wave=${WAVE_VALUE}"
echo "Risk=${RISK_VALUE}"
