import { Logger } from '../utils/logger';

const logger = new Logger('SearchService');
const TOMTOM_TIMEOUT_MS = 12000;
const HCMC_CENTER_LAT = 10.7769;
const HCMC_CENTER_LON = 106.7009;
const HCMC_RADIUS_METERS = 100000;

export interface PlaceSearchItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

interface TomTomSearchAddress {
  freeformAddress?: string;
  municipality?: string;
  countrySubdivision?: string;
}

interface TomTomSearchPosition {
  lat?: number;
  lon?: number;
}

interface TomTomSearchResult {
  id?: string;
  score?: number;
  dist?: number;
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
  private isInHoChiMinh(address?: TomTomSearchAddress): boolean {
    const combined =
      `${address?.municipality || ''} ${address?.countrySubdivision || ''} ${address?.freeformAddress || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return (
      combined.includes('ho chi minh') ||
      combined.includes('tp hcm') ||
      combined.includes('hcmc') ||
      combined.includes('thanh pho ho chi minh')
    );
  }

  async searchPlaces(query: string): Promise<PlaceSearchItem[]> {
    const apiKey = process.env.TOMTOM_API_KEY;

    if (!apiKey) {
      logger.error('TOMTOM_API_KEY is missing for place search');
      return [];
    }

    const encodedQuery = encodeURIComponent(query.trim());
    const tomtomUrl =
      `https://api.tomtom.com/search/2/search/${encodedQuery}.json` +
      `?key=${apiKey}` +
      `&countrySet=VN` +
      `&language=vi-VN` +
      `&limit=10`;
    // `&lat=${HCMC_CENTER_LAT}` +
    // `&lon=${HCMC_CENTER_LON}` +
    // `&radius=${HCMC_RADIUS_METERS}`;

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

      const normalized = results
        .map((item) => {
          const lat = Number(item?.position?.lat);
          const lon = Number(item?.position?.lon);
          const name = String(item?.poi?.name || item?.address?.freeformAddress || '').trim();
          const address = String(item?.address?.freeformAddress || '').trim();

          if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
          }

          return {
            place: {
              id: item.id || `${name}-${lat}-${lon}`,
              name,
              address,
              lat,
              lon,
            } as PlaceSearchItem,
            isInHcm: this.isInHoChiMinh(item.address),
            score: Number(item.score || 0),
            dist: Number(item.dist || Number.MAX_SAFE_INTEGER),
          };
        })
        .filter(
          (
            item
          ): item is {
            place: PlaceSearchItem;
            isInHcm: boolean;
            score: number;
            dist: number;
          } => Boolean(item)
        );

      normalized.sort((a, b) => {
        if (a.isInHcm !== b.isInHcm) {
          return a.isInHcm ? -1 : 1;
        }

        if (a.score !== b.score) {
          return b.score - a.score;
        }

        return a.dist - b.dist;
      });

      return normalized.slice(0, 5).map((item) => item.place);
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
