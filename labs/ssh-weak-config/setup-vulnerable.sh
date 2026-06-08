#!/bin/sh
set -eu

touch /var/log/auth.log

# Create weak passwords for test accounts
echo "student01:demo-ssh-pass" | chpasswd
echo "student02:demo-ssh-pass" | chpasswd

# Generate attacker key pair (simulates prior compromise)
mkdir -p /tmp/demo-attacker-key
ssh-keygen -t ed25519 -f /tmp/demo-attacker-key/id_ed25519 -N "" -q

# Plant unauthorized keys in root and student01 authorized_keys
for user_home in /root /home/student01; do
    mkdir -p "${user_home}/.ssh"
    cat /tmp/demo-attacker-key/id_ed25519.pub >> "${user_home}/.ssh/authorized_keys"
    chmod 600 "${user_home}/.ssh/authorized_keys"
    chown -R "$(basename "${user_home}")" "${user_home}/.ssh" 2>/dev/null || true
done

# Install build-time generated student public key for student01
cat /opt/lab/keys/lab_key.pub >> /home/student01/.ssh/authorized_keys
chown -R student01 /home/student01/.ssh

# Configure fail2ban with SSH jail (not started — student must enable it)
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = false
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 600
findtime = 600
EOF

# Clean up temporary files
rm -rf /tmp/demo-attacker-key

# Allow student01 to run fail2ban-client without password
echo "student01 ALL=(root) NOPASSWD: /usr/bin/fail2ban-client" > /etc/sudoers.d/student01-fail2ban
chmod 0440 /etc/sudoers.d/student01-fail2ban
