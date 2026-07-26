#!/bin/sh
set -eu

# Postfix keeps ownership of its package-managed queue tree. Only the lab's
# shared main.cf is writable so the workstation user can remediate it.
chown root:root /etc/postfix/main.cf
chmod 0666 /etc/postfix/main.cf
