import axios from 'axios';
import { errorFields, logger } from '../platform/logger.js';

/**
 * Alpha Vantage gold quote adapter with a 5-minute in-process cache.
 * Platform-wide market data (not tenant data). Behaviour preserved from
 * the pre-Phase-3 gold.service.js: stale cache is served when the provider
 * fails; with no cache the call fails with 503.
 */

const CACHE_DURATION_MS = 5 * 60 * 1000;
const USD_TO_INR = 82.5;
const GRAMS_PER_OUNCE = 31.1035;
const WEIGHTS = { '1g': 1, '5g': 5, '10g': 10, '50g': 50, '100g': 100 } as const;

type Weights = Record<keyof typeof WEIGHTS, number>;

export interface GoldRate {
  updated_at: string;
  gold_22k: Weights;
  gold_24k: Weights;
  source: 'live' | 'cache';
  warning: false | string;
  cacheAge?: number;
  isExpired?: boolean;
}

let cached: Omit<GoldRate, 'source' | 'warning' | 'cacheAge' | 'isExpired'> | null = null;
let fetchedAt: number | null = null;

export class GoldRateUnavailableError extends Error {
  constructor() {
    super('Gold rate service unavailable and no cached data');
    this.name = 'GoldRateUnavailableError';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const localTimestamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

async function fetchLive() {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) throw new Error('GOLD_API_KEY is not configured');
  const { data } = await axios.get('https://www.alphavantage.co/query', {
    params: { function: 'GLOBAL_QUOTE', symbol: 'XAUUSD', apikey: apiKey },
    timeout: 5000,
  });
  const price = data?.['Global Quote']?.['05. price'];
  if (data?.['Error Message'] || data?.Information || !price)
    throw new Error('Invalid gold rate data from provider');

  const perGram = (parseFloat(price) * USD_TO_INR) / GRAMS_PER_OUNCE;
  const per22k = Math.round(perGram * 0.9167);
  const per24k = Math.round(perGram * 0.9999);
  const scale = (unit: number) =>
    Object.fromEntries(
      Object.entries(WEIGHTS).map(([label, grams]) => [label, unit * grams]),
    ) as Weights;
  return {
    updated_at: localTimestamp(new Date()),
    gold_22k: scale(per22k),
    gold_24k: scale(per24k),
  };
}

export async function getGoldRate(options: { forceRefresh?: boolean } = {}): Promise<GoldRate> {
  const age = fetchedAt ? Date.now() - fetchedAt : Infinity;
  if (!options.forceRefresh && cached && age < CACHE_DURATION_MS) {
    return { ...cached, source: 'cache', warning: false, cacheAge: Math.round(age / 1000) };
  }
  try {
    cached = await fetchLive();
    fetchedAt = Date.now();
    return { ...cached, source: 'live', warning: false };
  } catch (error) {
    logger.warn('gold_rate_fetch_failed', errorFields(error));
    if (cached && fetchedAt) {
      const staleAge = Date.now() - fetchedAt;
      const isExpired = staleAge >= CACHE_DURATION_MS;
      return {
        ...cached,
        source: 'cache',
        warning: `Data may be stale due to API failure (${isExpired ? 'EXPIRED' : 'STALE'} cache)`,
        cacheAge: Math.round(staleAge / 1000),
        isExpired,
      };
    }
    throw new GoldRateUnavailableError();
  }
}
