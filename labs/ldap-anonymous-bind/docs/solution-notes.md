# Solution Notes: Open Directory

## Root Cause

The OpenLDAP server is configured with `olcAccess: to * by * read` on the
mdb database. This grants anonymous users full read access to the entire
directory, including user accounts, email addresses, group memberships, and
password hashes. TLS is not configured, so all queries travel in plaintext.

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
```

## POC Fix

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

This allows anonymous users only the `auth` permission (bind) — they can
authenticate but cannot search or read entries.

### 2. Enable TLS

Configure slapd to use the pre-generated TLS certificates:

```bash
ldapmodify -Y EXTERNAL -H ldapi:// <<'EOF'
dn: cn=config
changetype: modify
add: olcTLSCertificateFile
olcTLSCertificateFile: /etc/ldap/tls/ldap-server.crt
-
add: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/ldap/tls/ldap-server.key
EOF
```

### 3. Restart slapd

```bash
# Kill the running slapd process
pkill slapd
sleep 2
# Then restart the container from the portal, or manually start slapd:
# podman exec -d <container> /usr/sbin/slapd -h 'ldap:/// ldaps:/// ldapi:///' -u openldap -g openldap -F /etc/ldap/slapd.d
```

Note: the entrypoint runs `tail -f` as a foreground process, so killing
slapd does NOT auto-restart it. You must restart the container or start
slapd manually.

### 4. Verify with StartTLS

```bash
ldapsearch -x -ZZ -H ldap://ldap-host -b "dc=lab,dc=local" "(objectClass=posixAccount)" cn
```

The `-ZZ` flag requires StartTLS. If TLS is working, the query succeeds
over an encrypted connection. Without TLS, this would fail.

## Automated Verification

```bash verifier
# 1. Restrict anonymous access
ldapmodify -Y EXTERNAL -H ldapi:// <<'EOF'
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcAccess
olcAccess: to attrs=userPassword by self write by anonymous auth by * none
olcAccess: to attrs=shadowLastChange by self write by * read
olcAccess: to * by users read by anonymous auth
EOF

# 2. Enable TLS
ldapmodify -Y EXTERNAL -H ldapi:// <<'EOF'
dn: cn=config
changetype: modify
add: olcTLSCertificateFile
olcTLSCertificateFile: /etc/ldap/tls/ldap-server.crt
-
add: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/ldap/tls/ldap-server.key
EOF

# 3. Restart slapd
pkill slapd
sleep 3
```

## Expected Verification

```bash
# Anonymous search should fail
ldapsearch -x -H ldap://ldap-host -b "dc=lab,dc=local" "(objectClass=posixAccount)" cn
# Expected: Insufficient access

# StartTLS should work (self-signed cert requires LDAPTLS_REQCERT=never)
LDAPTLS_REQCERT=never ldapsearch -x -ZZ -H ldap://ldap-host -b "" -s base namingContexts
# Expected: namingContexts: dc=lab,dc=local
```

## Final-Lab Improvement

For production, also consider:

-   Requiring SASL authentication instead of simple bind
-   Using certificate-based client authentication
-   Implementing fine-grained ACLs per OU (e.g., only HR can read phone numbers)
-   Enabling audit logging with `loglevel stats`
-   Configuring replication for high availability
-   Using certificates from a proper CA instead of self-signed
