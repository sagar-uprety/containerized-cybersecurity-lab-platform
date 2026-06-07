#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
    exec "$@"
else
    exec python /app/app.py
fi
