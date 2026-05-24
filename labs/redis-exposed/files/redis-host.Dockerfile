FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      openssh-server \
      procps \
      redis-server \
      redis-tools \
      sudo \
      tini \
      vim-tiny \
    && mkdir -p /run/sshd /usr/local/etc/redis /data /opt/lab/seed \
    && rm -rf /var/lib/apt/lists/*

COPY files/redis-entrypoint.sh /usr/local/sbin/redis-entrypoint
COPY files/restart-redis.sh /usr/local/sbin/restart-redis
COPY files/redis.conf.vulnerable /opt/lab/baseline/redis.conf
COPY seed/redis-seed.txt /opt/lab/seed/redis-seed.txt

RUN useradd --create-home --shell /bin/bash redisadmin \
    && ssh-keygen -A \
    && sed -i 's/^session\s\+required\s\+pam_loginuid.so/session optional pam_loginuid.so/' /etc/pam.d/sshd \
    && printf '%s\n' \
      'PasswordAuthentication yes' \
      'PermitRootLogin no' \
      'AllowUsers redisadmin' \
      > /etc/ssh/sshd_config.d/lab.conf \
    && printf '%s\n' \
      'redisadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-redis' \
      > /etc/sudoers.d/redisadmin-restart \
    && chmod 0440 /etc/sudoers.d/redisadmin-restart \
    && chmod 0755 /usr/local/sbin/redis-entrypoint /usr/local/sbin/restart-redis \
    && chown -R redis:redis /data /usr/local/etc/redis

EXPOSE 22 6379

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/sbin/redis-entrypoint"]
