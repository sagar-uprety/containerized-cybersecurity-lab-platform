# PATTERN C AUTHORING REFERENCE - Proxy / Firewall / Segmentation
#
# One image carries BOTH the edge proxy and the internal backend. Each container
# selects its script and config through LAB_* variables in scenario.yaml. This
# reference uses an APPLICATION-LAYER proxy for segmentation, so it needs no
# extra capabilities. For the packet-filter variant of Pattern C, see the
# firewall lab, which adds NET_ADMIN and iptables.
FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1000 --create-home --shell /bin/bash proxyadmin \
    && printf '%s\n' \
      'proxyadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-edge-proxy' \
      > /etc/sudoers.d/proxyadmin \
    && chmod 0440 /etc/sudoers.d/proxyadmin

COPY reload-edge-proxy.sh /usr/local/sbin/reload-edge-proxy
RUN chmod 0755 /usr/local/sbin/reload-edge-proxy

COPY proxy.env.vulnerable /opt/lab/baseline/proxy.env
COPY backend.env.baseline /opt/lab/baseline/backend.env
COPY seed.txt /opt/lab/seed/seed.txt
COPY setup-proxy.sh /opt/lab/hooks/setup-proxy.sh
COPY setup-backend.sh /opt/lab/hooks/setup-backend.sh
COPY edge-proxy.py /opt/lab/edge-proxy.py
COPY internal-backend.py /opt/lab/internal-backend.py
RUN chmod 0755 /opt/lab/hooks/setup-proxy.sh /opt/lab/hooks/setup-backend.sh \
      /opt/lab/edge-proxy.py /opt/lab/internal-backend.py

EXPOSE 8080
