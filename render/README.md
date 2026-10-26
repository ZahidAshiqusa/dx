# ZAID ASHIQ STUDIO - BACKEND 2 (RENDER DEPLOYMENT GUIDE)

Yeh folder **Render.com** par WhatsApp Baileys Bot backend deploy karne ke liye tayyar kiya gaya hai. Isme Render Blueprint (`render.yaml`) support, `/api/health` zero-downtime health checking, Online Tracer, Anti-Delete Vault, Cloudinary Media CDN, aur GitHub Session Backup shamil hain.

---

## ⚡ Render Par Deploy Karne Ka Tareeqa (Step-by-Step Guide)

### Tareeqa A: One-Click Blueprint Ke Zariye (Sab Se Asaan)
1. Apni GitHub repository ko push karein.
2. [Render Dashboard](https://dashboard.render.com/) par login karein.
3. **New + > Blueprint** par click karein.
4. Apni repository select karein. Render khud bakhud `render.yaml` ko parh kar service configure kar lega:
   - **Service Name**: `zaid-ashiq-bot-backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Health Check Path**: `/api/health`
5. Environment variables fill karein aur **Apply** daba dein.

---

### Tareeqa B: Manual Web Service Banane Ka Tareeqa
1. [Render Dashboard](https://dashboard.render.com/) mein **New + > Web Service** par click karein.
2. Apni GitHub repo choose karein.
3. Service settings mein yeh details dein:
   - **Name**: `zaid-ashiq-bot-backend`
   - **Root Directory**: `render` (agar poori repo connect ki hai)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free` ya `Starter`
4. **Advanced Settings** kholein:
   - **Health Check Path**: `/api/health` (yeh Render ko batata hai ke bot active hai aur restart nahi hone deta)
5. **Environment Variables** add karein:

| Variable Name | Zaroori Hai? | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Haan | `production` | Production environment flag |
| `ADMIN_NUMBER` | Haan | `9232999931199` | Bot admin phone number (country code ke sath, baghair +) |
| `API_SECRET` | Haan | `zaid-ashiq-secret-2026` | API authentication key |
| `GOOGLE_CLIENT_ID` | Haan | `123456789.apps.googleusercontent.com` | Google Cloud Console OAuth 2.0 Web Client ID |
| `SESSION_ID` | Optional | `zaid-session-xyz...` | WhatsApp Baileys pre-authenticated session |
| `CLOUDINARY_URL` | Optional | `cloudinary://API_KEY:SECRET@NAME` | Voice notes, videos aur profile photos CDN par host karne ke liye |
| `GITHUB_TOKEN` | Zaroori (Backup) | `ghp_xxxxxxxxxxxxxxxxxxxx` | Session Gist backup ke liye (GitHub token with `gist` scope) |
| `GITHUB_GIST_ID` | Optional | `gist_id_here` | Agar purana session Gist restore karna ho |

6. **Create Web Service** par click karein.
7. Jab deploy ho jaye toh Render aapko public URL dega, jaise:
   ```
   https://your-bot-backend.onrender.com
   ```
8. Yeh URL copy karein aur apne **Vercel Frontend** ke Environment Variables mein `RENDER_BACKEND_URL` ke taur par paste kar dein!

---

## 🔒 Session Safety & Gist Backup
Render ke free tier containers idle hone par sleep ho sakte hain ya redeploy par disk wipe hoti hai.
- Bot mein **GitHub Gist Auto-Backup** shamil hai: WhatsApp pair hote hi `creds.json` aapke GitHub par private Gist mein save ho jata hai.
- Jab container dobara wake up hota hai, toh bot automatically Gist se session nikaal kar connect ho jata hai, zero manual intervention ke sath!
