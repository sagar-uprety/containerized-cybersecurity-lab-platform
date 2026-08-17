FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      apache2 \
      iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Set the banner directive explicitly so the vulnerable baseline is reproducible.
RUN mkdir -p /etc/ssh/sshd_config.d \
    && printf 'DebianBanner yes\n' > /etc/ssh/sshd_config.d/zz-lab-banner.conf

# Stage verbose Apache banner settings through the resettable config path.
COPY config.vulnerable /opt/lab/baseline/apache-security.conf

# A small internal diagnostic page that should never be reachable from the
# outside. Content is entirely fabricated lab-internal detail (dummy IPs,
# dummy backend names).
COPY debug-page.html /var/www/html/internal-status.html

EXPOSE 22 80
