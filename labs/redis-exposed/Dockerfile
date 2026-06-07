FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      redis-server \
      redis-tools \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash redisadmin \
    && echo "redisadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-redis" > /etc/sudoers.d/redisadmin \
    && chmod 0440 /etc/sudoers.d/redisadmin

RUN printf '#!/bin/sh\nset -e\npkill redis-server || true\nwhile pgrep redis-server > /dev/null; do sleep 0.1; done\nredis-server /usr/local/etc/redis/redis.conf --logfile /var/log/redis-server.log &\necho "Redis restarted"\n' > /usr/local/sbin/restart-redis \
    && chmod 0755 /usr/local/sbin/restart-redis

COPY config.vulnerable /opt/lab/baseline/redis.conf
COPY seed.txt /opt/lab/seed/seed.txt

EXPOSE 6379
