FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      postfix \
      swaks \
    && rm -rf /var/lib/apt/lists/*

RUN postconf -e "myhostname = postfix-host" \
    && postconf -e "myorigin = \$myhostname" \
    && postconf -e "mydestination = \$myhostname, localhost.\$mydomain, localhost" \
    && postconf -F "smtp/inet/chroot=n" \
    && rm -f /etc/postfix/main.cf

RUN useradd -m -s /bin/bash postfixadmin \
    && echo "postfixadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-postfix" > /etc/sudoers.d/postfixadmin \
    && chmod 0440 /etc/sudoers.d/postfixadmin

RUN printf '#!/bin/sh\nset -e\npostfix check\npostfix reload\necho "Postfix reloaded"\n' > /usr/local/sbin/restart-postfix \
    && chmod 0755 /usr/local/sbin/restart-postfix

COPY config.vulnerable /opt/lab/baseline/main.cf
COPY setup-permissions.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 25
