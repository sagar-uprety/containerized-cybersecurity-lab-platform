#!/bin/sh
set -eu

mkdir -p /lab/demo-app
chown appuser:appuser /lab/demo-app

if [ ! -f /lab/demo-app/app-config.env ]; then
  printf 'REDIS_USERNAME=%s\n' "${REDIS_USERNAME:-}" > /lab/demo-app/app-config.env
  printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASSWORD:-}" >> /lab/demo-app/app-config.env
  chown appuser:appuser /lab/demo-app/app-config.env
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec python /app/app.py
fi
