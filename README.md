# ZAID ASHIQ STUDIO — Multi-Cloud WhatsApp Bot & Web Control Suite

A production-grade, modular multi-cloud WhatsApp automation suite organized into exactly 4 platform-named folders:

| Folder Name | Deployment Target | Description & Guide |
| :--- | :--- | :--- |
| **`vercel/`** | **Vercel** | Progressive Web App & Dark Obsidian Dashboard. [Roman Urdu README](./vercel/README.md) |
| **`railway/`** | **Railway.app** | Baileys WhatsApp Bot with `railway.json` and `Procfile`. [Roman Urdu README](./railway/README.md) |
| **`render/`** | **Render.com** | Baileys WhatsApp Bot with `render.yaml` Blueprint & health check. [Roman Urdu README](./render/README.md) |
| **`heroku/`** | **Heroku** | Baileys WhatsApp Bot with `Procfile` & dynamic `$PORT` binding. [Roman Urdu README](./heroku/README.md) |

---

## ⚡ MULTI-CLOUD ARCHITECTURE & DEPLOYMENT OVERVIEW

> **Architecture Overview**: The **Backend** runs 24/7 on your choice of **Railway**, **Render**, or **Heroku**, maintaining persistent Baileys WhatsApp sockets, subscribing to presence updates, processing 118+ commands, and handling WhatsApp multi-device authentication (via 8-digit Pairing Code or QR Code). The **Frontend** runs on **Vercel** as a high-performance Dark Obsidian dashboard that connects in real-time to whichever backend you choose!

---

### Folder 1: `vercel/` (Vercel Deployment)
- **Target**: Vercel (Set Root Directory to `vercel`).
- **Detailed Roman Urdu Guide**: [vercel/README.md](./vercel/README.md)

### Folder 2: `railway/` (Railway Deployment)
- **Target**: Railway.app Web Service (Set Root Directory to `railway`).
- **Detailed Roman Urdu Guide**: [railway/README.md](./railway/README.md)

### Folder 3: `render/` (Render Deployment)
- **Target**: Render.com Blueprint or Web Service (Set Root Directory to `render`).
- **Detailed Roman Urdu Guide**: [render/README.md](./render/README.md)

### Folder 4: `heroku/` (Heroku Deployment)
- **Target**: Heroku Dyno (Set Root Directory to `heroku` or push subtree).
- **Detailed Roman Urdu Guide**: [heroku/README.md](./heroku/README.md)

---

## 🚀 GitHub Push Instructions

To push this entire project to a brand-new GitHub repository without any errors:

```bash
# Automated GitHub CLI Push:
bash push_to_github.sh
```

Or manually:
```bash
git add .
git commit -m "feat: 4 platform folders (vercel, railway, render, heroku)"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_NEW_REPO.git
git push -u origin main
```

For complete step-by-step instructions in Roman Urdu, see [GITHUB_PUSH_GUIDE.md](./GITHUB_PUSH_GUIDE.md).
