FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      fail2ban \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash student01 \
    && useradd -m -s /bin/bash student02

RUN mkdir -p /opt/lab/keys \
    && ssh-keygen -t ed25519 -f /opt/lab/keys/lab_key -N "" -q \
    && chmod 600 /opt/lab/keys/lab_key

COPY config.vulnerable /opt/lab/baseline/sshd_config
COPY setup-vulnerable.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 22
