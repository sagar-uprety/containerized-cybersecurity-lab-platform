#!/bin/sh
set -eu

# ── Start slapd temporarily for configuration and seeding ─────────────
/usr/sbin/slapd -h "ldap:/// ldapi:///" -u openldap -g openldap -F /etc/ldap/slapd.d

# Wait for slapd to accept connections
for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ldapsearch -x -H ldapi:// -b "" -s base "(objectClass=*)" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

# ── Apply vulnerable ACL ─────────────────────────────────────────────
ldapmodify -Y EXTERNAL -H ldapi:// -f /opt/lab/baseline/slapd-config.ldif 2>/dev/null || true

# ── Create base DIT ──────────────────────────────────────────────────
ldapadd -x -H ldapi:// -c -D "cn=admin,dc=lab,dc=local" -w dummypassword <<'EOF' || true
dn: dc=lab,dc=local
objectClass: dcObject
objectClass: organization
dc: lab
o: Lab Organization

dn: ou=people,dc=lab,dc=local
objectClass: organizationalUnit
ou: people

dn: ou=groups,dc=lab,dc=local
objectClass: organizationalUnit
ou: groups
EOF

# ── Seed synthetic employee entries ──────────────────────────────────
ldapadd -x -H ldapi:// -c -D "cn=admin,dc=lab,dc=local" -w dummypassword <<'EOF' || true
dn: uid=jdoe,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: John Doe
sn: Doe
mail: jdoe@lab.local
uid: jdoe
uidNumber: 10001
gidNumber: 10001
homeDirectory: /home/jdoe
telephoneNumber: +1-555-0101
userPassword: {SSHA}dUmMyHaShFoRjOhNdOeLaBpAsSwOrD01

dn: uid=asmith,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Alice Smith
sn: Smith
mail: asmith@lab.local
uid: asmith
uidNumber: 10002
gidNumber: 10002
homeDirectory: /home/asmith
telephoneNumber: +1-555-0102
userPassword: {SSHA}dUmMyHaShFoRaLiCeSmItHlAbPaSsWoRd02

dn: uid=bjones,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Bob Jones
sn: Jones
mail: bjones@lab.local
uid: bjones
uidNumber: 10003
gidNumber: 10001
homeDirectory: /home/bjones
telephoneNumber: +1-555-0103
userPassword: {SSHA}dUmMyHaShFoRbObJoNeSlAbPaSsWoRd03

dn: uid=cwilson,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Carol Wilson
sn: Wilson
mail: cwilson@lab.local
uid: cwilson
uidNumber: 10004
gidNumber: 10002
homeDirectory: /home/cwilson
telephoneNumber: +1-555-0104
userPassword: {SSHA}dUmMyHaShFoRcArOlWiLsOnLaBpAsSwOrD04

dn: uid=dlee,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: David Lee
sn: Lee
mail: dlee@lab.local
uid: dlee
uidNumber: 10005
gidNumber: 10001
homeDirectory: /home/dlee
telephoneNumber: +1-555-0105
userPassword: {SSHA}dUmMyHaShFoRdAvIdLeElAbPaSsWoRd05

dn: uid=egarcia,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Eva Garcia
sn: Garcia
mail: egarcia@lab.local
uid: egarcia
uidNumber: 10006
gidNumber: 10002
homeDirectory: /home/egarcia
telephoneNumber: +1-555-0106
userPassword: {SSHA}dUmMyHaShFoReVaGaRcIaLaBpAsSwOrD06

dn: uid=fmiller,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Frank Miller
sn: Miller
mail: fmiller@lab.local
uid: fmiller
uidNumber: 10007
gidNumber: 10001
homeDirectory: /home/fmiller
telephoneNumber: +1-555-0107
userPassword: {SSHA}dUmMyHaShFoRfRaNkMiLlErLaBpAsSwOrD07

dn: uid=gchen,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Grace Chen
sn: Chen
mail: gchen@lab.local
uid: gchen
uidNumber: 10008
gidNumber: 10002
homeDirectory: /home/gchen
telephoneNumber: +1-555-0108
userPassword: {SSHA}dUmMyHaShFoRgRaCeChEnLaBpAsSwOrD08

dn: uid=hpatel,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Hari Patel
sn: Patel
mail: hpatel@lab.local
uid: hpatel
uidNumber: 10009
gidNumber: 10001
homeDirectory: /home/hpatel
telephoneNumber: +1-555-0109
userPassword: {SSHA}dUmMyHaShFoRhArIpAtElLaBpAsSwOrD09

dn: uid=ikim,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: Irene Kim
sn: Kim
mail: ikim@lab.local
uid: ikim
uidNumber: 10010
gidNumber: 10002
homeDirectory: /home/ikim
telephoneNumber: +1-555-0110
userPassword: {SSHA}dUmMyHaShFoRiReNeKiMlAbPaSsWoRd10

dn: uid=ldapadmin,ou=people,dc=lab,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
cn: LDAP Admin
sn: Admin
mail: ldapadmin@lab.local
uid: ldapadmin
uidNumber: 10011
gidNumber: 10003
homeDirectory: /home/ldapadmin
telephoneNumber: +1-555-0199
userPassword: {SSHA}dUmMyHaShFoRlDaPdMiNiStRaToRpAsSwD11
EOF

# ── Seed synthetic group entries ─────────────────────────────────────
ldapadd -x -H ldapi:// -c -D "cn=admin,dc=lab,dc=local" -w dummypassword <<'EOF' || true
dn: cn=developers,ou=groups,dc=lab,dc=local
objectClass: posixGroup
cn: developers
gidNumber: 10001
memberUid: jdoe
memberUid: bjones
memberUid: dlee
memberUid: fmiller
memberUid: hpatel

dn: cn=admins,ou=groups,dc=lab,dc=local
objectClass: posixGroup
cn: admins
gidNumber: 10002
memberUid: asmith
memberUid: cwilson
memberUid: egarcia
memberUid: gchen
memberUid: ikim

dn: cn=interns,ou=groups,dc=lab,dc=local
objectClass: posixGroup
cn: interns
gidNumber: 10003
memberUid: ldapadmin
EOF

# ── Generate self-signed TLS certificates (pre-provisioned) ──────────
mkdir -p /etc/ldap/tls
openssl req -new -x509 -nodes -days 365 \
    -keyout /etc/ldap/tls/ldap-server.key \
    -out /etc/ldap/tls/ldap-server.crt \
    -subj "/CN=ldap-host/O=Lab Org/C=US" \
    -batch 2>/dev/null
chown -R openldap:openldap /etc/ldap/tls
chmod 600 /etc/ldap/tls/ldap-server.key
chmod 644 /etc/ldap/tls/ldap-server.crt

# ── Stop temporary slapd ─────────────────────────────────────────────
killall slapd 2>/dev/null || true
sleep 2
rm -f /var/run/slapd/ldapi

# ── Create log file for entrypoint tail ──────────────────────────────
touch /var/log/slapd.log
chown openldap:openldap /var/log/slapd.log
