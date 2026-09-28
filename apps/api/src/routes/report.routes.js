import express from 'express';
const router = express.Router();
import { getDashboardSummary, getSalesPerformance, getLeadAging, getConversionReport, exportLeadsCSV, getLeadsOverTime } from '../controllers/report.controller.js';
import authenticateToken, { requirePermission, requireScope } from '../middleware/auth.middleware.js';

// Every report aggregates only the caller's organization (and own records for own scope).
router.use(authenticateToken);

/** @route GET /reports/dashboard-summary */
router.get('/dashboard-summary', requirePermission('crm.reports.read'), getDashboardSummary);

/** @route GET /reports/sales-performance (per-member metrics: organization scope only) */
router.get('/sales-performance', requireScope('crm.reports.read', 'organization'), getSalesPerformance);

/** @route GET /reports/lead-aging */
router.get('/lead-aging', requirePermission('crm.reports.read'), getLeadAging);

/** @route GET /reports/conversion-report */
router.get('/conversion-report', requirePermission('crm.reports.read'), getConversionReport);

/** @route GET /reports/export-leads-csv */
router.get('/export-leads-csv', requirePermission('crm.reports.export'), exportLeadsCSV);

/** @route GET /reports/leads-over-time */
router.get('/leads-over-time', requirePermission('crm.reports.read'), getLeadsOverTime);

export default router;
