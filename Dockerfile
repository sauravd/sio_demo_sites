FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Security: create non-root user
RUN adduser --disabled-password --gecos "" django

WORKDIR /app

# System deps (compile pillow if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libjpeg-dev zlib1g-dev gettext \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python manage.py collectstatic --noinput || true
RUN chown -R django:django /app

USER django
EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
