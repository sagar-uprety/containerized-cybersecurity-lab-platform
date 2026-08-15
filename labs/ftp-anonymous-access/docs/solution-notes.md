# Solution Notes: FTP Anonymous Access and Cleartext Credential Exposure

## Root Cause

Two independent configuration failures combine in `/etc/vsftpd/vsftpd.conf`:

1. `anonymous_enable=YES` together with `anon_upload_enable=YES`,
   `anon_mkdir_write_enable=YES`, and `anon_other_write_enable=YES` lets any
   client connect without credentials, read every file in the anonymous
   root, and write new files into it - a malware-distribution vector as
   much as a data-exposure one.
2. `ssl_enable=NO` means the control channel is never encrypted, for
   anonymous **or** named-user sessions. A named account (`ftpuser`)
   authenticates with a real username and password, but both travel over
   the wire in plaintext `USER`/`PASS` commands that any on-path observer
   can read.

## Impact Demonstration

Context: student workstation.

```bash
nmap -sV -p 21 ftp-host
curl -s ftp://ftp-host/
```

`nmap` confirms vsftpd is listening on 21. The bare `curl` FTP request logs
in anonymously by default and lists the anonymous root's contents,
including `service-accounts.txt` and `deploy-notes.md` - no credentials
supplied.

```bash
curl -s ftp://ftp-host/service-accounts.txt
```

The listed files are readable without authentication, including one that
looks like leaked service-account credentials.

```bash
echo 'this file was uploaded anonymously' > /tmp/anon-upload-test.txt
curl -s -T /tmp/anon-upload-test.txt ftp://ftp-host/pub/anon-upload-test.txt
curl -s ftp://ftp-host/pub/anon-upload-test.txt
curl -s -Q 'DELE pub/anon-upload-test.txt' ftp://ftp-host/ >/dev/null 2>&1
rm -f /tmp/anon-upload-test.txt
```

The upload succeeds and the file is immediately readable back - anonymous
write access, not just read access.

Now capture the named account's login in cleartext:

```bash
tcpdump -i eth0 -U -w /tmp/ftp-capture.pcap port 21 &
TCPDUMP_PID=$!
sleep 1
curl -s 'ftp://ftpuser:ftp-demo-password@ftp-host/' -o /dev/null
sleep 1
kill "$TCPDUMP_PID" 2>/dev/null
wait "$TCPDUMP_PID" 2>/dev/null || true
```

```bash
tcpdump -r /tmp/ftp-capture.pcap -A 2>/dev/null | grep -i 'PASS '
```

Expected output: a line containing `PASS ftp-demo-password` - the named
account's real password, sitting in cleartext in the capture, exactly as
an attacker on the same network segment or a compromised switch port
would see it. `curl` sends the same plaintext `USER`/`PASS` sequence a
graphical FTP client or the `ftp` CLI would, so this capture reflects any
FTP client, not a curl-specific quirk.

## Canonical Remediation

### Step 1: Harden the vsftpd configuration

Context: student workstation. The service configuration lives on a shared
volume at `/lab/ftp/vsftpd.conf` and is writable from the workstation. The
TLS certificate the server already generated on first boot stays in place
at `/etc/vsftpd/certs/vsftpd.pem` inside the same volume - this rewrite
only replaces the conf file.

```bash
cat > /lab/ftp/vsftpd.conf <<'EOF'
listen=YES
listen_ipv6=NO

anonymous_enable=NO

local_enable=YES
write_enable=YES
chroot_local_user=YES
allow_writeable_chroot=YES
local_umask=022

dirmessage_enable=YES
use_localtime=YES

xferlog_enable=YES
xferlog_file=/var/log/vsftpd.log
xferlog_std_format=NO
log_ftp_protocol=YES

connect_from_port_20=YES
pasv_enable=YES
pasv_min_port=21100
pasv_max_port=21110

ssl_enable=YES
rsa_cert_file=/etc/vsftpd/certs/vsftpd.pem
rsa_private_key_file=/etc/vsftpd/certs/vsftpd.pem
allow_anon_ssl=NO
force_local_data_ssl=YES
force_local_logins_ssl=YES
ssl_sslv2=NO
ssl_sslv3=NO
require_ssl_reuse=NO
ssl_ciphers=HIGH

seccomp_sandbox=NO
pam_service_name=vsftpd
userlist_enable=NO
secure_chroot_dir=/var/empty
EOF
```

-   `anonymous_enable=NO` removes the credential-free access path entirely.
-   `ssl_enable=YES` plus the `rsa_cert_file`/`rsa_private_key_file` pair
    turns on FTPS (explicit TLS via `AUTH TLS`) using the certificate
    generated for this instance.
-   `force_local_logins_ssl=YES` and `force_local_data_ssl=YES` require
    every named-user session - control channel and data channel - to be
    encrypted; a plaintext login attempt is rejected outright.
-   `allow_anon_ssl=NO` is inert now that anonymous access is disabled, but
    keeps the config internally consistent if anonymous access is ever
    re-enabled for a legitimate reason.
-   `require_ssl_reuse=NO` allows the data-channel connection to
    reuse a fresh TLS session instead of the exact control-channel session
    ID - most modern FTPS clients, including `curl`, need this relaxed to
    connect at all.
-   `seccomp_sandbox`, `secure_chroot_dir`, `pasv_min_port`/`pasv_max_port`,
    and the logging directives are unchanged from the baseline; they are
    container and connectivity requirements, not part of the vulnerability.

### Step 2: Restart the service

The running `vsftpd` process does not pick up a rewritten config file on
its own. SSH into the FTP host as the lab admin account and run the narrow
restart helper.

Context: student workstation → transition to `ftpadmin@ftp-host`.

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new ftpadmin@ftp-host \
  "sudo /usr/local/sbin/restart-vsftpd"
unset LAB_PASSWORD
```

The interactive session ends after the single SSH command returns. The SSH
password is your own lab/workstation password (published in
`/lab/access/credentials.txt`). `restart-vsftpd` applies your edited config,
stops any running vsftpd process, and starts a new one against the
now-hardened config - vsftpd has no in-place config reload, so a restart is
required.

## Verification

Context: student workstation.

```bash
curl -s -m 5 'ftp://ftp-host/' >/dev/null 2>&1 \
  && echo 'anonymous still allowed' || echo 'anonymous blocked'
```

Expected: `anonymous blocked`.

```bash
curl -s -m 5 'ftp://ftpuser:ftp-demo-password@ftp-host/' >/dev/null 2>&1 \
  && echo 'plaintext login still works' || echo 'plaintext login blocked'
```

Expected: `plaintext login blocked` - the same credentials that worked in
cleartext before are now rejected without encryption.

```bash
curl -s -m 5 --ssl-reqd -k 'ftp://ftpuser:ftp-demo-password@ftp-host/' >/dev/null 2>&1 \
  && echo 'encrypted login ok' || echo 'encrypted login failed'
```

Expected: `encrypted login ok` - the named account still works, now only
over TLS. (`-k` accepts the lab's self-signed certificate; a production
deployment would use a certificate issued by a trusted CA instead.)

When all three checks pass, click **Run Check** in the portal.

## Design Rationale

This remediation teaches two layered controls:

1. **Authentication** (`anonymous_enable=NO`) - every session must present
   real credentials. Anonymous access is not a convenience feature here;
   it is a bypass of authentication entirely.
2. **Transport security** (`ssl_enable=YES`, `force_local_logins_ssl=YES`,
   `force_local_data_ssl=YES`) - even with valid credentials, the protocol
   itself leaks them unless the session is encrypted. Requiring TLS for
   both the login exchange and the data transfer closes the exact gap the
   tcpdump capture demonstrated.

## Final-Lab Improvement

For production, also consider:

-   Replacing the self-signed certificate with one issued by a trusted
    internal or public CA, so clients can verify it without `-k`/`--insecure`.
-   Setting `userlist_enable=YES` with an explicit `userlist_file` allow-list
    instead of relying only on PAM, for defense in depth.
-   Migrating off FTP/FTPS entirely to SFTP (SSH File Transfer Protocol),
    which reuses the already-hardened SSH transport and avoids the FTP
    passive-port range altogether.
-   Adding fail2ban or equivalent monitoring on repeated failed logins to
    the FTP log.
-   Narrowing `pasv_min_port`/`pasv_max_port` further, or moving to a
    firewall-aware deployment, if the service is ever exposed beyond an
    isolated lab network.
