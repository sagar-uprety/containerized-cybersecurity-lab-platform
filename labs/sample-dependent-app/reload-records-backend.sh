#!/bin/sh
set -eu
# PATTERN B - NARROW BACKEND RELOAD HELPER
# Validate the backend config, then signal only the backend process.
config=/etc/records-backend/config.env
pid_file=/run/records-backend.pid
grep -Eq '^ACCESS_CONTROL=(enabled|disabled)$' "${config}"
grep -Eq '^AUTHORIZED_TOKEN=.+$' "${config}"
test -s "${pid_file}"
kill -HUP "$(cat "${pid_file}")"
printf '%s\n' 'Records backend configuration reloaded'
