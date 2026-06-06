ARG TTYD_VERSION=1.7.7

FROM debian:bookworm-slim AS ttyd-builder
ARG TTYD_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      curl \
      libjson-c-dev \
      libssl-dev \
      libuv1-dev \
      libwebsockets-dev \
      zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/tsl0922/ttyd/archive/refs/tags/${TTYD_VERSION}.tar.gz" -o /tmp/ttyd.tar.gz \
    && mkdir -p /tmp/ttyd-src \
    && tar -xzf /tmp/ttyd.tar.gz -C /tmp/ttyd-src --strip-components=1 \
    && cmake -S /tmp/ttyd-src -B /tmp/ttyd-build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/ttyd-build --parallel "$(nproc)" \
    && install -m 0755 /tmp/ttyd-build/ttyd /usr/local/bin/ttyd

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dnsutils \
      ftp \
      hydra \
      iproute2 \
      iputils-ping \
      jq \
      ldap-utils \
      less \
      mariadb-client \
      nano \
      netcat-openbsd \
      nfs-common \
      nmap \
      openssh-client \
      openssh-server \
      procps \
      redis-tools \
      smbclient \
      snmp \
      tini \
      libjson-c5 \
      libssl3 \
      libuv1 \
      libwebsockets-evlib-uv \
      libwebsockets17 \
      zlib1g \
      vim-tiny \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ttyd-builder /usr/local/bin/ttyd /usr/local/bin/ttyd
COPY workstation-entrypoint.sh /usr/local/sbin/workstation-entrypoint
COPY thesis-command-logger.bash /usr/local/lib/thesis-command-logger.bash

RUN useradd --create-home --shell /bin/bash --uid 1000 student \
    && mkdir -p /run/sshd /etc/ssh/sshd_config.d /opt/lab/student \
    && ssh-keygen -A \
    && sed -i 's/^session\s\+required\s\+pam_loginuid.so/session optional pam_loginuid.so/' /etc/pam.d/sshd \
    && printf '%s\n' \
      'PasswordAuthentication yes' \
      'PermitRootLogin no' \
      'AllowUsers student' \
      > /etc/ssh/sshd_config.d/lab.conf \
    && chmod 0755 /usr/local/sbin/workstation-entrypoint \
    && chmod 0644 /usr/local/lib/thesis-command-logger.bash \
    && chmod 0755 /usr/local/bin/ttyd \
    && chmod -R a+rX /opt/lab/student \
    && chmod u+s /usr/bin/ping

EXPOSE 22 19000
WORKDIR /home/student

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/sbin/workstation-entrypoint"]
