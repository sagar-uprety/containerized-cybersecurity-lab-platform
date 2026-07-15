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

## POC Compensating Mitigation

Apache remains at vulnerable version 2.4.49 in this lab. The steps below do not
patch CVE-2021-41773; they apply a narrow compensating mitigation by restoring
the secure filesystem-root default and removing the unnecessary CGI module,
URL mapping, and directory grant that expose the traversal path. Production
remediation still requires upgrading to a supported release.

### 1. Edit the Apache configuration

The `apache_config` shared volume mounts the server's configuration directory
directly into the workstation at `/lab/apache` - edit
`/lab/apache/httpd.conf` from the workstation, no SSH required:

```bash
# Context: student workstation
sed -i '/^<Directory \/>$/,/^<\/Directory>$/ s/Require all granted/Require all denied/' /lab/apache/httpd.conf
sed -i 's/^LoadModule cgi_module /#LoadModule cgi_module /' /lab/apache/httpd.conf
sed -i 's/^Alias \/cgi-bin\//#Alias \/cgi-bin\//' /lab/apache/httpd.conf
sed -i '/<Directory "\/usr\/local\/apache2\/cgi-bin\/">/,/<\/Directory>/d' /lab/apache/httpd.conf
```

These edits are rerun-safe: subsequent runs leave already-commented directives
unchanged and find no removed directory block.

Or edit `/lab/apache/httpd.conf` by hand and make these changes:

-   Set the root `<Directory />` policy to `Require all denied`
-   Comment out or remove `LoadModule cgi_module modules/mod_cgi.so`
-   Comment out or remove the `Alias /cgi-bin/ "/usr/local/apache2/cgi-bin/"` line
-   Remove the entire `<Directory "/usr/local/apache2/cgi-bin/">` block

### 2. Restart Apache

The restart helper validates the configuration and gracefully reloads the
existing foreground server. Run it through the student CLI's interactive,
nested SSH path. `apacheadmin`'s password is the student's own lab password:

```bash
# Context: student workstation
ssh -o StrictHostKeyChecking=accept-new apacheadmin@apache-host
```

```bash
# Context: apacheadmin shell on apache-host
sudo /usr/local/sbin/restart-apache
exit
```

## Expected Verification

```bash
# Context: student workstation
# The exploit response should be 403 or 404 and must not contain /etc/passwd
curl --path-as-is -sS -o /tmp/traversal-body -w '%{http_code}\n' http://apache-host/cgi-bin/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd
grep '^root:' /tmp/traversal-body || echo 'No passwd disclosure'

# The home page must return actual HTTP 200
curl -sS -o /dev/null -w '%{http_code}\n' http://apache-host/
```

The checker does not accept an arbitrary 404, HTTP 500, or failed connection as
a fix. It requires the hardened root policy, absent active CGI module/mapping/
directory grant, an exploit response of 403 or 404 without `/etc/passwd`, and a
normal home-page response of HTTP 200.

## Final-Lab Improvement

For production, also consider:

-   Upgrading Apache to the current supported release. Version 2.4.51 was the
    historical minimum that fully fixed CVE-2021-41773, but it is not current
    production guidance. At the July 2026 review, Apache recommends 2.4.68;
    verify the latest release on the
    [official security page](https://httpd.apache.org/security/vulnerabilities_24.html).
-   Disabling all unnecessary modules
-   Implementing a Web Application Firewall (WAF) with virtual-patching rules
-   Running periodic vulnerability scans to catch outdated software early
-   Establishing a patch-management window and asset inventory
