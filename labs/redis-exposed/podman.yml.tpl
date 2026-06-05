runtime:
  engine: podman
  instance: "{{ runtime_project }}"
  labels:
    thesis.platform: "{{ thesis_platform_name }}"
    thesis.lab: "{{ lab_id }}"
    thesis.student: "{{ student_id }}"

network:
  name: "{{ runtime_project }}_labnet"
  internal: false
  labels:
    thesis.platform: "{{ thesis_platform_name }}"
    thesis.lab: "{{ lab_id }}"
    thesis.student: "{{ student_id }}"

volumes:
  - name: "{{ runtime_project }}_workstation_home"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"
  - name: "{{ runtime_project }}_redis_data"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"
  - name: "{{ runtime_project }}_redis_config"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"
  - name: "{{ runtime_project }}_app_config"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"
  - name: "{{ runtime_project }}_command_logs"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"

containers:
  - name: "{{ runtime_project }}_workstation"
    image: "{{ images.workstation }}"
    hostname: workstation
    init: true
    restart: unless-stopped
    sysctls:
      net.ipv4.ping_group_range: "0 2147483647"
    environment:
      LAB_ID: "{{ lab_id }}"
      STUDENT_ID: "{{ student_id }}"
      STUDENT_PASSWORD: "{{ student_password }}"
      TTYD_CREDENTIAL: "{{ ttyd_credential }}"
      BROWSER_TERMINAL_PORT: "{{ browser_terminal_port }}"
      REDIS_HOST: redis-host
      REDIS_PORT: "6379"
      DEMO_APP_URL: "http://demo-app:8080"
    ports:
      - host_ip: "{{ host_bind_ip }}"
        host_port: "{{ browser_terminal_port }}"
        container_port: 19000
      - host_ip: "{{ host_bind_ip }}"
        host_port: "{{ ssh_port }}"
        container_port: 22
    volumes:
      - source: "{{ runtime_project }}_workstation_home"
        target: /home/student
      - source: "{{ runtime_project }}_redis_config"
        target: /lab/redis
      - source: "{{ runtime_project }}_app_config"
        target: /lab/demo-app
      - source: "{{ runtime_project }}_command_logs"
        target: /var/log/thesis-labs/commands
    network:
      name: "{{ runtime_project }}_labnet"
      aliases:
        - workstation
    depends_on:
      - redis-host
      - demo-app
    healthcheck:
      command:
        - CMD-SHELL
        - pgrep -x sshd >/dev/null && curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:19000/ | grep -q '401'
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 10s
    security:
      no_new_privileges: false
      privileged: false
      host_network: false
      cap_add:
        - NET_RAW
    resources:
      cpus: "{{ resources.workstation.cpus }}"
      memory: "{{ resources.workstation.memory }}"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"

  - name: "{{ runtime_project }}_redis_host"
    image: "{{ images.redis_host }}"
    hostname: redis-host
    init: true
    restart: unless-stopped
    environment:
      REDIS_ADMIN_PASSWORD: "{{ student_password }}"
    expose:
      - 6379
    volumes:
      - source: "{{ runtime_project }}_redis_data"
        target: /data
      - source: "{{ runtime_project }}_redis_config"
        target: /usr/local/etc/redis
    network:
      name: "{{ runtime_project }}_labnet"
      aliases:
        - redis-host
    healthcheck:
      command:
        - CMD-SHELL
        - redis-cli -h 127.0.0.1 ping 2>&1 | grep -Eq 'PONG|NOAUTH|WRONGPASS'
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 5s
    security:
      no_new_privileges: false
      privileged: false
      host_network: false
      cap_add:
        - AUDIT_WRITE
    resources:
      cpus: "{{ resources['redis-host'].cpus }}"
      memory: "{{ resources['redis-host'].memory }}"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"

  - name: "{{ runtime_project }}_demo_app"
    image: "{{ images.demo_app }}"
    hostname: demo-app
    init: true
    restart: unless-stopped
    environment:
      REDIS_HOST: redis-host
      REDIS_PORT: "6379"
      APP_CONFIG_FILE: /app/config/app-config.env
    ports:
      - host_ip: "{{ host_bind_ip }}"
        host_port: "{{ app_port }}"
        container_port: 8080
    volumes:
      - source: "{{ runtime_project }}_app_config"
        target: /app/config
    network:
      name: "{{ runtime_project }}_labnet"
      aliases:
        - demo-app
    depends_on:
      - redis-host
    healthcheck:
      command:
        - CMD-SHELL
        - python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"
      interval: 10s
      timeout: 5s
      retries: 6
      start_period: 10s
    security:
      no_new_privileges: true
      privileged: false
      host_network: false
    resources:
      cpus: "{{ resources['demo-app'].cpus }}"
      memory: "{{ resources['demo-app'].memory }}"
    labels:
      thesis.platform: "{{ thesis_platform_name }}"
      thesis.lab: "{{ lab_id }}"
      thesis.student: "{{ student_id }}"
