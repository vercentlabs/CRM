import express from 'express';
const router = express.Router();
import { getDashboardSummary, getSalesPerformance, getLeadAging, getConversionReport, exportLeadsCSV, getLeadsOverTime } from '../controllers/report.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   GET /dashboard-summary
 * @desc    Get dashboard summary with key metrics
 * @access  Private
 */
router.get('/dashboard-summary', authenticateToken, getDashboardSummary);

/**
 * @route   GET /sales-performance
 * @desc    Get performance metrics for each sales user
 * @access  Private (Admin/Manager only)
 */
router.get('/sales-performance', authenticateToken, getSalesPerformance);

/**
 * @route   GET /lead-aging
 * @desc    Get lead aging distribution in time buckets
 * @access  Private
 */
router.get('/lead-aging', authenticateToken, getLeadAging);

/**
 * @route   GET /conversion-report
 * @desc    Get lead conversion funnel by status
 * @access  Private
 */
router.get('/conversion-report', authenticateToken, getConversionReport);

/**
 * @route   GET /export-leads-csv
 * @desc    Export leads data as CSV file with role-based filtering
 * @access  Private
 */
router.get('/export-leads-csv', authenticateToken, exportLeadsCSV);

/**
 * @route   GET /leads-over-time
 * @desc    Get leads data grouped by time period (today, this week, this month)
 * @access  Private
 */
router.get('/leads-over-time', authenticateToken, getLeadsOverTime);

export default router;