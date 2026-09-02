FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

# This container is the legacy Python agent, kept for reference and rollback only.
# See ../docs/v2/08-pi-agent.md — v2 replaces it with MediaMTX (deploy/) + Frigate.
WORKDIR /app/legacy
CMD ["python", "main.py"]
