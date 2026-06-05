#!/bin/sh
set -eu

CONFIG_PATH=/usr/local/etc/redis/redis.conf
PID_FILE=/run/redis-lab.pid
LOG_FILE=/var/log/redis-server.log

if [ -f "${PID_FILE}" ]; then
  old_pid="$(cat "${PID_FILE}")"
  if [ -n "${old_pid}" ] && kill -0 "${old_pid}" 2>/dev/null; then
    kill "${old_pid}"
    for _ in 1 2 3 4 5; do
      if ! kill -0 "${old_pid}" 2>/dev/null; then
        break
      fi
      sleep 1
    done
  fi
fi

mkdir -p /data
chown -R redis:redis /data /usr/local/etc/redis
chmod -R a+rwX /usr/local/etc/redis
touch "${LOG_FILE}"
chown redis:redis "${LOG_FILE}"

sudo -u redis sh -c 'exec redis-server "$1" >>"$2" 2>&1' sh "${CONFIG_PATH}" "${LOG_FILE}" &
echo "$!" > "${PID_FILE}"
echo "Redis restarted"
