# SAMPLE DOCKERFILE
# Keep real lab images small. Start from the shared service base, install only
# target-service dependencies, create one constrained admin path, and copy
# versioned baseline artifacts. Never place real secrets in an image.
FROM thesis-labs/lab-service-base:1.0

# Replace python3-minimal with packages needed by your service. Package versions
# should be pinned when exact version behavior is part of the lesson.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3-minimal \
    && rm -rf /var/lib/apt/lists/*

# UID 1000 is deliberate: the workstation student also uses UID 1000, allowing
# safe editing of the shared configuration volume without a host bind mount.
RUN useradd --uid 1000 --create-home --shell /bin/bash sampleadmin \
    && printf '%s\n' \
      'sampleadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-sample-service' \
      > /etc/sudoers.d/sampleadmin \
    && chmod 0440 /etc/sudoers.d/sampleadmin

# A narrow helper is safer and easier to document than unrestricted sudo. Real
# labs should validate configuration before reloading or restarting the service.
COPY reload-sample-service.sh /usr/local/sbin/reload-sample-service
RUN chmod 0755 /usr/local/sbin/reload-sample-service

COPY config.vulnerable /opt/lab/baseline/config.env
COPY seed.txt /opt/lab/seed/seed.txt
COPY setup-sample.sh /opt/lab/hooks/pre-start.sh
COPY sample-service.py /opt/lab/sample-service.py
RUN chmod 0755 /opt/lab/hooks/pre-start.sh /opt/lab/sample-service.py

# EXPOSE documents internal container ports. Host publication remains controlled
# only by scenario.yaml.
EXPOSE 8080
