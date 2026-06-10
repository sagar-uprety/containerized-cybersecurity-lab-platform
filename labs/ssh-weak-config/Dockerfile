FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      fail2ban \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash lab-user \
    && useradd -m -s /bin/bash svc-user

RUN mkdir -p /opt/lab/keys \
    && ssh-keygen -t ed25519 -f /opt/lab/keys/lab_key -N "" -q \
    && chmod 600 /opt/lab/keys/lab_key

RUN rm -f /etc/ssh/sshd_config
COPY config.vulnerable /opt/lab/baseline/sshd_config
COPY setup-vulnerable.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

RUN mkdir -p /etc/fail2ban \
    && printf '[sshd]\nenabled = false\nport = ssh\nfilter = sshd\nlogpath = /var/log/auth.log\nmaxretry = 3\nbantime = 600\nfindtime = 600\n' \
       > /etc/fail2ban/jail.local

EXPOSE 22
