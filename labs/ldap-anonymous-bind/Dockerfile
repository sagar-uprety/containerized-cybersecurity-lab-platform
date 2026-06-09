FROM thesis-labs/lab-service-base:1.0

ENV DEBIAN_FRONTEND=noninteractive

SHELL ["/bin/bash", "-o", "pipefail"]

# Pre-seed slapd debconf to avoid interactive prompts
RUN echo "slapd slapd/internal/generated_adminpw password dummypassword" \
      | debconf-set-selections \
    && echo "slapd slapd/internal/adminpw password dummypassword" \
      | debconf-set-selections \
    && echo "slapd slapd/password2 password dummypassword" \
      | debconf-set-selections \
    && echo "slapd slapd/password1 password dummypassword" \
      | debconf-set-selections \
    && echo "slapd slapd/domain string lab.local" \
      | debconf-set-selections \
    && echo "slapd shared/organization string Lab Org" \
      | debconf-set-selections \
    && echo "slapd slapd/purge_database boolean true" \
      | debconf-set-selections \
    && echo "slapd slapd/move_old_database boolean true" \
      | debconf-set-selections \
    && echo "slapd slapd/no_configuration boolean false" \
      | debconf-set-selections \
    && echo "slapd slapd/backend select MDB" \
      | debconf-set-selections

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ldap-utils \
      slapd \
    && rm -rf /var/lib/apt/lists/*

# Ensure slapd directories exist with correct ownership
RUN mkdir -p /var/run/slapd /var/lib/ldap /etc/ldap/slapd.d /var/log \
    && chown -R openldap:openldap /var/run/slapd /var/lib/ldap /etc/ldap/slapd.d

# Copy vulnerable config and setup script
COPY config.vulnerable /opt/lab/baseline/slapd-config.ldif
COPY setup-vulnerable.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 389
