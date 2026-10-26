# ZAID ASHIQ STUDIO - BACKEND 1 (RAILWAY DEPLOYMENT GUIDE)

Yeh folder **Railway.app** par WhatsApp Baileys Bot backend deploy karne ke liye mukammal taur par tayyar hai. Isme persistent WebSocket server, Online Tracer, Anti-Delete Vault, Cloudinary CDN, aur GitHub Session Backup shamil hain.

---

## ⚡ Railway Par Deploy Karne Ka Mukammal Tareeqa (Step-by-Step Guide)

### Step 1: GitHub Repository Ko Railway Par Connect Karein
1. [Railway.app](https://railway.app/) par login karein.
2. Dashboard par **New Project** par click karein.
3. **Deploy from GitHub repo** select karein aur apni repository choose karein.

### Step 2: Service Settings Configure Karein
1. Project banne ke baad us service par click karein aur **Settings** tab kholein.
2. **Root Directory**:
   - Agar aap puri repository se deploy kar rahe hain, toh **Root Directory** ko **`/railway`** set karein.
   - Agar aapne sirf yeh folder alag repository mein push kiya hai toh root `/` hi rehne dein.
3. **Build & Start Command**:
   - Build Command: (Khali chhor dein ya `npm install`).
   - Start Command: `node server.js` (Railway isko `railway.json` aur `Procfile` se auto-detect kar leta hai).

### Step 3: Environment Variables Add Karein
Railway ke **Variables** tab mein ja kar yeh secrets add karein:

| Variable Name | Zaroori Hai? | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Haan | `production` | Production environment flag |
| `PORT` | Auto | `3000` | Railway isko automatically set kar deta hai |
| `ADMIN_NUMBER` | Haan | `9232999931199` | Bot admin phone number (country code ke sath, baghair +) |
| `API_SECRET` | Haan | `zaid-ashiq-secret-2026` | API authentication key |
| `GOOGLE_CLIENT_ID` | Haan | `123456789.apps.googleusercontent.com` | Google Cloud Console OAuth 2.0 Web Client ID |
| `SESSION_ID` | Optional | `zaid-session-xyz...` | WhatsApp Baileys pre-authenticated session |
| `CLOUDINARY_URL` | Optional | `cloudinary://API_KEY:SECRET@NAME` | Voice notes, videos aur profile photos CDN par host karne ke liye |
| `GITHUB_TOKEN` | Zaroori (Backup) | `ghp_xxxxxxxxxxxxxxxxxxxx` | Session Gist backup ke liye (GitHub token with `gist` scope) |
| `GITHUB_GIST_ID` | Optional | `gist_id_here` | Agar purana session Gist restore karna ho |

### Step 4: Public Domain Generate Karein
1. Railway service ke **Networking** section mein jayein.
2. **Generate Domain** button par click karein.
3. Aapko public HTTPS URL mil jayega, jaise:
   ```
   https://your-bot-production.up.railway.app
   ```
4. Yeh URL copy karein aur apne **Vercel Frontend** ke Environment Variables mein `RAILWAY_BACKEND_URL` ke taur par paste kar dein!

---

## 🔒 Session Safety & Gist Backup (Containers Restart Protection)
Railway ke containers kabhi restart ya rebuild hote hain toh local session files delete ho sakti hain. Is se bachne ke liye:
- Jab aap `GITHUB_TOKEN` set karte hain, toh yeh bot WhatsApp connect hote hi `creds.json` ko aapke GitHub account mein **private secret Gist** ke taur par auto-save kar leta hai.
- Container restart hone par bot khud bakhud Gist se session restore kar leta hai, aur aapko dubara QR code scan karne ki zaroorat nahi parti!
