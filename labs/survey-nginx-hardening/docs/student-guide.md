# Securing an Nginx Web Server

_Note: You are not expected to have Nginx/domain knowledge for the purpose of the survey. This guide supplies the exact copy-paste commands to do the lab so every survey participant evaluates the
same platform workflow. In real university setting, students are expected to have the prior domain knowledge and the guide would differ in depth and explicit instructions._

## Scenario

**Role:** New IT support hire

A colleague set up an internal web-server (nginx) site quickly and asked you to secure two
settings that reveal more information than they should.

## Why This Matters

Web servers often reveal information they do not need to. Two of the most common
examples are advertising the exact **software version** (which tells an attacker
exactly what to target) and leaving **directory listing** switched on (which lets
anyone browse and download files that were never meant to be public).

## Objectives

By the end of this lab you should be able to:

-   See how a web server can leak its version and expose a private directory
-   Turn off both weaknesses by changing two configuration lines
-   Confirm the fix with the portal checker

## Prerequisites Knowledge

-   Basic Linux terminal usage
-   The idea that a web server like nginx has a configuration file you can edit

## Your Lab Environment

1. Run **Start Lab** if you have not already done so, the browser terminal opens on the
   **workstation** host terminal.

2. Click **Run Check** in the portal. You will see some failed checks as expected. You can run this at anytime to give you idea of the objectives and checks that you have to pass.

## Investigation

See the two problems for yourself. Run these on the workstation terminal.

The server tells everyone its exact version in the `Server:` header:

```bash
curl -sI http://nginx-host:8080/
```

The `/files/` directory is wide open - you can list and download everything:

```bash
curl -s http://nginx-host:8080/files/
curl -s http://nginx-host:8080/files/db-backup.sql
```

You should see a `Server: nginx/<version>` line, a browsable listing of
`/files/`, and the contents of a "backup" file that should never have been
reachable. That is the leak you are about to close. (The files are fake demo
data - nothing real is exposed.)

## Remediate

**Step 1: Take a look at the current content first:**

```bash
cat /lab/nginx/site.conf
```

In that file, `server_tokens on;` should become
`server_tokens off;`, and `autoindex on;` should become `autoindex off;`.

**Step 2: Edit the config.**
You can make both of the above edits in one shot with `sed`:

```bash
sed -i 's/server_tokens on;/server_tokens off;/; s/autoindex on;/autoindex off;/' /lab/nginx/site.conf
```

**Alternatively,**

Open the file with `nano /lab/nginx/site.conf`, change those two words from
`on` to `off`, and save (`Ctrl-O`, `Enter`, `Ctrl-X`).

**Step 3: Next reload nginx so the change takes effect.**

For this, you need log in over SSH to the nginx-host web server from the workstation and run
its reload helper.

```bash
ssh nginxadmin@nginx-host 'sudo /usr/local/sbin/reload-nginx'
```

The first time you connect, SSH will ask
`Are you sure you want to continue connecting (yes/no/[fingerprint])?` -
type `yes` and press Enter.

It shall then ask you for a password, you can find the password on [SSH Login Password](https://x02lp1.ucc.cit.tum.de/workstation-access)

You should see `nginx configuration reloaded`.

**Step 4: Click _Run Check_ in the portal. Everything should be fixed now.**

**If you're stuck:**

-   Nothing changed when you re-checked? You probably edited the file but did not run the reload (Step 3) - nginx only picks up changes when it reloads.
-   The reload printed an error? You likely removed a semicolon (`;`) by accident. Re-open the file, make sure each line ends with `;`, save, and reload again.
-   Password not accepted? The `nginxadmin` password is the same password you can find [SSH Login Password](https://x02lp1.ucc.cit.tum.de/workstation-access)

## Verify

If you run the same investigation commands again - they should look different now.

The version is no longer shown (just `Server: nginx`):

```bash
curl -sI http://nginx-host:8080/
```

Directory listing is now refused (403), and the normal home page still works:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://nginx-host:8080/files/
curl -s http://nginx-host:8080/
```

Select **End Lab** in the portal. You will be asked for end-of-lab feedback, you can click "Skip Feedback" as you will answer them on the actual survey.

You will now be able to see you lab results under **My Results**

Thank you very much for taking the time to use the platform. Please proceed to filling the [Survey Form](https://jotform.com/261886735461064)

## Real-World Context (Optional Reading)

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
