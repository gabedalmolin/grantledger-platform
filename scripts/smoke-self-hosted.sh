#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/self-hosted/docker-compose.yml"
ENV_FILE="$ROOT_DIR/deploy/self-hosted/.env"
DEFAULT_ENV_FILE="$ROOT_DIR/deploy/self-hosted/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$DEFAULT_ENV_FILE"
fi

set -a
source "$ENV_FILE"
set +a

API_PORT="${API_PORT:-3000}"
API_HOST_PORT="${API_HOST_PORT:-13000}"
WORKER_METRICS_PORT="${WORKER_METRICS_PORT:-9464}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
GRAFANA_PORT="${GRAFANA_PORT:-3001}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

print_failure_context() {
  echo
  echo "Self-hosted smoke validation failed. Recent stack state:"
  compose ps || true
  echo
  compose logs --tail=200 || true
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-60}"
  local delay="${4:-2}"

  for ((i=1; i<=attempts; i++)); do
    if curl --fail --silent --show-error "$url" >/tmp/grantledger-smoke-response.txt 2>/tmp/grantledger-smoke-error.txt; then
      return 0
    fi
    sleep "$delay"
  done

  echo "Timed out waiting for $name at $url" >&2
  cat /tmp/grantledger-smoke-error.txt >&2 || true
  return 1
}

wait_for_service_exit_code() {
  local service="$1"
  local expected_exit_code="$2"
  local attempts="${3:-60}"
  local delay="${4:-2}"
  local container_id=""

  for ((i=1; i<=attempts; i++)); do
    container_id="$(compose ps -a -q "$service")"
    if [[ -n "$container_id" ]]; then
      local status
      status="$(docker inspect -f '{{.State.Status}}:{{.State.ExitCode}}' "$container_id")"
      if [[ "$status" == "exited:${expected_exit_code}" ]]; then
        return 0
      fi
    fi
    sleep "$delay"
  done

  echo "Timed out waiting for $service to exit with code $expected_exit_code" >&2
  if [[ -n "$container_id" ]]; then
    docker inspect "$container_id" >&2 || true
  fi
  return 1
}

assert_contains() {
  local file="$1"
  local expected="$2"

  if ! grep -Fq "$expected" "$file"; then
    echo "Expected to find '$expected' in $file" >&2
    return 1
  fi
}

compose down --remove-orphans >/dev/null 2>&1 || true
compose up -d --build

if ! wait_for_service_exit_code migrate 0; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "API health" "http://127.0.0.1:${API_HOST_PORT}/healthz"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "API readiness" "http://127.0.0.1:${API_HOST_PORT}/readyz"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "API metrics" "http://127.0.0.1:${API_HOST_PORT}/metrics"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "Worker health" "http://127.0.0.1:${WORKER_METRICS_PORT}/healthz"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "Worker metrics" "http://127.0.0.1:${WORKER_METRICS_PORT}/metrics"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "Prometheus readiness" "http://127.0.0.1:${PROMETHEUS_PORT}/-/ready"; then
  print_failure_context
  exit 1
fi

if ! wait_for_http "Grafana health" "http://127.0.0.1:${GRAFANA_PORT}/api/health"; then
  print_failure_context
  exit 1
fi

curl --fail --silent --show-error "http://127.0.0.1:${API_HOST_PORT}/metrics" >/tmp/grantledger-api-metrics.txt
curl --fail --silent --show-error "http://127.0.0.1:${WORKER_METRICS_PORT}/metrics" >/tmp/grantledger-worker-metrics.txt

assert_contains /tmp/grantledger-api-metrics.txt "grantledger_api_http_requests_total"
assert_contains /tmp/grantledger-worker-metrics.txt "grantledger_worker_cycles_total"

if ! compose ps --services --status running | grep -qx worker; then
  echo "Worker service is not running" >&2
  print_failure_context
  exit 1
fi

echo "Self-hosted smoke validation completed successfully."
echo "The stack is still running. Use 'docker compose -f deploy/self-hosted/docker-compose.yml --env-file deploy/self-hosted/.env down --remove-orphans' to stop it."
