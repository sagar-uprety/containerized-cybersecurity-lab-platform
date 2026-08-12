# SURVEY LAB - Nginx web server (Pattern A standalone)
# A small, real nginx server with two intentional information-disclosure
# weaknesses. Deliberately simple so a first-time student can tour the platform.
FROM thesis-labs/lab-service-base:1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      nginx \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Service admin account used to reload nginx after an edit. Its password is the
# student's own lab password (injected at start); it may run only the reload
# helper via sudo.
RUN useradd --uid 1000 --create-home --shell /bin/bash nginxadmin \
    && printf '%s\n' \
      'nginxadmin ALL=(root) NOPASSWD: /usr/local/sbin/reload-nginx' \
      > /etc/sudoers.d/nginxadmin \
    && chmod 0440 /etc/sudoers.d/nginxadmin

COPY reload-nginx.sh /usr/local/sbin/reload-nginx
RUN chmod 0755 /usr/local/sbin/reload-nginx

COPY site.conf.vulnerable /opt/lab/baseline/site.conf
COPY setup-nginx.sh /opt/lab/hooks/pre-start.sh
COPY index.html /var/www/html/index.html
COPY files/ /var/www/html/files/
RUN chmod 0755 /opt/lab/hooks/pre-start.sh \
    && mkdir -p /var/www/html /var/log/nginx /etc/nginx/conf.d \
    && touch /var/log/nginx/access.log /var/log/nginx/error.log \
    && chmod 0666 /var/log/nginx/access.log /var/log/nginx/error.log \
    && rm -f /etc/nginx/sites-enabled/default

EXPOSE 8080
