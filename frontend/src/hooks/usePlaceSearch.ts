import { searchApi } from '@/services/api'
import { PlaceSearchResult } from '@/types'
import { useEffect, useState } from 'react'
import { useDebounce } from './useDebounce'

export const usePlaceSearch = (keyword: string) => {
  const debouncedKeyword = useDebounce(keyword.trim(), 350)
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const isCoordinateLike = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(
      debouncedKeyword
    )

    if (
      !debouncedKeyword ||
      debouncedKeyword.length < 2 ||
      debouncedKeyword === '__CURRENT_LOCATION__' ||
      isCoordinateLike
    ) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()

    setLoading(true)
    searchApi
      .searchPlaces(debouncedKeyword, controller.signal)
      .then((items) => {
        setResults(Array.isArray(items) ? items : [])
      })
      .catch((error: unknown) => {
        const axiosError = error as { code?: string }
        if (axiosError?.code === 'ERR_CANCELED') {
          return
        }
        console.error('Place search failed', error)
        setResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [debouncedKeyword])

  return {
    loading,
    results,
  }
}
