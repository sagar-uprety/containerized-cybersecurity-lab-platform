#!/bin/sh
set -eu

CONFIG_FILE="${APP_CONFIG_FILE:-/app/config/app-config.env}"

mkdir -p "$(dirname "${CONFIG_FILE}")"
if [ ! -f "${CONFIG_FILE}" ]; then
  cp /app/defaults/app-config.env "${CONFIG_FILE}"
fi

exec python /app/app.py
