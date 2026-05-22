#!/bin/sh
set -eu

if [ -z "${TTYD_CREDENTIAL:-}" ]; then
  echo "TTYD_CREDENTIAL is required" >&2
  exit 1
fi

if [ -n "${STUDENT_PASSWORD:-}" ]; then
  echo "student:${STUDENT_PASSWORD}" | chpasswd
fi

# Ensure proper bash profile for student
cp /etc/skel/.bashrc /home/student/.bashrc || true
cp /etc/skel/.profile /home/student/.profile || true
if [ ! -f /home/student/SITREP.txt ]; then
  cp /opt/lab/student/SITREP.txt /home/student/SITREP.txt
fi
if [ ! -f /home/student/REFLECTION.md ]; then
  cp /opt/lab/student/REFLECTION.md /home/student/REFLECTION.md
fi
if [ ! -d /home/student/hints ]; then
  cp -R /opt/lab/student/hints /home/student/hints
fi
chown -R student:student /home/student

mkdir -p /run/sshd
mkdir -p /lab/redis /lab/demo-app
chown -R student:student /lab

/usr/sbin/sshd

# Explicitly set HOME so ttyd doesn't inherit root's HOME
export HOME=/home/student
export USER=student

exec /usr/local/bin/ttyd \
  --interface 0.0.0.0 \
  --port 19000 \
  --base-path /terminal/${BROWSER_TERMINAL_PORT} \
  --credential "${TTYD_CREDENTIAL}" \
  --writable \
  --max-clients 1 \
  --uid 1000 \
  --gid 1000 \
  --cwd /home/student \
  /bin/bash
