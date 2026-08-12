#!/bin/sh
set -eu
# PATTERN D - NARROW RELOAD HELPER
config=/etc/records-service/config.env
pid_file=/run/records-service.pid
grep -Eq '^ACCESS_CONTROL=(enabled|disabled)$' "${config}"
grep -Eq '^AUTHORIZED_TOKEN=.+$' "${config}"
test -s "${pid_file}"
kill -HUP "$(cat "${pid_file}")"
printf '%s\n' 'Records service configuration reloaded'
