#!/bin/sh
set -eu
# PATTERN B - NARROW APP RELOAD HELPER
# Validate the app config, then signal only the app process.
config=/etc/records-app/config.env
pid_file=/run/records-app.pid
grep -Eq '^BACKEND_URL=.+$' "${config}"
grep -q '^BACKEND_TOKEN=' "${config}"
test -s "${pid_file}"
kill -HUP "$(cat "${pid_file}")"
printf '%s\n' 'Records app configuration reloaded'
