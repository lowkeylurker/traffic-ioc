<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Smart Traffic IOC — Citizen User Web Portal (`@traffic-ioc/user-web`)

## 1. Overview & Purpose

`@traffic-ioc/user-web` is the citizen-facing web application for the Smart Traffic Intelligent Operations Center (IOC) of Ho Chi Minh City, designed with equal desktop and mobile responsiveness. Built with **Next.js 16 (App Router)**, **React 19**, and **Tailwind CSS**, it allows commuters to:

- Monitor real-time traffic conditions, Level of Service (LOS), and road congestion metrics.
- Submit crowdsourced traffic incident reports (accidents, floodings, bottlenecks) with GPS location snapping and photo evidence.
- Browse verified traffic bulletins, safety advisories, and hyper-local alerts via the location-based News Feed.

---

## 2. Codebase Structure & Directory Layout

The application adopts a **Feature-Driven / Modular Domain Architecture** (adapted from modern Next.js production patterns):

```
apps/user-web/
├── public/ # Static assets (favicons, brand SVGs, public icons)
├── src/
│ ├── app/ # Next.js App Router (Routes, Layouts, Server Pages)
│ │ ├── (auth)/ # Auth route group (sign-in, sign-up)
│ │ ├── news/ # Verified traffic bulletin & location feed
│ │ │ └── page.tsx
│ │ ├── report/ # Incident submission page (GPS, photo upload)
│ │ │ └── page.tsx
│ │ ├── globals.css # Global Tailwind CSS imports & theme variables
│ │ ├── layout.tsx # Root layout shell (Metadata, Global Header, Footer)
│ │ └── page.tsx # Citizen landing page & quick service portal
│ │
│ ├── features/ # Domain-driven feature modules (React Query + API)
│ │ ├── auth/ # Authentication domain (login, session, tokens)
│ │ ├── incidents/ # Crowdsourcing incident domain
│ │ │ ├── incident.keys.ts # Centralized Query Key Factory
│ │ │ ├── incident.service.ts # Pure async API fetch calls (apiClient)
│ │ │ ├── incident.queries.ts # queryOptions & useQuery custom hooks
│ │ │ ├── incident.mutations.ts # useMutation hooks & cache invalidation
│ │ │ ├── types.ts # DTOs, filter params & domain interfaces
│ │ │ └── index.ts # Feature public barrel export
│ │ ├── news/ # News & broadcast domain (newsfeed, categories)
│ │ └── traffic/ # Real-time traffic flow & corridor status
│ │
│ ├── components/ # UI Components (Presentational layer)
│ │ ├── ui/ # Atomic UI primitives (Button, Dialog, Input, Card, Badge, Spinner)
│ │ ├── layouts/ # Reusable layout blocks (Header, Navbar, Footer, MobileNav)
│ │ ├── Incidents/ # Domain components (ReportForm, LocationSnapper, ImageUploader)
│ │ ├── News/ # Domain components (NewsCard, NewsFilterBar, TickerMarquee)
│ │ └── Home/ # Home components (StatusHero, QuickLinks, LosLegendGrid)
│ │
│ ├── lib/ # Infrastructure & shared application libraries
│ │ ├── api/ # Centralized HTTP Client & Networking
│ │ │ ├── apiClient.ts # Typed API client with custom ApiError & interceptors
│ │ │ ├── token.ts # Auth token storage & retrieval helpers
│ │ │ └── refresh.ts # Token refresh handlers
│ │ ├── query/ # TanStack React Query client provider & SSR prefetch helper
│ │ └── utils.ts # Classnames merger (`cn` with clsx & tailwind-merge)
│ │
│ ├── hooks/ # Global / generic custom React hooks (useGeolocation, useDebounce)
│ ├── stores/ # Global Client UI state (Zustand stores)
│ ├── types/ # Ambient TypeScript declarations & shared frontend interfaces
│ └── utils/ # Application constants, formatters, and helpers
│
├── AGENTS.md # Agent guidelines & rules
├── eslint.config.mjs # Next.js flat ESLint configuration + Prettier
├── .prettierrc # Code formatting rules with Tailwind plugin
├── next.config.ts # Next.js TypeScript configuration
├── package.json # Package metadata & script definitions
└── tsconfig.json # Path aliases (@/app, @/features, @/components, etc.)

```

---

## 3. React Query & Feature Conventions (`src/features/<feature>/`)

All feature modules must follow **TanStack React Query v5 best practices** with strict separation between data fetching, query definitions, mutations, and presentational UI.

### 3.1. Query Key Factories (`<feature>.keys.ts`)

- **NEVER** use inline string array literals (`queryKey: ['incidents', id]`).
- Define a single hierarchical **Query Key Factory** per feature using `as const` tuples for type safety and targeted cache invalidations:
  ```typescript
  // src/features/incidents/incident.keys.ts
  import type { IncidentFilterParams } from './types';

  export const incidentKeys = {
    all: ['incidents'] as const,
    lists: () => [...incidentKeys.all, 'list'] as const,
    list: (filters: IncidentFilterParams) => [...incidentKeys.lists(), filters] as const,
    details: () => [...incidentKeys.all, 'detail'] as const,
    detail: (id: string | number) => [...incidentKeys.details(), id] as const,
  };
  ```

### 3.2. Pure Service Layer (`<feature>.service.ts`)

- Contains pure asynchronous functions calling `api` from `@/lib/api/apiClient`.
- Returns typed `Promise<T>`. Contains **zero React hooks** and **zero UI state**:
  ```typescript
  // src/features/incidents/incident.service.ts
  import { api } from '@/lib/api/apiClient';
  import type { IncidentDetail, IncidentFilterParams, IncidentListResponse } from './types';

  export async function getIncidents(
    params: IncidentFilterParams = {}
  ): Promise<IncidentListResponse> {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return api.get<IncidentListResponse>(`/api/v1/incidents${qs ? `?${qs}` : ''}`);
  }

  export async function getIncidentById(id: string | number): Promise<IncidentDetail> {
    return api.get<IncidentDetail>(`/api/v1/incidents/${id}`);
  }

  export async function createIncidentReport(
    payload: FormData
  ): Promise<{ reportId: string; status: string }> {
    return api.post('/api/v1/user/report', payload);
  }
  ```

### 3.3. `queryOptions` & Query Hooks (`<feature>.queries.ts`)

- Use the `queryOptions` helper from `@tanstack/react-query` to define queries. This enables seamless reuse between Client Components (`useQuery`) and Server Components prefetching (`queryClient.prefetchQuery`):
  ```typescript
  // src/features/incidents/incident.queries.ts
  import { queryOptions, useQuery } from '@tanstack/react-query';
  import { incidentKeys } from './incident.keys';
  import { getIncidentById, getIncidents } from './incident.service';
  import type { IncidentFilterParams } from './types';

  export const incidentQueries = {
    list: (filters: IncidentFilterParams = {}) =>
      queryOptions({
        queryKey: incidentKeys.list(filters),
        queryFn: () => getIncidents(filters),
        staleTime: 30 * 1000, // 30 seconds for live incident feed
      }),

    detail: (id: string | number) =>
      queryOptions({
        queryKey: incidentKeys.detail(id),
        queryFn: () => getIncidentById(id),
        enabled: Boolean(id),
        staleTime: 60 * 1000,
      }),
  };

  /** Custom hook wrapping incident list query with selector support */
  export function useIncidentsQuery(filters: IncidentFilterParams = {}) {
    return useQuery(incidentQueries.list(filters));
  }

  /** Custom hook wrapping incident detail query */
  export function useIncidentDetailQuery(id: string | number) {
    return useQuery(incidentQueries.detail(id));
  }
  ```

### 3.4. Mutation Hooks & Invalidation (`<feature>.mutations.ts`)

- Encapsulate mutation hooks (`useMutation`) with clear boundaries between **Shared Cache Side Effects** and **UI Side Effects**:
  - **Shared Cache Side Effects** (query invalidation, cache rollback) $\rightarrow$ placed inside the `useMutation` hook definition.
  - **UI Side Effects** (toast alerts, modals, redirects) $\rightarrow$ placed in `mutate(data, { onSuccess })` at the component call site.
- Always use targeted key factory methods when invalidating:
  ```typescript
  // src/features/incidents/incident.mutations.ts
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { incidentKeys } from './incident.keys';
  import { createIncidentReport } from './incident.service';

  export function useSubmitIncidentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: (formData: FormData) => createIncidentReport(formData),
      onSuccess: () => {
        // Invalidate all incident lists while keeping other feature caches intact
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      },
    });
  }
  ```

### 3.5. Optimistic Updates Standard Pattern

When implementing optimistic updates (e.g. upvoting or status toggling):

```typescript
export function useUpvoteIncidentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (incidentId: string) => api.post(`/api/v1/incidents/${incidentId}/upvote`),
    onMutate: async (incidentId) => {
      // 1. Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: incidentKeys.detail(incidentId) });

      // 2. Snapshot previous value
      const previousIncident = queryClient.getQueryData(incidentKeys.detail(incidentId));

      // 3. Optimistically update cache
      queryClient.setQueryData(incidentKeys.detail(incidentId), (old: any) => ({
        ...old,
        upvotes: (old?.upvotes ?? 0) + 1,
      }));

      return { previousIncident };
    },
    onError: (_err, incidentId, context) => {
      // 4. Rollback on error
      if (context?.previousIncident) {
        queryClient.setQueryData(incidentKeys.detail(incidentId), context.previousIncident);
      }
    },
    onSettled: (_data, _error, incidentId) => {
      // 5. Always refetch to sync with server truth
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
    },
  });
}
```

---

## 4. Other Architectural Conventions

### 4.1. API Client & Networking (`src/lib/api/apiClient.ts`)

- All network requests go through a centralized `apiClient` instance (`api.get`, `api.post`, `api.put`, `api.patch`, `api.delete`).
- Standardized error handling using typed `ApiError` class (`NETWORK_ERROR`, `TIMEOUT`, `HTTP_ERROR`, `INVALID_JSON`) with automatic Bearer token injection.
- Automatic retry strategies for transient network issues.

### 4.2. State Management Segregation

- **Server State (Async Cache)**: Handled exclusively via `@tanstack/react-query`. Do NOT replicate server data in global stores.
- **Client UI State (Ephemeral & Local)**: Handled via `zustand` stores in `src/stores/` (e.g. active modal states, notification drawer open flags, user draft storage).

### 4.3. Form Validation & Submissions

- Combine **React Hook Form** (`react-hook-form`) with **Zod validation schemas** (`@hookform/resolvers/zod`).
- Wherever possible, reuse validation schemas defined in [`@traffic-ioc/shared`](file:///home/levion/Documents/project/traffic-ioc/packages/shared).

### 4.4. Component Hierarchy & Server/Client Boundaries

- **`src/components/ui/`**: Pure UI atoms and design primitives (Radix UI / Tailwind primitives).
- **`src/components/<Feature>/`**: Feature-specific UI widgets and organisms.
- **Server vs Client Components**:
  - Keep `page.tsx` and container layouts as **Server Components** by default.
  - Apply `'use client'` only at interactive leaf boundaries (forms, location tracking widgets, live animated tickers).

---

## 5. Path Aliases

TypeScript path aliases are configured in `tsconfig.json`:

- `@/*` $\rightarrow$ `src/*`
- `@/features/*` $\rightarrow$ `src/features/*`
- `@/components/*` $\rightarrow$ `src/components/*`
- `@/lib/*` $\rightarrow$ `src/lib/*`
- `@/hooks/*` $\rightarrow$ `src/hooks/*`
- `@/stores/*` $\rightarrow$ `src/stores/*`
- `@/types/*` $\rightarrow$ `src/types/*`
- `@/utils/*` $\rightarrow$ `src/utils/*`

---

## 6. Development & Verification Workflow

- **Development Server** (runs on port 3001 to avoid conflicting with backend):
  ```bash
  pnpm --filter=@traffic-ioc/user-web dev
  ```
- **Typecheck & Production Build**:
  ```bash
  pnpm --filter=@traffic-ioc/user-web build:check
  ```
- **Linting (ESLint Flat Config)**:
  ```bash
  pnpm --filter=@traffic-ioc/user-web lint
  ```
- **Code Formatting (Prettier)**:
  ```bash
  pnpm --filter=@traffic-ioc/user-web format
  ```
