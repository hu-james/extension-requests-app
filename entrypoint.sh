#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until python -c "
import psycopg2, os, sys
try:
    psycopg2.connect(
        host=os.environ['DB_HOST'],
        port=os.environ.get('DB_PORT', '5432'),
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        dbname=os.environ['DB_NAME']
    )
    sys.exit(0)
except Exception as e:
    print(f'DB not ready: {e}', file=sys.stderr)
    sys.exit(1)
"; do
    echo "  Postgres not ready, retrying in 2s..."
    sleep 2
done
echo "  PostgreSQL ready."

echo "==> Running database migrations..."
python -m flask --app views.py db upgrade

echo "==> Checking LTI keys..."
python -c "
from lti13_config import LTI13Config
import os
if not os.path.exists(LTI13Config.PRIVATE_KEY_PATH):
    print('  Generating RSA key pair...')
    LTI13Config.generate_key_pair()
    print('  Keys generated.')
else:
    print('  Keys already exist, skipping.')
"

echo "==> Starting gunicorn..."
exec gunicorn \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --threads 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    "views:app"
