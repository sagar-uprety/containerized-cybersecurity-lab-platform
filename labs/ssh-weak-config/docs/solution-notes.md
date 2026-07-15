# Solution Notes: Weak SSH Configuration and Brute-Force Vulnerability

## Root Cause

The SSH server accepts password authentication, permits direct root login,
allows too many authentication attempts, and has accounts with planted weak
passwords. Unauthorized public keys provide persistence. The fail2ban SSH jail
is disabled at baseline; when enabled, it must poll the real OpenSSH
authentication log rather than merely report a running process.

## Impact Demonstration

Run every command in this document from the student browser terminal, which is
the lab workstation. Commands that inspect or change the service explicitly
connect to `lab-user@ssh-host` with the legitimate key in `/lab/keys`.

```bash
sshpass -p 'demo-ssh-pass' ssh \
  -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  lab-user@ssh-host whoami
```

The command returns `lab-user`, proving that the planted password grants remote
access. Demonstrate that a short wordlist finds the same password:

```bash
printf 'password\ndemo-ssh-pass\n123456\nadmin\n' > /tmp/brute-wordlist.txt
hydra -l lab-user -P /tmp/brute-wordlist.txt ssh://ssh-host -t 4 -f
```

Inspect effective policy and the planted keys from the workstation:

```bash
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host \
  'sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin|maxauthtries) "'

ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host \
  'cat ~/.ssh/authorized_keys; sudo sed -n "1,5p" /root/.ssh/authorized_keys'
```

## POC Fix

### 1. Validate and harden the SSH policy

Run this block from the workstation. It edits the service configuration, then
refuses to continue if OpenSSH rejects the result.

```bash
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host <<'ENDSSH'
set -eu
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
sudo sshd -t
sudo sshd -T | grep -E '^(passwordauthentication no|permitrootlogin no|maxauthtries 3)$'
ENDSSH
```

### 2. Remove planted keys and remediate weak accounts

Replace the user key file from the known legitimate lab public key, empty the
root key file, and lock every account whose password was planted for the lab.
Key authentication for `lab-user` remains available.

```bash
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host <<'ENDSSH'
set -eu
sudo install -m 0600 -o lab-user -g lab-user \
  /opt/lab/keys/lab_key.pub /home/lab-user/.ssh/authorized_keys
sudo truncate -s 0 /root/.ssh/authorized_keys
sudo passwd -l root
sudo passwd -l lab-user
sudo passwd -l svc-user
ENDSSH
```

### 3. Enable the fail2ban SSH jail

The container uses rsyslog to write OpenSSH AUTH events to `/var/log/auth.log`.
The jail uses the polling backend and an iptables action. Enable it and reload
the already-running fail2ban server:

```bash
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host <<'ENDSSH'
set -eu
sudo sed -i 's/^enabled = false/enabled = true/' /etc/fail2ban/jail.local
sudo fail2ban-client reload
sudo fail2ban-client status sshd
sudo grep -E 'sshd.*Accepted publickey' /var/log/auth.log | tail -n 1
ENDSSH
```

### 4. Reload OpenSSH and verify the postcondition

Signaling `sshd` can close the SSH session and make the client exit nonzero.
That disconnect is expected. Do not treat client exit status as proof of either
success or failure; reconnect with the legitimate key and verify config syntax,
effective policy, and key access as the postcondition.

```bash
set +e
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host \
  'sudo sshd -t && sudo pkill -HUP sshd'
reload_rc=$?
set -e
printf 'Reload SSH client exit code: %s (a disconnect/nonzero is expected)\n' "$reload_rc"

ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 \
  -i /lab/keys/lab_key lab-user@ssh-host \
  'sudo sshd -t && sudo sshd -T | grep -E "^(passwordauthentication no|permitrootlogin no|maxauthtries 3)$" && echo POSTCONDITION_OK'
```

## Expected Verification

Confirm real password rejection and account/key cleanup from the workstation:

```bash
if sshpass -p 'demo-ssh-pass' ssh \
  -o StrictHostKeyChecking=no \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  -o ConnectTimeout=5 lab-user@ssh-host true; then
  echo 'ERROR: weak password still accepted'
  exit 1
else
  echo 'PASSWORD_REJECTED'
fi

ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host <<'ENDSSH'
set -eu
test "$(grep -vcE '^[[:space:]]*$|^#' ~/.ssh/authorized_keys)" -eq 1
if sudo grep -q . /root/.ssh/authorized_keys; then
  echo 'ERROR: root authorized_keys is not empty'
  exit 1
fi
for user in root lab-user svc-user; do
  sudo passwd -S "$user" | grep -q ' L '
done
echo 'KEYS_AND_ACCOUNTS_OK'
ENDSSH
```

Prove fail2ban consumes its configured SSH log and invokes its ban action without
banning the workstation. The documentation-only TEST-NET address is removed
immediately after observation:

```bash
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
  -i /lab/keys/lab_key lab-user@ssh-host <<'ENDSSH'
set -eu
test_ip=192.0.2.123
sudo fail2ban-client set sshd unbanip "$test_ip" >/dev/null 2>&1 || true
for attempt in 1 2 3; do
  printf '%s %s sshd[9999]: Failed password for invalid user checker from %s port 4242 ssh2\n' \
    "$(date '+%b %e %T')" "$(hostname)" "$test_ip"
done | sudo tee -a /var/log/auth.log >/dev/null
sleep 3
sudo fail2ban-client status sshd | grep "$test_ip"
sudo fail2ban-client set sshd unbanip "$test_ip" >/dev/null
echo 'FAIL2BAN_BAN_OBSERVED'
ENDSSH
```

Finally, click **Run Check** in the portal. Every objective and guardrail should
report `fixed`.

## Final-Lab Improvement

For production, replace rather than merely lock compromised accounts when they
are unnecessary, rotate all affected credentials and keys, restrict SSH access
to approved users or groups, centralize authentication logs, and alert on both
failures and unexpected successful key use.
