# Securing an Nginx Web Server

A colleague set up a small internal web server (nginx) in a hurry and asked you
to tidy up **settings that are leaking more than they should**. You will look
at the problem, change two lines, reload the server, and confirm it is fixed.

> **Study-lab notice:** This is a real, deliberately short beginner lab. For the
> study, the guide supplies the exact commands so every participant evaluates
> the same platform workflow. Standard labs on this platform use guiding
> questions and optional hints instead of providing the complete solution.

## Why This Matters

Web servers often reveal information they do not need to. Two of the most common
examples are advertising the exact software version (which tells an attacker
exactly what to target) and leaving **directory listing** switched on (which lets
anyone browse and download files that were never meant to be public). Both are
standard hardening items in the **CIS NGINX Benchmark**, and directory listing in
particular (CWE-548) is a real cause of data leaks. You are about to see one
first-hand and close it.

## Objectives

By the end of this lab you should be able to:

-   See how a web server can leak its version and expose a private directory
-   Turn off both weaknesses by changing two configuration lines
-   Confirm the fix with the portal checker

## Prerequisites

-   Basic Linux terminal usage
-   The idea that a web server has a configuration file you can edit

If you want a little background, these are optional:

-   nginx `server_tokens` directive: <https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens>
-   nginx `autoindex` directive: <https://nginx.org/en/docs/http/ngx_http_autoindex_module.html>
-   Directory listing exposure (CWE-548): <https://cwe.mitre.org/data/definitions/548.html>

## Your Lab Environment

When you select **Start Lab**, the browser terminal opens on the
**workstation**. The **web server** (`nginx-host`) runs on the same isolated lab
network.

What you will use:

-   `/lab/nginx/site.conf` - the web server's configuration file. You can open
    and edit it on the workstation with `nano` or `vim`.
-   **Web-server login** - to reload nginx after editing, log in to the server
    over SSH as `nginxadmin`. Its password is **your own lab password**, shown
    on the portal's **Workstation Access** page.

The main portal controls are **Start Lab**, **Run Check**, **Reset**, and
**End Lab**. **Reset** puts everything back to the vulnerable starting state, so
use it only if you need to start over; it does not apply your fix.

If the browser terminal does not open, use the SSH fallback endpoint shown on the
portal's Workstation Access page.

## Your Mission

1. Look at the two problems on the web server.
2. Fix them by editing two lines in the config file.
3. Reload the web server so your changes take effect.
4. Run **Run Check** in the portal and see it turn green.
5. Complete the short feedback form after ending the lab.

## Investigation

First, see the two problems for yourself. Run these on the workstation terminal:

```bash
# 1) The server tells everyone its exact version in the "Server:" header:
curl -sI http://nginx-host:8080/

# 2) The /files/ directory is wide open - you can list and download everything:
curl -s http://nginx-host:8080/files/
curl -s http://nginx-host:8080/files/db-backup.sql
```

You should see a `Server: nginx/<version>` line, a browsable listing of
`/files/`, and the contents of a "backup" file that should never have been
reachable. That is the leak you are about to close. (The files are fake demo
data - nothing real is exposed.)

## Remediate

You need to change **two lines** in `/lab/nginx/site.conf`, then reload nginx.

**What to change:** in that file, `server_tokens on;` should become
`server_tokens off;`, and `autoindex on;` should become `autoindex off;`.

**Edit the config.** Open the file with `nano /lab/nginx/site.conf`,
change those two words from `on` to `off`, and save (`Ctrl-O`, `Enter`,
`Ctrl-X`).

You may use `vim` or `sed` instead if you are comfortable with those tools.

**Now reload nginx** so the change takes effect.

For this, log in over SSH to the web server from the workstation and run
its reload helper:

```bash
# Use your lab password when prompted. Find it on Workstation Access in the portal.
ssh nginxadmin@nginx-host 'sudo /usr/local/sbin/reload-nginx'
```

You should see `nginx configuration reloaded`.

**References:**

-   nginx `server_tokens`: <https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens>
-   nginx `autoindex`: <https://nginx.org/en/docs/http/ngx_http_autoindex_module.html>

**If you're stuck:**

-   Nothing changed when you re-checked? You probably edited the file but did not run the reload step - nginx only picks up changes when it reloads.
-   The reload printed an error? You likely removed a semicolon (`;`) by accident. Re-open the file, make sure each line ends with `;`, save, and reload again.
-   Password not accepted? The `nginxadmin` password is your own lab password from the portal's Workstation Access page.

## Verify

Run the same checks again - they should look different now:

```bash
# Version no longer shown (just "Server: nginx"):
curl -sI http://nginx-host:8080/

# Directory listing is now refused (403):
curl -s -o /dev/null -w '%{http_code}\n' http://nginx-host:8080/files/

# The normal home page still works:
curl -s http://nginx-host:8080/
```

When those look right, click **Run Check** in the portal. All checks should turn
green (`fixed`). You have completed the lab.

## Real-World Context

The two settings you changed are textbook web-server hardening. Advertising the
software version (`server_tokens`) hands attackers a shortcut to matching known
exploits - it is listed in the CIS NGINX Benchmark and maps to CWE-200
(information exposure). Leaving directory listing on (`autoindex`) is more
serious: it is a real and recurring cause of data leaks, where backups,
credentials, and internal files sit in a browsable folder that search engines and
attackers happily index (CWE-548). Turning both off is a one-line change each, and
it is exactly the kind of quick win a real administrator applies during a
hardening pass.

Standard labs on this platform go further: you investigate the problem using
guiding questions and optional hints, then work out the remediation across
services such as SSH, LDAP, firewalls, and databases. Exact commands were
provided here only to standardize the platform experience evaluated in the
study.

**Sources:**

-   CWE-548: Exposure of Information Through Directory Listing. <https://cwe.mitre.org/data/definitions/548.html>
-   CWE-200: Exposure of Sensitive Information. <https://cwe.mitre.org/data/definitions/200.html>
-   nginx core module documentation. <https://nginx.org/en/docs/http/ngx_http_core_module.html>

---

_When you are done, select **End Lab** in the portal and complete the short
feedback form. Please answer about the platform and guide you actually used._
