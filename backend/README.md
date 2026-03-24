# Backend API - Smart Traffic IOC

REST API server for Smart Traffic IOC system using Node.js, Express, TypeScript, and Prisma ORM.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file based on `.env.example`:

```bash
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/traffic_ioc_db?schema=public"
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
CLOUDINARY_INCIDENT_FOLDER=traffic-ioc/incidents
```

### 3. Pull Database Schema

Since the database is managed by Data Engineers using SQL scripts, use Prisma introspection:

```bash
npx prisma db pull
npx prisma generate
```

### 4. Run Development Server

```bash
npm run dev
```

Server will start at: **http://localhost:3000**

**Health Check:** http://localhost:3000/health

## � Docker

Build image from backend folder:

```bash
docker build -t traffic-ioc-backend:latest .
```

Run container (pass env file with DATABASE_URL, CLERK keys, etc.):

```bash
docker run -d --name traffic-ioc-backend \
  --env-file .env \
  -p 3000:3000 \
  traffic-ioc-backend:latest
```

Push to Docker Hub:

```bash
# Login once
docker login

# Replace <dockerhub-username> with your account
docker tag traffic-ioc-backend:latest <dockerhub-username>/traffic-ioc-backend:latest
docker push <dockerhub-username>/traffic-ioc-backend:latest
```

Optional version tag:

```bash
docker tag traffic-ioc-backend:latest <dockerhub-username>/traffic-ioc-backend:v1.0.0
docker push <dockerhub-username>/traffic-ioc-backend:v1.0.0
```

## �📁 Project Structure

```
src/
├── config/           # Prisma configuration
├── constants/        # Constants & messages
├── controllers/      # HTTP request handlers
├── dtos/             # Data Transfer Objects (validation)
├── interfaces/       # TypeScript interfaces
├── middlewares/      # Global middlewares (error handler)
├── routes/           # API route definitions
├── services/         # Business logic layer
├── utils/            # Helper functions (response, logger)
├── app.ts            # Express app setup
└── server.ts         # Entry point

prisma/
└── schema.prisma     # Prisma schema (auto-generated)
```

## 📚 API Endpoints

### Map Module (`/api/v1/map`)

| Method | Path                 | Description                           |
| ------ | -------------------- | ------------------------------------- |
| `GET`  | `/segments`          | List all segments (GeoJSON)           |
| `GET`  | `/status`            | Current traffic status (all segments) |
| `GET`  | `/status/:segmentId` | Status of specific segment            |

### Analytics Module (`/api/v1/analytics`)

| Method | Path                   | Description                          |
| ------ | ---------------------- | ------------------------------------ |
| `GET`  | `/vehicle-mix`         | Vehicle distribution chart data      |
| `GET`  | `/speed-comparison`    | Current vs baseline speed comparison |
| `GET`  | `/reliability-ranking` | Top 10 segments by buffer index      |

### Simulation Module (`/api/v1/simulation`)

| Method | Path        | Description                  |
| ------ | ----------- | ---------------------------- |
| `POST` | `/forecast` | Forecast speed for a segment |
| `POST` | `/routing`  | Compute alternative route    |

### User Crowdsourcing Module (`/api/v1/user`)

| Method  | Path                              | Description                                                       |
| ------- | --------------------------------- | ----------------------------------------------------------------- |
| `GET`   | `/news?lat=...&long=...&radius=5` | Nearby verified incidents for user news feed                      |
| `POST`  | `/report`                         | Submit user incident report (multipart/form-data, optional image) |
| `PATCH` | `/report/:id`                     | Update own pending report (owner only)                            |
| `PATCH` | `/report/:id/status`              | Moderate report status (admin only)                               |

## 🔒 Important Notes

### Environment Variables

- **Never commit `.env`** - Use `.env.example` only
- All secrets must come from environment variables
- `.env` is in `.gitignore` automatically
- Clerk and Cloudinary variables are required for `/api/v1/user/report`
- See operational notes: `backend/docs/USER_CROWDSOURCING_OPERATIONS.md`

### Database Schema

⚠️ **CRITICAL**: Backend DOES NOT manage database schema

- Database is managed by **Data Engineers** using SQL scripts
- Set `synchronize: false` in Prisma (already configured)
- To sync schema after database changes: `npx prisma db pull && npx prisma generate`

### PostGIS Geometry

For queries involving geometry (GeoJSON):

```typescript
// Use raw queries with ST_AsGeoJSON function
const segments = await prisma.$queryRaw`
  SELECT segment_id, ST_AsGeoJSON(geometry)::json as geometry 
  FROM dim_segment
`;
```

## 📝 Response Format

All API responses follow standard format:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": {
    /* response data */
  },
  "timestamp": "2026-01-26T10:30:00Z"
}
```

**Error Response:**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid request",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": null
  },
  "timestamp": "2026-01-26T10:30:00Z"
}
```

## 🔧 Development

### Scripts

```bash
# Development mode (auto-reload)
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start

# Lint code
npm run lint

# Database commands
npm run prisma:pull    # Update schema from database
npm run prisma:gen     # Generate Prisma client
```

### Coding Conventions

- **Classes**: `PascalCase` (e.g., `MapService`)
- **Functions/Variables**: `camelCase` (e.g., `getSegments()`)
- **Interfaces**: `PascalCase` (e.g., `ITrafficData`)
- **Database Columns**: `snake_case` in DB → `camelCase` in API response

### Error Handling

All errors are caught by global error handler middleware:

- Prisma errors (P2025, P2002, P2003) → appropriate HTTP status
- Custom `AppError` → handled with custom status code
- Unhandled → 500 Internal Server Error

## 🚦 Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request / Validation Error
- **404**: Not Found
- **409**: Conflict (Duplicate)
- **500**: Internal Server Error

## 📦 Dependencies

- **express**: Web framework
- **@prisma/client**: ORM client
- **cors**: Cross-origin handling
- **helmet**: Security headers
- **morgan**: HTTP logging
- **class-validator**: DTO validation
- **typescript**: Type safety

## 🔗 Related

- **Frontend**: [../frontend](../frontend)
- **Data Pipeline**: [../data-pipeline](../data-pipeline)
- **Database**: [../infrastructure](../infrastructure)

---

**Last Updated**: Jan 2026
