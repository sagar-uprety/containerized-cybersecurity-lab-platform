FROM thesis-labs/lab-service-base:2026-06-06

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      redis-server \
      redis-tools \
    && rm -rf /var/lib/apt/lists/*

COPY config.vulnerable /opt/lab/baseline/redis.conf
COPY seed.txt /opt/lab/seed/seed.txt

EXPOSE 6379
