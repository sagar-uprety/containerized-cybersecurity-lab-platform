# Securing an Nginx Web Server

## Situation

**Role:** New IT support hire

A colleague set up an internal nginx site quickly and asked you to secure two
settings that reveal more information than they should. Investigate both
exposures, harden the configuration, reload the service, and verify the result.
The survey guide supplies the exact commands so every participant evaluates the
same platform workflow.

> **Survey-lab notice:** This is a real, deliberately short beginner lab. For the
> survey, the guide supplies the exact commands so every participant evaluates
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

If you want some more background, you can read here, but these are optional:

-   nginx `server_tokens` directive: <https://nginx.org/en/docs/http/ngx_http_core_module.html#server_tokens>
-   nginx `autoindex` directive: <https://nginx.org/en/docs/http/ngx_http_autoindex_module.html>
-   Directory listing exposure (CWE-548): <https://cwe.mitre.org/data/definitions/548.html>

## Your Lab Environment

When you select **Start Lab**, the browser terminal opens on the
**workstation** host terminal.

**web server** the actual nginx server lives in the (`nginx-host`) and runs on the same isolated lab
network.

You can **Run Check** in the portal at any time of the lab. This is recommended to give you idea of the objectives and mandatory checks that you have to pass. Please note that GUARDRAILS are just.

## Your Mission

1. Look at the two problems on the web server.
2. Fix them by editing two lines in the config file.
3. Reload the web server so your changes take effect.
4. Run **Run Check** in the portal and see it turn green.
5. Complete the short feedback form after ending the lab.

## Investigation

Click **Run Check** in the portal. You will see some failed checks as expected.

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

You need to edit the nginx config file in `/lab/nginx/site.conf`, then reload nginx.

Take a look at the current content first:

```bash
cat /lab/nginx/site.conf
```

**Edit the config.** In that file, `server_tokens on;` should become
`server_tokens off;`, and `autoindex on;` should become `autoindex off;`.

Open the file with `nano /lab/nginx/site.conf`, change those two words from
`on` to `off`, and save (`Ctrl-O`, `Enter`, `Ctrl-X`). You may use `vim`
instead if you prefer, or make both edits in one shot with `sed`:

```bash
sed -i 's/server_tokens on;/server_tokens off;/; s/autoindex on;/autoindex off;/' /lab/nginx/site.conf
```

**Now reload nginx** so the change takes effect.

For this, log in over SSH to the nginx-host web server from the workstation and run
its reload helper. You can find the password on [SSH Login Password](https://x02lp1.ucc.cit.tum.de/workstation-access) page in the lab portal.

```bash
ssh nginxadmin@nginx-host 'sudo /usr/local/sbin/reload-nginx'
```

The first time you connect, SSH will ask
`Are you sure you want to continue connecting (yes/no/[fingerprint])?` -
type `yes` and press Enter.

You should see `nginx configuration reloaded`.

**If you're stuck:**

-   Nothing changed when you re-checked? You probably edited the file but did not run the reload step - nginx only picks up changes when it reloads.
-   The reload printed an error? You likely removed a semicolon (`;`) by accident. Re-open the file, make sure each line ends with `;`, save, and reload again.
-   Password not accepted? The `nginxadmin` password is the same password you can find [SSH Login Password](https://x02lp1.ucc.cit.tum.de/workstation-access)

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

Click **Run Check** in the portal. All checks should turn
green (`fixed`). You have completed the lab. Select **End Lab** in the portal and
complete the short feedback form.

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
survey.

**Sources:**

-   CWE-548: Exposure of Information Through Directory Listing. <https://cwe.mitre.org/data/definitions/548.html>
-   CWE-200: Exposure of Sensitive Information. <https://cwe.mitre.org/data/definitions/200.html>
-   nginx core module documentation. <https://nginx.org/en/docs/http/ngx_http_core_module.html>
