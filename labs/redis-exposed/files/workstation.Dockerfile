ARG TTYD_IMAGE=tsl0922/ttyd:latest
FROM ${TTYD_IMAGE} AS ttyd

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      iproute2 \
      iputils-ping \
      jq \
      less \
      nano \
      netcat-openbsd \
      nmap \
      openssh-server \
      procps \
      redis-tools \
      tini \
      vim-tiny \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ttyd /usr/bin/ttyd /usr/local/bin/ttyd
COPY files/workstation-entrypoint.sh /usr/local/sbin/workstation-entrypoint

RUN useradd --create-home --shell /bin/bash --uid 1000 student \
    && mkdir -p /run/sshd /etc/ssh/sshd_config.d \
    && ssh-keygen -A \
    && printf '%s\n' \
      'PasswordAuthentication yes' \
      'PermitRootLogin no' \
      'AllowUsers student' \
      > /etc/ssh/sshd_config.d/lab.conf \
    && chmod 0755 /usr/local/sbin/workstation-entrypoint \
    && chmod 0755 /usr/local/bin/ttyd

EXPOSE 22 19000
WORKDIR /home/student

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/sbin/workstation-entrypoint"]
