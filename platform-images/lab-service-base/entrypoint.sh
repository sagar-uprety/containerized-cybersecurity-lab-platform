#!/bin/sh
set -eu

#   LAB_CONFIG_SRC        source config path inside image (default: /opt/lab/baseline/service.conf)
#   LAB_CONFIG_DST        runtime config path on volume   (default: /etc/service/service.conf)
#   LAB_SERVICE_CMD       command to start the service; if unset, falls back to exec "$@"
#   LAB_SETUP_SCRIPT      optional pre-start hook at /opt/lab/hooks/pre-start.sh
#   LAB_DATA_DIR          data directory to create on startup
#   LAB_DATA_USER         user to own data and config dirs
#   LAB_SEED_FILE         path to seed data file inside image
#   LAB_SEED_CMD          command for seeding (receives seed file on stdin)
#   LAB_LOG_FILE          log file to tail as foreground output; falls back to wait if absent
#   LAB_ADMIN_USER        in-container user to set password for (default: root)
#   SERVICE_ADMIN_PASSWORD password assigned to LAB_ADMIN_USER on startup
# ──────────────────────────────────────────────────────────────────────────────────

CONFIG_SRC="${LAB_CONFIG_SRC:-/opt/lab/baseline/service.conf}"
CONFIG_DST="${LAB_CONFIG_DST:-/etc/service/service.conf}"
ADMIN_USER="${LAB_ADMIN_USER:-root}"

# ── Set admin password from env ─────────────────────────────────────
if [ -n "${SERVICE_ADMIN_PASSWORD:-}" ]; then
    echo "${ADMIN_USER}:${SERVICE_ADMIN_PASSWORD}" | chpasswd
fi

# ── Seed runtime config from baseline on first boot ──────────────────
config_dir=$(dirname "${CONFIG_DST}")
mkdir -p "${config_dir}"
if [ ! -f "${CONFIG_DST}" ]; then
    cp "${CONFIG_SRC}" "${CONFIG_DST}"
fi

# ── Fix data directory permissions ───────────────────────────────────
if [ -n "${LAB_DATA_DIR:-}" ]; then
    mkdir -p "${LAB_DATA_DIR}"
fi
if [ -n "${LAB_DATA_USER:-}" ]; then
    chown -R "${LAB_DATA_USER}:${LAB_DATA_USER}" "${LAB_DATA_DIR:-/data}" "${config_dir}" 2>/dev/null || true
fi

# ── Start SSH for student access ─────────────────────────────────────
/usr/sbin/sshd

# ── Run optional pre-start setup ─────────────────────────────────────
if [ -n "${LAB_SETUP_SCRIPT:-}" ] && [ -f "${LAB_SETUP_SCRIPT}" ]; then
    sh "${LAB_SETUP_SCRIPT}"
fi

# ── Start the service ────────────────────────────────────────────────
if [ -n "${LAB_SERVICE_CMD:-}" ]; then
    sh -c "${LAB_SERVICE_CMD}" &
else
    exec "$@" &
fi

# ── Seed data (wait for service readiness) ───────────────────────────
if [ -n "${LAB_SEED_FILE:-}" ] && [ -f "${LAB_SEED_FILE}" ] && [ -n "${LAB_SEED_CMD:-}" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        if sh -c "${LAB_SEED_CMD} < /dev/null" >/dev/null 2>&1; then
            sh -c "${LAB_SEED_CMD}" < "${LAB_SEED_FILE}" >/dev/null 2>&1 || true
            break
        fi
        sleep 1
    done
fi

# ── Hold foreground ──────────────────────────────────────────────────
if [ -n "${LAB_LOG_FILE:-}" ] && [ -f "${LAB_LOG_FILE}" ]; then
    tail -f "${LAB_LOG_FILE}"
else
    wait
fi
