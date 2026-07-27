#!/bin/sh
set -eu

# SAMPLE PRE-START HOOK
# Use hooks for deterministic first-boot setup that cannot be expressed through
# generic LAB_* variables. Keep them idempotent because reset/start may rerun them.

data_file=/var/lib/sample-service/records.txt
log_file=/var/log/sample-service.log

if [ ! -f "${data_file}" ]; then
    cp /opt/lab/seed/seed.txt "${data_file}"
fi

touch "${log_file}"
chown sampleadmin:sampleadmin \
    /etc/sample-service/config.env \
    "${data_file}" \
    "${log_file}"
chmod 0644 /etc/sample-service/config.env "${data_file}" "${log_file}"
