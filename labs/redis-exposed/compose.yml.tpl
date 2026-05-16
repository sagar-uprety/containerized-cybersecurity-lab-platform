name: "{{ compose_project }}"

services:
  workstation:
    image: "{{ images.workstation }}"
    hostname: workstation
    init: true
    restart: unless-stopped
    environment:
      LAB_ID: "{{ lab_id }}"
      STUDENT_ID: "{{ student_id }}"
      STUDENT_PASSWORD: "{{ student_password }}"
      TTYD_CREDENTIAL: "{{ ttyd_credential }}"
      REDIS_HOST: redis-host
      REDIS_PORT: "6379"
      DEMO_APP_URL: "http://demo-app:8080"
    ports:
      - "{{ host_bind_ip }}:{{ browser_terminal_port }}:19000"
      - "{{ host_bind_ip }}:{{ ssh_port }}:22"
    volumes:
      - workstation-home:/home/student
      - redis-config:/lab/redis
      - app-config:/lab/demo-app
    networks:
      - labnet
    depends_on:
      redis-host:
        condition: service_healthy
      demo-app:
        condition: service_healthy
    healthcheck:
      test:
        - CMD-SHELL
        - pgrep -x sshd >/dev/null && curl -fsS http://127.0.0.1:19000/ >/dev/null
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 10s
    security_opt:
      - no-new-privileges:true
    cpus: "{{ resources.workstation.cpus }}"
    mem_limit: "{{ resources.workstation.memory }}"

  redis-host:
    image: "{{ images.redis_host }}"
    hostname: redis-host
    init: true
    restart: unless-stopped
    expose:
      - "6379"
    volumes:
      - redis-data:/data
      - redis-config:/usr/local/etc/redis
    networks:
      - labnet
    healthcheck:
      test:
        - CMD-SHELL
        - redis-cli -h 127.0.0.1 ping 2>&1 | grep -Eq 'PONG|NOAUTH|WRONGPASS'
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 5s
    security_opt:
      - no-new-privileges:true
    cpus: "{{ resources.redis_host.cpus }}"
    mem_limit: "{{ resources.redis_host.memory }}"

  demo-app:
    image: "{{ images.demo_app }}"
    hostname: demo-app
    init: true
    restart: unless-stopped
    environment:
      REDIS_HOST: redis-host
      REDIS_PORT: "6379"
      APP_CONFIG_FILE: /app/config/app-config.env
    ports:
      - "{{ host_bind_ip }}:{{ app_port }}:8080"
    networks:
      - labnet
    volumes:
      - app-config:/app/config
    depends_on:
      redis-host:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/health >/dev/null"]
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 10s
    security_opt:
      - no-new-privileges:true
    cpus: "{{ resources.demo_app.cpus }}"
    mem_limit: "{{ resources.demo_app.memory }}"

networks:
  labnet:
    driver: bridge
    internal: true

volumes:
  workstation-home:
  redis-data:
  redis-config:
  app-config:
