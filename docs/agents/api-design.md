# API & Backend Design Conventions

## REST Endpoints
- **URL Path**: `kebab-case`, plural or entity nouns prefixed with `/api/v1` (e.g., `/api/v1/traffic-flow`, `/api/v1/user-incidents`).
- **HTTP Methods**: GET (read), POST (create/action), PUT/PATCH (update), DELETE (remove).

## Payload & Responses
- **JSON Formatting**: Always use `camelCase` for JSON keys in request bodies and API responses (e.g., `{ "currentSpeed": 45, "segmentId": 102 }`).
- **Standardized Response Structure**:
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "Optional message"
  }
  ```
- **Error Handling**: Use the centralized `error.middleware.ts`. Throw explicit HTTP error classes with relevant status codes.
- **Validation**: Validate incoming request body and parameters using Zod or Class-Validator DTOs.
