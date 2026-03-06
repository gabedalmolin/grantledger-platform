#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-gabedalmolin/grantledger-platform}"
PROJECT_NUMBER="${PROJECT_NUMBER:-6}"
PROJECT_OWNER="${PROJECT_OWNER:-john-dalmolin}"
BASE_BRANCH="${BASE_BRANCH:-main}"
DEFAULT_LABEL="${DEFAULT_LABEL:-Architecture Hardening}"
RUN_GATES=1

ISSUE_NUMBER=""
ISSUE_TITLE=""
ISSUE_BODY_FILE=""
PR_TITLE=""
PR_BODY_FILE=""
BRANCH="$(git branch --show-current)"

usage() {
  echo "Usage:"
  echo "  $0 [--issue-number N | --issue-title T --issue-body FILE] --pr-title T --pr-body FILE [--branch B] [--skip-gates]"
  exit 1
}

require_file() {
  local f="$1"
  [[ -f "$f" ]] || { echo "File not found: $f"; exit 1; }
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue-number) ISSUE_NUMBER="$2"; shift 2 ;;
    --issue-title) ISSUE_TITLE="$2"; shift 2 ;;
    --issue-body) ISSUE_BODY_FILE="$2"; shift 2 ;;
    --pr-title) PR_TITLE="$2"; shift 2 ;;
    --pr-body) PR_BODY_FILE="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --skip-gates) RUN_GATES=0; shift 1 ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

[[ -n "$PR_TITLE" && -n "$PR_BODY_FILE" ]] || usage
require_file "$PR_BODY_FILE"

if [[ -n "$ISSUE_BODY_FILE" ]]; then
  require_file "$ISSUE_BODY_FILE"
fi

if [[ -z "$ISSUE_NUMBER" && ( -z "$ISSUE_TITLE" || -z "$ISSUE_BODY_FILE" ) ]]; then
  usage
fi

if [[ "$RUN_GATES" -eq 1 ]]; then
  npm run quality:gate
  if [[ -n "${DATABASE_URL:-}" ]]; then
    npm run test:pg
  else
    echo "DATABASE_URL not set: skipping npm run test:pg"
  fi
fi

if [[ -z "$ISSUE_NUMBER" ]]; then
  ISSUE_URL="$(gh issue create --repo "$REPO" --title "$ISSUE_TITLE" --body-file "$ISSUE_BODY_FILE")"
  ISSUE_NUMBER="${ISSUE_URL##*/}"
else
  if [[ -n "$ISSUE_BODY_FILE" ]]; then
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --body-file "$ISSUE_BODY_FILE" >/dev/null
  fi
fi

gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "https://github.com/$REPO/issues/$ISSUE_NUMBER" >/dev/null || true

DRY_RUN=1 ONLY_OPEN=1 ./scripts/project-sync-issue-metadata.sh "$ISSUE_NUMBER"
ONLY_OPEN=1 ./scripts/project-sync-issue-metadata.sh "$ISSUE_NUMBER"

ASSIGNEE="$(gh api user -q .login)"
gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-assignee "$ASSIGNEE" >/dev/null || true

if gh label list --repo "$REPO" --limit 200 | cut -f1 | grep -Fxq "$DEFAULT_LABEL"; then
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$DEFAULT_LABEL" >/dev/null || true
fi

TMP_PR_BODY="$(mktemp)"
cp "$PR_BODY_FILE" "$TMP_PR_BODY"
if ! grep -Eq "Closes[[:space:]]+#$ISSUE_NUMBER" "$TMP_PR_BODY"; then
  printf "\nCloses #%s\n" "$ISSUE_NUMBER" >> "$TMP_PR_BODY"
fi

EXISTING_PR_NUMBER="$(gh pr list --repo "$REPO" --base "$BASE_BRANCH" --head "$BRANCH" --state open --json number --jq '.[0].number // ""')"

if [[ -n "$EXISTING_PR_NUMBER" ]]; then
  gh pr edit "$EXISTING_PR_NUMBER" --repo "$REPO" --title "$PR_TITLE" --body-file "$TMP_PR_BODY" >/dev/null
  PR_NUMBER="$EXISTING_PR_NUMBER"
else
  PR_URL="$(gh pr create --repo "$REPO" --base "$BASE_BRANCH" --head "$BRANCH" --title "$PR_TITLE" --body-file "$TMP_PR_BODY")"
  PR_NUMBER="${PR_URL##*/}"
fi

if [[ -x ./scripts/pr-metadata-sync.sh ]]; then
  ./scripts/pr-metadata-sync.sh --pr "$PR_NUMBER" --issue "$ISSUE_NUMBER"
else
  ./scripts/project-sync-pr-metadata.sh "$PR_NUMBER"
fi

echo "Issue: https://github.com/$REPO/issues/$ISSUE_NUMBER"
echo "PR:    https://github.com/$REPO/pull/$PR_NUMBER"
