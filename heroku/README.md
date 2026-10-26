# ZAID ASHIQ STUDIO - BACKEND 3 (HEROKU DEPLOYMENT GUIDE)

Yeh folder **Heroku** par WhatsApp Baileys Bot backend deploy karne ke liye tayyar kiya gaya hai. Isme Heroku `Procfile`, dynamic `$PORT` binding (`0.0.0.0`), Online Tracer, Anti-Delete Vault, Cloudinary Media CDN, aur Heroku dyno restart protection ke liye GitHub Gist Backup shamil hain.

---

## ⚡ Heroku Par Deploy Karne Ka Tareeqa (Step-by-Step Guide)

### Tareeqa A: Heroku Dashboard + GitHub Integration Ke Zariye
1. [Heroku Dashboard](https://dashboard.heroku.com/) par login karein.
2. **New > Create new app** par click karein.
3. App ka unique name dein (jaise `zaid-whatsapp-bot`) aur region choose karein.
4. **Deploy** tab mein ja kar **Deployment method** mein **GitHub** select karein aur apni repository connect karein.
5. Agar repository monorepo hai jisme yeh folder mojood hai, toh Heroku Buildpack `heroku-buildpack-monorepo` use karein ya is folder ko standalone push karein:
   - **Monorepo setup**: Settings -> Add buildpack: `https://github.com/lstoll/heroku-buildpack-monorepo`
   - Config Var add karein: `APP_BASE=heroku`
   - Phir Node.js buildpack add karein: `heroku/nodejs`

---

### Tareeqa B: Heroku CLI Ke Zariye (Fastest & Direct)
Agar aap terminal / CLI use karte hain:
```bash
# 1. Heroku login karein
heroku login

# 2. Nayi Heroku app banayein
heroku create zaid-whatsapp-bot

# 3. Heroku remote add karein aur deploy karein
git subtree push --prefix heroku heroku main
# Ya agar standalone repo ho:
git push heroku main
```

---

### Step 2: Environment Variables (Config Vars) Add Karein
Heroku Dashboard mein apni app kholein -> **Settings** tab -> **Reveal Config Vars** par click karein aur yeh variables add karein:

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

*(Note: `PORT` variable manually add karne ki zaroorat nahi hai, Heroku har dyno start par automatically dynamic `$PORT` assign karta hai).*

### Step 3: Dyno Activate Karein
- **Resources** tab mein jayein.
- `web: node server.js` dyno ko toggle kar ke **ON** karein aur **Confirm** karein.
- Aapki app ka public URL mil jayega, jaise:
  ```
  https://zaid-whatsapp-bot.herokuapp.com
  ```
- Yeh URL copy karein aur apne **Vercel Frontend** ke Environment Variables mein `HEROKU_BACKEND_URL` ke taur par paste kar dein!

---

## 🔒 Heroku Dyno Cycling & Gist Backup (Daily Dyno Restart Protection)
Heroku ke dynos har 24 ghantay baad automatically restart ("cycle") hote hain aur unka ephemeral filesystem refresh ho jata hai.
- Is bot mein **GitHub Secret Gist Backup** built-in hai: jaise hi aap QR scan ya pairing code se WhatsApp link karte hain, bot session credentials ko encrypt kar ke aapke GitHub Gist mein save kar leta hai.
- Jab Heroku dyno restart hota hai, bot foran Gist se `creds.json` utha leta hai aur foran online ho jata hai. Aapko dobara phone se WhatsApp link karne ki bilkul zaroorat nahi parti!
