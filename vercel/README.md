# ZAID ASHIQ STUDIO - FRONTEND WEB CONTROL PANEL (VERCEL DEPLOYMENT GUIDE)

Yeh folder **Zaid Ashiq Studio** ka official frontend web control panel aur Progressive Web App (PWA) hai. Yeh Vercel par deployment ke liye mukammal taur par tayyar hai aur Railway, Render, aur Heroku backends ke sath automatically connect ho jata hai.

---

## ⚡ Vercel Par Deploy Karne Ka Tareeqa (Step-by-Step Guide)

### Step 1: GitHub Repository Vercel Mein Import Karein
1. [Vercel.com](https://vercel.com/) par login karein.
2. Dashboard par **Add New > Project** par click karein.
3. Apni GitHub repository select karein jisme yeh project mojood hai.

### Step 2: Vercel Project Settings (Bohat Zaroori Step!)
1. **Root Directory**:
   - Vercel settings mein **Root Directory** ke samnay **Edit** par click karein.
   - Folder name **`vercel`** likhein ya select karein aur **Save** karein.
   - *(Note: Agar Root Directory `vercel` set nahi karenge toh Vercel backend files ko execute karne ki koshish karega aur 500 error aayega!)*
2. **Framework Preset**:
   - Isko **Other** par rehne dein (yeh static HTML5, TailwindCSS, aur `/api/env.js` serverless function par mushtamil hai).
3. **Build & Output Settings**:
   - Default settings par rehne dein. Koi extra build command zaroori nahi hai.

### Step 3: Environment Variables Configure Karein
Vercel ke **Environment Variables** section mein ja kar yeh variables add karein:

| Variable Name | Zaroori Hai? | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `RAILWAY_BACKEND_URL` | Haan (agar backend Railway par hai) | `https://your-bot.up.railway.app` | Aapke Railway bot backend ka public HTTPS URL |
| `RENDER_BACKEND_URL` | Haan (agar backend Render par hai) | `https://your-bot.onrender.com` | Aapke Render bot backend ka public HTTPS URL |
| `HEROKU_BACKEND_URL` | Haan (agar backend Heroku par hai) | `https://your-bot.herokuapp.com` | Aapke Heroku bot backend ka public HTTPS URL |
| `GOOGLE_CLIENT_ID` | Optional | `123456789.apps.googleusercontent.com` | Google Cloud Console OAuth 2.0 Client ID |
| `CLOUDINARY_URL` | Optional | `cloudinary://API_KEY:SECRET@NAME` | Media CDN status sync ke liye |

### Step 4: Deploy Par Click Karein
- **Deploy** button dabayein.
- Vercel 10 se 20 seconds mein aapka live production panel generate kar dega (jaise `https://your-bot.vercel.app`).
- Jab panel open hoga, yeh automatically aapke Railway, Render, ya Heroku backend se connect ho jayega!

---

## 🛠️ Agar Pehle Se Deploy Hai Aur 500 Error Aa Raha Hai?
Agar aapko `500 FUNCTION_INVOCATION_FAILED` ya `ERR_REQUIRE_ESM` error nazar aa raha hai:
1. Vercel dashboard par jayein -> Apna Project select karein -> **Settings** -> **General** mein jayein.
2. **Root Directory** ke samnay **Edit** click karein aur **`vercel`** likhein, phir **Save** karein.
3. Phir **Deployments** tab mein jayein, latest deployment ke 3 dots `...` par click karein aur **Redeploy** karein.
4. Error khatam ho jayega aur panel foran chal parega!

---

## 📱 Features Jo Is Frontend Mein Shamil Hain
1. **Dark Obsidian & Emerald Design**: Modern SaaS dashboard layout with tabular numerals and zero-pill typography.
2. **Live Baileys QR Code & Pairing Code**: Baghair console khole browser se WhatsApp connect karein (8-digit instant code).
3. **Multi-Backend Switcher**: Railway, Render, Heroku aur Localhost ke darmian 1-click switch aur live latency ping.
4. **Interactive 118+ Commands Catalog**: Live search, category filter, aur sandbox test runner.
5. **Session ID Rehydration**: Base64 session string check aur automated verification.
6. **Broadcast & Announcement Sandbox**: Paired chats par test announcements dispatch karein.
