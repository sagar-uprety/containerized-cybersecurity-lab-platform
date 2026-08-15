FROM thesis-labs/lab-service-base:1.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      vsftpd \
      openssl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/vsftpd.conf

RUN useradd -m -s /bin/bash ftpadmin \
    && echo "ftpadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-vsftpd" \
      > /etc/sudoers.d/ftpadmin \
    && chmod 0440 /etc/sudoers.d/ftpadmin

RUN id -u ftp >/dev/null 2>&1 || useradd -r -d /srv/ftp -s /usr/sbin/nologin ftp \
    && useradd -m -d /home/ftpuser -s /usr/sbin/nologin ftpuser \
    && grep -qx /usr/sbin/nologin /etc/shells || echo /usr/sbin/nologin >> /etc/shells

COPY restart-vsftpd.sh /usr/local/sbin/restart-vsftpd
RUN chmod 0755 /usr/local/sbin/restart-vsftpd

RUN mkdir -p /srv/ftp/pub /var/log /var/empty \
    && chmod 0755 /var/empty

COPY config.vulnerable /opt/lab/baseline/vsftpd.conf
COPY setup-ftp.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 21 21100-21110
