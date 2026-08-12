# PATTERN D AUTHORING REFERENCE - service image
#
# The target service is an ordinary standalone (Pattern A) records service. The
# thing that makes this lab Pattern D is the CUSTOM WORKSTATION image, built by
# Dockerfile.workstation and wired in scenario.yaml. This service Dockerfile is
# unremarkable on purpose.
FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1000 --create-home --shell /bin/bash recadmin \
    && printf '%s\n' \
      'recadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-records-service' \
      > /etc/sudoers.d/recadmin \
    && chmod 0440 /etc/sudoers.d/recadmin

COPY reload-records-service.sh /usr/local/sbin/reload-records-service
RUN chmod 0755 /usr/local/sbin/reload-records-service

COPY config.vulnerable /opt/lab/baseline/config.env
COPY seed.txt /opt/lab/seed/seed.txt
COPY setup-service.sh /opt/lab/hooks/pre-start.sh
COPY records-service.py /opt/lab/records-service.py
RUN chmod 0755 /opt/lab/hooks/pre-start.sh /opt/lab/records-service.py

EXPOSE 8080
