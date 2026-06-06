FROM thesis-labs/workstation-base:2026-06-06

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      redis-tools \
    && rm -rf /var/lib/apt/lists/*

COPY files/SITREP.txt /opt/lab/student/

RUN chmod -R a+rX /opt/lab/student
