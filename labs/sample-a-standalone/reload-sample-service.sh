#!/bin/sh
set -eu

# SAMPLE NARROW ADMIN HELPER
# Validate first, then signal only the intended process. Replace this helper with
# the target service's supported reload/restart mechanism.

config=/etc/sample-service/config.env
pid_file=/run/sample-service.pid

grep -Eq '^ACCESS_CONTROL=(enabled|disabled)$' "${config}"
grep -Eq '^AUTHORIZED_TOKEN=.+$' "${config}"
test -s "${pid_file}"
kill -HUP "$(cat "${pid_file}")"
printf '%s\n' 'Sample service configuration reloaded'
