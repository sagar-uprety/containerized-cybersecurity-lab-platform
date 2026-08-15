#!/bin/sh
set -eu

mkdir -p /lab/demo-app
chown appuser:appuser /lab/demo-app

if [ ! -f /lab/demo-app/app-config.env ]; then
  printf 'DB_USER=%s\n' "${DB_USER:-app_user}" > /lab/demo-app/app-config.env
  printf 'DB_PASSWORD=%s\n' "${DB_PASSWORD:-app-demo-password}" >> /lab/demo-app/app-config.env
  chown appuser:appuser /lab/demo-app/app-config.env
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec python3 /app/app.py
fi
