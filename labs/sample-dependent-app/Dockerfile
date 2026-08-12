# PATTERN B AUTHORING REFERENCE - Service With Dependent Application
#
# One image carries BOTH the shared backend and the dependent app. Each
# container selects its script and config through the generic LAB_* variables in
# scenario.yaml, so a single build serves two runtime services. Keep real lab
# images small and never bake real secrets in.
FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 \
    && rm -rf /var/lib/apt/lists/*

# UID 1000 matches the workstation student, allowing safe editing of the shared
# configuration volumes without a host bind mount.
RUN useradd --uid 1000 --create-home --shell /bin/bash appadmin \
    && printf '%s\n' \
      'appadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-records-backend, /usr/local/sbin/reload-records-app' \
      > /etc/sudoers.d/appadmin \
    && chmod 0440 /etc/sudoers.d/appadmin

COPY reload-records-backend.sh /usr/local/sbin/reload-records-backend
COPY reload-records-app.sh /usr/local/sbin/reload-records-app
RUN chmod 0755 /usr/local/sbin/reload-records-backend /usr/local/sbin/reload-records-app

# Both baseline configs and both scripts ship in the one image; each container
# picks the pair it runs.
COPY backend.env.vulnerable /opt/lab/baseline/backend.env
COPY app.env.vulnerable /opt/lab/baseline/app.env
COPY seed.txt /opt/lab/seed/seed.txt
COPY setup-backend.sh /opt/lab/hooks/setup-backend.sh
COPY setup-app.sh /opt/lab/hooks/setup-app.sh
COPY records-backend.py /opt/lab/records-backend.py
COPY records-app.py /opt/lab/records-app.py
RUN chmod 0755 /opt/lab/hooks/setup-backend.sh /opt/lab/hooks/setup-app.sh \
      /opt/lab/records-backend.py /opt/lab/records-app.py

EXPOSE 8080
