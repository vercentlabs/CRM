import { fetchGoldRate } from '../services/gold.service.js';

/**
 * Get current gold rates with calculated prices for different weights
 * @route   GET /gold/gold-rate
 * @desc    Get current gold rates for 22k and 24k gold in various weights
 * @access  Public
 */
const getGoldRate = async (req, res) => {
  try {
    // Fetch gold rate from service (with cache support)
    const goldRate = await fetchGoldRate();

    // Return the response from service directly (already includes source and warning flags)
    res.status(200).json(goldRate);
  } catch (error) {
    // Handle 503 error specifically for service unavailable
    if (error.status === 503) {
      return res.status(503).json({
        message: error.message,
        source: 'none',
        warning: true
      });
    }

    res.status(500).json({
      message: 'Error fetching gold rates',
      error: error.message,
      source: 'none',
      warning: true
    });
  }
};

/**
 * Force refresh gold rates
 * @route   POST /gold/refresh
 * @desc    Force refresh gold rates and update cache
 * @access  Admin
 */
const refreshGoldRate = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.roleId !== 1) {
      return res.status(403).json({
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Import the service to access cache variables
    const goldServiceModule = import('../services/gold.service.js');
    const goldService = (await goldServiceModule).default;

    // Temporarily clear cache to force fresh fetch
    const originalCachedRate = goldService.cachedRate;
    const originalLastFetchedAt = goldService.lastFetchedAt;
    goldService.setCachedRate(null);
    goldService.setLastFetchedAt(null);

    // Fetch fresh data using the imported function
    const goldRate = await fetchGoldRate();

    res.status(200).json({
      message: 'Gold rates refreshed successfully',
      data: goldRate
    });
  } catch (error) {
    // Handle 503 error specifically for service unavailable
    if (error.status === 503) {
      return res.status(503).json({
        message: error.message,
        source: 'none',
        warning: true
      });
    }

    res.status(500).json({
      message: 'Error refreshing gold rates',
      error: error.message,
      source: 'none',
      warning: true
    });
  }
};

export {
  getGoldRate,
  refreshGoldRate
};