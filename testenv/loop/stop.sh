#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/data/server.pid"
if [ ! -f "$PIDFILE" ]; then
  echo "not_running"
  exit 0
fi
PID="$(cat "$PIDFILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill -TERM "$PID" || true
  for i in 1 2 3 4 5; do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.2
  done
  kill -0 "$PID" 2>/dev/null && kill -KILL "$PID" || true
fi
rm -f "$PIDFILE" "$ROOT/data/runtime.json"
echo "stopped"
