FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/doepet_flask_mysql/requirements.txt
RUN pip install --no-cache-dir -r /app/doepet_flask_mysql/requirements.txt

COPY . /app/doepet_flask_mysql

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "doepet_flask_mysql.wsgi:app"]
