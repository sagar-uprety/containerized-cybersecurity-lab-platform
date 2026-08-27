#!/bin/sh
set -eu

touch /var/log/auth.log
chmod 0640 /var/log/auth.log

# The container has no systemd journal, so route sshd's AUTH messages to the
# file consumed by the fail2ban polling backend.
rm -f /run/rsyslogd.pid
rsyslogd

# Create weak passwords for test accounts
echo "lab-user:demo-ssh-pass" | chpasswd
echo "svc-user:demo-ssh-pass" | chpasswd

# Generate attacker key pair (simulates prior compromise)
mkdir -p /tmp/demo-attacker-key
ssh-keygen -t ed25519 -f /tmp/demo-attacker-key/id_ed25519 -N "" -q

# Plant unauthorized keys (clear first for idempotency)
for user_home in /root /home/lab-user; do
    mkdir -p "${user_home}/.ssh"
    true > "${user_home}/.ssh/authorized_keys"
    cat /tmp/demo-attacker-key/id_ed25519.pub >> "${user_home}/.ssh/authorized_keys"
    chmod 600 "${user_home}/.ssh/authorized_keys"
    chown -R "$(basename "${user_home}")" "${user_home}/.ssh" 2>/dev/null || true
done

# Install build-time generated student public key for lab-user
cat /opt/lab/keys/lab_key.pub >> /home/lab-user/.ssh/authorized_keys
chown -R lab-user /home/lab-user/.ssh

# Start fail2ban (jail.local is created in Dockerfile; starts with jail disabled)
rm -f /var/run/fail2ban/fail2ban.sock 2>/dev/null || true
fail2ban-client start || true

# Remove generated key staging files.
rm -rf /tmp/demo-attacker-key

# Allow any student account to run lab-required commands without password
groupadd -r student 2>/dev/null || true
usermod -aG student lab-user
usermod -aG student svc-user
cat > /etc/sudoers.d/student-lab <<'EOF'
%student ALL=(root) NOPASSWD: /usr/bin/fail2ban-client, /usr/bin/grep, /usr/bin/install, /usr/bin/passwd, /usr/bin/sed, /usr/bin/tee, /usr/sbin/sshd, /usr/bin/truncate, /bin/cp, /bin/chown, /bin/chmod, /bin/kill, /usr/bin/pkill, /usr/bin/vi
EOF
chmod 0440 /etc/sudoers.d/student-lab
