#!/bin/sh
set -eu

# Provision once per persistent volume to avoid overwriting student remediation.
PROVISIONED_FLAG=/var/lib/mysql/.lab-provisioned
SOCKET=/run/mysqld/mysqld.sock

mkdir -p /run/mysqld /var/log/mysql
chown mysql:mysql /run/mysqld /var/log/mysql
touch /var/log/mysql/general.log /var/log/mysql/error.log
chown mysql:mysql /var/log/mysql/general.log /var/log/mysql/error.log

# Refresh isolated-lab SSH credentials on every start.
mkdir -p /lab/access
umask 077
cat > /lab/access/credentials.txt <<EOF
Database host: db-host
SSH user: root
SSH password: ${SERVICE_ADMIN_PASSWORD}
EOF
chmod 0644 /lab/access/credentials.txt

if [ -f "${PROVISIONED_FLAG}" ]; then
    # Preserve existing persistent-volume state.
    exit 0
fi

# ── Initialize a fresh MariaDB data directory ─────────────────────────
if [ ! -d /var/lib/mysql/mysql ]; then
    mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
fi

# Start provisioning-only mariadbd to apply the baseline schema.
/usr/sbin/mariadbd --user=mysql --datadir=/var/lib/mysql \
    --socket="${SOCKET}" --skip-networking \
    --pid-file=/run/mysqld/mysqld-setup.pid &
SETUP_PID=$!

READY=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
    if mariadb-admin --socket="${SOCKET}" -u root ping >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done
[ "${READY}" -eq 1 ] || { echo "mariadbd did not become ready for setup" >&2; exit 1; }

mariadb --socket="${SOCKET}" -u root < /opt/lab/baseline/provision.sql

mariadb-admin --socket="${SOCKET}" -u root shutdown
wait "${SETUP_PID}" 2>/dev/null || true
rm -f "${SOCKET}" /run/mysqld/mysqld-setup.pid

touch "${PROVISIONED_FLAG}"
