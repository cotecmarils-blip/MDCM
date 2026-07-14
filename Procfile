web: python manage.py migrate --noinput && python scripts/ensure_media_dirs.py && gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120
