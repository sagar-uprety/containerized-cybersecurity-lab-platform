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
if ! grep -q 'thesis-command-logger.bash' /home/student/.bashrc 2>/dev/null; then
  printf '\n# Thesis lab command/session logging.\n[ -r /usr/local/lib/thesis-command-logger.bash ] && . /usr/local/lib/thesis-command-logger.bash\n' >> /home/student/.bashrc
fi
chown -R student:student /home/student

mkdir -p /run/sshd
mkdir -p /lab/redis /lab/demo-app
mkdir -p /var/log/thesis-labs/commands
chown -R student:student /lab
chown -R student:student /var/log/thesis-labs/commands

/usr/sbin/sshd

# Explicitly set HOME so ttyd doesn't inherit root's HOME
export HOME=/home/student
export USER=student
export THESIS_COMMAND_LOG_DIR=/var/log/thesis-labs/commands

exec /usr/local/bin/ttyd \
  --interface 0.0.0.0 \
  --port 19000 \
  --base-path /terminal/${BROWSER_TERMINAL_PORT} \
  --credential "${TTYD_CREDENTIAL}" \
  --writable \
  --uid 1000 \
  --gid 1000 \
  --cwd /home/student \
  /bin/bash -i
