#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-gabedalmolin/grantledger-platform}"
PROJECT_NUMBER="${PROJECT_NUMBER:-6}"
PROJECT_OWNER="${PROJECT_OWNER:-john-dalmolin}"
BASE_BRANCH="${BASE_BRANCH:-main}"
MERGE_METHOD="${MERGE_METHOD:-squash}" # squash|merge|rebase|none
WATCH_CHECKS=1
DELETE_BRANCH=1
CLOSE_ISSUE=1
SYNC_MAIN=1
DRY_RUN="${DRY_RUN:-0}"

PR_NUMBER=""
ISSUE_NUMBER=""
PROJECT_OWNER_USED="$PROJECT_OWNER"
PROJECT_ID=""
STATUS_FIELD_ID=""
DONE_OPTION_ID=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/delivery-closeout.sh --pr <PR_NUMBER> [options]

Required:
  --pr <number>                Pull request number

Optional:
  --issue <number>             Issue number (auto-detected from "Closes #N" when omitted)
  --repo <slug>                Repository slug (default: gabedalmolin/grantledger-platform)
  --project <number>           Project number (default: 6)
  --owner <owner>              Project owner (default: john-dalmolin, fallback @me)
  --base <branch>              Base branch to sync locally (default: main)
  --merge-method <value>       squash|merge|rebase|none (default: squash)
  --no-watch-checks            Skip waiting for PR checks
  --keep-branch                Do not delete remote branch on merge
  --no-close-issue             Do not close issue automatically
  --no-sync-main               Do not switch/pull local base branch
  --dry-run                    Print planned actions without changing remote state
  -h, --help                   Show this help
USAGE
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
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

run_or_echo() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: $*"
  else
    "$@"
  fi
}

project_item_add() {
  local url="$1"
  local owner_try="$PROJECT_OWNER_USED"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: gh project item-add $PROJECT_NUMBER --owner $owner_try --url $url"
    return 0
  fi

  if gh_retry_run gh project item-add "$PROJECT_NUMBER" --owner "$owner_try" --url "$url" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$owner_try" != "$PROJECT_OWNER" ]]; then
    if gh_retry_run gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$url" >/dev/null 2>&1; then
      PROJECT_OWNER_USED="$PROJECT_OWNER"
      return 0
    fi
  fi

  if [[ "$owner_try" != "@me" && "$PROJECT_OWNER" != "@me" ]]; then
    if gh_retry_run gh project item-add "$PROJECT_NUMBER" --owner "@me" --url "$url" >/dev/null 2>&1; then
      PROJECT_OWNER_USED="@me"
      return 0
    fi
  fi

  return 1
}

detect_issue_from_body() {
  local body="$1"
  local first_match

  first_match="$(printf '%s' "$body" | grep -Eio 'closes[[:space:]]+#[0-9]+' | head -n1 || true)"
  if [[ -z "$first_match" ]]; then
    return 1
  fi

  printf '%s' "$first_match" | tr -dc '0-9'
}

project_capture_json() {
  local command_name="$1"
  shift
  local out

  if out=$(gh_retry_capture gh project "$command_name" "$PROJECT_NUMBER" --owner "$PROJECT_OWNER_USED" "$@" --format json); then
    printf '%s' "$out"
    return 0
  fi

  if [[ "$PROJECT_OWNER_USED" != "$PROJECT_OWNER" ]]; then
    if out=$(gh_retry_capture gh project "$command_name" "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" "$@" --format json); then
      PROJECT_OWNER_USED="$PROJECT_OWNER"
      printf '%s' "$out"
      return 0
    fi
  fi

  if [[ "$PROJECT_OWNER_USED" != "@me" && "$PROJECT_OWNER" != "@me" ]]; then
    if out=$(gh_retry_capture gh project "$command_name" "$PROJECT_NUMBER" --owner "@me" "$@" --format json); then
      PROJECT_OWNER_USED="@me"
      printf '%s' "$out"
      return 0
    fi
  fi

  fail "Unable to read Project #$PROJECT_NUMBER metadata."
}

mark_item_done() {
  local url="$1"
  local item_name="$2"
  local items_json item_id current_status

  if ! project_item_add "$url"; then
    echo "WARN: Could not add $item_name to Project #$PROJECT_NUMBER."
  fi

  items_json="$(project_capture_json item-list --limit 500)"
  item_id="$(printf '%s' "$items_json" | jq -r --arg URL "$url" '.items[]? | select((.content.url // "") == $URL) | .id' | head -n1)"
  current_status="$(printf '%s' "$items_json" | jq -r --arg URL "$url" '.items[]? | select((.content.url // "") == $URL) | .status // ""' | head -n1)"

  if [[ -z "$item_id" ]]; then
    echo "WARN: Could not resolve project item for $item_name ($url)."
    return 0
  fi

  if [[ "$current_status" == "Done" ]]; then
    echo "OK: $item_name already Done"
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: $item_name status ${current_status:-<empty>} -> Done"
    return 0
  fi

  gh_retry_run gh project item-edit \
    --id "$item_id" \
    --project-id "$PROJECT_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --single-select-option-id "$DONE_OPTION_ID" >/dev/null

  echo "OK: $item_name status ${current_status:-<empty>} -> Done"
}

while [[ $# -gt 0 ]]; do
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
    --project)
      PROJECT_NUMBER="${2:-}"
      shift 2
      ;;
    --owner)
      PROJECT_OWNER="${2:-}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --merge-method)
      MERGE_METHOD="${2:-}"
      shift 2
      ;;
    --no-watch-checks)
      WATCH_CHECKS=0
      shift 1
      ;;
    --keep-branch)
      DELETE_BRANCH=0
      shift 1
      ;;
    --no-close-issue)
      CLOSE_ISSUE=0
      shift 1
      ;;
    --no-sync-main)
      SYNC_MAIN=0
      shift 1
      ;;
    --dry-run)
      DRY_RUN=1
      shift 1
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

PROJECT_OWNER_USED="$PROJECT_OWNER"

[[ -n "$PR_NUMBER" ]] || fail "Missing required --pr"
case "$MERGE_METHOD" in
  squash|merge|rebase|none) ;;
  *) fail "Invalid --merge-method '$MERGE_METHOD'. Use squash|merge|rebase|none." ;;
esac

need gh
need jq
need git
need grep

PROJECT_JSON="$(project_capture_json view)"
FIELDS_JSON="$(project_capture_json field-list)"
PROJECT_ID="$(printf '%s' "$PROJECT_JSON" | jq -r '.id // empty')"
STATUS_FIELD_ID="$(printf '%s' "$FIELDS_JSON" | jq -r '.fields[]? | select(.name == "Status") | .id' | head -n1)"
DONE_OPTION_ID="$(printf '%s' "$FIELDS_JSON" | jq -r '.fields[]? | select(.name == "Status") | .options[]? | select(.name == "Done") | .id' | head -n1)"

[[ -n "$PROJECT_ID" ]] || fail "Could not resolve Project ID."
[[ -n "$STATUS_FIELD_ID" ]] || fail "Could not resolve Project 'Status' field."
[[ -n "$DONE_OPTION_ID" ]] || fail "Could not resolve Project 'Done' option."

PR_JSON="$(gh_retry_capture gh pr view "$PR_NUMBER" --repo "$REPO" --json number,state,url,body,headRefName,mergeCommit)"
PR_URL="$(printf '%s' "$PR_JSON" | jq -r '.url')"
PR_STATE="$(printf '%s' "$PR_JSON" | jq -r '.state')"
PR_BODY="$(printf '%s' "$PR_JSON" | jq -r '.body // ""')"
MERGE_SHA="$(printf '%s' "$PR_JSON" | jq -r '.mergeCommit.oid // ""')"

if [[ -z "$ISSUE_NUMBER" ]]; then
  ISSUE_NUMBER="$(detect_issue_from_body "$PR_BODY" || true)"
fi

if [[ "$PR_STATE" == "OPEN" && "$WATCH_CHECKS" -eq 1 ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: gh pr checks $PR_NUMBER --repo $REPO --watch"
  else
    gh pr checks "$PR_NUMBER" --repo "$REPO" --watch || true
  fi
fi

if [[ "$PR_STATE" == "OPEN" && "$MERGE_METHOD" != "none" ]]; then
  merge_args=(gh pr merge "$PR_NUMBER" --repo "$REPO" "--$MERGE_METHOD")
  if [[ "$DELETE_BRANCH" -eq 1 ]]; then
    merge_args+=(--delete-branch)
  fi

  run_or_echo "${merge_args[@]}"
fi

if [[ "$DRY_RUN" != "1" ]]; then
  PR_JSON="$(gh_retry_capture gh pr view "$PR_NUMBER" --repo "$REPO" --json number,state,url,headRefName,mergeCommit)"
  PR_STATE="$(printf '%s' "$PR_JSON" | jq -r '.state')"
  MERGE_SHA="$(printf '%s' "$PR_JSON" | jq -r '.mergeCommit.oid // ""')"
fi

mark_item_done "$PR_URL" "PR #$PR_NUMBER"

if [[ -n "$ISSUE_NUMBER" ]]; then
  ISSUE_URL="https://github.com/$REPO/issues/$ISSUE_NUMBER"
  mark_item_done "$ISSUE_URL" "Issue #$ISSUE_NUMBER"

  if [[ "$CLOSE_ISSUE" -eq 1 ]]; then
    ISSUE_STATE="$(gh_retry_capture gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json state --jq '.state')"
    if [[ "$ISSUE_STATE" == "OPEN" ]]; then
      CLOSE_COMMENT=$(
        cat <<EOF
Closeout summary:
- Objective delivered via PR #$PR_NUMBER
- Merge SHA: ${MERGE_SHA:-n/a}
- Governance metadata synchronized
EOF
      )

      if [[ "$DRY_RUN" == "1" ]]; then
        echo "DRY_RUN: gh issue close $ISSUE_NUMBER --repo $REPO --comment \"${CLOSE_COMMENT//$'\n'/\\n}\""
      else
        gh_retry_run gh issue close "$ISSUE_NUMBER" --repo "$REPO" --comment "$CLOSE_COMMENT" >/dev/null
      fi
    fi
  fi

fi

if [[ "$SYNC_MAIN" -eq 1 ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: git switch $BASE_BRANCH && git pull --ff-only origin $BASE_BRANCH"
  else
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "Local working tree has changes; skipping local sync for $BASE_BRANCH."
    else
      current_branch="$(git branch --show-current)"
      if [[ "$current_branch" != "$BASE_BRANCH" ]]; then
        git switch "$BASE_BRANCH"
      fi
      git pull --ff-only origin "$BASE_BRANCH"
    fi
  fi
fi

echo
echo "Closeout complete."
echo "PR:    $PR_URL"
echo "State: $PR_STATE"
if [[ -n "$ISSUE_NUMBER" ]]; then
  echo "Issue: https://github.com/$REPO/issues/$ISSUE_NUMBER"
else
  echo "Issue: <not detected>"
fi
if [[ -n "$MERGE_SHA" ]]; then
  echo "Merge SHA: $MERGE_SHA"
fi
