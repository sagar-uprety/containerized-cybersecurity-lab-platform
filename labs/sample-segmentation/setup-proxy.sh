#!/bin/sh
set -eu
# PATTERN C - PROXY PRE-START HOOK (idempotent)
log_file=/var/log/edge-proxy.log
touch "${log_file}"
chown proxyadmin:proxyadmin /etc/edge-proxy/config.env "${log_file}"
chmod 0644 /etc/edge-proxy/config.env "${log_file}"
