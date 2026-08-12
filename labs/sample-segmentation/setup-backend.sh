#!/bin/sh
set -eu
# PATTERN C - BACKEND PRE-START HOOK (idempotent)
data_file=/var/lib/internal-backend/records.txt
log_file=/var/log/internal-backend.log
[ -f "${data_file}" ] || cp /opt/lab/seed/seed.txt "${data_file}"
touch "${log_file}"
chown proxyadmin:proxyadmin "${data_file}" "${log_file}"
chmod 0644 "${data_file}" "${log_file}"
