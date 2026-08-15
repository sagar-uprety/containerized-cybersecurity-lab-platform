#!/bin/sh
set -eu

PROVISIONED_FLAG=/srv/ftp/.lab-provisioned
CERT_DIR=/etc/vsftpd/certs
CERT_FILE="${CERT_DIR}/vsftpd.pem"

mkdir -p /lab/access "${CERT_DIR}" /srv/ftp/pub /home/ftpuser /var/empty
chmod 0755 /var/empty

umask 077
cat > /lab/access/credentials.txt <<EOF
FTP host: ftp-host
Anonymous FTP: ftp://ftp-host/ (no credentials required)
Named FTP user: ftpuser
Named FTP password: ftp-demo-password
SSH admin user: ftpadmin
SSH admin password: ${SERVICE_ADMIN_PASSWORD}
EOF
chmod 0644 /lab/access/credentials.txt

# Self-signed TLS certificate for FTPS. Generated once on first boot rather
# than baked into the image, because the config volume (and therefore this
# certs directory) is empty until this hook populates it.
if [ ! -f "${CERT_FILE}" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
      -subj "/CN=ftp-host.lab.internal" \
      -keyout "${CERT_FILE}" -out "${CERT_FILE}" >/dev/null 2>&1
    chmod 0600 "${CERT_FILE}"
fi

touch /var/log/vsftpd.log

# anon_root itself (/srv/ftp) must stay non-writable - vsftpd refuses to
# serve a writable chroot root for anonymous sessions regardless of
# allow_writeable_chroot, which only covers non-anonymous chroots. The
# seeded, readable files live directly under /srv/ftp; the "pub" subdirectory
# is the separate writable dropbox anonymous uploads land in.
if [ ! -f "${PROVISIONED_FLAG}" ]; then
    echo 'ftpuser:ftp-demo-password' | chpasswd
    cat > /srv/ftp/README.txt <<'EOF'
Deployment package drop.
Upload new build artifacts to pub/; the release pipeline picks them up hourly.
EOF

    cat > /srv/ftp/service-accounts.txt <<'EOF'
# rotate quarterly - last rotation 2024-03
build-pipeline:demo-pipeline-pass-2024
monitoring-agent:demo-monitor-pass-2024
# TODO: move this off the file share
EOF

    cat > /srv/ftp/deploy-notes.md <<'EOF'
# Deployment share migration notes
- This share still uses the legacy transfer service for compatibility
  with the older build agents.
- Action item: retire the legacy transfer path once agents are upgraded.
EOF

    chmod 0644 /srv/ftp/README.txt /srv/ftp/service-accounts.txt /srv/ftp/deploy-notes.md
    touch "${PROVISIONED_FLAG}"
fi

cat > /home/ftpuser/shift-handover-notes.txt <<'EOF'
Handover: build pipeline is stable. No open incidents.
EOF
chmod 0644 /home/ftpuser/shift-handover-notes.txt

# The generic entrypoint's blanket chown runs before this hook and applies
# LAB_DATA_USER (root) to the whole /srv/ftp tree. Keep the anon_root itself
# non-writable (root-owned) - that is required, not incidental - and restore
# ownership only on the dedicated writable dropbox and the seed files.
chown root:root /srv/ftp
chmod 0755 /srv/ftp
chown root:root /srv/ftp/README.txt /srv/ftp/service-accounts.txt /srv/ftp/deploy-notes.md
chown -R ftp:ftp /srv/ftp/pub
chmod 0755 /srv/ftp/pub
chown -R ftpuser:ftpuser /home/ftpuser

# vsftpd refuses to trust a config file (or TLS certificate) that is not
# root-owned and not world-writable, so the live /etc/vsftpd tree is never
# volume-shared with the workstation - it is private to this container and
# always root-owned by construction (created fresh here, and by the generic
# entrypoint's cp of the baseline). The SAME volume that used to be mounted
# there is instead mounted at /etc/vsftpd-staging, and is the one shared
# with the workstation at /lab/ftp: it is a plain editable staging copy that
# the restart helper applies to the live path. Reseed the staging copy from
# the current live config on every boot, so a portal Reset also resets what
# the student sees as editable.
mkdir -p /etc/vsftpd-staging
cp /etc/vsftpd/vsftpd.conf /etc/vsftpd-staging/vsftpd.conf
chmod 0644 /etc/vsftpd-staging/vsftpd.conf
# Own it as uid 1000 explicitly rather than relying on the workstation
# container's own /lab chown to land first - the two containers boot
# independently and that race can go either way.
chown 1000:1000 /etc/vsftpd-staging /etc/vsftpd-staging/vsftpd.conf
