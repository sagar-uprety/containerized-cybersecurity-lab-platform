FROM debian:bookworm-slim@sha256:7b140f374b289a7c2befc338f42ebe6441b7ea838a042bbd5acbfca6ec875818

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      openssh-server \
      procps \
      sudo \
      tini \
      vim-tiny \
    && rm -rf /var/lib/apt/lists/*

RUN sed -i 's/^#\?\s*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?\s*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' /etc/pam.d/sshd \
    && mkdir -p /run/sshd /opt/lab/baseline /opt/lab/seed \
    && ssh-keygen -A

COPY entrypoint.sh /usr/local/sbin/lab-entrypoint
RUN chmod 0755 /usr/local/sbin/lab-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/sbin/lab-entrypoint"]
