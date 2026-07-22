# Solution Notes: Open SMB Share with Sensitive Data Exposure

## Root Cause

Three independent configuration failures combine in `/etc/samba/smb.conf`:

1. The `[backup]` share is declared with `guest ok = yes`, so Samba maps
   any client that supplies no credentials to the guest account.
2. The global `map to guest = Bad User` policy turns a missing or invalid
   username into a guest session instead of rejecting it. Together with
   `guest ok = yes`, anyone on the network can connect without a password.
3. No `valid users` restriction on the share and `smb encrypt = off`, so
   there is no access-control list and no transport encryption. Guest
   reads are unencrypted and unrestricted.

## Impact Demonstration

Context: student workstation.

```bash
nmap -p 445 smb-host
smbclient -N -L //smb-host
smbclient -N //smb-host/backup -c 'ls'
smbclient -N //smb-host/backup -c 'get passwords.txt /tmp/passwords.txt'
cat /tmp/passwords.txt
smbclient -N //smb-host/backup -c 'get app-production.conf /tmp/app-production.conf'
cat /tmp/app-production.conf
```

`-N` supplies no password. With `map to guest = Bad User`, the empty
identity is mapped to guest and the connection succeeds. `ls` lists
seeded files including `passwords.txt`, `app-production.conf`, a database
backup, and payroll data — all readable without credentials. Any user on
the lab network can exfiltrate the contents and the transfer is
unencrypted.

## Canonical Remediation

### Step 1: Harden the Samba configuration

Context: student workstation. The share configuration is exposed on a
shared volume at `/lab/smb/smb.conf` and is writable from the
workstation.

```bash
cat > /lab/smb/smb.conf <<'EOF'
[global]
   workgroup = WORKGROUP
   security = user
   map to guest = Never
   smb encrypt = required
   disable netbios = yes
   smb ports = 445
   log file = /var/log/samba/log.smbd
   max log size = 1000
   server min protocol = SMB2
   logging = file

[backup]
   path = /srv/samba/backup
   read only = yes
   writable = no
   guest ok = no
   valid users = @allowed
EOF
```

-   `map to guest = Never` rejects clients that supply no valid credentials
    instead of mapping them to guest.
-   `guest ok = no` removes guest access from the share.
-   `valid users = @allowed` restricts the share to members of the `allowed`
    Unix group.
-   `smb encrypt = required` forces SMB 3 encryption on every session;
    clients that cannot negotiate it are rejected.

### Step 2: Create the Samba user and restart the service

The Samba password database and the `smbd` process live on the file
server, not the workstation. SSH into the file server as the lab admin
account, then set the Samba password for the pre-created `shareuser`
account (a member of the `allowed` group) and restart `smbd`.

Context: student workstation → transition to `sambaadmin@smb-host`.

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new sambaadmin@smb-host \
  "printf 'smb-demo-password\nsmb-demo-password\n' | sudo smbpasswd -s -a shareuser && \
   sudo smbpasswd -e shareuser && \
   sudo /usr/local/sbin/restart-samba"
unset LAB_PASSWORD
```

The interactive session ends after the single SSH command returns. The
SSH password is your own lab/workstation password (published in
`/lab/access/credentials.txt`). `smbpasswd -s -a` reads the new password
from stdin twice; `-e` enables the account. `restart-samba` sends SIGHUP
to the running `smbd` process, which makes it re-read the hardened
`/etc/samba/smb.conf` without a full process restart.

## Verification

Context: student workstation.

```bash
smbclient -N //smb-host/backup -c 'ls' 2>&1 | grep -qiE 'NT_STATUS_ACCESS_DENIED|NT_STATUS_LOGON_FAILURE' \
  && echo 'anonymous blocked' || echo 'anonymous still allowed'
```

Expected: `anonymous blocked` — guest access is rejected.

```bash
smbclient -U 'shareuser%smb-demo-password' //smb-host/backup -c 'ls' 2>&1 | grep -q 'passwords' \
  && echo 'authenticated read ok' || echo 'authenticated read failed'
```

Expected: `authenticated read ok` — the restricted user can still read
the share over an encrypted session.

```bash
smbclient -N --option='client smb encrypt = off' //smb-host/backup -c 'ls' 2>&1 \
  | grep -qiE 'NT_STATUS_ACCESS_DENIED|NT_STATUS_LOGON_FAILURE|NT_STATUS_CONNECTION' \
  && echo 'unencrypted rejected' || echo 'unencrypted allowed'
```

Expected: `unencrypted rejected` — with `smb encrypt = required` and
guest disabled, an unencrypted anonymous session cannot read the share.

When all three checks pass, click **Run Check** in the portal.

## Design Rationale

This remediation teaches three layered controls:

1. **Authentication** (`map to guest = Never`, `guest ok = no`) — clients
   must present valid Samba credentials. Missing or bad identities are
   rejected, not silently mapped to a guest.
2. **Authorization** (`valid users = @allowed`) — even authenticated users
   are granted access only if they belong to the authorized group, limiting
   blast radius if an account is compromised.
3. **Transport security** (`smb encrypt = required`) — all session traffic
   is encrypted at the SMB 3 layer, preventing on-path sniffing of file
   contents and credentials.

## Final-Lab Improvement

For production, also consider:

-   Using individual `valid users` entries instead of a broad group when
    finer-grained access is needed
-   Enabling Samba audit logging (`full_audit` VFS module) to record file
    access per user
-   Joining the server to Active Directory for centralized identity instead
    of local `smbpasswd` accounts
-   Disabling SMB 1 entirely and raising `server min protocol` to SMB 3
-   Using the newer `server smb encrypt = mandatory` syntax (Samba ≥ 4.14) which
    is equivalent to `smb encrypt = required` — the old form still works on
    current Debian but may be deprecated in future releases; the checker
    (`(server )?smb encrypt = required`) already accepts both
-   Storing the share on a dedicated volume with filesystem ACLs that match
    the `valid users` policy
