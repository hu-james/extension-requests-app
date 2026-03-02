# Assignment Extension Manager

A Canvas LTI 1.3 app that streamlines assignment extension requests. Students submit requests with supporting documentation; instructors review, approve, or deny them from a centralized dashboard. Approved extensions are automatically applied in Canvas via assignment overrides.

**Stack:** Flask + PostgreSQL (backend), React + Vite + TailwindCSS (frontend), Docker

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/hu-james/extension-requests-app.git
cd extension-requests-app
git checkout docker
```

### 2. Create your `.env` file

```bash
cp .env.template .env
```

Open `.env` and fill in the minimum required values to start the app:

```bash
SECRET_FLASK=any-random-string-here   # generate with: python -c "import os; print(os.urandom(24).hex())"
DB_USER=postgres
DB_PASSWORD=devpassword
DB_NAME=extension_app
```

Canvas and LTI values can be left as placeholders until you connect to Canvas (see below).

### 3. Start the stack

```bash
docker compose up --build
```

**What starts:**

| Service | URL | Description |
|---------|-----|-------------|
| Backend | http://localhost:5001 | Flask dev server with hot reload |
| Frontend | http://localhost:3008 | Vite dev server with HMR |
| Postgres | localhost:5432 (internal) | Not exposed to the network |

**Verify it's working:**
- http://localhost:5001/lti.json — should return LTI config JSON
- http://localhost:3008 — should load the React app

### Day-to-day commands

| Task | Command |
|------|---------|
| Start | `docker compose up` |
| Stop | `Ctrl+C`, then `docker compose down` |
| View backend logs | `docker compose logs -f backend` |
| Open a Postgres shell | `docker compose exec postgres psql -U postgres -d extension_app` |

---

## Connecting to Canvas

The app supports two Canvas setups:

### Option A: Canvas Docker (Local Testing)

Use this if you are running [canvas-docker](https://github.com/instructure/canvas-docker) locally.

Update your `.env` with these values:

```bash
# Canvas Docker URLs
CANVAS_API_URL=http://canvas.docker
LTI_ISSUER=http://canvas.docker
LTI_AUTH_LOGIN_URL=http://canvas.docker/api/lti/authorize_redirect
LTI_AUTH_TOKEN_URL=http://canvas.docker/login/oauth2/token
LTI_KEY_SET_URL=http://canvas.docker/api/lti/security/jwks

# Canvas API token (get from Canvas → Account → Settings → + New Access Token)
CANVAS_API_TOKEN=your_canvas_api_token_here

# Your host machine's LAN IP — Canvas Docker cannot resolve "localhost"
# Find it with: ifconfig | grep "inet " | grep -v 127.0.0.1   (macOS/Linux)
TOOL_BASE_URL=http://192.168.x.x:5001
ALLOWED_ORIGINS=http://localhost:3008
```

### Option B: Real Canvas (Production)

Use this when deploying to a server (EC2, etc.) connected to an institution's Canvas or canvas.instructure.com.

> **HTTPS required.** Canvas LTI 1.3 requires your tool to be served over HTTPS. You need a domain name and an SSL certificate (e.g., via Let's Encrypt + Nginx) before Canvas will accept your LTI registration.

Update your `.env`:

```bash
# Real Canvas URLs (replace with your institution's Canvas URL if not instructure.com)
CANVAS_API_URL=https://canvas.instructure.com
LTI_ISSUER=https://canvas.instructure.com
LTI_AUTH_LOGIN_URL=https://canvas.instructure.com/api/lti/authorize_redirect
LTI_AUTH_TOKEN_URL=https://canvas.instructure.com/login/oauth2/token
LTI_KEY_SET_URL=https://canvas.instructure.com/api/lti/security/jwks

CANVAS_API_TOKEN=your_canvas_api_token_here

# Your server's public domain
TOOL_BASE_URL=https://your-domain.com
ALLOWED_ORIGINS=https://your-domain.com
```

Use `docker-compose.prod.yml` for production (see [Production Deployment](#production-deployment-ec2)).

---

## LTI Registration in Canvas

These steps are the same for both Canvas Docker and real Canvas. Complete them after starting the app.

### Step 1 — Register the Developer Key

1. Log into Canvas as an admin
2. Go to **Admin → Developer Keys**
3. Click **+ Developer Key → + LTI Key**
4. Select **"Paste JSON"** as the configuration method
5. Fetch the LTI config from your running app and paste it in:
   ```
   http://YOUR_TOOL_BASE_URL/lti.json
   ```
6. Click **Save**
7. Toggle the key **ON**
8. **Copy the numeric Client ID** shown in the key list (e.g., `10000000000003`)

### Step 2 — Update `.env` with the Client ID

```bash
LTI_CLIENT_ID=10000000000003
```

Then restart the backend so it picks up the new value:

```bash
docker compose restart backend
```

### Step 3 — Install the tool in a course

1. Go to a Canvas course
2. Navigate to **Settings → Apps**
3. Click **+ App**
4. Configuration Type: **By Client ID**
5. Enter the Client ID from Step 1
6. Click **Submit**

The tool will now appear in the course navigation as "Assignment Extensions".

### Step 4 — Test the launch

Click "Assignment Extensions" in the course navigation. The LTI launch flow will run and the React app should load with the correct student or instructor interface based on your Canvas role.

---

## Production Deployment (EC2)

Use `docker-compose.prod.yml` for production. This runs gunicorn instead of Flask's dev server and serves the React app as static files — no separate frontend container.

### On the EC2 instance

```bash
# Install Docker
sudo yum install -y docker
sudo systemctl start docker && sudo systemctl enable docker
sudo usermod -aG docker $USER && newgrp docker

# Update Docker buildx plugin (required on Amazon Linux 2023)
BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
mkdir -p ~/.docker/cli-plugins
curl -Lo ~/.docker/cli-plugins/docker-buildx \
  "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-amd64"
chmod +x ~/.docker/cli-plugins/docker-buildx

# Clone and configure
git clone https://github.com/hu-james/extension-requests-app.git
cd extension-requests-app
git checkout docker
cp .env.template .env
nano .env   # fill in all production values

# Start in production mode
docker compose -f docker-compose.prod.yml up --build -d
```

**View logs:**
```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_FLASK` | Flask session signing key | Always |
| `DB_USER` | Postgres username | Always |
| `DB_PASSWORD` | Postgres password | Always |
| `DB_NAME` | Postgres database name | Always |
| `DB_HOST` | Set automatically by Docker Compose to `postgres` | Auto |
| `CANVAS_API_URL` | Base URL of your Canvas instance | Canvas integration |
| `CANVAS_API_TOKEN` | Canvas API personal access token | Canvas integration |
| `LTI_CLIENT_ID` | Client ID from Canvas Developer Key registration | LTI launch |
| `LTI_ISSUER` | Canvas instance URL (used in JWT validation) | LTI launch |
| `LTI_AUTH_LOGIN_URL` | Canvas OIDC login URL | LTI launch |
| `LTI_AUTH_TOKEN_URL` | Canvas token URL | LTI launch |
| `LTI_KEY_SET_URL` | Canvas public JWKS URL | LTI launch |
| `LTI_DEPLOYMENT_ID` | Deployment ID (default: `1`) | LTI launch |
| `TOOL_BASE_URL` | Public URL of this app | LTI launch |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | Always |

---

## Troubleshooting

### `LTI launch failed: audience doesn't match`

The `LTI_CLIENT_ID` in your `.env` doesn't match the Developer Key registered in Canvas. Each Canvas instance assigns its own numeric client_id.

**Fix:** Go to Canvas Admin → Developer Keys, copy the numeric ID next to your key, update `LTI_CLIENT_ID` in `.env`, then restart:
```bash
docker compose restart backend
```

---

### Canvas can't reach the Flask app (404 / connection refused)

You are using `localhost` or `127.0.0.1` in `TOOL_BASE_URL`. Canvas Docker runs in its own container and cannot resolve these to your host machine.

**Fix:** Use your host machine's LAN IP address in `TOOL_BASE_URL`:
```bash
# Find your LAN IP
ifconfig | grep "inet " | grep -v 127.0.0.1   # macOS/Linux
```

---

### `compose build requires buildx 0.17.0 or later`

Your Docker buildx plugin is outdated.

**Fix (Amazon Linux 2023 / Linux):**
```bash
BUILDX_VERSION=$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
mkdir -p ~/.docker/cli-plugins
curl -Lo ~/.docker/cli-plugins/docker-buildx \
  "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-amd64"
chmod +x ~/.docker/cli-plugins/docker-buildx
docker buildx version   # verify
```

---

### Database connection errors on startup

The DB credentials in `.env` don't match what Postgres was initialized with, or Postgres hasn't finished starting yet.

**Fix:** Check that `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env` match across both the `postgres` and `backend` services. If you changed credentials after the volume was created, reset the volume:
```bash
docker compose down -v   # WARNING: deletes all data
docker compose up --build
```
