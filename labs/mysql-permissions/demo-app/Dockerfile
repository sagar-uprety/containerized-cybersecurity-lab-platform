FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      mariadb-client \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin appuser

COPY demo-app/app.py /app/app.py
COPY demo-app/entrypoint.sh /usr/local/bin/demo-app-entrypoint

RUN chmod 0755 /usr/local/bin/demo-app-entrypoint

WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/demo-app-entrypoint"]
