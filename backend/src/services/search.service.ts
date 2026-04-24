import { Logger } from '../utils/logger';

const logger = new Logger('SearchService');
const TOMTOM_TIMEOUT_MS = 12000;

export interface PlaceSearchItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface TomTomSearchAddress {
  freeformAddress?: string;
}

interface TomTomSearchPosition {
  lat?: number;
  lon?: number;
}

interface TomTomSearchResult {
  id?: string;
  poi?: {
    name?: string;
  };
  address?: TomTomSearchAddress;
  position?: TomTomSearchPosition;
}

interface TomTomSearchResponse {
  results?: TomTomSearchResult[];
}

export class SearchService {
  async searchPlaces(query: string): Promise<PlaceSearchItem[]> {
    const apiKey = process.env.TOMTOM_API_KEY;

    if (!apiKey) {
      logger.error('TOMTOM_API_KEY is missing for place search');
      return [];
    }

    const encodedQuery = encodeURIComponent(query.trim());
    const tomtomUrl =
      `https://api.tomtom.com/search/2/search/${encodedQuery}.json` +
      `?key=${apiKey}&countrySet=VN&language=vi-VN&limit=5`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), TOMTOM_TIMEOUT_MS);

    try {
      const response = await fetch(tomtomUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      if (!response.ok) {
        logger.warn('TomTom place search failed', {
          status: response.status,
          statusText: response.statusText,
          query,
        });
        return [];
      }

      const payload = (await response.json()) as TomTomSearchResponse;
      const results = payload?.results ?? [];

      return results
        .map((item): PlaceSearchItem | null => {
          const lat = Number(item?.position?.lat);
          const lon = Number(item?.position?.lon);
          const name = String(item?.poi?.name || item?.address?.freeformAddress || '').trim();
          const address = String(item?.address?.freeformAddress || '').trim();

          if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }

          return {
            id: item.id || `${name}-${lat}-${lon}`,
            name,
            address,
            lat,
            lon,
          };
        })
        .filter((item): item is PlaceSearchItem => Boolean(item));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.warn('TomTom place search timeout', { query });
        return [];
      }

      logger.error('TomTom place search proxy error', error);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const searchService = new SearchService();
