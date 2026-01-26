# 🚀 Quick Start Guide

## 1️⃣ Prerequisites
- Node.js 18+
- npm or yarn
- Mapbox account (for access token)

## 2️⃣ Installation (2 minutes)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
```

## 3️⃣ Configuration (1 minute)

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env`:
```
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOiJjbHl4eHh4eHgifQ.xxxxxxxxxxxx
```

> Get Mapbox token from: https://account.mapbox.com/tokens/

## 4️⃣ Start Development Server (instant)

```bash
npm run dev
```

Visit: **http://localhost:5173**

## 5️⃣ Verify Everything Works

✅ **Real-Time Page** (`/real-time`)
- Should see interactive map
- Weather widget (top-left)
- Alert feed (top-right)

✅ **Analytics Page** (`/analytics`)
- Should see 4 charts/tables
- Filter bar at top

✅ **Simulation Page** (`/simulation`)
- Should see split layout
- Map on left, control panel on right

## 📝 Common Tasks

### Build for Production
```bash
npm run build
# Output in dist/ folder
```

### Check Code Quality
```bash
npm run lint
```

### Preview Production Build
```bash
npm run preview
```

## 🔧 Troubleshooting

### Port 5173 already in use
```bash
npm run dev -- --port 5174
```

### Map not displaying
- Check Mapbox token is valid
- Verify `VITE_MAPBOX_TOKEN` in `.env`

### Backend not connecting
- Ensure Backend running at `localhost:3000`
- Check `VITE_API_BASE_URL` in `.env`
- Check Network tab in DevTools

### TypeScript errors
```bash
npx tsc --noEmit
```

## 📚 Next Steps

1. Read [README.md](README.md) for full documentation
2. Check [DEVELOPMENT.md](DEVELOPMENT.md) for development guide
3. Review [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture
4. See [CHECKLIST.md](CHECKLIST.md) for what's implemented

## 🎯 Project Structure

```
src/
├── pages/          # Page components (RealTime, Analytics, Simulation)
├── components/     # Reusable UI components
├── hooks/         # Custom React hooks
├── services/      # API communication
├── stores/        # Global state (Zustand)
├── config/        # Constants & theme
├── types/         # TypeScript interfaces
├── utils/         # Utility functions
└── styles/        # Global CSS
```

## 🌐 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:3000/api/v1` |
| `VITE_MAPBOX_TOKEN` | Mapbox GL token | `pk.eyJ...` |

## 📞 Need Help?

- Check [DEVELOPMENT.md](DEVELOPMENT.md) Troubleshooting section
- Read code comments in `/src` files
- Check Browser DevTools Console for errors
- Ensure Backend is running (`npm run dev` in backend folder)

---

## ✨ You're All Set!

```bash
cd frontend
npm install
npm run dev
```

Then visit: **http://localhost:5173** 🎉
