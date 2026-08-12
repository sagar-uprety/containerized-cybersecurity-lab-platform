#!/bin/sh
set -eu
# PATTERN C - NARROW PROXY RELOAD HELPER
config=/etc/edge-proxy/config.env
pid_file=/run/edge-proxy.pid
grep -Eq '^PROXY_MODE=(open|restricted)$' "${config}"
grep -Eq '^BACKEND_URL=.+$' "${config}"
test -s "${pid_file}"
kill -HUP "$(cat "${pid_file}")"
printf '%s\n' 'Edge proxy configuration reloaded'
