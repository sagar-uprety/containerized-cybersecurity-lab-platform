# Solution Notes: Weak SSH Configuration and Brute-Force Vulnerability

## Root Cause

The SSH server is configured with password authentication enabled for all users
including root, no rate limiting, and weak user passwords. Additionally,
unauthorized public keys in `authorized_keys` indicate a prior compromise.

## Impact Demonstration

```bash
# Show weak password auth works
sshpass -p 'demo-ssh-pass' ssh -o StrictHostKeyChecking=no lab-user@ssh-host whoami

# Show root login with password
sshpass -p 'demo-ssh-pass' ssh -o StrictHostKeyChecking=no root@ssh-host whoami

# Show unauthorized keys
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host cat ~/.ssh/authorized_keys

# Brute-force demonstration
hydra -l lab-user -P /usr/share/wordlists/rockyou.txt ssh://ssh-host -t 4 -f
```

## POC Fix

### 1. Harden sshd_config

SSH into the server and edit the config with vi:

```bash
ssh -o StrictHostKeyChecking=no -i /lab/keys/lab_key lab-user@ssh-host
sudo vi /etc/ssh/sshd_config
```

Change these lines:

-   `PermitRootLogin yes` → `PermitRootLogin prohibit-password`
-   `PasswordAuthentication yes` → `PasswordAuthentication no`
-   `MaxAuthTries 6` → `MaxAuthTries 3`

### 2. Remove unauthorized keys

Inspect the authorized_keys file - you'll see two keys. The first is an
attacker-installed key, the second is your legitimate lab key. Remove the
attacker key and clear root's authorized_keys:

```bash
vi ~/.ssh/authorized_keys
# Delete the first line (attacker key), keep the second (your lab key)
```

Then clear root's planted keys:

```bash
sudo truncate -s 0 /root/.ssh/authorized_keys
```

### 3. Enable fail2ban

Edit the fail2ban jail config and start the service:

```bash
sudo vi /etc/fail2ban/jail.local
# Change `enabled = false` to `enabled = true` under [sshd]
sudo fail2ban-client start
```

### 4. Restart sshd

```bash
sudo systemctl restart sshd
```

## Automated Verification

```bash verifier
# 1. Harden sshd_config
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host << 'ENDSSH'
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
ENDSSH

# 2. Remove unauthorized keys (keep only the lab student key)
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host << 'ENDSSH'
cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak
tail -1 ~/.ssh/authorized_keys.bak > ~/.ssh/authorized_keys
chown lab-user:lab-user ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sudo truncate -s 0 /root/.ssh/authorized_keys
ENDSSH

# 3. Enable fail2ban
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host << 'ENDSSH'
sudo sed -i 's/^enabled = false/enabled = true/' /etc/fail2ban/jail.local
sudo systemctl start fail2ban || sudo fail2ban-client start
ENDSSH

# 4. Restart sshd
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host sudo systemctl restart sshd
```

## Expected Verification

```bash
# Password auth should be disabled
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host grep -i ^PasswordAuthentication /etc/ssh/sshd_config

# Key auth should still work
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host echo KEY_AUTH_OK

# fail2ban should be active
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /lab/keys/lab_key lab-user@ssh-host sudo fail2ban-client status sshd
```

PasswordAuthentication should show `no`. Key auth should succeed. fail2ban should
report the sshd jail as active.

## Final-Lab Improvement

For production, also consider:

-   Changing all user passwords to strong random values
-   Restricting SSH access to specific groups via `AllowGroups`
-   Enabling audit logging with `LogLevel VERBOSE`
-   Using certificate-based authentication instead of authorized_keys
