# Solution Notes: Unpatched Service with Known Vulnerability

## Root Cause

The server is running Apache HTTP Server 2.4.49, which contains a known path-
traversal vulnerability (CVE-2021-41773). The vulnerable configuration includes
an `Alias /cgi-bin/` directive with `Require all granted` on the aliased
directory, and the root filesystem `<Directory />` block set to `Require all
granted` instead of the secure default. Because of a path-normalization bug in
this version, a crafted URL such as
`/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd` escapes the aliased directory
and reads files from the server filesystem.

## Impact Demonstration

```bash
# Identify the version
curl -s -I http://apache-host/ 2>/dev/null | grep -i server

# Demonstrate the path-traversal exploit
curl --path-as-is -s http://apache-host/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd
```

The exploit should return the contents of `/etc/passwd` from the server,
confirming arbitrary file read.

## POC Fix

The goal is to block the attack path by removing the Alias directive
that provides the traversal entry point.

### 1. Edit the Apache configuration

SSH into the server and edit the config file:

```bash
ssh -o StrictHostKeyChecking=no apacheadmin@apache-host
sudo vi /usr/local/apache2/conf/httpd.conf
```

Make these changes:

-   Comment out or remove the `Alias /cgi-bin/ "/usr/local/apache2/cgi-bin/"` line
-   Comment out or remove the entire `<Directory "/usr/local/apache2/cgi-bin/">` block
-   Optionally, comment out `LoadModule cgi_module modules/mod_cgi.so` (the CGI module is no longer needed)

### 2. Restart Apache

```bash
sudo /usr/local/sbin/restart-apache
```

Or, if the restart script is unavailable:

```bash
sudo pkill httpd
sudo /usr/local/apache2/bin/httpd -f /usr/local/apache2/conf/httpd.conf -DFOREGROUND
```

## Automated Verification

```bash verifier
# 1. Comment out the Alias directive and remove the cgi-bin Directory block
#    (config file is owned by apacheadmin - no sudo needed for sed)
# restart-apache doesn't work via SSH (process orphaning), so use labctl instead
ssh -o StrictHostKeyChecking=no -o BatchMode=yes apacheadmin@apache-host << 'ENDSSH'
sed -i 's/^Alias \/cgi-bin/#Alias \/cgi-bin/' /usr/local/apache2/conf/httpd.conf
sed -i '/<Directory "\/usr\/local\/apache2\/cgi-bin">/,/<\/Directory>/d' /usr/local/apache2/conf/httpd.conf
ENDSSH
# 2. Restart the lab to reload config (restart-apache fails via SSH)
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible x01 -m shell \
  -a "labctl stop ${lab_id} ${student_id} && labctl start ${lab_id} ${student_id}"
```

## Expected Verification

```bash
# The exploit should now fail (return nothing or a 404)
curl --path-as-is -s http://apache-host/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd

# The home page should still work
curl -s -o /dev/null -w '%{http_code}' http://apache-host/
```

The path traversal should no longer return `/etc/passwd`. The home page should
still return HTTP 200.

## Final-Lab Improvement

For production, also consider:

-   Upgrading Apache to the latest patched version (2.4.51+ or current stable)
-   Disabling all unnecessary modules
-   Implementing a Web Application Firewall (WAF) with virtual-patching rules
-   Running periodic vulnerability scans to catch outdated software early
-   Establishing a patch-management window and asset inventory
