# -*- coding: utf-8 -*-
# Railway-ready Dockerfile for FastAPI backend (UTF-8 safe)
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8 \
    PYTHONUTF8=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

EXPOSE 8000
# Railway supplies PORT; default to 8000 for local dev
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} --log-level ${LOG_LEVEL:-info}"]
