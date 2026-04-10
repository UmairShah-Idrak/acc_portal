# Accounts Portal

A self-hosted Google Drive-like file management portal built for the IdrakAI accounts team. Stores files on your own server with no storage limits.

## Features

- **Google Drive-like UI** — grid/list views, drag & drop upload, breadcrumb navigation, right-click context menus
- **File Management** — upload, download, rename, move to trash, restore, starred files, search
- **Folders** — create nested folder structures
- **File Versioning** — replace any file with a new version (keeps the same entry)
- **Preview** — in-browser preview for images, PDFs, videos, and audio
- **Password-Protected Sharing** — generate share links with a password and optional expiry date
- **User Management** — admin can create/edit/delete users, reset passwords, activate/deactivate accounts
- **Roles** — `admin` and `user` roles

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, Mongoose |
| Frontend | React, Vite, Tailwind CSS |
| Database | MongoDB |
| File Storage | Local filesystem (Docker volume) |
| Containerization | Docker, Docker Compose |

## Deploy

### Prerequisites

- Docker & Docker Compose installed on server
- MongoDB instance accessible

### Steps

```bash
# 1. Clone the repo
git clone git@github-work:UmairShah-Idrak/acc_portal.git
cd acc_portal

# 2. Build images
docker compose build

# 3. Start services
docker compose up -d

# 4. Seed the first admin user (run once)
make seed
```

Portal is available at `http://YOUR_SERVER_IP:8888`

### Default Admin Credentials

```
Email:    admin@idrakai.com
Password: admin123
```

> **Change the password immediately after first login.**

## Configuration

Edit `docker-compose.yml` to update:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Change to a strong random secret in production |
| `ports` | Change `8888:80` to `80:80` for standard port |

## Project Structure

```
accounts_portal/
├── backend/
│   ├── src/
│   │   ├── config/db.js
│   │   ├── models/          # User, FileItem, Share
│   │   ├── routes/          # auth, users, files, shares
│   │   ├── middleware/       # auth, upload
│   │   ├── server.js
│   │   └── seed.js
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login, Drive, Users, SharedFile
│   │   ├── components/      # Layout, Files, FileIcon, Modals
│   │   └── context/         # AuthContext
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── Makefile
```

## Usage

### Uploading Files
- Click **Upload** or drag & drop files anywhere on the Drive page
- Multiple files supported, up to 5 GB each

### Sharing a File
1. Right-click a file → **Share**
2. Set a password and optional expiry
3. Copy the generated link and send it
4. Recipient visits the link, enters password, and downloads

### Replacing a File Version
- Right-click a file → **Upload new version**
- The file is replaced in-place (same name, same location)

### User Management (Admin only)
- Go to **User Management** in the sidebar
- Create, edit, activate/deactivate, reset passwords, or delete users
