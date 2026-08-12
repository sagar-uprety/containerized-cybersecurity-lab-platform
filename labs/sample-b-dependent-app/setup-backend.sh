#!/bin/sh
set -eu
# PATTERN B - BACKEND PRE-START HOOK (idempotent)
data_file=/var/lib/records-backend/records.txt
log_file=/var/log/records-backend.log
[ -f "${data_file}" ] || cp /opt/lab/seed/seed.txt "${data_file}"
touch "${log_file}"
chown appadmin:appadmin /etc/records-backend/config.env "${data_file}" "${log_file}"
chmod 0644 /etc/records-backend/config.env "${data_file}" "${log_file}"
