#!/bin/sh
set -eu
# PATTERN D - SERVICE PRE-START HOOK (idempotent)
data_file=/var/lib/records-service/records.txt
log_file=/var/log/records-service.log
[ -f "${data_file}" ] || cp /opt/lab/seed/seed.txt "${data_file}"
touch "${log_file}"
chown recadmin:recadmin /etc/records-service/config.env "${data_file}" "${log_file}"
chmod 0644 /etc/records-service/config.env "${data_file}" "${log_file}"
