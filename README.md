# Extension Manager App 
This is a Canvas-integrated LTI app that automates assignment extension requests.  

## Prerequisites

### Required Software
- Docker and Docker Compose
- Git
- Python 3.9+
- Node.js 18+ and npm
- PostgreSQL 14+

### Canvas Docker Instance
- Canvas running at `http://canvas.docker` (or another URL)
- Admin access to Canvas
- Canvas Docker container accessible from host machine

---

## Step 1: Clone the Repository

```bash
git clone 
cd auto-extend
```

---

## Step 2: Set Up PostgreSQL Database

### Start PostgreSQL 

**macOS (Homebrew):**
```bash
brew services start postgresql@14
```


### Create Database

```bash
createdb auto_extend_local
```

---

## Step 3: Configure Environment Variables

### Create .env file

Copy the .env.template file and fill in values. 

```bash
# Canvas Docker Configuration
CANVAS_API_URL=http://canvas.docker
CANVAS_API_TOKEN=YOUR_CANVAS_API_TOKEN_HERE

# LTI 1.3 Configuration
LTI_ISSUER=http://canvas.docker
LTI_AUTH_LOGIN_URL=http://canvas.docker/api/lti/authorize_redirect
LTI_AUTH_TOKEN_URL=http://canvas.docker/login/oauth2/token
LTI_KEY_SET_URL=http://canvas.docker/api/lti/security/jwks

# LTI Tool Configuration (will be updated after Canvas setup)
LTI_CLIENT_ID=TBD
LTI_DEPLOYMENT_ID=1
LTI_TOOL_ID=auto-extend-tool

# Flask Secret Key
SECRET_FLASK=YOUR_GENERATED_SECRET_KEY

# PostgreSQL Database Configuration
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auto_extend_local

# File Upload Configuration
UPLOAD_FOLDER=uploads
```

### Get Canvas API Token

1. Log into Canvas at `http://canvas.docker` as admin
2. Go to **Account → Settings → Approved Integrations**
3. Click **"+ New Access Token"**
4. Give it a name (e.g., "Auto Extend Dev")
5. Click **Generate Token**
6. Copy the token and update `CANVAS_API_TOKEN` in `.env`

---

## Step 4: Install Python Dependencies

```bash
# Install Python packages
pip install -r requirements.txt
```

---

## Step 5: Initialize the Database

```bash
# Set Flask app
export FLASK_APP=views.py

# Run migrations
flask db upgrade
```

---

## Step 6: Build the React Frontend

The React frontend needs to be built so Flask can serve it:

```bash
cd client

# Install Node dependencies
npm install

# Build for production (outputs to ../static/)
npm run build

# Return to root directory
cd ..
```
---

## Step 7: Find Your Host Machine IP

Canvas Docker needs to access your Flask app. Find your local IP address:

**macOS/Linux:**
```bash
# Get your local network IP
ifconfig | grep "inet " | grep -v 127.0.0.1

```

**Or use:**
```bash
hostname -I  # Linux
ipconfig getifaddr en0  # macOS 
```

Use this IP (e.g., `192.168.42.42`) instead of `localhost` in all Canvas configurations, since Canvas Docker can't resolve `localhost` to your host machine.

---

## Step 8: Start the Flask Application

```bash
# Start Flask on port 5001, accessible from network
python app.py
```

The server will run at:
- **Local:** `http://localhost:5001`
- **Network (for Canvas):** `http://192.168.42.42:5001` (use your actual IP)

---

## Step 9: Configure LTI 1.3 in Canvas

### Option A: Automatic Configuration (Recommended)

1. Log into Canvas at `http://canvas.docker` as admin
2. Go to **Admin → Developer Keys**
3. Click **"+ Developer Key" → "+ LTI Key"**
4. Choose **"Paste JSON"** method
5. Paste lti.json file into textbox. Note that you may need to change the URLs at the bottom of the json file. 
4. Click **"Save"**
5. Turn the key **"ON"**
6. **Copy the Client ID**
---

## Step 10: Update Configuration with Client ID

Add the Canvas Client ID to your `.env` file:

```bash
LTI_CLIENT_ID=10000000000003
```

### Restart Flask

```bash
# Stop the current Flask server (Ctrl+C)
# Restart it
python app.py
```

---

## Step 11: Install the Tool in a Canvas Course

1. Go to any course in Canvas
2. Navigate to **Settings → Apps**
3. Click **"+ App"**
4. Configuration Type: **"By Client ID"**
5. Enter the **Client ID** 
6. Click **"Submit"**

The tool should now appear in your course navigation as "Extension Manager".

---

## Step 12: Test the Integration

1. Click **"Extension Manager"** in the course navigation
2. Canvas will launch the LTI tool
3. The React app should load from Flask
4. You should see the student or instructor interface depending on your role

---

## Troubleshooting

### Issue: Canvas can't reach Flask app (404 errors)

**Solution:**
- Verify Flask is running: `curl http://localhost:5001/lti/jwks`
- Test from Canvas network perspective:
  ```bash
  docker exec -it CANVAS_CONTAINER_NAME curl http://host.docker.internal:5001/lti/jwks
  ```
- Make sure you're using your host IP, not `localhost`
- Check firewall settings



### Issue: Database connection errors

**Solution:**
```bash
# Verify PostgreSQL is running
pg_isready

# Check database exists
psql -l | grep auto_extend_local

# Recreate if needed
dropdb auto_extend_local
createdb auto_extend_local
flask db upgrade
```

### Issue: LTI launch fails with JWT errors

**Solution:**
- Verify `LTI_CLIENT_ID` in `.env` matches Canvas Developer Key
- Check Canvas can access JWKs endpoint: `http://YOUR_IP:5001/lti/jwks`
- Review Flask logs in `error.log`


---

## Quick Reference

### Start Everything
```bash
# Terminal 1: Start Flask
python app.py

# Terminal 2 (optional): React dev server
cd client && npm run dev
```

### Rebuild Frontend
```bash
cd client && npm run build && cd ..
```

### Reset Database
```bash
dropdb auto_extend_local && createdb auto_extend_local
flask db upgrade
```

### View Logs
```bash
tail -f error.log
```

### Key URLs
- **Flask App:** http://localhost:5001
- **LTI Config:** http://YOUR_IP:5001/lti.json
- **JWKs:** http://YOUR_IP:5001/lti/jwks
- **Launch:** http://YOUR_IP:5001/lti/launch
- **Canvas:** http://canvas.docker

---
