# STAGE 1: Build React frontend

FROM node:22-alpine AS frontend-builder

WORKDIR /client

COPY client/package.json client/package-lock.json ./
RUN npm ci --silent

COPY client/ .
RUN npm run build

# STAGE 2: Install Python dependencies into an isolated venv

FROM python:3.11-slim AS python-builder

WORKDIR /build

# gcc needed to compile some transitive Python deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# STAGE 3: Development target
FROM python-builder AS development

WORKDIR /app
ENV PATH="/opt/venv/bin:$PATH"

# Default command — overridden by docker-compose.yml to add migrations + debug flag
CMD ["python", "views.py"]

# STAGE 4: Production target
FROM python-builder AS production

WORKDIR /app

RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser

ENV PATH="/opt/venv/bin:$PATH"

# React build from stage 1 (Node and source files are discarded)
COPY --from=frontend-builder /client/dist ./client/dist

# Application source 
COPY views.py settings.py models.py extension_views.py ./
COPY lti13_config.py lti13_service.py canvas_service.py file_security.py ./
COPY static/ ./static/
COPY templates/ ./templates/
COPY migrations/ ./migrations/
COPY entrypoint.sh ./

RUN chmod +x /app/entrypoint.sh && \
    mkdir -p /app/uploads /app/keys && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
