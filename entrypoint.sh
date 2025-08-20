#!/usr/bin/env bash
set -e

python manage.py migrate --noinput

# If you really need to re-run collectstatic in a specific deploy,
# set RUN_COLLECTSTATIC=true as an env var.
if [ "${RUN_COLLECTSTATIC:-false}" = "true" ]; then
  python manage.py collectstatic --noinput
fi

exec gunicorn siofieldmap.wsgi:application --bind 0.0.0.0:8080 --workers 3 --timeout 60
