FROM thesis-labs/lab-service-base:1.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      samba \
      smbclient \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/samba/smb.conf

RUN useradd -m -s /bin/bash sambaadmin \
    && echo "sambaadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-samba, /usr/bin/smbpasswd" \
      > /etc/sudoers.d/sambaadmin \
    && chmod 0440 /etc/sudoers.d/sambaadmin

RUN groupadd -r allowed \
    && useradd -m -s /usr/sbin/nologin -G allowed shareuser

RUN printf '#!/bin/sh\nset -e\nPIDS=$(pgrep -x smbd 2>/dev/null || true)\nif [ -n "$PIDS" ]; then\n  kill -HUP $PIDS 2>/dev/null || true\n  sleep 1\nelse\n  setsid smbd -D --no-process-group < /dev/null > /dev/null 2>&1 &\nfi\necho "Samba configuration reloaded"\n' > /usr/local/sbin/restart-samba \
    && chmod 0755 /usr/local/sbin/restart-samba

RUN mkdir -p /srv/samba/backup /var/log/samba

COPY config.vulnerable /opt/lab/baseline/smb.conf
COPY setup-smb.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 445
