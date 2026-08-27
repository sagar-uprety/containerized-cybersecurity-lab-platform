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

# vsftpd requires a non-writable anonymous root; uploads use pub/.
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

# Restore root ownership except for the anonymous upload directory.
chown root:root /srv/ftp
chmod 0755 /srv/ftp
chown root:root /srv/ftp/README.txt /srv/ftp/service-accounts.txt /srv/ftp/deploy-notes.md
chown -R ftp:ftp /srv/ftp/pub
chmod 0755 /srv/ftp/pub
chown -R ftpuser:ftpuser /home/ftpuser

# Keep live config root-owned and expose an editable staging copy.
# Reseed staging on startup so Reset restores the editable baseline.
mkdir -p /etc/vsftpd-staging
cp /etc/vsftpd/vsftpd.conf /etc/vsftpd-staging/vsftpd.conf
chmod 0644 /etc/vsftpd-staging/vsftpd.conf
# Set workstation ownership without depending on container startup order.
chown 1000:1000 /etc/vsftpd-staging /etc/vsftpd-staging/vsftpd.conf
