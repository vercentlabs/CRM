import axios from 'axios';

// In-memory cache variables
let cachedRate = null;
let lastFetchedAt = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Fetch gold rate data from external API or cache
 * @returns {Object} Object with gold rates for different weights and updated_at
 * @throws {Error} If API call fails
 */
const fetchGoldRate = async () => {
  // Check if we have cached data that's still valid (strict TTL validation)
  const now = Date.now();
  const cacheAge = lastFetchedAt ? now - lastFetchedAt : Infinity;
  
  if (cachedRate && lastFetchedAt && cacheAge < CACHE_DURATION) {
    // Cache hit - increment counter and log
    cacheHits++;
    console.log(`Cache HIT! Returning cached gold rate data (age: ${Math.round(cacheAge/1000)}s, hits: ${cacheHits}, misses: ${cacheMisses})`);
    
    // Return cached data with source flag
    const cachedResponse = { ...cachedRate };
    cachedResponse.source = 'cache';
    cachedResponse.warning = false;
    cachedResponse.cacheAge = Math.round(cacheAge/1000); // Include cache age in seconds
    return cachedResponse;
  }
  try {
    // Using the Alpha Vantage API for physical gold prices
    const apiResponse = await axios.get('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=XAUUSD&apikey=YKEW3KGIXUWJEQ16', { timeout: 5000 });

    // Extract the data from the API response
    const { data } = apiResponse;

    // Log the actual response to understand its structure
    console.log('API Response:', JSON.stringify(data, null, 2));

    // Check if the response contains an error message
    if (data && data['Error Message']) {
      throw new Error(`API Error: ${data['Error Message']}`);
    }

    // Check if the response contains an information message (like demo key limitation)
    if (data && data['Information']) {
      throw new Error(`API Limitation: ${data['Information']}`);
    }

    // Validate the response structure
    if (!data || !data['Global Quote'] || !data['Global Quote']['05. price']) {
      throw new Error('Invalid gold rate data structure from API');
    }

    // Get the current timestamp
    const now = new Date();

    // Format the date in ISO format with T separator (YYYY-MM-DDTHH:MM:SS)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    // Get the price per ounce (XAU in USD)
    const pricePerOunceUSD = parseFloat(data['Global Quote']['05. price']);

    // Convert USD to INR (approximate conversion rate)
    const usdToInrRate = 82.5; // This could be fetched from another API if needed
    const pricePerOunceINR = pricePerOunceUSD * usdToInrRate;

    // Convert price to per gram (1 ounce = 31.1035 grams)
    const pricePerGram = pricePerOunceINR / 31.1035;

    // Calculate 22k and 24k prices (22k is 91.67% pure, 24k is 99.99% pure)
    const price_22k_per_gram = Math.round(pricePerGram * 0.9167);
    const price_24k_per_gram = Math.round(pricePerGram * 0.9999);

    // Calculate prices for different weights
    const gold_22k = {
      "1g": price_22k_per_gram,
      "5g": price_22k_per_gram * 5,
      "10g": price_22k_per_gram * 10,
      "50g": price_22k_per_gram * 50,
      "100g": price_22k_per_gram * 100
    };

    const gold_24k = {
      "1g": price_24k_per_gram,
      "5g": price_24k_per_gram * 5,
      "10g": price_24k_per_gram * 10,
      "50g": price_24k_per_gram * 50,
      "100g": price_24k_per_gram * 100
    };

    // First create the response object with updated_at at the very top
    const response = {
      updated_at: formattedDate
    };

    // Add the gold price data
    response.gold_22k = gold_22k;
    response.gold_24k = gold_24k;

    // Add source flag to indicate this is fresh data
    response.source = 'live';
    response.warning = false;

    // Update the cache
    cachedRate = response;
    lastFetchedAt = Date.now();
    
    // Increment cache miss counter and log
    cacheMisses++;
    console.log(`Cache MISS! Fetched fresh gold rate data and updated cache (hits: ${cacheHits}, misses: ${cacheMisses})`);

    // TODO: persist daily gold rates to DB for historical reports

    return response;
  } catch (error) {
    console.error('Error fetching gold rate:', error.message);

    // If we have cached data, return it as a fallback
    if (cachedRate) {
      const cacheAge = lastFetchedAt ? Date.now() - lastFetchedAt : 0;
      const isExpired = cacheAge >= CACHE_DURATION;
      
      // Log cache fallback with statistics
      console.log(`API failed, returning ${isExpired ? 'EXPIRED' : 'STALE'} cached data as fallback (age: ${Math.round(cacheAge/1000)}s, hits: ${cacheHits}, misses: ${cacheMisses})`);
      
      // Add a warning flag to indicate this is stale data
      const fallbackResponse = { ...cachedRate };
      fallbackResponse.warning = `Data may be stale due to API failure (${isExpired ? 'EXPIRED' : 'STALE'} cache)`;
      fallbackResponse.cacheAge = Math.round(cacheAge/1000); // Include cache age in seconds
      fallbackResponse.isExpired = isExpired;
      return fallbackResponse;
    }

    // No cached data available, throw a 503 error
    const serviceError = new Error('Gold rate service unavailable and no cached data');
    serviceError.status = 503;
    throw serviceError;
  }
};

export default {
  fetchGoldRate,
  // Expose cache variables for controller access
  get cachedRate() { return cachedRate; },
  get lastFetchedAt() { return lastFetchedAt; },
  // Expose cache statistics
  get cacheStats() { 
    return {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%' : '0%'
    };
  },
  // Reset cache statistics
  resetCacheStats() { 
    cacheHits = 0;
    cacheMisses = 0;
  },
  // Setter methods for controller to modify cache
  setCachedRate(value) { cachedRate = value; },
  setLastFetchedAt(value) { lastFetchedAt = value; }
};

// Also export the fetchGoldRate function as a named export
export { fetchGoldRate };