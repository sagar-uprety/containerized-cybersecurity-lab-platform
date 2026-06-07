#!/bin/sh
set -eu

# Ensure the shared config directory exists (volume may shadow the image dir)
mkdir -p /lab/demo-app
chown appuser:appuser /lab/demo-app

# Create default config if missing, so the app can start before the student writes the real one
if [ ! -f /lab/demo-app/app-config.env ]; then
  printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASSWORD:-}" > /lab/demo-app/app-config.env
  chown appuser:appuser /lab/demo-app/app-config.env
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec python /app/app.py
fi
