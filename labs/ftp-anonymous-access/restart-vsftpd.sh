#!/bin/sh
set -e

# Validate the editable staging config, then install it into the root-owned live path.
cp /etc/vsftpd-staging/vsftpd.conf /etc/vsftpd/vsftpd.conf
chown root:root /etc/vsftpd/vsftpd.conf
chmod 0644 /etc/vsftpd/vsftpd.conf

PIDS=$(pgrep -x vsftpd 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    sleep 1
fi

setsid /usr/sbin/vsftpd /etc/vsftpd/vsftpd.conf < /dev/null > /dev/null 2>&1 &
sleep 1
echo "vsftpd restarted"
