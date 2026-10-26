# 🛠️ ZAID ASHIQ STUDIO - Complete Environment Setup Guide
### Roman Urdu & English Walkthrough for Production Deployment

Yeh guide aapko batati hai ke aap apne WhatsApp Bot aur Control Panel ke tamam **Environment Variables (`.env`)** kaise hasil karein aur unhein Vercel, Railway, Render, aur Heroku par kaise configure karein.

---

## 📋 1. Must-Have Variables Table (لازمی ویری ایبلز)

| Variable Name | Purpose (مقصد) | Example Value | Kahan Set Karein? |
| :--- | :--- | :--- | :--- |
| `SESSION_ID` | WhatsApp Session Credentials | `ZAID~bXlfc2Vzc2lvbg==` | Railway, Render, Heroku |
| `BOT_NAME` | Bot Display Name | `ZAID ASHIQ STUDIO` | All Backends |
| `BOT_PREFIX` | Commands Prefix (`/`, `!`, `.`) | `/` | All Backends |
| `OWNER_NUMBER` | Bot Owner WhatsApp Number | `923001234567` | All Backends |
| `OWNER_NAME` | Bot Owner Name | `Zahid Ashiq` | All Backends |
| `WORK_TYPE` | `public` ya `private` | `public` | All Backends |
| `TIMEZONE` | Pakistan Timezone (PKT) | `Asia/Karachi` | All Backends & Frontend |
| `PORT` | Listening Port | `8080` (Railway) / `10000` (Render) | Railway / Render |
| `VITE_API_BASE_URL` | Public Backend Domain | `https://your-bot.up.railway.app` | Vercel (Frontend) |
| `CLOUDINARY_URL` | Cloud Media CDN (Optional) | `cloudinary://key:secret@name` | All Backends |
| `GITHUB_TOKEN` | Automated Session Backup (Optional) | `ghp_xxxxxxxxxxxxxx` | All Backends |

---

## 🔑 2. Credential Hasil Karne Ka Tareeqa (How to Obtain Keys)

### A. WhatsApp `SESSION_ID` Kaise Hasil Karein?
1. Bot ko local preview ya Railway/Render par run karein.
2. Web Dashboard par ja kar **WhatsApp Pairing (Features ☰)** open karein.
3. Apna phone number enter kar ke **8-digit Pairing Code** hasil karein aur mobile WhatsApp mein enter karein.
4. Connect hone ke baad, browser mein `http://your-backend-url/api/session` par ja kar apna **`SESSION_ID`** copy kar lein (Format: `ZAID~...`).
5. Is `SESSION_ID` ko Railway, Render, ya Heroku ke Environment Variables mein paste kar dein. **Is ke baad container restart hone par dobara QR code ya pair code ki zaroorat nahi paregi!**

---

### B. Free Cloudinary Media Storage Kaise Banayein?
*(Yeh PTV Video Notes, PTT Voice Notes, aur Anti-Delete Photos ko mehfooz rakhne ke liye zaroori hai)*
1. [cloudinary.com](https://cloudinary.com) par ja kar **Free Account** create karein.
2. Dashboard par aapko **Cloud Name**, **API Key**, aur **API Secret** mil jaye ga.
3. Ya phir Dashboard se direct **API Environment Variable** (`CLOUDINARY_URL`) copy kar lein:
   ```env
   CLOUDINARY_URL=cloudinary://123456789012345:abcdefghijklmnopqrst@my-cloud-name
   ```

---

### C. GitHub Session Backup Token Kaise Banayein?
*(Heroku ya Render par free container restart hone par session token bachane ke liye)*
1. Apne [github.com/settings/tokens](https://github.com/settings/tokens) par jayein.
2. **Generate New Token (Classic)** par click karein.
3. **`gist`** aur **`repo`** permission checkbox ko tick karein.
4. Token generate kar ke copy karein aur `GITHUB_TOKEN=ghp_...` mein paste kar dein.

---

## 🚀 3. Platform-by-Platform Setup (پلیٹ فارم وار طریقہ کار)

### 1. Vercel (Frontend UI Dashboard)
- **Root Directory**: `vercel`
- **Build Command**: Leave default (Static HTML)
- **Environment Variables**:
  ```env
  VITE_API_BASE_URL=https://your-backend.up.railway.app
  VITE_APP_TITLE=ZAID ASHIQ STUDIO - WhatsApp Control Panel
  VITE_DEFAULT_TIMEZONE=Asia/Karachi
  ```

---

### 2. Railway (Continuous Bot Container)
- **Root Directory**: `railway`
- **Service Settings > Variables**:
  ```env
  PORT=8080
  NODE_ENV=production
  RAILWAY_ENVIRONMENT=production
  SESSION_ID=ZAID~your_session_string_here
  BOT_NAME=ZAID ASHIQ STUDIO
  BOT_PREFIX=/
  OWNER_NUMBER=923001234567
  OWNER_NAME=Zahid Ashiq
  WORK_TYPE=public
  TIMEZONE=Asia/Karachi
  RAILWAY_BACKEND_URL=https://your-service.up.railway.app
  CLOUDINARY_URL=cloudinary://... (optional)
  GITHUB_TOKEN=ghp_... (optional)
  ```

---

### 3. Render (Web Service)
- **Root Directory**: `render`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Environment Variables**:
  ```env
  PORT=10000
  NODE_ENV=production
  SESSION_ID=ZAID~your_session_string_here
  BOT_NAME=ZAID ASHIQ STUDIO
  BOT_PREFIX=/
  OWNER_NUMBER=923001234567
  OWNER_NAME=Zahid Ashiq
  WORK_TYPE=public
  TIMEZONE=Asia/Karachi
  RENDER_EXTERNAL_URL=https://your-service.onrender.com
  CLOUDINARY_URL=cloudinary://... (optional)
  GITHUB_TOKEN=ghp_... (optional)
  ```

---

### 4. Heroku (Dyno Container)
- **Root Directory**: `heroku` (ya Procfile in root)
- **Settings > Config Vars**:
  ```env
  NODE_ENV=production
  SESSION_ID=ZAID~your_session_string_here
  BOT_NAME=ZAID ASHIQ STUDIO
  BOT_PREFIX=/
  OWNER_NUMBER=923001234567
  OWNER_NAME=Zahid Ashiq
  WORK_TYPE=public
  TIMEZONE=Asia/Karachi
  HEROKU_BACKEND_URL=https://your-app.herokuapp.com
  CLOUDINARY_URL=cloudinary://... (optional)
  GITHUB_TOKEN=ghp_... (optional)
  ```
  *(Note: Heroku par `PORT` manually set na karein, Heroku apna dynamic `$PORT` khud deta hai).*

---

## ⚡ 4. Local Testing (اپنے کمپیوٹر یا AI Studio پر ٹیسٹ کرنے کے لیے)

Roote folder mein mojood `.env.example` ko copy kar ke `.env` banayein:
```bash
cp .env.example .env
npm start
```
Browser mein `http://localhost:3000` open karein. Aapka WhatsApp Control Panel mukammal taur par active ho jaye ga!
