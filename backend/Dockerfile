# Backend image for Google Cloud Run.
# Cloud Run sends traffic to the port named by $PORT (default 8080).
FROM python:3.11-slim

# Faster, quieter Python in containers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application package.
COPY app ./app

EXPOSE 8080

# Honor Cloud Run's $PORT; default to 8080 locally. `sh -c` expands the var.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
