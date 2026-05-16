FROM python:3.12-slim

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/config /app/defaults \
    && chown -R appuser:appuser /app

COPY demo-app/app.py /app/app.py
COPY seed/app-config.env.tpl /app/defaults/app-config.env
COPY demo-app/entrypoint.sh /usr/local/bin/demo-app-entrypoint

RUN chmod 0755 /usr/local/bin/demo-app-entrypoint

WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/demo-app-entrypoint"]
