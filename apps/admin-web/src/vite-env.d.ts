/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_MAPBOX_TOKEN: string
  readonly VITE_MAPBOX_STYLE: string
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'mapbox-gl' {
  const content: any
  export default content
  export type Map = any
  export type MapLayerMouseEvent = any
}

declare namespace mapboxgl {
  type Map = any
  type MapLayerMouseEvent = any
}
