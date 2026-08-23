# TypeScript & Frontend Conventions

## Code Style & Types
- **Strict Typing**: Avoid `any`. Use explicit interfaces and types defined in `src/types/` or co-located DTOs.
- **Component Architecture**:
  - Functional components with React 18 hooks.
  - Component files in PascalCase (e.g., `TrafficMap.tsx`).
  - Co-locate sub-components and CSS if specific to a single page/feature.
- **State Management**:
  - Use Zustand stores (`useAppStore`, `useNotificationStore`) for cross-cutting global state.
  - Keep local UI state within components using `useState` / `useReducer`.
- **Heavy Computation**:
  - Offload heavy GeoJSON / spatial calculations to Web Workers (e.g., `traffic-processor.worker.ts`) to maintain 60 FPS UI rendering.
- **Linting & Formatting**:
  - Run `npm run lint` in `frontend/` or `backend/` before submitting changes.
