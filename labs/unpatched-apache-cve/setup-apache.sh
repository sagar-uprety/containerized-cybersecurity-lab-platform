#!/bin/sh
set -e

# Copy the seeded homepage into the runtime htdocs directory
cp /opt/lab/seed/seed.txt /usr/local/apache2/htdocs/index.html
chown apache:apache /usr/local/apache2/htdocs/index.html
