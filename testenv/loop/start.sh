#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/../config/testenv.env" ] && set -a && source "$ROOT/../config/testenv.env" && set +a
export TESTENV_EXECUTOR_MODE="${TESTENV_EXECUTOR_MODE:-MOCK}"
if [ "$TESTENV_EXECUTOR_MODE" != "MOCK" ]; then
  echo "REFUSE: only MOCK authorized in testenv" >&2
  exit 2
fi
mkdir -p "$ROOT/data"
PIDFILE="$ROOT/data/server.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "already_running pid=$(cat "$PIDFILE")"
  exit 0
fi
nohup node "$ROOT/server.cjs" >"$ROOT/data/stdout.log" 2>"$ROOT/data/stderr.log" &
echo $! >"$PIDFILE"
sleep 0.3
if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "start_failed" >&2
  cat "$ROOT/data/stderr.log" >&2 || true
  exit 1
fi
echo "started pid=$(cat "$PIDFILE") mode=MOCK"
