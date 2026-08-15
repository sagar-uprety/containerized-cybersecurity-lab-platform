FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bind9 \
      bind9-dnsutils \
      openssh-client \
      sshpass \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/bind/named.conf

RUN useradd -m -s /bin/bash dnsresolveradmin \
    && echo "dnsresolveradmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-bind9" > /etc/sudoers.d/dnsresolveradmin \
    && chmod 0440 /etc/sudoers.d/dnsresolveradmin

RUN printf '#!/bin/sh\nset -e\npkill named || true\nwhile pgrep named > /dev/null; do sleep 0.1; done\nnamed -u bind -c /etc/bind/named.conf -g < /dev/null >> /var/log/named.log 2>&1 &\necho "BIND restarted"\n' > /usr/local/sbin/restart-bind9 \
    && chmod 0755 /usr/local/sbin/restart-bind9

RUN mkdir -p /var/cache/bind /etc/bind/dnssec-shared \
    && chown -R bind:bind /var/cache/bind \
    && touch /var/log/named.log \
    && chown bind:bind /var/log/named.log

COPY config.vulnerable /opt/lab/baseline/named.conf
COPY resolve-forwarder.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 53/udp 53/tcp
