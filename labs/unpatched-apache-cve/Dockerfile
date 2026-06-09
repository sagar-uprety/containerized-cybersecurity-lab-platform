FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      wget \
      ca-certificates \
      libapr1-dev \
      libaprutil1-dev \
      libpcre3-dev \
      libssl-dev \
      zlib1g-dev \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN wget -q https://archive.apache.org/dist/httpd/httpd-2.4.49.tar.gz \
    && tar -xzf httpd-2.4.49.tar.gz

WORKDIR /usr/src/httpd-2.4.49
RUN ./configure \
      --prefix=/usr/local/apache2 \
      --enable-so \
      --enable-cgi \
      --enable-cgid \
      --enable-ssl \
      --with-mpm=prefork \
      --with-pcre \
    && make -j"$(nproc)" \
    && make install

WORKDIR /usr/src
RUN rm -rf httpd-2.4.49 httpd-2.4.49.tar.gz

# Create apache user and runtime directories; remove default httpd.conf
# so our custom config.vulnerable is the only config source
RUN useradd -r -s /bin/false apache \
    && mkdir -p /usr/local/apache2/cgi-bin /usr/local/apache2/htdocs /usr/local/apache2/logs \
    && rm -f /usr/local/apache2/conf/httpd.conf \
    && chown apache:apache /usr/local/apache2/cgi-bin /usr/local/apache2/htdocs

# Simple CGI script for the vulnerable /cgi-bin/ alias
RUN printf '#!/bin/sh\necho "Content-type: text/plain"\necho ""\necho "CGI works"\n' > /usr/local/apache2/cgi-bin/test.cgi \
    && chmod 755 /usr/local/apache2/cgi-bin/test.cgi

# Admin user for restart
RUN useradd -m -s /bin/bash apacheadmin \
    && echo "apacheadmin ALL=(root) NOPASSWD: /usr/local/sbin/restart-apache" > /etc/sudoers.d/apacheadmin \
    && chmod 0440 /etc/sudoers.d/apacheadmin

# Restart script — $H expands at runtime, not build time
# hadolint ignore=SC2016
RUN printf '#!/bin/sh\nset -e\nH=$(pgrep -f "httpd.*DFOREGROUND" || true)\nif [ -n "$H" ]; then kill "$H" 2>/dev/null || true; while pgrep -f "httpd.*DFOREGROUND" > /dev/null 2>&1; do sleep 0.1; done; fi\n/usr/local/apache2/bin/httpd -f /usr/local/apache2/conf/httpd.conf -DFOREGROUND 2>/usr/local/apache2/logs/error_log &\necho "Apache restarted"\n' > /usr/local/sbin/restart-apache \
    && chmod 0755 /usr/local/sbin/restart-apache

COPY config.vulnerable /opt/lab/baseline/httpd.conf
COPY seed.txt /opt/lab/seed/seed.txt
COPY setup-apache.sh /opt/lab/hooks/pre-start.sh
RUN chmod 0755 /opt/lab/hooks/pre-start.sh

EXPOSE 80
