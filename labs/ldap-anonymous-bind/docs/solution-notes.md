# Solution Notes: LDAP Directory Exposure with Anonymous Bind

## Root Cause

The OpenLDAP server is configured with `olcAccess: to * by * read` on the MDB
database. This grants anonymous users read/search access to names, UIDs,
numeric IDs, home directories, email addresses, telephone numbers, group
memberships, and password hashes. Anonymous bind acceptance alone is not this
vulnerability: a secure ACL may retain `by anonymous auth` so clients can bind
while preventing anonymous reads and searches. TLS is initially unavailable
and therefore not enforced.

## Impact Demonstration

```bash
# Anonymous search returns all user entries
ldapsearch -x -H ldap://ldap-host -b "dc=lab,dc=local" "(objectClass=posixAccount)"

# Extract email addresses
ldapsearch -x -H ldap://ldap-host -b "ou=people,dc=lab,dc=local" mail

# Reveal group memberships and org structure
ldapsearch -x -H ldap://ldap-host -b "ou=groups,dc=lab,dc=local" memberUid

# Show password hashes are readable
ldapsearch -x -H ldap://ldap-host -b "ou=people,dc=lab,dc=local" userPassword

# Show other retained exposed attributes
ldapsearch -x -H ldap://ldap-host -b "ou=people,dc=lab,dc=local" cn uid uidNumber gidNumber homeDirectory mail telephoneNumber
```

## POC Fix

### 0. Reach the LDAP host

The `cn=config` (OLC) changes below are applied via `ldapmodify -Y EXTERNAL
-H ldapi://`, which authenticates over a local Unix socket - it is not
reachable from the workstation over the network. SSH into the directory
server itself using credentials published inside this isolated lab:

```bash
# Context: student workstation
cat /lab/access/credentials.txt
ssh -o StrictHostKeyChecking=accept-new root@ldap-host
```

Run the remaining steps in that session.

### 1. Restrict anonymous access

Apply an ACL that requires authentication for read access:

```bash
ldapmodify -Y EXTERNAL -H ldapi:// <<'EOF'
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcAccess
olcAccess: to attrs=userPassword by self write by anonymous auth by * none
olcAccess: to attrs=shadowLastChange by self write by * read
olcAccess: to * by users read by anonymous auth
EOF
```

This allows anonymous users only the `auth` permission (bind) - they can
authenticate but cannot search or read entries.

### 2. Enable TLS

Configure slapd to use the pre-generated TLS certificates and require TLS for
LDAP operations. `replace` makes this safe to run again after a partial attempt:

```bash
ldapmodify -Y EXTERNAL -H ldapi:// <<'EOF'
dn: cn=config
changetype: modify
replace: olcTLSCertificateFile
olcTLSCertificateFile: /etc/ldap/tls/ldap-server.crt
-
replace: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/ldap/tls/ldap-server.key
-
replace: olcSecurity
olcSecurity: tls=1
EOF
```

### 3. Restart slapd

The portal's **Reset** action would wipe the fix back to the vulnerable
baseline, so don't use it here. Restart slapd manually, from the same SSH
session, so it picks up the new `cn=config` values:

```bash
# Context: root shell on ldap-host
pkill slapd
sleep 2
setsid /usr/sbin/slapd -h 'ldap:/// ldaps:/// ldapi:///' -u openldap -g openldap -F /etc/ldap/slapd.d < /dev/null > /dev/null 2>&1 &
disown
sleep 2
```

Note: the entrypoint runs `tail -f` as a foreground process, so killing
slapd does NOT auto-restart it - you must start it again yourself.
`setsid`/`disown` detach the new process from the SSH session so it keeps
running after you disconnect.

### 4. Verify with StartTLS

```bash
# Context: student workstation, after leaving the ldap-host SSH session
LDAPTLS_REQCERT=never ldapsearch -x -ZZ -H ldap://ldap-host \
  -D "cn=admin,dc=lab,dc=local" -w dummypassword \
  -b "dc=lab,dc=local" "(objectClass=posixAccount)" cn
```

The `-ZZ` flag requires StartTLS. If TLS is working, the query succeeds
over an encrypted connection. Without TLS, this would fail.
`LDAPTLS_REQCERT=never` is required because the certificate is self-signed;
without it, ldapsearch fails on certificate verification even when StartTLS
itself is configured correctly.

## Expected Verification

```bash
# Context: student workstation
# Anonymous StartTLS search should fail
LDAPTLS_REQCERT=never ldapsearch -x -ZZ -H ldap://ldap-host -b "dc=lab,dc=local" "(objectClass=posixAccount)" cn
# Expected: Insufficient access

# Authenticated plaintext should fail
ldapsearch -x -H ldap://ldap-host -D "cn=admin,dc=lab,dc=local" -w dummypassword -b "dc=lab,dc=local" cn
# Expected: Confidentiality required

# The same authenticated query should succeed with required StartTLS
LDAPTLS_REQCERT=never ldapsearch -x -ZZ -H ldap://ldap-host -D "cn=admin,dc=lab,dc=local" -w dummypassword -b "dc=lab,dc=local" cn
```

## Final-Lab Improvement

For production, also consider:

-   Requiring SASL authentication instead of simple bind
-   Using certificate-based client authentication
-   Implementing fine-grained ACLs per OU (e.g., only HR can read phone numbers)
-   Enabling audit logging with `loglevel stats`
-   Configuring replication for high availability
-   Using certificates from a proper CA instead of self-signed
