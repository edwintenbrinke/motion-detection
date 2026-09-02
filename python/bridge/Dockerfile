FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app

# Buffers undelivered events here when motion-api is unreachable; see main.py.
RUN mkdir -p /var/lib/event-bridge

CMD ["python", "main.py"]
