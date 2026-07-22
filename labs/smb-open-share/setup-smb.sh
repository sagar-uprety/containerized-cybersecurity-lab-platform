#!/bin/sh
set -eu

PROVISIONED_FLAG=/srv/samba/backup/.lab-provisioned

mkdir -p /lab/access /srv/samba/backup /var/log/samba
umask 077
cat > /lab/access/credentials.txt <<EOF
SMB host: smb-host
SSH user: sambaadmin
SSH password: ${SERVICE_ADMIN_PASSWORD}
Samba share: backup
Samba user to configure: shareuser
Allowed group: allowed
EOF
chmod 0644 /lab/access/credentials.txt

touch /var/log/samba/log.smbd

if [ ! -f "${PROVISIONED_FLAG}" ]; then
    cat > /srv/samba/backup/passwords.txt <<'EOF'
# DO NOT COMMIT - temporary credentials rotation 2024-03
svc_backup:demo-backup-pass-2024
db_admin:demo-db-pass-2024
monitoring:demo-grafana-tmp-2024
# TODO: rotate these before Q2 deploy
EOF

    cat > /srv/samba/backup/db_backup_2024-03-15.sql <<'EOF'
-- Demo Corp database backup 2024-03-15 (synthetic)
CREATE TABLE customers_demo (id INT, name TEXT, email TEXT, tier TEXT);
INSERT INTO customers_demo VALUES (1,'Alice Chen','alice@demo-corp.internal','gold');
INSERT INTO customers_demo VALUES (2,'Bob Martinez','bob@demo-corp.internal','silver');
INSERT INTO customers_demo VALUES (3,'Carol Ng','carol@demo-corp.internal','gold');
CREATE TABLE orders_demo (id INT, customer_id INT, total TEXT, status TEXT);
INSERT INTO orders_demo VALUES (5001,1,'42.97','shipped');
INSERT INTO orders_demo VALUES (5002,2,'18.50','processing');
INSERT INTO orders_demo VALUES (5003,3,'129.00','pending');
EOF

    cat > /srv/samba/backup/app-production.conf <<'EOF'
[app]
db_host = db-demo-internal.demo-corp.local
db_password = demo-prod-db-pass-2024
api_key = demo-api-key-DEADBEEF2024
redis_cache = redis-demo-internal:6379
EOF

    cat > /srv/samba/backup/migration-notes.md <<'EOF'
# File share migration plan 2024-Q2
- Migrate file share to new NAS 2024-04-10
- Decommission smb-host after migration
- Note: share currently left open for transition team access
- Action item: lock down guest access before handover
EOF

    cat > /srv/samba/backup/payroll_salary-grades.csv <<'EOF'
name,grade,salary_demo
Alice Chen,G7,92000
Bob Martinez,G5,67000
Carol Ng,G7,88000
David Lee,G4,55000
Eva Garcia,G6,74000
EOF

    chmod 0644 /srv/samba/backup/*
    touch "${PROVISIONED_FLAG}"
fi

chown -R root:allowed /srv/samba/backup 2>/dev/null || true
chmod 0755 /srv/samba/backup
