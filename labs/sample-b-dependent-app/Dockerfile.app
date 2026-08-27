# Pattern B dependent app, built independently from its shared backend.
FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1000 --create-home --shell /bin/bash appadmin \
    && printf '%s\n' \
      'appadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-records-app' \
      > /etc/sudoers.d/appadmin \
    && chmod 0440 /etc/sudoers.d/appadmin

COPY reload-records-app.sh /usr/local/sbin/reload-records-app
RUN chmod 0755 /usr/local/sbin/reload-records-app

COPY app.env.vulnerable /opt/lab/baseline/config.env
COPY setup-app.sh /opt/lab/hooks/pre-start.sh
COPY records-app.py /opt/lab/records-app.py
RUN chmod 0755 /opt/lab/hooks/pre-start.sh /opt/lab/records-app.py

EXPOSE 8080
