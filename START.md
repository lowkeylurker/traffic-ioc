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

## Full Stack with AI-Core (20 minutes)

### Terminal 1 - Database, AI-Core, & Support Services
```bash
# Copy environment template
cp .env.example .env

# Start all services (PostgreSQL, Redis, Data-Pipeline, AI-Core)
docker-compose up -d

# View logs
docker-compose logs -f ai-core
```

### Terminal 2 - Backend API (Node.js)
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

## Verify Services are Running

```bash
# Check all services
docker-compose ps

# Check AI-Core health
curl http://localhost:5000/health-check

# Check Backend API
curl http://localhost:3000/api/health

# View Database
# Connect to: postgresql://postgres:postgres@localhost:5433/traffic_ioc_db
```

---

## AI-Core Development (FastAPI)

If you want to develop AI-Core without Docker:

```bash
cd ai-core

# Create virtual environment
python -m venv venv
source venv/Scripts/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Run tests
pytest src/tests/ -v

# Start API server
uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload
```

API will be available at: **http://localhost:5000**
API Documentation: **http://localhost:5000/docs**

---

## What You Need

1. **Node.js 18+** - https://nodejs.org
2. **Python 3.9+** (for AI-Core development) - https://python.org
3. **Docker & Docker Compose** - https://docker.com
4. **Mapbox Token** (optional) - https://mapbox.com
5. **Text Editor** - VS Code recommended

---

## Common Issues

### Port Already in Use
```bash
# Find what's using port 5000
lsof -i :5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill the process or use different port
docker-compose up -d -e AI_SERVICE_PORT=5001
```

### Database Connection Failed
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### AI-Core Import Errors
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall --no-cache-dir

# Clear Python cache
find . -type d -name __pycache__ -exec rm -r {} +
```

---

## Documentation

- **README.md** - Project overview & architecture
- **ai-core/README.md** - AI-Core module details (Forecasting, RL, Clustering)
- **backend/README.md** - Backend API documentation
- **frontend/README.md** - Frontend documentation
- **data-pipeline/README.md** - Data ETL pipeline

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
