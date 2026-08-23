# Design System Specification

> **System:** Traffic IOC (Intelligent Operations Center) — Ho Chi Minh City  
> **Aesthetic Philosophy:** Professional Light Theme, Clean, Administrative, High Contrast & High Readability  
> **Foundational Stack:** React 18, TypeScript, Ant Design v5, Mapbox GL / Deck.gl, Chart.js / Recharts / ECharts, Zustand, Clerk Auth  

---

## 1. Design Tokens (Primitives)

All design tokens are derived directly from the application theme configuration (`src/config/theme.ts`), global stylesheet (`src/styles/index.css`), application constants (`src/config/constants.ts`), and localized OLAP style modules (`src/pages/analytics/OlapDashboard.css`).

### 1.1. Color Palette

#### Base & Surface Colors
| Token Name | Hex / RGBA Value | Usage Context & Description |
| :--- | :--- | :--- |
| `colorBgLayout` | `#f0f2f5` | Global body and application layout background (Ant Design Slate Light Gray). |
| `colorBgContainer` | `#ffffff` | Primary container, Card, Popover, Dialog, and Table surface background. |
| `colorBorder` | `#d9d9d9` | Neutral input borders, card borders, and primary dividers. |
| `colorBorderSubtle` | `#e2e8f0` / `rgba(0, 0, 0, 0.06)` | Secondary borders inside widgets, list items, and filter panels. |
| `colorHeaderBg` | `#ffffff` | Top navigation bar / header background. |
| `colorSiderBg` | `#ffffff` (default) / `#001529` (dark) | Navigation sidebar background. |
| `tableHeaderBg` | `#fafafa` | Table header row background. |
| `tableRowHoverBg` | `#e6f4ff` | Data table row hover highlight. |
| `glassBgLight` | `rgba(255, 255, 255, 0.88)` - `0.96` | Floating map widget background with `backdrop-filter: blur(10px - 12px)`. |
| `glassBorder` | `rgba(255, 255, 255, 0.60)` - `0.80` | Frosted glass card perimeter highlight border. |

#### Brand & Action Colors
| Token Name | Hex Value | Usage Context & Description |
| :--- | :--- | :--- |
| `colorPrimary` | `#1677ff` | Primary action buttons, active navigation items, standard links, focus rings. |
| `colorPrimaryHover` | `#4096ff` | Hover state for primary buttons, interactive links, and actionable icons. |
| `colorPrimaryActive` | `#0958d9` | Active/Pressed state for primary buttons and interactive tabs. |
| `colorInfo` | `#1677ff` | Informational badges, alerts, and system notices. |

#### Semantic Traffic Colors (Level of Service - LOS)
Optimized specifically for high visibility on light-themed street maps (`mapbox://styles/mapbox/streets-v12`).

| Token Name / Grade | Hex Value | Semantic Definition & Speed / Condition |
| :--- | :--- | :--- |
| `LOS A` (`TRAFFIC_COLORS.MINIMAL`) | `#52c41a` | **Thông thoáng** (Free Flow) — Speed $\ge$ 40 km/h. |
| `LOS B` (`TRAFFIC_COLORS.VERY_LOW`) | `#73d13d` | **Khá thông thoáng** (Reasonably Free) — High contrast green. |
| `LOS C` (`TRAFFIC_COLORS.MODERATE`) | `#faad14` | **Trung bình** (Stable Flow) — Golden Yellow (avoids washed-out `#ffff00`). |
| `LOS D` (`TRAFFIC_COLORS.HIGH`) | `#d46b08` | **Mật độ cao** (Approaching Capacity) — Deep Amber/Orange. |
| `LOS E` (`TRAFFIC_COLORS.VERY_HIGH`) | `#cf1322` | **Đông xe / Ùn ứ** (Unstable Flow) — Crimson Red. |
| `LOS F` (`TRAFFIC_COLORS.EXTREME`) | `#820014` | **Ùn tắc nghiêm trọng** (Forced Breakdown) — Deep Maroon. |
| `TRAFFIC_COLORS.JAM` | `#cf1322` | General traffic bottleneck marker. |
| `TRAFFIC_COLORS.NO_DATA` | `#d9d9d9` / `#8c8c8c` | Segment with sensor offline or missing data. |

#### Semantic Incident Severity & Type Colors
| Token Name / Level | Hex Value | Usage Context & Visual Effect |
| :--- | :--- | :--- |
| `INCIDENT_BASE` | `#722ed1` | Base incident purple color (differentiates incidents from traffic congestion). |
| `CRITICAL` | `#ff0000` / `#ff4d4f` | Extreme emergency (e.g., multi-vehicle collision, major fire); uses pulsating animation. |
| `HIGH` | `#ff7a45` | Major disruption (e.g., serious flood, closed lanes). |
| `MEDIUM` | `#faad14` | Moderate disruption (e.g., maintenance, slow construction). |
| `LOW` | `#1890ff` | Minor disruption (e.g., minor debris, roadwork on shoulder). |

#### Typography Text Colors
| Token Name | Computed Value | Usage Context |
| :--- | :--- | :--- |
| `colorTextHeading` | `#001529` / `#0f172a` | Main headings (`H1`, `H2`), card titles, metric labels. |
| `colorTextPrimary` | `rgba(0, 0, 0, 0.88)` | Primary body copy, table cell content, input text. |
| `colorTextSecondary` | `rgba(0, 0, 0, 0.45)` - `0.65` | Subtitles, helper text, timestamps, unit labels (`km/h`). |
| `colorTextDisabled` | `rgba(0, 0, 0, 0.25)` | Disabled button labels and placeholders. |
| `colorTextInverse` | `#ffffff` | Text on dark tooltips, dark sider menus, and high-severity status badges. |

---

### 1.2. Typography

| Attribute | Specification | Notes & Fallback Chain |
| :--- | :--- | :--- |
| **Primary Font Family** | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | Clean, geometric sans-serif for UI labels, titles, and body content. |
| **Monospace / Metric Font Family** | `'Roboto Mono', 'JetBrains Mono', monospace` | Used for numerical data points, coordinates, speed indicators, tabular counters. |
| **Display / Weather Font Family** | `'Space Grotesk', 'Segoe UI', sans-serif` | Used in weather cards and real-time banner headings. |
| **Line Height Base** | `1.5` | Standard across all body paragraphs and form labels. |

#### Type Hierarchy Scales
| Scale Name | Font Size | Font Weight | Line Height | Color Token |
| :--- | :--- | :--- | :--- | :--- |
| `H1` (Page Title) | `24px` | 700 (Bold) | `1.2` | `#001529` |
| `H2` (Section / Tab Title) | `20px` | 600 (SemiBold) | `1.25` | `#001529` |
| `Card Title` / `H3` | `16px` | 600 (SemiBold) | `1.3` | `#001529` / `#0f172a` |
| `Subheading` | `15px` | 500 (Medium) | `1.4` | `rgba(0, 0, 0, 0.88)` |
| `Body Base` | `14px` | 400 (Regular) | `1.5` | `rgba(0, 0, 0, 0.88)` |
| `Caption / Label` | `12px` - `13px` | 500 (Medium) | `1.4` | `rgba(0, 0, 0, 0.65)` |
| `Badge / Tag / Sub-meta` | `11px` | 600 (SemiBold) | `1.2` | `rgba(0, 0, 0, 0.45)` |
| `KPI Metric Big` | `24px` - `34px` | 700 (Bold, Mono) | `1.0` | Variable (`#1677ff`, `#cf1322`, etc.) |

---

### 1.3. Spacing & Sizing

The system adheres strictly to an **8px base grid** with half-step (`4px`) subdivisions for compact indicators:

| Token / Step | Value | Common Application |
| :--- | :--- | :--- |
| `space-xxs` | `2px` - `4px` | Map control inner button margins, compact badge paddings. |
| `space-xs` | `6px` - `8px` | Icon-to-text gaps, list item vertical gaps, tag padding. |
| `space-sm` | `10px` - `12px` | Card internal element margins, search input padding. |
| `space-md` | `16px` | Standard card body padding, layout content padding, grid gaps. |
| `space-lg` | `20px` - `24px` | Page container padding, modal padding, main dashboard gutter. |
| `space-xl` | `32px` | Major section separators, empty state vertical margins. |
| `space-xxl` | `48px` - `60px` | Full page error / unauthorized state paddings. |

---

### 1.4. Radii & Elevation Shadows

| Token | Value | Target Components |
| :--- | :--- | :--- |
| `borderRadiusSM` | `4px` | Small tags, sub-pills, input micro-badges. |
| `borderRadiusBase` | `6px` | Standard buttons, input fields, dropdown menus, alert boxes. |
| `borderRadiusMD` | `8px` - `10px` | Inner panels, mini-widgets, map control clusters, map legends. |
| `borderRadiusLG` | `12px` - `14px` | Floating cards, alert feeds, routing dialogs, standard modals. |
| `borderRadiusXL` | `16px` | Weather glass widget, high-level KPI dashboard cards. |
| `borderRadiusPill` | `9999px` | Circle buttons, status chips, floating action icons. |
| `boxShadowCard` | `0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)` | Static dashboard cards in light mode. |
| `boxShadowFloating` | `0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)` | Standard map overlay widgets (MapControls, MapLegend). |
| `boxShadowGlass` | `0 12px 32px rgba(15, 23, 42, 0.12), 0 2px 10px rgba(15, 23, 42, 0.06)` | Heavy floating glass cards (KPIBar, IncidentAlertWidget). |
| `boxShadowHover` | `0 12px 48px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.06)` | Interactive hover state for floating map cards. |

---

### 1.5. Responsive Breakpoints

| Breakpoint | Threshold | Behavioral Policy |
| :--- | :--- | :--- |
| `xs` | `< 576px` | Full width dialogs, single column KPI lists, hidden sidebars. |
| `sm` | `≥ 576px` | 2-column KPI lists, stacked filter rows. |
| `md` | `≥ 768px` | Tablet layout; standard routing panel positioning, expanded chart legends. |
| `lg` | `≥ 992px` | Desktop layout switch point; collapsible desktop Sider enabled; 2-column analytics charts. |
| `xl` | `≥ 1200px` | 3-column filter panels, 4-column summary metric grids. |
| `xxl` | `≥ 1600px` | Multi-screen operations center wall display optimizations. |

---

## 2. Core UI Components (Foundation)

### 2.1. Loading (`src/components/common/index.tsx`)
* **Description:** Foundational centered spinner component using Ant Design's `<Spin>` with customized large/small indicator icon. Used during route transitions, API queries, and async chart fetching.
* **Props Interface:**
```typescript
interface LoadingProps {
  spinning?: boolean
  size?: 'small' | 'default' | 'large'
}
```
* **Variants & States:**
  - `size="large"`: Renders 48px `LoadingOutlined` icon.
  - `size="small"` / `default`: Renders 24px `LoadingOutlined` icon.
  - `spinning={true | false}`: Controls visibility without destroying layout dimensions.
* **Usage Rules:** Use inside asynchronous card boundaries, lazy route boundaries, and full-screen loading fallbacks.

---

### 2.2. ErrorState (`src/components/common/index.tsx`)
* **Description:** Standard fallback container rendered when a query fails or network error occurs, providing an optional retry button.
* **Props Interface:**
```typescript
interface ErrorStateProps {
  message: string
  onRetry?: () => void
}
```
* **Variants & States:**
  - `message`: Text in `#ff7875` with 16px font size.
  - `onRetry` present: Renders a `#1890ff` solid action button with hover transition.
* **Usage Rules:** Display within card containers or page content when API error boundaries trigger.

---

### 2.3. EmptyState (`src/components/common/index.tsx`)
* **Description:** Standard placeholder display when datasets, queries, or incident feeds return zero items.
* **Props Interface:**
```typescript
interface EmptyStateProps {
  message?: string
  description?: string
}
```
* **Variants & States:**
  - Default `message`: `"Không có dữ liệu"` (`#8c8c8c`, 16px, font-weight 500).
  - Optional `description`: Secondary muted subtitle (`#bfbfbf`, 14px).
* **Usage Rules:** Must be shown when search/filter queries return empty lists or no historical records exist.

---

### 2.4. RoleGuard (`src/components/auth/RoleGuard.tsx`)
* **Description:** Client-side authentication and role-based access controller wrapping protected route elements. Coordinates with Clerk user metadata.
* **Props Interface:**
```typescript
interface RoleGuardProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'user' | 'guest' | 'user,admin'
}
```
* **Variants & States:**
  - `Loading`: Displays `<Loading />` while Clerk session initializes.
  - `Unauthorized`: Redirects to `/unauthorized` (HTTP 403 Result).
  - `Permitted`: Renders `children`.
* **Usage Rules:** Wrap around protected application routes in `App.tsx`.

---

### 2.5. SignInSignUpDialog (`src/components/auth/SignInSignUpDialog.tsx`)
* **Description:** Modal dialog supporting email/password authentication, Clerk OTP verification flow, and OAuth redirect (Google Sign-In).
* **Props Interface:**
```typescript
interface SignInSignUpDialogProps {
  open: boolean
  onClose: () => void
}
```
* **Variants & States:**
  - `TabKey`: `'signin'` | `'signup'`.
  - `loading`: Disables inputs and renders loading spinners on action buttons.
  - `verificationStep`: Toggles OTP verification code input state.
* **Usage Rules:** Triggered from the navigation sidebar or guest interaction CTA.

---

### 2.6. LiveNewsTicker (`src/components/LiveNewsTicker.tsx`)
* **Description:** Fixed bottom broadcast news ticker displaying high-priority traffic bulletins in a continuous horizontal marquee.
* **Props Interface:**
```typescript
export const LiveNewsTicker: React.FC
```
* **Variants & States:**
  - `isVisible`: Auto-slides up from bottom (`translateY(0)`) upon new broadcast; auto-hides after 20 seconds.
  - `Hover`: Marquee text pause animation (`animation-play-state: paused`).
* **Usage Rules:** Single instance embedded inside `MainLayout` at `z-index: 1000`.

---

### 2.7. KPIBar (`src/components/widgets/KPIBar.tsx`)
* **Description:** Glassmorphism overlay bar mounted at the top of the map showing active traffic metrics (Average Speed, Active Bottlenecks, Incident Count).
* **Props Interface:**
```typescript
interface KPIBarProps {
  avgSpeed?: number
  activeJams?: number
  incidentCount?: number
  jamSegments?: GeoJSONFeature[]
  onSegmentClick?: (segment: GeoJSONFeature) => void
}
```
* **Variants & States:**
  - `collapsed = true`: Shrinks to 72px pill displaying vertical numeric icons.
  - `collapsed = false`: Expands horizontally with animated 3-column stats.
  - Interactive: Clicking the Jam card triggers a modal displaying severe segments (`LOS E/F`).
* **Usage Rules:** Placed at top-left of the real-time operational map.

---

### 2.8. AlertFeed (`src/components/widgets/AlertFeed.tsx`)
* **Description:** Floating right-hand drawer widget showing the real-time queue of traffic congestion and road incident alerts.
* **Props Interface:**
```typescript
interface AlertFeedProps {
  alerts?: Alert[]
  maxHeight?: number
  style?: React.CSSProperties
  onAlertClick?: (alert: Alert) => void
}
```
* **Variants & States:**
  - `collapsed`: Header only (`max-height: 72px`).
  - `hover`: Elevated transform (`translateY(-2px)`) with expanded shadow.
  - `Empty`: Renders Ant Design `<Empty>` fallback.
* **Usage Rules:** Placed at top-right of the map; collapses to avoid obstructing spatial layers.

---

### 2.9. IncidentAlertWidget (`src/components/widgets/IncidentAlertWidget.tsx`)
* **Description:** Floating right-hand incident management card showing categorized incidents (`ACCIDENT`, `FLOOD`, `CONSTRUCTION`, `FIRE`) with color-coded severity tags and one-click camera fly-to actions.
* **Props Interface:**
```typescript
interface IncidentAlertWidgetProps {
  incidents: IncidentFeature[]
  isLoading?: boolean
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<unknown>
  floating?: boolean
}
```
* **Variants & States:**
  - `floating = true`: Absolute position over map canvas with vertical toggle button.
  - `floating = false`: Relative position embedded in side panels.
  - `severity = 'CRITICAL'`: Triggers animated blinking tag (`@keyframes blink`).
* **Usage Rules:** Used on operational oversight dashboards for emergency management.

---

### 2.10. WeatherWidget (`src/components/widgets/WeatherWidget.tsx`)
* **Description:** Real-time meteorological monitor card showing temperature, humidity, wind velocity, animated weather condition vectors, and dynamic advisory ticker.
* **Props Interface:**
```typescript
interface WeatherWidgetProps {
  style?: React.CSSProperties
  compact?: boolean
  weatherData?: WeatherData | null
  loading?: boolean
  error?: string | null
}
```
* **Variants & States:**
  - `compact = true`: Optimized typography for mobile map viewports.
  - `error`: Shows warning red banner with fallback cached data.
  - `warning_message`: Automatically triggers looping marquee alert banner.
* **Usage Rules:** Mounted at top-left/top-right overlaying the primary map.

---

### 2.11. MapControls (`src/components/widgets/MapControls.tsx`)
* **Description:** Floating vertical control stack on the bottom-right of the map offering Zoom In/Out, North Compass reset, CCTV trigger, and layer toggles.
* **Props Interface:**
```typescript
interface MapControlsProps {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onCompass?: () => void
  onCamera?: () => void
  onSegmentStatusToggle?: (enabled: boolean) => void
  onIncidentToggle?: (enabled: boolean) => void
  onRoutingToggle?: (enabled: boolean) => void
  showCamera?: boolean
  showRouting?: boolean
  defaultSegmentStatusLayerEnabled?: boolean
  defaultIncidentLayerEnabled?: boolean
}
```
* **Variants & States:**
  - Button Active (`type="primary"`): Layer is active and rendered on WebGL canvas.
  - Button Inactive (`type="text"`): Layer is hidden.
* **Usage Rules:** Positioned at `bottom: 24px, right: 10px`, `z-index: 10`.

---

### 2.12. MapLegend (`src/components/widgets/MapLegend.tsx`)
* **Description:** Compact horizontal bar illustrating the 6-level Level of Service (`LOS A` through `LOS F`) spectrum from Green (Fast) to Maroon (Severe Congestion).
* **Props Interface:**
```typescript
export const MapLegend: React.FC
```
* **Variants & States:**
  - Desktop: 170px width with 6px bar height.
  - Mobile (`<= 768px`): Reduced font size (9px) with tight padding.
* **Usage Rules:** Positioned at `bottom: 24px, right: 44px`, `z-index: 10`.

---

### 2.13. RoutingPanel (`src/components/widgets/RoutingPanel.tsx`)
* **Description:** Autonomous navigation panel supporting origin/destination search, GPS geolocator, swap endpoints, and travel time / distance computation.
* **Props Interface:**
```typescript
interface RoutingPanelProps {
  visible: boolean
  isEditingRoutePoints: boolean
  startPoint: string
  endPoint: string
  loading: boolean
  activeInput: 'start' | 'end'
  routeGeoJSON?: any
  onStartChange: (val: string) => void
  onEndChange: (val: string) => void
  onStartPlaceSelect: (place: PlaceSearchResult) => void
  onEndPlaceSelect: (place: PlaceSearchResult) => void
  onActiveInputSet: (type: 'start' | 'end') => void
  onComputeRoute: () => void
  onGetCurrentLocation: (target: 'start' | 'end') => void
  onEditingRoutePointsChange: (isEditing: boolean) => void
  onClose: () => void
  onSwap: () => void
}
```
* **Variants & States:**
  - `isCompactMode`: Collapses input forms to display only estimated time and distance cards.
  - `loading = true`: Disables route computation button and renders Ant Design spinner.
* **Usage Rules:** Positioned at `top: 24px, left: 24px` on desktop, centered on mobile.

---

### 2.14. CCTVModal (`src/components/widgets/CCTVModal.tsx`)
* **Description:** 16:9 surveillance modal displaying live CCTV streams from urban intersections.
* **Props Interface:**
```typescript
interface CCTVModalProps {
  visible?: boolean
  onClose?: () => void
}
```
* **Variants & States:**
  - `isPlaying = false`: Displays thumbnail with interactive play overlay.
  - `isPlaying = true`: Activates stream feed.
* **Usage Rules:** Modal launched when clicking CCTV camera icons in MapControls or on map markers.

---

### 2.15. TrafficMap (`src/components/map/TrafficMap.tsx`)
* **Description:** Foundational WebGL map canvas supporting vector tile rendering, TomTom raster/incident tiles, interactive hover segment inspection, and LOS color painting.
* **Props Interface:**
```typescript
interface TrafficMapProps {
  segmentData: SegmentResponse | null
  trafficStatus?: any[]
  onMapClick?: (event: any) => void
  style?: React.CSSProperties
  autoRefreshInterval?: number
  mapRef?: React.RefObject<MapRef>
  segmentStatusLayerEnabled?: boolean
  useTomTomFlowTiles?: boolean
  tomTomFlowTilesUrl?: string
  useTomTomIncidentTiles?: boolean
  tomTomIncidentTilesUrl?: string
  useVectorTiles?: boolean
  showHoverPopup?: boolean
  minimalTooltip?: boolean
  children?: React.ReactNode
}
```
* **Usage Rules:** Core map component for real-time monitoring and situational awareness.

---

### 2.16. IncidentLayer (`src/components/map/IncidentLayer.tsx`)
* **Description:** Mapbox HTML Marker and Popup overlay displaying incident icons with severity clusters and popup cards.
* **Props Interface:**
```typescript
interface IncidentLayerProps {
  incidents: IncidentFeature[]
  isLoading?: boolean
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<unknown>
  selectedIncident?: IncidentFeature | null
  onSelectedIncidentChange?: (incident: IncidentFeature | null) => void
}
```

---

### 2.17. IncidentImpactLayer (`src/components/map/IncidentImpactLayer.tsx`)
* **Description:** Deck.gl `PathLayer` overlay with real-time sinusoidal opacity pulsation visualizing upstream spillover queues caused by major incidents.
* **Props Interface:**
```typescript
interface IncidentImpactLayerProps {
  visible: boolean
  segments: IncidentImpactSegment[]
  mapRef: React.RefObject<{ getMap?: () => unknown } | null>
}
```

---

### 2.18. RoutingMapboxLayer (`src/components/map/RoutingMapboxLayer.tsx`)
* **Description:** Mapbox GL 3-layer line stack rendering high-contrast casing (10px `#0f172a`), glow blur (8px `#f8fafc`), and active core (4px `#2563eb`).
* **Props Interface:**
```typescript
interface RoutingMapboxLayerProps {
  routeGeoJSON: any | null
  rawStart?: [number, number] | null
  rawEnd?: [number, number] | null
}
```

---

### 2.19. ComparisonChart & Chart Family (`src/components/charts/ChartComponents.tsx`)
* **Description:** Comprehensive suite of statistical chart modules (Chart.js v4) for anomaly detection, baseline vs. today comparisons, moving averages, and data completeness.
* **Props Interfaces:**
```typescript
export type ComparisonChartType = 'lineBand' | 'groupedBar' | 'scatter'

interface ComparisonChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
  chartType?: ComparisonChartType
}

interface DeltaBarChartProps {
  data: ComparisonDataPoint[]
  metricLabel: string
}

interface DataQualityChartProps {
  data: ComparisonDataPoint[]
}
```

---

## 3. Layout Systems & Grid Patterns

### 3.1. Main Layout Shell (`src/layouts/MainLayout.tsx`)
* **Structure:**
  - `Layout` (Full screen `100vh`, `minHeight: 100vh`).
  - **Desktop Sider:** Width `200px`, collapsible to `56px`. Houses brand header (`🚦 Traffic IOC`), primary navigation items, unread notification counter badge, and user session footer.
  - **Mobile Header:** Triggered at screen width `< 992px` (`!screens.lg`). Replaces persistent Sider with a top-right floating circular action button (`z-index: 1200`) and a `280px` slide-out `Drawer`.
  - **Content Viewport:** Full bleed (`padding: 0`) for map canvases (`overflow: hidden`) or structured padding (`padding: 16px` or `24px`) for administrative dashboards.

### 3.2. Z-Index Hierarchy
To prevent visual collisions between Mapbox WebGL canvas layers, glassmorphism floating cards, drawers, and modal dialogs, the application follows a strict Z-index hierarchy:

```
┌────────────────────────────────────────────────────────────┐
│ 1200 : Mobile Hamburger Trigger Button                     │
├────────────────────────────────────────────────────────────┤
│ 1050 : Modal Dialogs (CCTVModal, SignInDialog, JamModal)  │
├────────────────────────────────────────────────────────────┤
│ 1000 : Broadcast Ticker (LiveNewsTicker)                   │
├────────────────────────────────────────────────────────────┤
│   20 : Interactive Panels (RoutingPanel, KPIBar Expanded)  │
├────────────────────────────────────────────────────────────┤
│   10 : Floating Overlays (MapControls, Legend, Weather)    │
├────────────────────────────────────────────────────────────┤
│    0 : Base WebGL Canvas (Mapbox GL, Deck.gl Layers)       │
└────────────────────────────────────────────────────────────┘
```

### 3.3. Analytics & OLAP Grid Patterns (`src/pages/analytics/OlapDashboard.css`)
* **KPI Metric Grid (`.olap-summary-grid`):**
  - Desktop (`> 1200px`): `grid-template-columns: repeat(4, 1fr)` with `16px` gap.
  - Tablet (`992px - 1200px`): `grid-template-columns: repeat(2, 1fr)`.
  - Mobile (`< 992px`): `grid-template-columns: 1fr`.
* **Filter Panel Grid (`.olap-filter-grid`):**
  - Desktop (`> 1200px`): `grid-template-columns: repeat(3, minmax(0, 1fr))` with `12px` gap.
  - Tablet (`768px - 1200px`): `grid-template-columns: repeat(2, minmax(0, 1fr))`.
  - Mobile (`< 768px`): `grid-template-columns: 1fr`.
* **Asymmetric Chart Pair Grid (`.olap-chart-grid`):**
  - Desktop: `grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr)` with `16px` gap.
  - Mobile / Tablet (`< 992px`): `grid-template-columns: 1fr`.

---

## 4. State Management & Theming (UI Level)

### 4.1. Theming Architecture
* **Provider:** Root `ConfigProvider` configured in `src/main.tsx` using `customTheme` from `src/config/theme.ts`.
* **Theme Algorithm:** `theme.defaultAlgorithm` (Enforcing **Professional Light Theme**).
* **Locale:** `antd/locale/vi_VN` providing native Vietnamese calendar dates, pagination, and validation messages.

### 4.2. Global State Stores (Zustand)
1. **`useAppStore` (`src/stores/useAppStore.ts`):**
   - Stores real-time segment GeoJSON collections, selected road segments, live traffic statuses (`TrafficStatus[]`), active alerts, and global loading/error flags.
2. **`useNotificationStore` (`src/stores/useNotificationStore.ts`):**
   - Manages asynchronous user notifications, unread counts (rendered on navigation badge), socket-driven real-time alert pushes, and mark-as-read status.
3. **`useGuestStore` (`src/stores/useGuestStore.ts`):**
   - Manages guest session flags with persistence in browser `localStorage`.

### 4.3. Global Feedback & Notifications
* **Toast Messages:** Invoked via Ant Design `message.success(text)`, `message.error(text)`, `message.warning(text)` with automatic 3s dismissal.
* **Modal Dialogs:** Controlled centrally via React state and Zustand actions (`open={isOpen}`, `onCancel={handleClose}`).
* **Global Real-Time Gateway:** Initialized via `useSocket()` hook in `MainLayout.tsx` for real-time WebSocket traffic updates and alert streaming.

