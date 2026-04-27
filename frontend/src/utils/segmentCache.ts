import { CorridorAnalyticsOption, SegmentResponse, TrafficStatus } from '@/types'

const DB_NAME = 'traffic-ioc-cache'
const DB_VERSION = 1
const STORE_NAME = 'app-cache'
const SEGMENTS_KEY = 'segments'
const TRAFFIC_STATUS_KEY = 'traffic-status'
const CORRIDORS_KEY = 'corridors'

type TimestampedCache<T> = {
  cachedAt: number
  data: T
}

export type TrafficStatusCacheResult = {
  data: TrafficStatus[]
  isFresh: boolean
  cachedAt: number
}

const openCacheDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const isValidSegmentResponse = (data: unknown): data is SegmentResponse => {
  if (!data || typeof data !== 'object') return false
  const maybeData = data as SegmentResponse
  return (
    maybeData.type === 'FeatureCollection' && Array.isArray(maybeData.features)
  )
}

export const getCachedSegments = async (): Promise<SegmentResponse | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null
  }

  try {
    const db = await openCacheDb()
    return await new Promise<SegmentResponse | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(SEGMENTS_KEY)

      request.onsuccess = () => {
        const value = request.result
        resolve(isValidSegmentResponse(value) ? value : null)
      }
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => reject(tx.error)
    })
  } catch (error) {
    console.warn('Unable to read segment cache from IndexedDB:', error)
    return null
  }
}

export const setCachedSegments = async (
  segmentData: SegmentResponse
): Promise<void> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return
  }

  try {
    const db = await openCacheDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(segmentData, SEGMENTS_KEY)

      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (error) {
    console.warn('Unable to write segment cache to IndexedDB:', error)
  }
}

const isValidTrafficStatusArray = (data: unknown): data is TrafficStatus[] => {
  return Array.isArray(data)
}

const isValidTimestampedCache = <T>(
  value: unknown,
  validateData: (data: unknown) => data is T
): value is TimestampedCache<T> => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const cache = value as TimestampedCache<T>
  return (
    typeof cache.cachedAt === 'number' &&
    Number.isFinite(cache.cachedAt) &&
    validateData(cache.data)
  )
}

export const getCachedTrafficStatus = async (
  maxAgeMs: number
): Promise<TrafficStatus[] | null> => {
  const cached = await getCachedTrafficStatusWithMeta(maxAgeMs)
  return cached?.isFresh ? cached.data : null
}

export const getCachedTrafficStatusWithMeta = async (
  maxAgeMs: number
): Promise<TrafficStatusCacheResult | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null
  }

  try {
    const db = await openCacheDb()
    return await new Promise<TrafficStatusCacheResult | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(TRAFFIC_STATUS_KEY)

        request.onsuccess = () => {
          const value = request.result
          if (!isValidTimestampedCache(value, isValidTrafficStatusArray)) {
            resolve(null)
            return
          }

          const ageMs = Date.now() - value.cachedAt
          resolve({
            data: value.data,
            cachedAt: value.cachedAt,
            isFresh: ageMs <= maxAgeMs,
          })
        }

        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
        tx.onerror = () => reject(tx.error)
      }
    )
  } catch (error) {
    console.warn('Unable to read traffic status cache from IndexedDB:', error)
    return null
  }
}

export const setCachedTrafficStatus = async (
  trafficStatus: TrafficStatus[]
): Promise<void> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return
  }

  const payload: TimestampedCache<TrafficStatus[]> = {
    cachedAt: Date.now(),
    data: trafficStatus,
  }

  try {
    const db = await openCacheDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(payload, TRAFFIC_STATUS_KEY)

      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (error) {
    console.warn('Unable to write traffic status cache to IndexedDB:', error)
  }
}

const isValidCorridorArray = (data: unknown): data is CorridorAnalyticsOption[] => {
  return Array.isArray(data)
}

export const getCachedCorridors = async (): Promise<
  CorridorAnalyticsOption[] | null
> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null
  }

  try {
    const db = await openCacheDb()
    return await new Promise<CorridorAnalyticsOption[] | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(CORRIDORS_KEY)

        request.onsuccess = () => {
          const value = request.result
          resolve(isValidCorridorArray(value) ? value : null)
        }
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
        tx.onerror = () => reject(tx.error)
      }
    )
  } catch (error) {
    console.warn('Unable to read corridor cache from IndexedDB:', error)
    return null
  }
}

export const setCachedCorridors = async (
  corridors: CorridorAnalyticsOption[]
): Promise<void> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return
  }

  try {
    const db = await openCacheDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(corridors, CORRIDORS_KEY)

      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (error) {
    console.warn('Unable to write corridor cache to IndexedDB:', error)
  }
}
