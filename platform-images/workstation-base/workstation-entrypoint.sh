#!/bin/sh
set -eu

if [ -z "${TTYD_CREDENTIAL:-}" ]; then
  echo "TTYD_CREDENTIAL is required" >&2
  exit 1
fi

student_user="${STUDENT_ID:-student}"
case "${student_user}" in
  student|student[0-9][0-9]|student[0-9][0-9][0-9]|student[0-9][0-9][0-9][0-9]) ;;
  *)
    echo "Invalid STUDENT_ID for workstation user: ${student_user}" >&2
    exit 1
    ;;
esac

if [ "${student_user}" != "student" ]; then
  if getent passwd student >/dev/null 2>&1 && ! getent passwd "${student_user}" >/dev/null 2>&1; then
    usermod --login "${student_user}" student
  fi
  if getent group student >/dev/null 2>&1 && ! getent group "${student_user}" >/dev/null 2>&1; then
    groupmod --new-name "${student_user}" student
  fi
fi

printf '%s\n' \
  'PasswordAuthentication yes' \
  'PermitRootLogin no' \
  "AllowUsers ${student_user}" \
  > /etc/ssh/sshd_config.d/lab.conf

if [ -n "${STUDENT_PASSWORD:-}" ]; then
  echo "${student_user}:${STUDENT_PASSWORD}" | chpasswd
fi

cp /etc/skel/.bashrc /home/student/.bashrc || true
cp /etc/skel/.profile /home/student/.profile || true
if ! grep -q 'thesis-command-logger.bash' /home/student/.bashrc 2>/dev/null; then
  printf '\n# Thesis lab command/session logging.\n[ -r /usr/local/lib/thesis-command-logger.bash ] && . /usr/local/lib/thesis-command-logger.bash\n' >> /home/student/.bashrc
fi
chown -R "${student_user}:${student_user}" /home/student

mkdir -p /run/sshd
mkdir -p /lab
mkdir -p /var/log/thesis-labs/commands
chown -R "${student_user}:${student_user}" /lab
chown -R "${student_user}:${student_user}" /var/log/thesis-labs/commands

/usr/sbin/sshd

export HOME=/home/student
export USER="${student_user}"
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
