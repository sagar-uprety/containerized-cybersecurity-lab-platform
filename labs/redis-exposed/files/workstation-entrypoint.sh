#!/bin/sh
set -eu

if [ -z "${TTYD_CREDENTIAL:-}" ]; then
  echo "TTYD_CREDENTIAL is required" >&2
  exit 1
fi

if [ -n "${STUDENT_PASSWORD:-}" ]; then
  echo "student:${STUDENT_PASSWORD}" | chpasswd
fi

mkdir -p /run/sshd
mkdir -p /lab/redis /lab/demo-app
chown -R student:student /home/student /lab

/usr/sbin/sshd

exec /usr/local/bin/ttyd \
  --interface 0.0.0.0 \
  --port 19000 \
  --credential "${TTYD_CREDENTIAL}" \
  --writable \
  --max-clients 1 \
  --check-origin \
  --uid 1000 \
  --gid 1000 \
  --cwd /home/student \
  /bin/bash -l
