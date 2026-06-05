# Studio404 Transfer — Operations Runbook

Self-hosted file transfer system running on the studio Mac mini.
Live at: **https://transfer.studio404.nyc**

---

## Table of Contents

1. [Credentials](#credentials)
2. [Stack Overview](#stack-overview)
3. [Starting and Stopping](#starting-and-stopping)
4. [Account Management](#account-management)
5. [Viewing Logs](#viewing-logs)
6. [Cloudflare Tunnel](#cloudflare-tunnel)
7. [Backups and Restore](#backups-and-restore)
8. [Making Changes](#making-changes)
9. [Key Config Files](#key-config-files)
10. [Troubleshooting](#troubleshooting)

---

## Credentials

**Update only this section when passwords change.** All commands throughout
this document reference credentials by label — substitute the value from
this table when running them.

| Label | Purpose | Where to find the value |
|---|---|---|
| `MONGO_ROOT_PASSWORD` | MongoDB root user — used in backup, restore, and direct DB access commands | `MONGO_INITDB_ROOT_PASSWORD` in `.env` |

> All secrets live in `.env` and `next/.env`, both of which are gitignored.
> Never paste actual credential values into this file.

---

## Stack Overview

| Container | Role | Port |
|---|---|---|
| `transferzip-web-next-1` | Web app and API | 9001 |
| `transferzip-web-mongo-1` | Database (accounts, transfer metadata) | 27017 |
| `transferzip-web-worker-1` | Background jobs (deletes expired transfers) | 3001 |
| `transferzip-web-signaling-server-1` | WebSocket broker for Quick Transfer | 9002 |
| `transferzip-node-server-1` | File storage (actual uploaded files) | 3050 |
| `transferzip-node-redis-1` | Cache for the node server | 6379 |

External routing is handled by **Cloudflare Tunnel** — no ports are open
on the router. The tunnel runs as a macOS system service and starts
automatically on reboot.

---

## Starting and Stopping

All commands should be run from the web app directory:
```
cd /Users/404server/Documents/transfer.zip-web
```

### Check what's running
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Start the full stack
```bash
docker compose up -d
```

### Stop the full stack
```bash
docker compose down
```

### Restart a single service
```bash
docker compose restart next
docker compose restart worker
docker compose restart mongo
```

### Start the node server (file storage)
The node server is a separate Docker Compose project:
```bash
cd /Users/404server/studio-server/transfer.zip-node
docker compose up -d
cd /Users/404server/Documents/transfer.zip-web
```

### Start everything after a reboot
Docker Desktop must be running first. Once it's up:
```bash
cd /Users/404server/Documents/transfer.zip-web
docker compose up -d

cd /Users/404server/studio-server/transfer.zip-node
docker compose up -d
```

The Cloudflare tunnel starts automatically — no action needed.

---

## Account Management

All scripts are in `/Users/404server/Documents/transfer.zip-web`.

### Create a new account
```bash
cd /Users/404server/Documents/transfer.zip-web
./create-account.sh
```
Prompts for email, password, and web server port (enter `9001`).

After creating an account, tell the employee to go to
`https://transfer.studio404.nyc/signin` → **Forgot password?** to set
their own password — this way you never know their actual credentials.

### List all accounts
```bash
cd /Users/404server/Documents/transfer.zip-web
./list-accounts.sh
```

### Delete an account
```bash
cd /Users/404server/Documents/transfer.zip-web
./delete-account.sh
```
Prompts for the email address to remove.

### Reset a password (admin)
If an employee is locked out and can't receive email:
1. Delete their account: `./delete-account.sh`
2. Recreate it: `./create-account.sh`
3. Have them use **Forgot password?** to set their own password

### Employee self-service password reset
Employees can reset their own password at any time:
`https://transfer.studio404.nyc/signin` → **Forgot password?**
A reset link is sent to their email automatically.

---

## Viewing Logs

```bash
cd /Users/404server/Documents/transfer.zip-web
```

### Live log stream (press Ctrl+C to stop)
```bash
docker compose logs -f next
docker compose logs -f worker
docker compose logs -f mongo
```

### Last 50 lines from a service
```bash
docker compose logs next --tail=50
docker compose logs worker --tail=50
```

### Cloudflare tunnel logs
```bash
cat /Library/Logs/com.cloudflare.cloudflared.err.log | tail -50
```

---

## Cloudflare Tunnel

The tunnel connects `transfer.studio404.nyc` and `files.studio404.nyc`
to the Mac mini without any open router ports.

### Check tunnel status
```bash
cloudflared tunnel info studio-transfer
```
Should show 4 active connections. If it shows none, see Troubleshooting.

### Restart the tunnel service
```bash
sudo launchctl stop com.cloudflare.cloudflared
sudo launchctl start com.cloudflare.cloudflared
```

### Tunnel config file
```
~/.cloudflared/config.yml
```

---

## Backups and Restore

> Substitute `MONGO_ROOT_PASSWORD` with the value from the [Credentials](#credentials) section.

### Back up the database
```bash
docker exec transferzip-web-mongo-1 mongodump \
  --username root \
  --password <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --db transfer-zip \
  --out /tmp/backup

docker cp transferzip-web-mongo-1:/tmp/backup ./mongo-backup-$(date +%Y%m%d)
```
Saves a backup folder to the project directory named `mongo-backup-YYYYMMDD`.

### Restore from a backup
```bash
docker cp ./mongo-backup-YYYYMMDD transferzip-web-mongo-1:/tmp/restore

docker exec transferzip-web-mongo-1 mongorestore \
  --username root \
  --password <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --db transfer-zip \
  /tmp/restore/transfer-zip
```

### What gets backed up
The database backup covers user accounts and transfer metadata (names,
links, expiry dates). Uploaded files are stored separately on the node
server at:
```
/Users/404server/studio-server/transfer.zip-node/_data/
```
Back up that directory separately to preserve actual file contents.

---

## Making Changes

### After editing any source file (JS, JSX, config)
```bash
cd /Users/404server/Documents/transfer.zip-web
docker compose up -d --build next
```
The build takes 2–3 minutes. The site stays up on the old version during
the build.

### After editing `.env` or `next/.env`
```bash
docker compose up -d
```
> Do **not** use `docker compose restart` — it does not re-read `.env`.
> Always use `up -d` to pick up environment variable changes.

### After editing `next/conf.json` (node server URL)
Requires a rebuild:
```bash
docker compose up -d --build next
```

### Changing the MongoDB password
> Update `MONGO_ROOT_PASSWORD` in the [Credentials](#credentials) section
> after completing these steps.

1. Change the password inside MongoDB (while containers are still running):
```bash
docker exec transferzip-web-mongo-1 mongosh \
  -u root -p <MONGO_ROOT_PASSWORD> \
  --authenticationDatabase admin \
  --eval 'db.getSiblingDB("admin").changeUserPassword("root", "<NEW_PASSWORD>")'
```
2. Update `.env`:
```bash
sed -i '' 's|MONGO_INITDB_ROOT_PASSWORD=<OLD_PASSWORD>|MONGO_INITDB_ROOT_PASSWORD=<NEW_PASSWORD>|' \
  /Users/404server/Documents/transfer.zip-web/.env
```
3. Recreate containers to pick up the new value:
```bash
docker compose up -d
```
4. Update `MONGO_ROOT_PASSWORD` in the [Credentials](#credentials) section of this file.

### Changing the brand color
Edit line 3 of `next/tailwind.config.js`, then rebuild:
```bash
docker compose up -d --build next
```

### Replacing the logo
Replace these files with your new PNG (square, min 256×256), then rebuild:
```
next/public/img/icon.png         — used in emails and the UI
next/public/img/icon-small.png   — smaller UI variant
next/src/img/icon.png            — used by the sign-in page
next/public/favicon.ico          — browser tab icon (copy PNG directly)
```
```bash
cp your-logo.png next/public/favicon.ico
docker compose up -d --build next
```

---

## Key Config Files

| File | What it controls |
|---|---|
| `.env` | MongoDB credentials, port numbers, Caddy domain |
| `next/.env` | Site URL, cookie domain, Resend API key, Stripe keys |
| `next/conf.json` | URL of the file storage node server |
| `next/tailwind.config.js` | Brand color |
| `~/.cloudflared/config.yml` | Cloudflare tunnel routing rules |
| `/Library/LaunchDaemons/com.cloudflare.cloudflared.plist` | Tunnel auto-start on reboot |

### MongoDB direct access (for Compass or mongosh)
```
Host:      localhost:27017
Username:  root
Password:  <MONGO_ROOT_PASSWORD>  — see Credentials section
Database:  transfer-zip
```

---

## Troubleshooting

### Site is down / not loading
1. Check Docker is running (whale icon in menu bar)
2. Check containers: `docker ps`
3. Check tunnel: `cloudflared tunnel info studio-transfer`
4. Check logs: `docker compose logs next --tail=50`

### Worker keeps crashing
Usually means it can't reach MongoDB. Check that mongo is running:
```bash
docker ps | grep mongo
```
If missing, start the full stack:
```bash
docker compose up -d
```

### Worker shows authentication error
The worker's password doesn't match MongoDB. Confirm `.env` has the
correct password, then recreate containers:
```bash
grep MONGO_INITDB_ROOT_PASSWORD .env
docker compose up -d
```

### Tunnel shows no active connections
```bash
sudo launchctl stop com.cloudflare.cloudflared
sudo launchctl start com.cloudflare.cloudflared
cloudflared tunnel info studio-transfer
```
If still down, run manually to see the error:
```bash
cloudflared tunnel run fffe8a5f-e8c6-41b3-8bab-140a59195d65
```

### Emails not sending
Check the Resend API key is set in `next/.env`:
```bash
grep RESEND_API_KEY /Users/404server/Documents/transfer.zip-web/next/.env
```
Should show `RESEND_API_KEY=re_...`. If blank, add the key and rebuild:
```bash
docker compose up -d --build next
```

### Account login fails with "Wrong email or password"
Reset the account:
1. `./delete-account.sh`
2. `./create-account.sh`
3. Have the user set their own password via **Forgot password?**

### Uploaded files are missing after restart
Files live at:
```
/Users/404server/studio-server/transfer.zip-node/_data/
```
Check the node server is running:
```bash
docker ps | grep node-server
```
If missing:
```bash
cd /Users/404server/studio-server/transfer.zip-node
docker compose up -d
```
