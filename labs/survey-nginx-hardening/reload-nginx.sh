#!/bin/sh
set -eu
# SURVEY LAB - NARROW NGINX RELOAD HELPER
# Validate the configuration first, then reload only nginx.
nginx -t
nginx -s reload
printf '%s\n' 'nginx configuration reloaded'
