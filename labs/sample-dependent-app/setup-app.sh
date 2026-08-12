#!/bin/sh
set -eu
# PATTERN B - APP PRE-START HOOK (idempotent)
log_file=/var/log/records-app.log
touch "${log_file}"
chown appadmin:appadmin /etc/records-app/config.env "${log_file}"
chmod 0644 /etc/records-app/config.env "${log_file}"
