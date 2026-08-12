#!/bin/sh
set -eu
# SURVEY LAB - PRE-START HOOK (idempotent)
mkdir -p /var/log/nginx
touch /var/log/nginx/access.log /var/log/nginx/error.log
chmod 0666 /var/log/nginx/access.log /var/log/nginx/error.log
chown -R nginxadmin:nginxadmin /etc/nginx/conf.d 2>/dev/null || true
