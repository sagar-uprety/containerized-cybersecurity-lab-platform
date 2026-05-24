#!/bin/sh
set -eu

CONFIG_PATH=/usr/local/etc/redis/redis.conf
BASELINE_CONFIG=/opt/lab/baseline/redis.conf
SEED_FILE=/opt/lab/seed/redis-seed.txt

if [ -n "${REDIS_ADMIN_PASSWORD:-}" ]; then
  echo "redisadmin:${REDIS_ADMIN_PASSWORD}" | chpasswd
fi

mkdir -p /run/sshd /data /usr/local/etc/redis

if [ ! -f "${CONFIG_PATH}" ]; then
  cp "${BASELINE_CONFIG}" "${CONFIG_PATH}"
fi

chown -R redis:redis /data /usr/local/etc/redis
chmod -R a+rwX /usr/local/etc/redis

/usr/sbin/sshd
/usr/local/sbin/restart-redis

if [ -f "${SEED_FILE}" ]; then
  for attempt in 1 2 3 4 5; do
    if redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; then
      redis-cli -h 127.0.0.1 < "${SEED_FILE}" >/dev/null
      break
    fi
    sleep 1
  done
fi

tail -f /var/log/redis-server.log
