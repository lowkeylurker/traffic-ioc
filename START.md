# ⚡ FASTEST WAY TO START

Copy & Paste These Commands:

## Frontend Only (5 minutes)

```bash
cd frontend
npm install
npm run dev
```

Then open: **http://localhost:5173**

---

## Full Stack (15 minutes)

### Terminal 1 - Database & Cache
```bash
docker-compose up -d
```

### Terminal 2 - Backend API
```bash
cd backend
npm install
npm run dev
```

### Terminal 3 - Frontend App
```bash
cd frontend
npm install
npm run dev
```

Then open: **http://localhost:5173**

---

## What You Need

1. **Node.js 18+** - https://nodejs.org
2. **Docker** (optional) - https://docker.com
3. **Mapbox Token** (optional) - https://mapbox.com
4. **Text Editor** - VS Code recommended

---

## First Time Setup (One-time)

Before running, create `.env` file in frontend folder:

```bash
cd frontend
cp .env.example .env
```

Then edit `.env` with your Mapbox token:
```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_MAPBOX_TOKEN=pk.eyJ...YOUR_TOKEN...
```

Get token from: https://account.mapbox.com/tokens/

---

## You're Done! 🎉

Visit **http://localhost:5173** and start exploring!

---

## Next: Read Documentation

- **QUICK_START.md** - Quick setup guide
- **README.md** - Full documentation
- **frontend/DEVELOPMENT.md** - Development guide
- **IMPLEMENTATION_SUMMARY.md** - What's built

---

## Troubleshooting

### Port already in use?
```bash
npm run dev -- --port 5174
```

### Node modules issue?
```bash
rm -rf node_modules package-lock.json
npm install
```

### Still stuck?
Check the frontend/README.md troubleshooting section.

---

**Questions?** See the documentation in each folder.
