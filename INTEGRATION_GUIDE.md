# Canvas LTI Integration Guide

## Installing Auto-Extend as an External Tool

### Manual Integration Steps: 

1. Click Admin on the left-most navigation in Canvas
2. Click the organization you'd like to add the app to 
3. Click Developer Keys in the left navigation
4. Click + Developer Key
5. Click + LTI Key 
6. Enter the following:
        Key Name: Auto-extend
7. Select Enter URL in the Method dropdown and enter 
    https://auto-extend.com/lti.json
8. Click Save. Make sure State is changed to ON. 
9. Copy the Client ID found under Details, and send the Client ID and Canvas Host URL to hu.james@ufl.edu. Wait until this client ID is approved before adding the app to a course. 

## Adding Auto-extend to a course 
1. In Canvas Admin, click on Courses.
2. Click on Settings for the course. 
3. Click Apps 
4. Click + App
5. Under Configuration Type, select By Client ID
6. Enter the copied Client ID. 
7. Click Submit
8. Click Install

---

## AWS Admin: Approving a New Client ID

After a Canvas admin sends you their Client ID and Canvas host URL, SSH into EC2 and run:

```bash
cd /home/ec2-user/extension-requests-app

# Approve a new client ID
docker compose -f docker-compose.prod.yml exec backend flask approve-client \
  <CLIENT_ID> \
  <CANVAS_HOST_URL> \
  --org-name "Organization Name" \
  --approved-by "your name"

# Example
docker compose -f docker-compose.prod.yml exec backend flask approve-client \
  10000000000008 \
  https://ufldev.instructure.com \
  --org-name "University of Florida Dev" \
  --approved-by "James Hu"
```

No restart required — the client ID is active immediately.

### Other commands

```bash
# List all approved client IDs and their status
docker compose -f docker-compose.prod.yml exec backend flask list-clients

# Revoke a client ID (blocks future launches without deleting the record)
docker compose -f docker-compose.prod.yml exec backend flask revoke-client <CLIENT_ID>
```

### Notes
- The `LTI_CLIENT_ID` in `.env` is always approved — no need to add it via CLI.
- Revoked client IDs can be reactivated by running `approve-client` again.
- Run `list-clients` to audit who has access at any time. 