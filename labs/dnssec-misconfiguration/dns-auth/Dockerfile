FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bind9 \
      bind9utils \
      bind9-dnsutils \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/bind/named.conf

RUN useradd -m -s /bin/bash dnsauthadmin

RUN mkdir -p /var/cache/bind /etc/bind/keys /etc/bind/zones /etc/bind/dnssec-shared \
    && chown -R bind:bind /var/cache/bind /etc/bind/keys /etc/bind/zones \
    && touch /var/log/named.log \
    && chown bind:bind /var/log/named.log

COPY dns-auth/config.vulnerable /opt/lab/baseline/named.conf
COPY dns-auth/zone.lab.internal /etc/bind/zones/db.lab.internal.unsigned
COPY dns-auth/sign-zone.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh \
    && chown bind:bind /etc/bind/zones/db.lab.internal.unsigned

EXPOSE 53/udp 53/tcp
