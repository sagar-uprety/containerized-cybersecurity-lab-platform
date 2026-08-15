FROM thesis-labs/lab-service-base:1.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      mariadb-server \
      mariadb-client \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /var/lib/mysql /run/mysqld /var/log/mysql \
    && chown -R mysql:mysql /var/lib/mysql /run/mysqld /var/log/mysql

COPY config.vulnerable /opt/lab/baseline/60-lab.cnf
COPY provision.sql /opt/lab/baseline/provision.sql
COPY setup-vulnerable.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 3306
