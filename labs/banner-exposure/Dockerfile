FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      apache2 \
      iproute2 \
    && rm -rf /var/lib/apt/lists/*

# SSH: explicit, discoverable vulnerable-baseline banner directive. Debian's
# OpenSSH build appends a distro tag to the protocol identification string
# unless DebianBanner is turned off; the directive is written out explicitly
# (rather than left implicit) so students have a concrete file to find and
# edit, matching how the same protocol version string looks in the real
# world by default.
RUN mkdir -p /etc/ssh/sshd_config.d \
    && printf 'DebianBanner yes\n' > /etc/ssh/sshd_config.d/zz-lab-banner.conf

# Apache: vulnerable-baseline verbose banner/signature config, staged through
# the generic entrypoint's config mechanism (LAB_CONFIG_SRC/LAB_CONFIG_DST)
# so a reset always restores this exact baseline.
COPY config.vulnerable /opt/lab/baseline/apache-security.conf

# A small internal diagnostic page that should never be reachable from the
# outside. Content is entirely fabricated lab-internal detail (dummy IPs,
# dummy backend names) - see intentional-risk-allowlist.yaml.
COPY debug-page.html /var/www/html/internal-status.html

EXPOSE 22 80
