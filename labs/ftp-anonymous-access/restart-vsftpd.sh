#!/bin/sh
set -e

# /etc/vsftpd-staging is the volume also mounted on the workstation at
# /lab/ftp, where students edit vsftpd.conf directly. vsftpd itself refuses
# to trust a config file that is not root-owned and not world-writable, so
# it never reads that staging copy - apply it to the private, always
# root-owned live path first, then restart against the live path.
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
